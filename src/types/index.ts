/**
 * Payload phone.email passes to `window.phoneEmailReceiver` after the user
 * verifies their address. `user_json_url` points at
 * `https://user.phone.email/<id>.json`; the backend reads the verified email
 * from it (never trust `user_email_id` from the browser on its own).
 */
export interface UserObject {
  user_json_url: string;
  user_email_id: string;
}

/** Successful response from the backend's `POST /create-token`. */
export interface TokenResponse {
  email: string;
  expiresIn: number;
}

/** The verified user handed to `onVerified`. */
export interface VerifiedUser {
  email: string;
  expiresIn: number;
}

/** Tracks the current state of the email verification flow. */
export interface VerificationState {
  isLoading: boolean;
  isVerified: boolean;
  error: string | null;
  email: string | null;
}

/** Configuration options for the client-side rate limiter. */
export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

/** Result of an email validation check. */
export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
}

/** Password strength assessment result. */
export interface PasswordStrengthResult {
  strength: "weak" | "medium" | "strong";
  score: number;
  criteria: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasDigit: boolean;
    hasSpecialChar: boolean;
  };
  unmetCriteria: string[];
}

declare global {
  interface Window {
    /** Callback phone.email's widget script invokes after verification. */
    phoneEmailReceiver?: (userObj: UserObject) => void;
  }
}
