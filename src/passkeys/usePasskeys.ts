import { useCallback, useState } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { AppError, AuthError, errorFromStatus, handleApiError } from "../utils/errorHandler.js";
import type { VerifiedUser } from "../types/index.js";

export interface UsePasskeysOptions {
  /** Base URL of your backend (default: same origin). */
  apiUrl?: string;
}

export interface UsePasskeysResult {
  /** Whether this browser can use passkeys at all. */
  supported: boolean;
  /** True while a passkey prompt or request is in progress. */
  isWorking: boolean;
  error: AppError | null;
  /** Adds a passkey to the signed-in account. Resolves true on success. */
  register: () => Promise<boolean>;
  /** Signs in with a passkey. Resolves the user, or null on failure/cancel. */
  signIn: () => Promise<VerifiedUser | null>;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw errorFromStatus(res.status, data.message);
  return data;
}

/** The browser rejects with NotAllowedError when the user closes the prompt. */
function toAppError(err: unknown): AppError {
  if (err instanceof Error && err.name === "NotAllowedError") {
    return new AuthError("The passkey prompt was cancelled or timed out.", 400);
  }
  return handleApiError(err);
}

/**
 * Passkey support for accounts created by email verification: after the
 * first email sign-in, `register()` adds a passkey; next time, `signIn()`
 * signs in with it directly. Needs the backend's `/passkeys` endpoints and the
 * `@simplewebauthn/browser` package.
 */
export function usePasskeys({ apiUrl = "" }: UsePasskeysOptions = {}): UsePasskeysResult {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const run = useCallback(async <T>(task: () => Promise<T>, fallback: T): Promise<T> => {
    setIsWorking(true);
    setError(null);
    try {
      return await task();
    } catch (err) {
      setError(toAppError(err));
      return fallback;
    } finally {
      setIsWorking(false);
    }
  }, []);

  const register = useCallback(
    () =>
      run(async () => {
        const optionsJSON = await post<PublicKeyCredentialCreationOptionsJSON>(
          `${apiUrl}/passkeys/register/options`,
        );
        const response = await startRegistration({ optionsJSON });
        await post(`${apiUrl}/passkeys/register/verify`, { response });
        return true;
      }, false),
    [apiUrl, run],
  );

  const signIn = useCallback(
    () =>
      run<VerifiedUser | null>(async () => {
        const { flowId, options } = await post<{
          flowId: string;
          options: PublicKeyCredentialRequestOptionsJSON;
        }>(`${apiUrl}/passkeys/login/options`);
        const response = await startAuthentication({ optionsJSON: options });
        return post<VerifiedUser>(`${apiUrl}/passkeys/login/verify`, { flowId, response });
      }, null),
    [apiUrl, run],
  );

  return { supported: browserSupportsWebAuthn(), isWorking, error, register, signIn };
}
