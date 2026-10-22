import { createHash } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type { ServerConfig } from "./config.js";
import { MemoryPasskeyStore, type PasskeyStore } from "./passkeyStore.js";
import { passkeyRouter } from "./passkeys.js";
import { fetchVerifiedEmail, parseVerificationUrl, VerificationError } from "./phoneEmail.js";
import { noStore, requireJson, requireTrustedOrigin } from "./security.js";
import { SessionManager } from "./session.js";
import { MemoryTtlStore, type TtlStore } from "./store.js";

/** How long a used verification URL is remembered (and refused). */
export const USED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppStores {
  /** Hashes of phone.email verification URLs that were already used. */
  usedUrls: TtlStore;
  /** IDs of sessions revoked by logout. */
  revokedSessions: TtlStore;
  /** Pending passkey (WebAuthn) challenges. */
  challenges: TtlStore<string>;
  /** Registered passkeys. */
  passkeys: PasskeyStore;
}

export interface AppOptions {
  config: ServerConfig;
  fetchImpl?: typeof fetch;
  /** Shared stores for multi-instance deployments and persistence (default: in memory). */
  stores?: Partial<AppStores>;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Builds the Express app (kept separate from `listen` so tests can use it). */
export function createApp({ config, fetchImpl = fetch, stores = {} }: AppOptions) {
  const usedUrls = stores.usedUrls ?? new MemoryTtlStore();
  const sessions = new SessionManager(config, stores.revokedSessions ?? new MemoryTtlStore());

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  // JSON API: no HTML is served, so the strictest CSP applies.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
    }),
  );
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(requireTrustedOrigin(config.corsOrigins));

  // Server-side limit on sign-in attempts per IP (default 10 per minute).
  const verifyLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.rateLimitPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many verification attempts. Please wait a minute and try again." },
  });

  app.use(
    "/passkeys",
    passkeyRouter({
      config,
      sessions,
      passkeys: stores.passkeys ?? new MemoryPasskeyStore(),
      challenges: stores.challenges ?? new MemoryTtlStore<string>(),
      rateLimiter: verifyLimiter,
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post(
    "/create-token",
    verifyLimiter,
    noStore,
    requireJson,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const url = parseVerificationUrl(req.body?.user_json_url);
        // Each verification URL signs in once. Claim it before fetching, so two
        // parallel requests with the same URL can't both succeed.
        const key = sha256(url.href);
        if (!(await usedUrls.add(key, true, USED_URL_TTL_MS))) {
          throw new VerificationError(
            "This verification was already used. Please verify again.",
            409,
          );
        }
        let email: string;
        try {
          email = await fetchVerifiedEmail(url, fetchImpl);
        } catch (err) {
          // phone.email unreachable: release the URL so the user can retry it.
          if (err instanceof VerificationError && err.status >= 500) await usedUrls.delete(key);
          throw err;
        }
        sessions.issue(res, email);
        res.json({ email, expiresIn: config.sessionTtlSeconds });
      } catch (err) {
        next(err);
      }
    },
  );

  app.get("/me", noStore, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await sessions.read(req);
      if (session) {
        res.json({ email: session.email, expiresAt: new Date(session.exp * 1000).toISOString() });
        return;
      }
      if (req.cookies?.[sessions.cookieName]) {
        sessions.clear(res);
        res
          .status(401)
          .json({ message: "Your session has expired or is invalid. Please verify again." });
        return;
      }
      res.status(401).json({ message: "Not signed in." });
    } catch (err) {
      next(err);
    }
  });

  app.post("/logout", noStore, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sessions.revoke(res, await sessions.read(req));
      res.set("Clear-Site-Data", '"cookies"');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ message: "Not found." });
  });

  // Error handler: known verification errors keep their message; anything
  // else is logged and returned as a generic 500 (no stack traces leak).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof VerificationError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    if (err instanceof SyntaxError || (err as { type?: string })?.type === "entity.too.large") {
      res.status(400).json({ message: "Invalid request body." });
      return;
    }
    console.error(err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  });

  return app;
}
