import { useCallback, useEffect, useRef, useState } from "react";
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
} from "../components/phoneEmailScript.js";
import type { TokenResponse, UserObject, VerificationState, VerifiedUser } from "../types/index.js";

export interface UseEmailVerificationOptions {
  /** Base URL of your backend (default: same origin, e.g. behind a proxy). */
  apiUrl?: string;
  /** Called after the backend confirms the email and sets the session cookie. */
  onVerified?: (user: VerifiedUser) => void;
  /** Called with a typed error when verification fails. */
  onError?: (error: AppError) => void;
  /** Override the widget script URL (mainly for tests). */
  scriptSrc?: string;
}

export interface UseEmailVerificationResult {
  state: VerificationState;
  /** Clears the verified/error state, e.g. to verify another address. */
  reset: () => void;
}

const INITIAL: VerificationState = {
  isLoading: false,
  isVerified: false,
  error: null,
  email: null,
};

/**
 * Headless version of `EmailVerificationButton`: loads the phone.email widget,
 * receives its callback, and posts the verification URL to
 * `${apiUrl}/create-token`. Render your own UI around the returned state, and
 * put an element with class `pe_verify_email` and `data-client-id` on the page
 * for the widget to turn into its button.
 */
export function useEmailVerification({
  apiUrl = "",
  onVerified,
  onError,
  scriptSrc = PHONE_EMAIL_SCRIPT_SRC,
}: UseEmailVerificationOptions = {}): UseEmailVerificationResult {
  const [state, setState] = useState<VerificationState>(INITIAL);
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

  const reset = useCallback(() => setState(INITIAL), []);
  return { state, reset };
}
