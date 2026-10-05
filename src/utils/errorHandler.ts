/**
 * Typed error classes and centralized error handling for the
 * email verification flow.
 */

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export class ValidationError extends Error {
  public readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export class NetworkError extends Error {
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(message: string, statusCode?: number, retryable: boolean = true) {
    super(message);
    this.name = "NetworkError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export type AppError = AuthError | ValidationError | NetworkError;

/** Maps an HTTP status (plus the server's message, if any) to a typed error. */
export function errorFromStatus(status: number, serverMessage?: string): AppError {
  switch (status) {
    case 400:
      return new ValidationError(
        serverMessage || "The request was invalid. Please check your input.",
        "request",
      );
    case 401:
      return new AuthError(serverMessage || "Authentication failed. Please try again.", 401);
    case 403:
      return new AuthError(
        serverMessage || "You do not have permission to perform this action.",
        403,
      );
    case 429:
      return new NetworkError("Too many requests. Please wait a moment and try again.", 429, true);
    case 500:
    case 502:
    case 503:
    case 504:
      return new NetworkError(
        "The server is experiencing issues. Please try again later.",
        status,
        true,
      );
    default:
      return new NetworkError(
        serverMessage || `Unexpected error (status ${status}).`,
        status,
        false,
      );
  }
}

/**
 * Maps any thrown value (fetch failure, Axios-style error, or Error) to a
 * typed error with a user-friendly message.
 */
export function handleApiError(error: unknown): AppError {
  if (
    error instanceof AuthError ||
    error instanceof ValidationError ||
    error instanceof NetworkError
  ) {
    return error;
  }

  // Axios-style error ({ response?: { status, data } })
  if (isHttpLikeError(error)) {
    if (!error.response) {
      return new NetworkError(
        "Unable to connect to the server. Please check your internet connection.",
        undefined,
        true,
      );
    }
    return errorFromStatus(error.response.status, error.response.data?.message);
  }

  // fetch() rejects with a TypeError when the network is unreachable
  if (error instanceof TypeError) {
    return new NetworkError(
      "Unable to connect to the server. Please check your internet connection.",
      undefined,
      true,
    );
  }

  if (error instanceof Error) {
    return new NetworkError(error.message, undefined, false);
  }

  return new NetworkError("An unknown error occurred.", undefined, false);
}

function isHttpLikeError(
  error: unknown,
): error is { response?: { status: number; data?: { message?: string } }; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    ("response" in error || "isAxiosError" in error)
  );
}
