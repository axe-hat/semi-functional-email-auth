import { randomUUID } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { ServerConfig } from "./config.js";
import type { TtlStore } from "./store.js";

export interface Session {
  email: string;
  /** Unique session ID (JWT `jti`), used to revoke the session on logout. */
  id: string;
  /** Expiry as a Unix timestamp in seconds. */
  exp: number;
}

/**
 * `__Host-` cookies are only accepted over HTTPS, for this exact host and path
 * "/", so a sibling subdomain can't set or overwrite them. Plain HTTP (local
 * development) falls back to an unprefixed name.
 */
export function sessionCookieName(config: Pick<ServerConfig, "cookieSecure">): string {
  return config.cookieSecure ? "__Host-session" : "session";
}

/**
 * Stateless JWT sessions in an httpOnly cookie, plus a revocation list so that
 * logout invalidates the token server-side, not just in the browser.
 */
export class SessionManager {
  readonly cookieName: string;
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly config: ServerConfig,
    private readonly revoked: TtlStore,
  ) {
    this.cookieName = sessionCookieName(config);
    this.cookieOptions = {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: config.cookieSameSite,
      path: "/",
    };
  }

  /** Signs a new session (always a fresh ID) and sets the cookie. */
  issue(res: Response, email: string): Session {
    const id = randomUUID();
    const token = jwt.sign({ sub: email }, this.config.jwtSecret, {
      algorithm: "HS256",
      expiresIn: this.config.sessionTtlSeconds,
      jwtid: id,
    });
    res.cookie(this.cookieName, token, {
      ...this.cookieOptions,
      maxAge: this.config.sessionTtlSeconds * 1000,
    });
    return { email, id, exp: Math.floor(Date.now() / 1000) + this.config.sessionTtlSeconds };
  }

  /** Returns the request's valid, unrevoked session, or null. */
  async read(req: Request): Promise<Session | null> {
    const token: unknown = req.cookies?.[this.cookieName];
    if (typeof token !== "string" || token === "") return null;
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ["HS256"],
      }) as jwt.JwtPayload;
    } catch {
      return null;
    }
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string" || !payload.exp) {
      return null;
    }
    if (await this.revoked.get(payload.jti)) return null;
    return { email: payload.sub, id: payload.jti, exp: payload.exp };
  }

  /** Revokes the session until its natural expiry and clears the cookie. */
  async revoke(res: Response, session: Session | null): Promise<void> {
    if (session) {
      const ttlMs = session.exp * 1000 - Date.now();
      if (ttlMs > 0) await this.revoked.add(session.id, true, ttlMs);
    }
    this.clear(res);
  }

  clear(res: Response): void {
    res.clearCookie(this.cookieName, this.cookieOptions);
  }
}
