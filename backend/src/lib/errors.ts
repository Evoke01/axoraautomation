export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "internal_error",
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication failed.", details?: Record<string, unknown>) {
    super(message, 401, "auth_failed", details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "validation_error", details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 404, "not_found", details);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message: string, public readonly availableAt: Date) {
    super(message, 429, "quota_exceeded", { availableAt: availableAt.toISOString() });
  }
}
