/**
 * Represents the user object returned by the phone.email verification API.
 */
export interface UserObject {
  user_json_url: string;
  user_email_id: string;
}

/**
 * Response from the /create-token endpoint.
 */
export interface TokenResponse {
  token: string;
  expiresIn?: number;
  refreshToken?: string;
}

/**
 * Tracks the current state of the email verification flow.
 */
export interface VerificationState {
  isLoading: boolean;
  isVerified: boolean;
  error: string | null;
  email: string | null;
}

/**
 * Configuration options for the client-side rate limiter.
 */
export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

/**
 * Result of an email validation check.
 */
export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Password strength assessment result.
 */
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
