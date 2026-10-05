import {
  AuthError,
  NetworkError,
  ValidationError,
  errorFromStatus,
  handleApiError,
} from "../src/utils/errorHandler.js";

describe("errorFromStatus", () => {
  it.each([
    [400, ValidationError],
    [401, AuthError],
    [403, AuthError],
    [429, NetworkError],
    [500, NetworkError],
    [502, NetworkError],
    [503, NetworkError],
    [504, NetworkError],
    [418, NetworkError],
  ])("maps %i to the right error class", (status, cls) => {
    expect(errorFromStatus(status)).toBeInstanceOf(cls);
  });

  it("prefers the server's message where it is safe to show", () => {
    expect(errorFromStatus(401, "Session expired").message).toBe("Session expired");
    expect(errorFromStatus(418, "Teapot").message).toBe("Teapot");
  });

  it("marks server errors retryable and unknown statuses not", () => {
    expect((errorFromStatus(503) as NetworkError).retryable).toBe(true);
    expect((errorFromStatus(418) as NetworkError).retryable).toBe(false);
  });
});

describe("handleApiError", () => {
  it("passes typed errors through unchanged", () => {
    const err = new AuthError("nope");
    expect(handleApiError(err)).toBe(err);
  });

  it("maps Axios-style errors by status", () => {
    const err = { message: "x", response: { status: 400, data: { message: "Bad input" } } };
    const mapped = handleApiError(err);
    expect(mapped).toBeInstanceOf(ValidationError);
    expect(mapped.message).toBe("Bad input");
  });

  it("treats a missing response or a fetch TypeError as a connection problem", () => {
    expect(handleApiError({ message: "x", isAxiosError: true })).toBeInstanceOf(NetworkError);
    const fetchFailure = handleApiError(new TypeError("Failed to fetch")) as NetworkError;
    expect(fetchFailure.retryable).toBe(true);
    expect(fetchFailure.message).toMatch(/Unable to connect/);
  });

  it("wraps other errors and unknown values", () => {
    expect(handleApiError(new Error("boom")).message).toBe("boom");
    expect(handleApiError("weird").message).toBe("An unknown error occurred.");
  });
});
