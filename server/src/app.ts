import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import type { ServerConfig } from "./config.js";
import { fetchVerifiedEmail, parseVerificationUrl, VerificationError } from "./phoneEmail.js";

export const SESSION_COOKIE = "session";

export interface AppOptions {
  config: ServerConfig;
  fetchImpl?: typeof fetch;
}

/** Builds the Express app (kept separate from `listen` so tests can use it). */
export function createApp({ config, fetchImpl = fetch }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));

  const cookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
  };

  // Server-side limit: per IP, 10 verification attempts per minute.
  const verifyLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many verification attempts. Please wait a minute and try again." },
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post(
    "/create-token",
    verifyLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const url = parseVerificationUrl(req.body?.user_json_url);
        const email = await fetchVerifiedEmail(url, fetchImpl);
        const token = jwt.sign({ sub: email }, config.jwtSecret, {
          algorithm: "HS256",
          expiresIn: config.sessionTtlSeconds,
        });
        res.cookie(SESSION_COOKIE, token, {
          ...cookieOptions,
          maxAge: config.sessionTtlSeconds * 1000,
        });
        res.json({ email, expiresIn: config.sessionTtlSeconds });
      } catch (err) {
        next(err);
      }
    },
  );

  app.get("/me", (req: Request, res: Response) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      res.status(401).json({ message: "Not signed in." });
      return;
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret, {
        algorithms: ["HS256"],
      }) as jwt.JwtPayload;
      res.json({
        email: payload.sub,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      });
    } catch {
      res.clearCookie(SESSION_COOKIE, cookieOptions);
      res
        .status(401)
        .json({ message: "Your session has expired or is invalid. Please verify again." });
    }
  });

  app.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
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
