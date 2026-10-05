import { act, render, screen, waitFor } from "@testing-library/react";
import EmailVerificationButton from "../src/components/EmailVerificationButton.js";
import {
  loadPhoneEmailScript,
  resetPhoneEmailScriptState,
} from "../src/components/phoneEmailScript.js";

const SRC = "https://example.test/verify_email_v1.js";
const USER = {
  user_json_url: "https://user.phone.email/user_abc.json",
  user_email_id: "jane@example.com",
};

function mockFetch(status: number, body: unknown) {
  const fn = jest
    .fn()
    .mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

async function verify(user = USER) {
  await act(async () => {
    window.phoneEmailReceiver?.(user);
  });
}

beforeEach(() => {
  resetPhoneEmailScriptState();
  document.body.innerHTML = "";
});

describe("EmailVerificationButton", () => {
  it("renders the phone.email widget container with the client ID and loads the script once", () => {
    render(
      <>
        <EmailVerificationButton clientId="client-123" scriptSrc={SRC} />
        <EmailVerificationButton clientId="client-123" scriptSrc={SRC} />
      </>,
    );
    expect(document.querySelectorAll(".pe_verify_email")[0]).toHaveAttribute(
      "data-client-id",
      "client-123",
    );
    expect(document.querySelectorAll(`script[src="${SRC}"]`)).toHaveLength(1);
    expect(typeof window.phoneEmailReceiver).toBe("function");
  });

  it("posts only the verification URL, with cookies, and reports the verified user", async () => {
    const fetchMock = mockFetch(200, { email: "jane@example.com", expiresIn: 3600 });
    const onVerified = jest.fn();
    render(
      <EmailVerificationButton
        clientId="c"
        apiUrl="http://api.test"
        scriptSrc={SRC}
        onVerified={onVerified}
      />,
    );

    await verify();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/create-token",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ user_json_url: USER.user_json_url }),
      }),
    );
    expect(await screen.findByText("Email verified: jane@example.com")).toBeInTheDocument();
    expect(onVerified).toHaveBeenCalledWith({ email: "jane@example.com", expiresIn: 3600 });
    expect(window.localStorage.getItem("token")).toBeNull();
  });

  it("shows the server's error and calls onError", async () => {
    mockFetch(401, { message: "Verification could not be confirmed." });
    const onError = jest.fn();
    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} onError={onError} />);

    await verify();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Verification could not be confirmed.",
    );
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "AuthError" }));
  });

  it("rejects an invalid email without calling the backend", async () => {
    const fetchMock = mockFetch(200, {});
    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);

    await verify({ ...USER, user_email_id: "not-an-email" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows a connection message when the backend is unreachable", async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);

    await verify();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to connect/);
  });

  it("limits repeated attempts", async () => {
    mockFetch(500, {});
    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);
    for (let i = 0; i < 6; i++) await verify();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Too many attempts/);
  });

  it("shows an error if the widget script fails to load", async () => {
    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);
    const script = document.querySelector(`script[src="${SRC}"]`)!;
    await act(async () => {
      script.dispatchEvent(new Event("error"));
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not load the email verification widget.",
      ),
    );
  });

  it("removes the global receiver when the last button unmounts", () => {
    const { unmount } = render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);
    unmount();
    expect(window.phoneEmailReceiver).toBeUndefined();
  });
});

describe("loadPhoneEmailScript", () => {
  it("resolves once the script loads and reuses the same promise", async () => {
    const first = loadPhoneEmailScript(SRC);
    expect(loadPhoneEmailScript(SRC)).toBe(first);
    document.querySelector(`script[src="${SRC}"]`)!.dispatchEvent(new Event("load"));
    await expect(first).resolves.toBeUndefined();
  });
});
