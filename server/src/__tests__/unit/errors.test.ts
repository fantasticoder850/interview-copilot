import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { errorMiddleware } from "../../common/error-middleware.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  MissingApiKeyError,
  NotFoundError,
  UnauthorizedError,
  UpstreamAIError,
} from "../../common/errors.js";

function mockRes() {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("error classes", () => {
  it("map to their HTTP status codes", () => {
    expect(new BadRequestError().status).toBe(400);
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ConflictError().status).toBe(409);
    expect(new MissingApiKeyError().status).toBe(402);
    expect(new UpstreamAIError().status).toBe(502);
  });
});

describe("errorMiddleware", () => {
  it("translates an AppError to its status + message", () => {
    const res = mockRes();
    errorMiddleware(new NotFoundError("Interview not found"), {} as any, res, vi.fn());
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Interview not found" });
  });

  it("merges AppError details into the body", () => {
    const res = mockRes();
    errorMiddleware(new ForbiddenError("Account is not active", { status: "pending" }), {} as any, res, vi.fn());
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Account is not active", status: "pending" });
  });

  it("returns a generic 500 for an unknown error (no internal leak)", () => {
    const res = mockRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorMiddleware(new Error("secret db detail"), {} as any, res, vi.fn());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    spy.mockRestore();
  });

  it("does nothing when headers already sent", () => {
    const res = mockRes();
    res.headersSent = true;
    errorMiddleware(new NotFoundError(), {} as any, res, vi.fn());
    expect(res.statusCode).toBe(0);
  });
});
