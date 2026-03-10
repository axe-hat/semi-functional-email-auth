/**
 * Email validation using RFC 5322 compliant regex pattern.
 * Checks both format and common structural requirements.
 */
export function validateEmail(email: string): {
  isValid: boolean;
  error?: string;
} {
  if (!email || email.trim().length === 0) {
    return { isValid: false, error: "Email address is required" };
  }

  const trimmed = email.trim().toLowerCase();

  // Check max length (RFC 5321)
  if (trimmed.length > 254) {
    return { isValid: false, error: "Email address is too long" };
  }

  // Check local part length
  const [localPart, domain] = trimmed.split("@");
  if (!localPart || !domain) {
    return { isValid: false, error: "Email must contain an @ symbol" };
  }

  if (localPart.length > 64) {
    return { isValid: false, error: "Local part of email is too long" };
  }

  // RFC 5322 regex pattern
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: "Invalid email format" };
  }

  // Domain must have at least one dot
  if (!domain.includes(".")) {
    return { isValid: false, error: "Email domain must contain a dot" };
  }

  // TLD must be at least 2 characters
  const tld = domain.split(".").pop();
  if (!tld || tld.length < 2) {
    return { isValid: false, error: "Invalid top-level domain" };
  }

  return { isValid: true };
}

/**
 * Password strength validator.
 * Checks minimum length, uppercase, lowercase, digit, and special character.
 * Returns a strength level and list of unmet criteria.
 */
export function validatePasswordStrength(password: string): {
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
} {
  const criteria = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const unmetCriteria: string[] = [];
  if (!criteria.minLength) unmetCriteria.push("At least 8 characters");
  if (!criteria.hasUppercase) unmetCriteria.push("At least one uppercase letter");
  if (!criteria.hasLowercase) unmetCriteria.push("At least one lowercase letter");
  if (!criteria.hasDigit) unmetCriteria.push("At least one digit");
  if (!criteria.hasSpecialChar) unmetCriteria.push("At least one special character");

  const score = Object.values(criteria).filter(Boolean).length;

  let strength: "weak" | "medium" | "strong";
  if (score <= 2) {
    strength = "weak";
  } else if (score <= 4) {
    strength = "medium";
  } else {
    strength = "strong";
  }

  return { strength, score, criteria, unmetCriteria };
}

/**
 * Sanitize user input to prevent XSS attacks.
 * Escapes HTML entities and trims whitespace.
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";

  return input
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}
