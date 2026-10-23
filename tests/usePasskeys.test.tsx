import { act, renderHook } from "@testing-library/react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { usePasskeys } from "../src/passkeys/index.js";

jest.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration: jest.fn(),
  startAuthentication: jest.fn(),
}));
const startReg = startRegistration as jest.Mock;
const startAuth = startAuthentication as jest.Mock;

function respond(...responses: Array<{ status: number; body?: unknown }>) {
  const fn = jest.fn();
  for (const r of responses)
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => jest.clearAllMocks());

describe("usePasskeys", () => {
  it("registers a passkey: options -> browser prompt -> verify", async () => {
    const options = { challenge: "abc" };
    const fetchMock = respond({ status: 200, body: options }, { status: 201, body: { id: "c1" } });
    startReg.mockResolvedValueOnce({ id: "c1" });
    const { result } = renderHook(() => usePasskeys({ apiUrl: "http://api.test" }));
    expect(result.current.supported).toBe(true);

    let ok = false;
    await act(async () => {
      ok = await result.current.register();
    });
    expect(ok).toBe(true);
    expect(startReg).toHaveBeenCalledWith({ optionsJSON: options });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://api.test/passkeys/register/options", {
      method: "POST",
      credentials: "include",
      headers: undefined,
      body: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://api.test/passkeys/register/verify",
      expect.objectContaining({ body: JSON.stringify({ response: { id: "c1" } }) }),
    );
    expect(result.current.isWorking).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("signs in with a passkey and returns the user", async () => {
    const fetchMock = respond(
      { status: 200, body: { flowId: "f1", options: { challenge: "xyz" } } },
      { status: 200, body: { email: "jane@example.com", expiresIn: 3600 } },
    );
    startAuth.mockResolvedValueOnce({ id: "c1" });
    const { result } = renderHook(() => usePasskeys());
    let user = null;
    await act(async () => {
      user = await result.current.signIn();
    });
    expect(user).toEqual({ email: "jane@example.com", expiresIn: 3600 });
    expect(startAuth).toHaveBeenCalledWith({ optionsJSON: { challenge: "xyz" } });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/passkeys/login/verify",
      expect.objectContaining({ body: JSON.stringify({ flowId: "f1", response: { id: "c1" } }) }),
    );
  });

  it("reports a cancelled prompt as a friendly error", async () => {
    respond({ status: 200, body: { flowId: "f1", options: {} } });
    startAuth.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );
    const { result } = renderHook(() => usePasskeys());
    let user: unknown = "unset";
    await act(async () => {
      user = await result.current.signIn();
    });
    expect(user).toBeNull();
    expect(result.current.error?.message).toMatch(/cancelled or timed out/);
  });

  it("surfaces the server's message when registration is refused", async () => {
    respond({ status: 401, body: { message: "Please verify your email first." } });
    const { result } = renderHook(() => usePasskeys());
    let ok = true;
    await act(async () => {
      ok = await result.current.register();
    });
    expect(ok).toBe(false);
    expect(startReg).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({
      name: "AuthError",
      message: "Please verify your email first.",
    });
  });
});
