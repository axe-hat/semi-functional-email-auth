export { default as EmailVerificationButton } from "./components/EmailVerificationButton.js";
export {
  DEFAULT_LABELS,
  type EmailVerificationButtonProps,
} from "./components/EmailVerificationButton.js";
export {
  useEmailVerification,
  type UseEmailVerificationOptions,
  type UseEmailVerificationResult,
} from "./hooks/useEmailVerification.js";
export { useSession, type UseSessionOptions, type UseSessionResult } from "./hooks/useSession.js";
export { loadPhoneEmailScript, PHONE_EMAIL_SCRIPT_SRC } from "./components/phoneEmailScript.js";
export { validateEmail, validatePasswordStrength, sanitizeInput } from "./utils/validation.js";
export { RateLimiter } from "./utils/rateLimiter.js";
export {
  AuthError,
  ValidationError,
  NetworkError,
  errorFromStatus,
  handleApiError,
} from "./utils/errorHandler.js";
export type { AppError } from "./utils/errorHandler.js";
export type * from "./types/index.js";
