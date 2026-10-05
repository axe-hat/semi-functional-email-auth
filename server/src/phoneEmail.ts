/**
 * Confirms a verification with phone.email. The browser only sends the
 * `user_json_url` it received; the server fetches that JSON itself, so the
 * verified email comes from phone.email, not from the client.
 */

export const PHONE_EMAIL_HOST = "user.phone.email";

export class VerificationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

/**
 * Accepts only `https://user.phone.email/user_<id>.json` (phone.email's documented format). Anything else is
 * rejected before any request is made, so the endpoint can't be used to make
 * the server fetch arbitrary URLs.
 */
export function parseVerificationUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 512) {
    throw new VerificationError("A valid user_json_url is required.", 400);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VerificationError("A valid user_json_url is required.", 400);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== PHONE_EMAIL_HOST ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !/^\/user_[\w-]+\.json$/.test(url.pathname) ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new VerificationError("user_json_url must be a phone.email verification URL.", 400);
  }
  return url;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Fetches the phone.email JSON and returns the verified, lower-cased email. */
export async function fetchVerifiedEmail(
  url: URL,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new VerificationError("Could not reach phone.email to confirm the verification.", 502);
  }
  if (!response.ok) {
    throw new VerificationError("Verification could not be confirmed.", 401);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new VerificationError("Unexpected response from phone.email.", 502);
  }
  const email =
    typeof data === "object" && data !== null && "user_email_id" in data
      ? (data as { user_email_id: unknown }).user_email_id
      : undefined;
  if (typeof email !== "string" || !EMAIL.test(email.trim())) {
    throw new VerificationError("Verification could not be confirmed.", 401);
  }
  return email.trim().toLowerCase();
}
