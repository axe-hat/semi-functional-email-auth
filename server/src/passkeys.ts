import { randomBytes, randomUUID } from "node:crypto";
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { ServerConfig } from "./config.js";
import type { PasskeyStore } from "./passkeyStore.js";
import { VerificationError } from "./phoneEmail.js";
import { noStore, requireJson } from "./security.js";
import type { Session, SessionManager } from "./session.js";
import type { TtlStore } from "./store.js";

/** How long the browser has to finish a passkey ceremony. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export interface PasskeyRouterOptions {
  config: ServerConfig;
  sessions: SessionManager;
  passkeys: PasskeyStore;
  /** Pending WebAuthn challenges, each usable once. */
  challenges: TtlStore<string>;
  rateLimiter: RequestHandler;
}

type Handler = (req: Request, res: Response) => Promise<void>;

/** Wraps an async handler so rejected promises reach the error handler. */
const wrap = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);

const fail = (message: string, status = 400) => new VerificationError(message, status);

/**
 * Passkey (WebAuthn) endpoints. A user who verified their email can add a
 * passkey, then sign in with it next time without the email round trip.
 */
export function passkeyRouter({
  config,
  sessions,
  passkeys,
  challenges,
  rateLimiter,
}: PasskeyRouterOptions) {
  const { rpId, rpName, origins } = config.webauthn;
  const router = Router();
  router.use(noStore);

  const requireSession = async (req: Request): Promise<Session> => {
    const session = await sessions.read(req);
    if (!session) throw fail("Please verify your email first.", 401);
    return session;
  };

  router.get(
    "/",
    wrap(async (req, res) => {
      const session = await requireSession(req);
      const list = await passkeys.listByEmail(session.email);
      res.json(
        list.map(({ id, deviceType, backedUp, createdAt }) => ({
          id,
          deviceType,
          backedUp,
          createdAt,
        })),
      );
    }),
  );

  router.post(
    "/register/options",
    wrap(async (req, res) => {
      const session = await requireSession(req);
      const existing = await passkeys.listByEmail(session.email);
      const userHandle = existing[0]?.userHandle ?? randomBytes(32).toString("base64url");
      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName: session.email,
        userID: Buffer.from(userHandle, "base64url"),
        attestationType: "none",
        // Don't register the same authenticator twice.
        excludeCredentials: existing.map(({ id, transports }) => ({ id, transports })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      await challenges.delete(`reg:${session.id}`);
      await challenges.add(
        `reg:${session.id}`,
        JSON.stringify({ challenge: options.challenge, userHandle }),
        CHALLENGE_TTL_MS,
      );
      res.json(options);
    }),
  );

  router.post(
    "/register/verify",
    requireJson,
    wrap(async (req, res) => {
      const session = await requireSession(req);
      const pending = await challenges.take(`reg:${session.id}`);
      if (!pending) throw fail("Passkey setup expired. Please try again.");
      const { challenge, userHandle } = JSON.parse(pending) as {
        challenge: string;
        userHandle: string;
      };

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: req.body?.response as RegistrationResponseJSON,
          expectedChallenge: challenge,
          expectedOrigin: origins,
          expectedRPID: rpId,
          requireUserVerification: true,
        });
      } catch {
        throw fail("The passkey could not be verified.");
      }
      if (!verification.verified) throw fail("The passkey could not be verified.");

      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;
      if (await passkeys.get(credential.id)) throw fail("This passkey is already registered.", 409);
      await passkeys.save({
        id: credential.id,
        email: session.email,
        userHandle,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        createdAt: new Date().toISOString(),
      });
      res.status(201).json({ id: credential.id });
    }),
  );

  router.post(
    "/login/options",
    rateLimiter,
    wrap(async (_req, res) => {
      // Discoverable credentials: the browser offers the user's passkeys for this site.
      const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: "required",
      });
      const flowId = randomUUID();
      await challenges.add(`auth:${flowId}`, options.challenge, CHALLENGE_TTL_MS);
      res.json({ flowId, options });
    }),
  );

  router.post(
    "/login/verify",
    rateLimiter,
    requireJson,
    wrap(async (req, res) => {
      const flowId: unknown = req.body?.flowId;
      const response = req.body?.response as AuthenticationResponseJSON | undefined;
      const challenge = typeof flowId === "string" ? await challenges.take(`auth:${flowId}`) : null;
      if (!challenge) throw fail("Passkey sign-in expired. Please try again.");
      const passkey = typeof response?.id === "string" ? await passkeys.get(response.id) : null;
      // Same message for unknown and invalid passkeys (no account enumeration).
      if (!passkey) throw fail("Passkey sign-in failed.", 401);

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: response!,
          expectedChallenge: challenge,
          expectedOrigin: origins,
          expectedRPID: rpId,
          credential: {
            id: passkey.id,
            publicKey: new Uint8Array(passkey.publicKey),
            counter: passkey.counter,
            transports: passkey.transports,
          },
          requireUserVerification: true,
        });
      } catch {
        throw fail("Passkey sign-in failed.", 401);
      }
      if (!verification.verified) throw fail("Passkey sign-in failed.", 401);

      await passkeys.updateCounter(passkey.id, verification.authenticationInfo.newCounter);
      sessions.issue(res, passkey.email);
      res.json({ email: passkey.email, expiresIn: config.sessionTtlSeconds });
    }),
  );

  router.delete(
    "/:id",
    wrap(async (req, res) => {
      const session = await requireSession(req);
      if (!(await passkeys.delete(String(req.params.id), session.email))) {
        throw fail("Passkey not found.", 404);
      }
      res.status(204).end();
    }),
  );

  return router;
}
