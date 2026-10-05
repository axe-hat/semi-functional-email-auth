import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp, SESSION_COOKIE } from "../src/app.js";
import { loadConfig, type ServerConfig } from "../src/config.js";

const SECRET = "x".repeat(40);
const config: ServerConfig = {
  port: 0,
  jwtSecret: SECRET,
  sessionTtlSeconds: 3600,
  corsOrigins: ["http://localhost:5173"],
  cookieSecure: true,
  isProduction: false,
};
const GOOD_URL = "https://user.phone.email/user_abc123.json";

function phoneEmail(response: { ok?: boolean; status?: number; body?: unknown; throws?: boolean }) {
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

function cookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[];
  return raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
}

describe("POST /create-token", () => {
  it("verifies with phone.email and sets a secure httpOnly session cookie", async () => {
    const fetchImpl = phoneEmail({ body: { user_email_id: "Jane@Example.com" } });
    const res = await request(createApp({ config, fetchImpl }))
      .post("/create-token")
      .send({ user_json_url: GOOD_URL, user_email_id: "attacker@evil.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: "jane@example.com", expiresIn: 3600 });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(GOOD_URL),
      expect.objectContaining({ redirect: "error" }),
    );
    const cookie = cookieFrom(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const token = cookie.split(";")[0].split("=")[1];
    expect((jwt.verify(token, SECRET) as jwt.JwtPayload).sub).toBe("jane@example.com");
  });

  it.each([
    ["missing", undefined],
    ["not a URL", "nope"],
    ["http", "http://user.phone.email/user_abc.json"],
    ["other host", "https://evil.com/user_abc.json"],
    ["lookalike host", "https://user.phone.email.evil.com/user_abc.json"],
    ["internal address", "https://169.254.169.254/latest/meta-data"],
    ["custom port", "https://user.phone.email:8443/user_abc.json"],
    ["credentials", "https://a:b@user.phone.email/user_abc.json"],
    ["path traversal", "https://user.phone.email/../admin.json"],
    ["not json", "https://user.phone.email/user_abc.html"],
    ["not a user file", "https://user.phone.email/admin.json"],
    ["query string", "https://user.phone.email/user_abc.json?x=1"],
  ])("rejects a %s user_json_url without fetching it", async (_label, url) => {
    const fetchImpl = phoneEmail({ body: { user_email_id: "jane@example.com" } });
    const res = await request(createApp({ config, fetchImpl }))
      .post("/create-token")
      .send({ user_json_url: url });
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    ["phone.email says no", { ok: false, status: 404 }, 401],
    ["no email in the JSON", { body: { something: "else" } }, 401],
    ["invalid email in the JSON", { body: { user_email_id: "not-an-email" } }, 401],
    ["phone.email unreachable", { throws: true }, 502],
    ["phone.email returns non-JSON", { body: "not-json" }, 502],
  ])("does not create a session when %s", async (_label, response, status) => {
    const res = await request(createApp({ config, fetchImpl: phoneEmail(response) }))
      .post("/create-token")
      .send({ user_json_url: GOOD_URL });
    expect(res.status).toBe(status);
    expect(res.body.message).toBeTruthy();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a malformed JSON body", async () => {
    const res = await request(createApp({ config, fetchImpl: phoneEmail({}) }))
      .post("/create-token")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated attempts from one client", async () => {
    const app = createApp({ config, fetchImpl: phoneEmail({ ok: false, status: 404 }) });
    let last: request.Response | undefined;
    for (let i = 0; i < 11; i++)
      last = await request(app).post("/create-token").send({ user_json_url: GOOD_URL });
    expect(last!.status).toBe(429);
  });
});

describe("GET /me and POST /logout", () => {
  it("returns the signed-in email for a valid session", async () => {
    const app = createApp({
      config,
      fetchImpl: phoneEmail({ body: { user_email_id: "jane@example.com" } }),
    });
    const login = await request(app).post("/create-token").send({ user_json_url: GOOD_URL });
    const res = await request(app).get("/me").set("Cookie", cookieFrom(login).split(";")[0]);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("jane@example.com");
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("rejects missing, forged and expired sessions", async () => {
    const app = createApp({ config });
    expect((await request(app).get("/me")).status).toBe(401);
    const forged = jwt.sign({ sub: "jane@example.com" }, "wrong-secret");
    expect(
      (await request(app).get("/me").set("Cookie", `${SESSION_COOKIE}=${forged}`)).status,
    ).toBe(401);
    const expired = jwt.sign(
      { sub: "jane@example.com", exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    const res = await request(app).get("/me").set("Cookie", `${SESSION_COOKIE}=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/);
  });

  it("logout clears the session cookie", async () => {
    const res = await request(createApp({ config })).post("/logout");
    expect(res.status).toBe(204);
    expect(cookieFrom(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("app basics", () => {
  it("serves /health, 404s unknown routes and hides the framework header", async () => {
    const app = createApp({ config });
    const health = await request(app).get("/health");
    expect(health.body).toEqual({ status: "ok" });
    expect(health.headers["x-powered-by"]).toBeUndefined();
    expect((await request(app).get("/nope")).status).toBe(404);
  });

  it("allows CORS with credentials only for configured origins", async () => {
    const app = createApp({ config });
    const ok = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const other = await request(app).get("/health").set("Origin", "https://evil.com");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("loadConfig", () => {
  it("requires a strong JWT_SECRET in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: "short" })).toThrow(/JWT_SECRET/);
    const prod = loadConfig({ NODE_ENV: "production", JWT_SECRET: SECRET });
    expect(prod.cookieSecure).toBe(true);
  });

  it("generates a random development secret and reads options", () => {
    const a = loadConfig({});
    const b = loadConfig({});
    expect(a.jwtSecret).toHaveLength(64);
    expect(a.jwtSecret).not.toBe(b.jwtSecret);
    expect(a.cookieSecure).toBe(false);
    const c = loadConfig({
      PORT: "5000",
      CORS_ORIGIN: "https://a.com, https://b.com",
      COOKIE_SECURE: "true",
    });
    expect(c.port).toBe(5000);
    expect(c.corsOrigins).toEqual(["https://a.com", "https://b.com"]);
    expect(c.cookieSecure).toBe(true);
  });
});
