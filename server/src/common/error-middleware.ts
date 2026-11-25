import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errors.js";

// Central Express error handler. Translates AppError subclasses to their HTTP
// status + message (plus any extra details); everything else is logged and
// returned as a generic 500 so internal details never leak to the client.
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...err.details });
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
}
