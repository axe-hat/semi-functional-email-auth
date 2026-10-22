import type request from "supertest";
import type { ServerConfig } from "../src/config.js";
import { sessionCookieName } from "../src/session.js";

export const SECRET = "x".repeat(40);
export const config: ServerConfig = {
  port: 0,
  jwtSecret: SECRET,
  sessionTtlSeconds: 3600,
  rateLimitPerMinute: 10,
  corsOrigins: ["http://localhost:5173"],
  cookieSecure: true,
  cookieSameSite: "strict",
  isProduction: false,
  webauthn: { rpId: "localhost", rpName: "Test", origins: ["http://localhost:5173"] },
};
export const SESSION_COOKIE = sessionCookieName(config);
export const GOOD_URL = "https://user.phone.email/user_abc123.json";

export function phoneEmail(response: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  throws?: boolean;
}) {
  return jest.fn(async () => {
    if (response.throws) throw new Error("network down");
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => {
        if (response.body === "not-json") throw new SyntaxError("bad json");
        return response.body;
      },
    } as unknown as Response;
  });
}

export function cookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[];
  return raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
}
