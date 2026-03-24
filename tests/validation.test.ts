import { validateEmail, validatePasswordStrength, sanitizeInput } from "../src/utils/validation";

describe("validateEmail", () => {
  describe("valid emails", () => {
    it("should accept a standard email address", () => {
      const result = validateEmail("user@example.com");
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept an email with subdomains", () => {
      const result = validateEmail("user@mail.example.co.uk");
      expect(result.isValid).toBe(true);
    });

    it("should accept an email with plus addressing", () => {
      const result = validateEmail("user+tag@example.com");
      expect(result.isValid).toBe(true);
    });

    it("should accept an email with dots in local part", () => {
      const result = validateEmail("first.last@example.com");
      expect(result.isValid).toBe(true);
    });

    it("should accept an email with numbers in local part", () => {
      const result = validateEmail("user123@example.com");
      expect(result.isValid).toBe(true);
    });

    it("should trim whitespace and still validate", () => {
      const result = validateEmail("  user@example.com  ");
      expect(result.isValid).toBe(true);
    });
  });

  describe("invalid formats", () => {
    it("should reject an empty string", () => {
      const result = validateEmail("");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Email address is required");
    });

    it("should reject an email without @ symbol", () => {
      const result = validateEmail("userexample.com");
      expect(result.isValid).toBe(false);
    });

    it("should reject an email without domain", () => {
      const result = validateEmail("user@");
      expect(result.isValid).toBe(false);
    });

    it("should reject an email without local part", () => {
      const result = validateEmail("@example.com");
      expect(result.isValid).toBe(false);
    });

    it("should reject an email with spaces in the middle", () => {
      const result = validateEmail("user name@example.com");
      expect(result.isValid).toBe(false);
    });

    it("should reject a domain without a dot", () => {
      const result = validateEmail("user@localhost");
      expect(result.isValid).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should reject an email exceeding 254 characters", () => {
      const longLocal = "a".repeat(200);
      const result = validateEmail(`${longLocal}@example.com`);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Email address is too long");
    });

    it("should reject a local part exceeding 64 characters", () => {
      const longLocal = "a".repeat(65);
      const result = validateEmail(`${longLocal}@example.com`);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Local part of email is too long");
    });

    it("should reject a TLD with only one character", () => {
      const result = validateEmail("user@example.c");
      expect(result.isValid).toBe(false);
      expect(result.error).toBe("Invalid top-level domain");
    });

    it("should handle null-like input gracefully", () => {
      const result = validateEmail(undefined as unknown as string);
      expect(result.isValid).toBe(false);
    });
  });
});

describe("validatePasswordStrength", () => {
  describe("weak passwords", () => {
    it("should rate an empty password as weak", () => {
      const result = validatePasswordStrength("");
      expect(result.strength).toBe("weak");
      expect(result.score).toBeLessThanOrEqual(2);
    });

    it("should rate a short lowercase-only password as weak", () => {
      const result = validatePasswordStrength("abc");
      expect(result.strength).toBe("weak");
      expect(result.unmetCriteria.length).toBeGreaterThan(2);
    });

    it("should rate a numeric-only password as weak", () => {
      const result = validatePasswordStrength("12345678");
      expect(result.strength).toBe("weak");
    });
  });

  describe("medium passwords", () => {
    it("should rate a password with mixed case and length as medium", () => {
      const result = validatePasswordStrength("Abcdefgh");
      expect(result.strength).toBe("medium");
    });

    it("should rate a password with letters and digits as medium", () => {
      const result = validatePasswordStrength("abcd1234");
      expect(result.strength).toBe("medium");
    });

    it("should return specific unmet criteria", () => {
      const result = validatePasswordStrength("abcdefgh");
      expect(result.criteria.minLength).toBe(true);
      expect(result.criteria.hasLowercase).toBe(true);
      expect(result.criteria.hasUppercase).toBe(false);
      expect(result.unmetCriteria).toContain("At least one uppercase letter");
    });
  });

  describe("strong passwords", () => {
    it("should rate a password meeting all criteria as strong", () => {
      const result = validatePasswordStrength("Str0ng!Pass");
      expect(result.strength).toBe("strong");
      expect(result.score).toBe(5);
      expect(result.unmetCriteria).toHaveLength(0);
    });

    it("should confirm all criteria flags are true for a strong password", () => {
      const result = validatePasswordStrength("C0mpl3x!ty");
      expect(result.criteria.minLength).toBe(true);
      expect(result.criteria.hasUppercase).toBe(true);
      expect(result.criteria.hasLowercase).toBe(true);
      expect(result.criteria.hasDigit).toBe(true);
      expect(result.criteria.hasSpecialChar).toBe(true);
    });
  });
});

describe("sanitizeInput", () => {
  it("should escape HTML angle brackets", () => {
    const result = sanitizeInput("<script>alert('xss')</script>");
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  it("should escape ampersands", () => {
    const result = sanitizeInput("rock & roll");
    expect(result).toContain("&amp;");
  });

  it("should escape double quotes", () => {
    const result = sanitizeInput('say "hello"');
    expect(result).toContain("&quot;");
  });

  it("should trim whitespace", () => {
    const result = sanitizeInput("  hello  ");
    expect(result).toBe("hello");
  });

  it("should return empty string for falsy input", () => {
    expect(sanitizeInput("")).toBe("");
    expect(sanitizeInput(undefined as unknown as string)).toBe("");
  });
});
