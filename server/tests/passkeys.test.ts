import request from "supertest";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { createApp } from "../src/app.js";
import { MemoryPasskeyStore } from "../src/passkeyStore.js";
import { config, cookieFrom, GOOD_URL, phoneEmail } from "./helpers.js";

// Option generation runs for real; the cryptographic verification (which needs a
// real authenticator) is mocked. The Playwright e2e test covers the real ceremony.
jest.mock("@simplewebauthn/server", () => ({
  ...jest.requireActual("@simplewebauthn/server"),
  verifyRegistrationResponse: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));
const verifyReg = verifyRegistrationResponse as jest.Mock;
const verifyAuth = verifyAuthenticationResponse as jest.Mock;

const CRED_ID = "Y3JlZC0x";

function registered(id = CRED_ID) {
  return {
    verified: true,
    registrationInfo: {
      credential: {
        id,
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ["internal"],
      },
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
    },
  };
}

async function signedIn() {
  const passkeys = new MemoryPasskeyStore();
  const app = createApp({
    config,
    fetchImpl: phoneEmail({ body: { user_email_id: "jane@example.com" } }),
    stores: { passkeys },
  });
  const login = await request(app).post("/create-token").send({ user_json_url: GOOD_URL });
  return { app, passkeys, cookie: cookieFrom(login).split(";")[0] };
}

async function addPasskey(app: ReturnType<typeof createApp>, cookie: string) {
  await request(app).post("/passkeys/register/options").set("Cookie", cookie);
  verifyReg.mockResolvedValueOnce(registered());
  return request(app)
    .post("/passkeys/register/verify")
    .set("Cookie", cookie)
    .send({ response: { id: CRED_ID } });
}

beforeEach(() => jest.clearAllMocks());

describe("passkey registration", () => {
  it("requires a verified session", async () => {
    const app = createApp({ config });
    expect((await request(app).post("/passkeys/register/options")).status).toBe(401);
    expect((await request(app).get("/passkeys")).status).toBe(401);
  });

  it("returns options bound to the RP, without the email as user handle", async () => {
    const { app, cookie } = await signedIn();
    const res = await request(app).post("/passkeys/register/options").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.rp).toEqual({ id: "localhost", name: "Test" });
    expect(res.body.user.name).toBe("jane@example.com");
    expect(Buffer.from(res.body.user.id, "base64url").toString()).not.toContain("jane");
    expect(res.body.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
  });

  it("verifies against the issued challenge and stores the passkey", async () => {
    const { app, cookie, passkeys } = await signedIn();
    const options = await request(app).post("/passkeys/register/options").set("Cookie", cookie);
    verifyReg.mockResolvedValueOnce(registered());
    const res = await request(app)
      .post("/passkeys/register/verify")
      .set("Cookie", cookie)
      .send({ response: { id: CRED_ID } });
    expect(res.status).toBe(201);
    expect(verifyReg).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: options.body.challenge,
        expectedOrigin: ["http://localhost:5173"],
        expectedRPID: "localhost",
        requireUserVerification: true,
      }),
    );
    expect(await passkeys.listByEmail("jane@example.com")).toHaveLength(1);
    const list = await request(app).get("/passkeys").set("Cookie", cookie);
    expect(list.body).toEqual([
      { id: CRED_ID, deviceType: "multiDevice", backedUp: true, createdAt: expect.any(String) },
    ]);
  });

  it("uses each challenge once and rejects failed verification", async () => {
    const { app, cookie } = await signedIn();
    const verify = () =>
      request(app).post("/passkeys/register/verify").set("Cookie", cookie).send({ response: {} });
    expect((await verify()).status).toBe(400);

    await request(app).post("/passkeys/register/options").set("Cookie", cookie);
    verifyReg.mockRejectedValueOnce(new Error("bad attestation"));
    expect((await verify()).body.message).toMatch(/could not be verified/);
    expect((await verify()).body.message).toMatch(/expired/);

    await request(app).post("/passkeys/register/options").set("Cookie", cookie);
    verifyReg.mockResolvedValueOnce({ verified: false });
    expect((await verify()).status).toBe(400);
  });

  it("refuses to register the same credential twice", async () => {
    const { app, cookie } = await signedIn();
    expect((await addPasskey(app, cookie)).status).toBe(201);
    expect((await addPasskey(app, cookie)).status).toBe(409);
  });

  it("excludes existing passkeys and reuses the user handle", async () => {
    const { app, cookie } = await signedIn();
    const first = await request(app).post("/passkeys/register/options").set("Cookie", cookie);
    verifyReg.mockResolvedValueOnce(registered());
    await request(app)
      .post("/passkeys/register/verify")
      .set("Cookie", cookie)
      .send({ response: {} });
    const second = await request(app).post("/passkeys/register/options").set("Cookie", cookie);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.excludeCredentials).toEqual([
      expect.objectContaining({ id: CRED_ID, type: "public-key" }),
    ]);
  });

  it("deletes only the user's own passkeys", async () => {
    const { app, cookie } = await signedIn();
    await addPasskey(app, cookie);
    expect((await request(app).delete("/passkeys/other").set("Cookie", cookie)).status).toBe(404);
    expect((await request(app).delete(`/passkeys/${CRED_ID}`).set("Cookie", cookie)).status).toBe(
      204,
    );
    expect((await request(app).get("/passkeys").set("Cookie", cookie)).body).toEqual([]);
  });
});

