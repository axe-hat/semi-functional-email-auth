import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated, state-changing requests (including
 * login CSRF on the sign-in endpoints), following OWASP's Fetch Metadata and
 * Origin-verification guidance:
 *
 * - If the browser sends `Origin`, it must be one of the allowed front-end origins.
 * - Otherwise `Sec-Fetch-Site: cross-site` is refused.
 * - Requests with neither header come from non-browser clients (curl, servers),
 *   which can't carry a victim's cookies, so they are allowed.
 */
export function requireTrustedOrigin(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin");
    if (origin !== undefined) {
      if (allowed.has(origin)) return next();
      res.status(403).json({ message: "Request origin is not allowed." });
      return;
    }
    if (req.get("sec-fetch-site") === "cross-site") {
      res.status(403).json({ message: "Cross-site requests are not allowed." });
      return;
    }
    next();
  };
}

/**
 * JSON-only POST bodies. A cross-site HTML form can't send
 * `Content-Type: application/json`, and a script that does triggers a CORS
 * preflight, which only the allowed origins pass.
 */
export function requireJson(req: Request, res: Response, next: NextFunction) {
  if (!req.is("application/json")) {
    res.status(415).json({ message: "Content-Type must be application/json." });
    return;
  }
  next();
}

/** Auth responses carry personal data and must never be cached. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store");
  next();
}
