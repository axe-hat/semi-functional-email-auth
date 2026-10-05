import type { EmailValidationResult, PasswordStrengthResult } from "../types/index.js";

const LOCAL_PART = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/**
 * Validates an email address against the common RFC 5321/5322 rules:
 * one "@", a local part of at most 64 characters with no leading, trailing or
 * repeated dots, a dotted domain of valid labels, a TLD of 2+ letters, and at
 * most 254 characters overall.
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email || email.trim().length === 0) {
    return { isValid: false, error: "Email address is required" };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length > 254) {
    return { isValid: false, error: "Email address is too long" };
  }

  const parts = trimmed.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { isValid: false, error: "Email must contain exactly one @ symbol" };
  }
  const [localPart, domain] = parts;

  if (localPart.length > 64) {
    return { isValid: false, error: "Local part of email is too long" };
  }

  if (!LOCAL_PART.test(localPart)) {
    return { isValid: false, error: "Invalid email format" };
  }

  if (!domain.includes(".")) {
    return { isValid: false, error: "Email domain must contain a dot" };
  }

  const labels = domain.split(".");
  if (!labels.every((label) => DOMAIN_LABEL.test(label))) {
    return { isValid: false, error: "Invalid email format" };
  }

  const tld = labels[labels.length - 1];
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return { isValid: false, error: "Invalid top-level domain" };
  }

  return { isValid: true };
}

/**
 * Optional helper for apps that also collect a password. Checks length,
 * upper/lower case, digit and special character, and returns a strength level
 * plus the unmet criteria. (The phone.email flow itself is passwordless.)
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const value = password ?? "";
  const criteria = {
    minLength: value.length >= 8,
    hasUppercase: /[A-Z]/.test(value),
    hasLowercase: /[a-z]/.test(value),
    hasDigit: /[0-9]/.test(value),
    hasSpecialChar: /[^A-Za-z0-9\s]/.test(value),
  };

  const unmetCriteria: string[] = [];
  if (!criteria.minLength) unmetCriteria.push("At least 8 characters");
  if (!criteria.hasUppercase) unmetCriteria.push("At least one uppercase letter");
  if (!criteria.hasLowercase) unmetCriteria.push("At least one lowercase letter");
  if (!criteria.hasDigit) unmetCriteria.push("At least one digit");
  if (!criteria.hasSpecialChar) unmetCriteria.push("At least one special character");

  const score = Object.values(criteria).filter(Boolean).length;
  const strength = score <= 2 ? "weak" : score <= 4 ? "medium" : "strong";

  return { strength, score, criteria, unmetCriteria };
}

/**
 * Escapes HTML special characters. React already escapes text it renders, so
 * use this only when inserting text into raw HTML (e.g. emails, innerHTML).
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
