import { useEffect, useRef, useState, type CSSProperties } from "react";
import { validateEmail } from "../utils/validation.js";
import {
  AppError,
  errorFromStatus,
  handleApiError,
  NetworkError,
  ValidationError,
} from "../utils/errorHandler.js";
import { RateLimiter } from "../utils/rateLimiter.js";
import {
  loadPhoneEmailScript,
  PHONE_EMAIL_SCRIPT_SRC,
  registerReceiver,
} from "./phoneEmailScript.js";
import type { TokenResponse, UserObject, VerificationState, VerifiedUser } from "../types/index.js";

export interface EmailVerificationButtonProps {
  /** Your phone.email client ID. */
  clientId: string;
  /** Base URL of your backend (default: same origin, e.g. behind a proxy). */
  apiUrl?: string;
  /** Called after the backend confirms the email and sets the session cookie. */
  onVerified?: (user: VerifiedUser) => void;
  /** Called with a typed error when verification fails. */
  onError?: (error: AppError) => void;
  /** Extra class for the wrapper element. */
  className?: string;
  /** Override the widget script URL (mainly for tests). */
  scriptSrc?: string;
}

const box: CSSProperties = {
  padding: "8px 12px",
  marginBottom: "8px",
  borderRadius: "4px",
  fontSize: "14px",
};

/**
 * "Verify with email" button backed by phone.email. On success it posts the
 * verification URL to `${apiUrl}/create-token`; the backend reads the verified
 * email from phone.email and sets an httpOnly session cookie (no token is
 * stored in the browser).
 */
export default function EmailVerificationButton({
  clientId,
  apiUrl = "",
  onVerified,
  onError,
  className,
  scriptSrc = PHONE_EMAIL_SCRIPT_SRC,
}: EmailVerificationButtonProps) {
  const [state, setState] = useState<VerificationState>({
    isLoading: false,
    isVerified: false,
    error: null,
    email: null,
  });
  const limiter = useRef(new RateLimiter({ maxRequests: 5, windowMs: 60_000 }));
  // Keep the latest callbacks without re-registering the receiver.
  const callbacks = useRef({ onVerified, onError });
  useEffect(() => {
    callbacks.current = { onVerified, onError };
  }, [onVerified, onError]);

  useEffect(() => {
    let active = true;

    const fail = (error: AppError) => {
      if (!active) return;
      setState((prev) => ({ ...prev, isLoading: false, error: error.message }));
      callbacks.current.onError?.(error);
    };

    const receive = async ({ user_json_url, user_email_id }: UserObject) => {
      const emailCheck = validateEmail(user_email_id);
      if (!emailCheck.isValid) {
        fail(new ValidationError(emailCheck.error || "Invalid email address", "email"));
        return;
      }
      if (!limiter.current.recordRequest()) {
        const seconds = Math.ceil(limiter.current.getRetryAfterMs() / 1000);
        fail(new NetworkError(`Too many attempts. Please try again in ${seconds}s.`, 429, true));
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null, email: user_email_id }));
      try {
        const response = await fetch(`${apiUrl}/create-token`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_json_url }),
        });
        const data = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
          message?: string;
        };
        if (!response.ok) throw errorFromStatus(response.status, data.message);
        if (!active) return;

        const user: VerifiedUser = {
          email: data.email ?? user_email_id,
          expiresIn: data.expiresIn ?? 0,
        };
        setState({ isLoading: false, isVerified: true, error: null, email: user.email });
        callbacks.current.onVerified?.(user);
      } catch (err) {
        fail(handleApiError(err));
      }
    };

    const unregister = registerReceiver((userObj) => void receive(userObj));
    loadPhoneEmailScript(scriptSrc).catch((err: Error) => fail(new NetworkError(err.message)));

    return () => {
      active = false;
      unregister();
    };
  }, [apiUrl, scriptSrc]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div role="status" aria-live="polite">
        {state.isLoading && (
          <div style={{ ...box, textAlign: "center", color: "#6c757d" }}>
            Verifying your email...
          </div>
        )}
        {state.isVerified && (
          <div
            style={{
              ...box,
              color: "#155724",
              backgroundColor: "#d4edda",
              border: "1px solid #c3e6cb",
            }}
          >
            Email verified: {state.email}
          </div>
        )}
      </div>
      {state.error && (
        <div
          role="alert"
          style={{
            ...box,
            color: "#721c24",
            backgroundColor: "#f8d7da",
            border: "1px solid #f5c6cb",
          }}
        >
          {state.error}
        </div>
      )}
      <div
        className="pe_verify_email"
        data-client-id={clientId}
        aria-busy={state.isLoading}
        style={{
          opacity: state.isLoading ? 0.5 : 1,
          pointerEvents: state.isLoading ? "none" : "auto",
        }}
      />
    </div>
  );
}