describe("passkey sign-in", () => {
  async function withPasskey() {
    const ctx = await signedIn();
    await addPasskey(ctx.app, ctx.cookie);
    return ctx;
  }

  it("signs in with a registered passkey and updates its counter", async () => {
    const { app, passkeys } = await withPasskey();
    const start = await request(app).post("/passkeys/login/options");
    expect(start.status).toBe(200);
    expect(start.body.options).toMatchObject({ rpId: "localhost", userVerification: "required" });
    expect(start.body.options.allowCredentials).toBeUndefined();

    verifyAuth.mockResolvedValueOnce({ verified: true, authenticationInfo: { newCounter: 7 } });
    const res = await request(app)
      .post("/passkeys/login/verify")
      .send({ flowId: start.body.flowId, response: { id: CRED_ID } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: "jane@example.com", expiresIn: 3600 });
    expect(cookieFrom(res)).toMatch(/HttpOnly/);
    expect(verifyAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: start.body.options.challenge,
        expectedRPID: "localhost",
        requireUserVerification: true,
        credential: expect.objectContaining({ id: CRED_ID, counter: 0 }),
      }),
    );
    expect((await passkeys.get(CRED_ID))?.counter).toBe(7);

    const me = await request(app).get("/me").set("Cookie", cookieFrom(res).split(";")[0]);
    expect(me.body.email).toBe("jane@example.com");
  });

  it("rejects unknown flows, reused flows, unknown and invalid passkeys alike", async () => {
    const { app } = await withPasskey();
    const verify = (flowId: unknown, id = CRED_ID) =>
      request(app).post("/passkeys/login/verify").send({ flowId, response: { id } });

    expect((await verify("nope")).status).toBe(400);

    let flow = (await request(app).post("/passkeys/login/options")).body.flowId;
    const unknown = await verify(flow, "unknown-credential");
    expect(unknown.status).toBe(401);
    expect((await verify(flow)).body.message).toMatch(/expired/);

    flow = (await request(app).post("/passkeys/login/options")).body.flowId;
    verifyAuth.mockResolvedValueOnce({ verified: false, authenticationInfo: { newCounter: 0 } });
    const invalid = await verify(flow);
    expect(invalid.status).toBe(401);
    expect(invalid.body.message).toBe(unknown.body.message);
    expect(invalid.headers["set-cookie"]).toBeUndefined();

    flow = (await request(app).post("/passkeys/login/options")).body.flowId;
    verifyAuth.mockRejectedValueOnce(new Error("bad signature"));
    expect((await verify(flow)).status).toBe(401);
  });

  it("is protected by the origin check", async () => {
    const { app } = await withPasskey();
    const res = await request(app)
      .post("/passkeys/login/options")
      .set("Origin", "https://evil.com");
    expect(res.status).toBe(403);
  });
});
