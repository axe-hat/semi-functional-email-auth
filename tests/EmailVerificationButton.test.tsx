import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import EmailVerificationButton from "../src/components/EmailVerificationButton.js";
import { useEmailVerification } from "../src/hooks/useEmailVerification.js";
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
    for (let i = 0; i < 6; i++)
      await verify({ ...USER, user_json_url: `https://user.phone.email/user_${i}.json` });
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

describe("EmailVerificationButton customisation", () => {
  it("uses custom labels and class names", async () => {
    mockFetch(200, { email: "jane@example.com", expiresIn: 60 });
    render(
      <EmailVerificationButton
        clientId="c"
        scriptSrc={SRC}
        labels={{ verified: (email) => `Correo verificado: ${email}` }}
        classNames={{ success: "ok", widget: "my-widget" }}
      />,
    );
    await verify();
    const success = await screen.findByText("Correo verificado: jane@example.com");
    expect(success).toHaveClass("ok");
    expect(success).toHaveStyle({ backgroundColor: "#d4edda" });
    expect(document.querySelector(".pe_verify_email")).toHaveClass("my-widget");
  });

  it("drops the built-in styles when unstyled", async () => {
    mockFetch(401, { message: "Nope." });
    render(
      <EmailVerificationButton clientId="c" scriptSrc={SRC} unstyled classNames={{ error: "e" }} />,
    );
    await verify();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveClass("e");
    expect(alert).not.toHaveAttribute("style");
  });
});

describe("useEmailVerification", () => {
  it("exposes the verification state and can reset it", async () => {
    mockFetch(200, { email: "jane@example.com", expiresIn: 60 });
    const { result } = renderHook(() => useEmailVerification({ scriptSrc: SRC }));
    await verify();
    await waitFor(() => expect(result.current.state.isVerified).toBe(true));
    act(() => result.current.reset());
    expect(result.current.state).toEqual({
      isLoading: false,
      isVerified: false,
      error: null,
      email: null,
    });
  });
});

describe("phone.email widget lifecycle", () => {
  it("delivers each verification once, even if the widget reports it twice", async () => {
    const fetchMock = mockFetch(200, { email: "jane@example.com", expiresIn: 60 });
    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);
    await verify();
    await verify();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-runs the widget script when the button mounts again into an empty element", async () => {
    const load = () =>
      act(async () => {
        document.querySelectorAll(`script[src="${SRC}"]`).forEach((s) => {
          s.dispatchEvent(new Event("load"));
        });
      });
    const first = render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);
    const original = document.querySelector(`script[src="${SRC}"]`);
    await load();
    // Simulate the widget drawing its button, then the button unmounting.
    document.querySelector(".pe_verify_email")!.appendChild(document.createElement("button"));
    first.unmount();

    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);
    const rerun = document.querySelectorAll(`script[src="${SRC}"]`);
    expect(rerun).toHaveLength(1);
    expect(rerun[0]).not.toBe(original);
  });

  it("doesn't re-run the script while the widget is already drawn", async () => {
    render(<EmailVerificationButton clientId="c" scriptSrc={SRC} />);
    const script = document.querySelector(`script[src="${SRC}"]`)!;
    await act(async () => {
      script.dispatchEvent(new Event("load"));
    });
    document.querySelector(".pe_verify_email")!.appendChild(document.createElement("button"));
    await loadPhoneEmailScript(SRC);
    expect(document.querySelector(`script[src="${SRC}"]`)).toBe(script);
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
