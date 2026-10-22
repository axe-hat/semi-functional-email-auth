import { randomBytes } from "node:crypto";

export interface ServerConfig {
  port: number;
  jwtSecret: string;
  sessionTtlSeconds: number;
  /** Sign-in attempts allowed per IP per minute (email and passkey). */
  rateLimitPerMinute: number;
  corsOrigins: string[];
  cookieSecure: boolean;
  /** SameSite for the session cookie. "none" needs a secure cookie (cross-site front end). */
  cookieSameSite: "strict" | "lax" | "none";
  isProduction: boolean;
  /** Passkey (WebAuthn) relying-party settings. */
  webauthn: {
    /** Domain passkeys are bound to, e.g. "example.com" (no scheme or port). */
    rpId: string;
    /** Name shown in the browser's passkey prompt. */
    rpName: string;
    /** Front-end origins allowed to use the passkeys. */
    origins: string[];
  };
}

const SAME_SITE = ["strict", "lax", "none"] as const;

/** Reads a whole number > 0, failing fast on typos instead of running with NaN. */
function positiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number above 0.`);
  return n;
}

/**
 * Reads configuration from environment variables. In production a real
 * JWT_SECRET (32+ characters) is required; in development a random one is
 * generated per process so the server still starts out of the box.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === "production";
  let jwtSecret = env.JWT_SECRET ?? "";

  if (jwtSecret.length < 32) {
    if (isProduction) {
      throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
    }
    jwtSecret = randomBytes(32).toString("hex");
  }

  const cookieSecure = env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProduction;
  const cookieSameSite = (env.COOKIE_SAME_SITE ?? "strict").toLowerCase();
  if (!(SAME_SITE as readonly string[]).includes(cookieSameSite)) {
    throw new Error("COOKIE_SAME_SITE must be strict, lax or none.");
  }
  if (cookieSameSite === "none" && !cookieSecure) {
    throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true.");
  }

  const corsOrigins = (env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const passkeyOrigins = env.WEBAUTHN_ORIGINS
    ? env.WEBAUTHN_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : corsOrigins;

  return {
    port: positiveInt("PORT", env.PORT, 4000),
    jwtSecret,
    sessionTtlSeconds: positiveInt("SESSION_TTL_SECONDS", env.SESSION_TTL_SECONDS, 3600),
    rateLimitPerMinute: positiveInt("RATE_LIMIT_PER_MINUTE", env.RATE_LIMIT_PER_MINUTE, 10),
    corsOrigins,
    cookieSecure,
    cookieSameSite: cookieSameSite as ServerConfig["cookieSameSite"],
    isProduction,
    webauthn: {
      rpId: env.WEBAUTHN_RP_ID ?? new URL(passkeyOrigins[0] ?? "http://localhost").hostname,
      rpName: env.WEBAUTHN_RP_NAME ?? "Email Auth",
      origins: passkeyOrigins,
    },
  };
}
