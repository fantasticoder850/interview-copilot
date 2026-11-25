// Central error hierarchy. Any thrown AppError is translated to its HTTP
// status and message by the error middleware; anything else becomes a 500.

export class AppError extends Error {
  readonly status: number;
  // Optional extra fields merged into the JSON error body (e.g. { status }).
  readonly details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: Record<string, unknown>) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated", details?: Record<string, unknown>) {
    super(401, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: Record<string, unknown>) {
    super(403, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", details?: Record<string, unknown>) {
    super(404, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: Record<string, unknown>) {
    super(409, message, details);
  }
}

// Raised when work would require a Claude call but the user has not set their
// own Anthropic key. There is no shared/env fallback key — every call is billed
// to the user's own key, so usage shows up in that user's Anthropic account.
export class MissingApiKeyError extends AppError {
  constructor() {
    super(
      402,
      "No Anthropic API key set. Add your key in Account settings before running interviews.",
    );
  }
}

// Raised when an upstream AI provider call fails (non-auth). Surfaces as 502.
export class UpstreamAIError extends AppError {
  constructor(message = "The AI provider request failed") {
    super(502, message);
  }
}
