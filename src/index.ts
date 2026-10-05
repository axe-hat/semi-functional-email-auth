export { default as EmailVerificationButton } from "./components/EmailVerificationButton.js";
export type { EmailVerificationButtonProps } from "./components/EmailVerificationButton.js";
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
