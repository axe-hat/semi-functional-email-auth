import { randomBytes } from "node:crypto";

export interface ServerConfig {
  port: number;
  jwtSecret: string;
  sessionTtlSeconds: number;
  corsOrigins: string[];
  cookieSecure: boolean;
  isProduction: boolean;
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

  return {
    port: Number(env.PORT ?? 4000),
    jwtSecret,
    sessionTtlSeconds: Number(env.SESSION_TTL_SECONDS ?? 3600),
    corsOrigins: (env.CORS_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === "true" : isProduction,
    isProduction,
  };
}
