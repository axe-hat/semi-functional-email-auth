import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { sessionCookieName } from "../src/session.js";
import { config, cookieFrom, GOOD_URL, phoneEmail, SECRET, SESSION_COOKIE } from "./helpers.js";

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
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/^__Host-session=/);
    expect(res.headers["cache-control"]).toBe("no-store");
    const token = cookie.split(";")[0].split("=")[1];
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
    expect(payload.sub).toBe("jane@example.com");
    expect(payload.jti).toEqual(expect.any(String));
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
    expect(res.headers["clear-site-data"]).toBe('"cookies"');
  });

  it("logout revokes the token server-side, so a copied cookie stops working", async () => {
    const app = createApp({
      config,
      fetchImpl: phoneEmail({ body: { user_email_id: "jane@example.com" } }),
    });
    const login = await request(app).post("/create-token").send({ user_json_url: GOOD_URL });
    const cookie = cookieFrom(login).split(";")[0];
    expect((await request(app).get("/me").set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).post("/logout").set("Cookie", cookie)).status).toBe(204);
    const after = await request(app).get("/me").set("Cookie", cookie);
    expect(after.status).toBe(401);
    expect(after.body.message).toMatch(/expired or is invalid/);
  });

  it("rejects tokens without a session ID", async () => {
    const legacy = jwt.sign({ sub: "jane@example.com" }, SECRET, { expiresIn: 60 });
    const res = await request(createApp({ config }))
      .get("/me")
      .set("Cookie", `${SESSION_COOKIE}=${legacy}`);
    expect(res.status).toBe(401);
  });
});

describe("replay protection", () => {
  const ok = () => phoneEmail({ body: { user_email_id: "jane@example.com" } });

  it("accepts each verification URL only once", async () => {
    const app = createApp({ config, fetchImpl: ok() });
    const first = await request(app).post("/create-token").send({ user_json_url: GOOD_URL });
    expect(first.status).toBe(200);
    const again = await request(app).post("/create-token").send({ user_json_url: GOOD_URL });
    expect(again.status).toBe(409);
    expect(again.headers["set-cookie"]).toBeUndefined();
  });

  it("lets only one of two parallel requests with the same URL through", async () => {
    const app = createApp({ config, fetchImpl: ok() });
    const send = () => request(app).post("/create-token").send({ user_json_url: GOOD_URL });
    const statuses = (await Promise.all([send(), send()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("releases the URL when phone.email is unreachable, so the user can retry", async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user_email_id: "j@x.io" }),
      });
    const app = createApp({ config, fetchImpl: fetchImpl as unknown as typeof fetch });
    const send = () => request(app).post("/create-token").send({ user_json_url: GOOD_URL });
    expect((await send()).status).toBe(502);
    expect((await send()).status).toBe(200);
  });
});

describe("CSRF defences", () => {
  const app = () =>
    createApp({ config, fetchImpl: phoneEmail({ body: { user_email_id: "jane@example.com" } }) });

  it("refuses state-changing requests from other origins", async () => {
    const res = await request(app())
      .post("/create-token")
      .set("Origin", "https://evil.com")
      .send({ user_json_url: GOOD_URL });
    expect(res.status).toBe(403);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect((await request(app()).post("/logout").set("Origin", "https://evil.com")).status).toBe(
      403,
    );
  });

  it("refuses cross-site requests that send no Origin", async () => {
    const res = await request(app())
      .post("/create-token")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ user_json_url: GOOD_URL });
    expect(res.status).toBe(403);
  });

  it("allows the configured front end and non-browser clients", async () => {
    const fromFrontEnd = await request(app())
      .post("/create-token")
      .set("Origin", "http://localhost:5173")
      .set("Sec-Fetch-Site", "same-site")
      .send({ user_json_url: GOOD_URL });
    expect(fromFrontEnd.status).toBe(200);
    const noHeaders = await request(app()).post("/create-token").send({ user_json_url: GOOD_URL });
    expect(noHeaders.status).toBe(200);
  });

  it("only accepts JSON bodies on /create-token", async () => {
    const res = await request(app())
      .post("/create-token")
      .type("form")
      .send({ user_json_url: GOOD_URL });
    expect(res.status).toBe(415);
  });
});

describe("app basics", () => {
  it("serves /health, 404s unknown routes and hides the framework header", async () => {
    const app = createApp({ config });
    const health = await request(app).get("/health");
    expect(health.body).toEqual({ status: "ok" });
    expect(health.headers["x-powered-by"]).toBeUndefined();
    expect(health.headers["content-security-policy"]).toMatch(/default-src 'none'/);
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["strict-transport-security"]).toBeTruthy();
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
    expect(c.cookieSameSite).toBe("strict");
    expect(c.rateLimitPerMinute).toBe(10);
    expect(loadConfig({ RATE_LIMIT_PER_MINUTE: "100" }).rateLimitPerMinute).toBe(100);
    expect(c.webauthn).toEqual({
      rpId: "a.com",
      rpName: "Email Auth",
      origins: ["https://a.com", "https://b.com"],
    });
    expect(
      loadConfig({ WEBAUTHN_RP_ID: "example.com", WEBAUTHN_ORIGINS: "https://app.example.com" })
        .webauthn,
    ).toEqual({ rpId: "example.com", rpName: "Email Auth", origins: ["https://app.example.com"] });
  });

  it("rejects invalid numbers instead of running with NaN", () => {
    expect(() => loadConfig({ RATE_LIMIT_PER_MINUTE: "ten" })).toThrow(/RATE_LIMIT_PER_MINUTE/);
    expect(() => loadConfig({ SESSION_TTL_SECONDS: "-5" })).toThrow(/SESSION_TTL_SECONDS/);
    expect(() => loadConfig({ PORT: "4000.5" })).toThrow(/PORT/);
    expect(loadConfig({ PORT: "" }).port).toBe(4000);
  });

  it("validates COOKIE_SAME_SITE", () => {
    expect(loadConfig({ COOKIE_SAME_SITE: "Lax" }).cookieSameSite).toBe("lax");
    expect(() => loadConfig({ COOKIE_SAME_SITE: "sometimes" })).toThrow(/strict, lax or none/);
    expect(() => loadConfig({ COOKIE_SAME_SITE: "none" })).toThrow(/COOKIE_SECURE/);
    expect(loadConfig({ COOKIE_SAME_SITE: "none", COOKIE_SECURE: "true" }).cookieSameSite).toBe(
      "none",
    );
  });

  it("uses the __Host- cookie prefix only over HTTPS", () => {
    expect(sessionCookieName({ cookieSecure: true })).toBe("__Host-session");
    expect(sessionCookieName({ cookieSecure: false })).toBe("session");
  });
});
