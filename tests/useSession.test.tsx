import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "../src/hooks/useSession.js";

function respond(...responses: Array<{ status: number; body?: unknown } | Error>) {
  const fn = jest.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else
      fn.mockResolvedValueOnce({
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: async () => r.body ?? {},
      });
  }
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("useSession", () => {
  it("starts loading, then reports the signed-in user from GET /me", async () => {
    const fetchMock = respond({
      status: 200,
      body: { email: "jane@example.com", expiresAt: "2026-10-22T12:00:00.000Z" },
    });
    const { result } = renderHook(() => useSession({ apiUrl: "http://api.test" }));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.session).toEqual({
      email: "jane@example.com",
      expiresAt: "2026-10-22T12:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/me", { credentials: "include" });
  });

  it("is unauthenticated (without an error) on 401", async () => {
    respond({ status: 401, body: { message: "Not signed in." } });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(result.current.error).toBeNull();
  });

  it("reports a typed error when the backend is unreachable or failing", async () => {
    respond(new TypeError("Failed to fetch"), { status: 503 });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.error?.name).toBe("NetworkError"));
    expect(result.current.status).toBe("unauthenticated");
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error?.message).toMatch(/server is experiencing issues/);
  });

  it("refresh() picks up a new session and logout() ends it", async () => {
    const fetchMock = respond(
      { status: 401 },
      { status: 200, body: { email: "jane@example.com", expiresAt: null } },
      { status: 204 },
    );
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    await act(async () => {
      expect(await result.current.refresh()).toEqual({
        email: "jane@example.com",
        expiresAt: null,
      });
    });
    expect(result.current.status).toBe("authenticated");
    await act(async () => {
      await result.current.logout();
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/logout", {
      method: "POST",
      credentials: "include",
    });
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.session).toBeNull();
  });

  it("keeps the session and reports an error if logout fails", async () => {
    respond({ status: 200, body: { email: "jane@example.com", expiresAt: null } }, { status: 403 });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.status).toBe("authenticated");
    expect(result.current.error?.name).toBe("AuthError");
  });

  it("ignores responses that arrive after unmount", async () => {
    let resolve!: (value: unknown) => void;
    globalThis.fetch = jest.fn(() => new Promise((r) => (resolve = r))) as unknown as typeof fetch;
    const { result, unmount } = renderHook(() => useSession());
    unmount();
    await act(async () => {
      resolve({ ok: true, status: 200, json: async () => ({ email: "x@y.io" }) });
    });
    expect(result.current.status).toBe("loading");
  });
});
