import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 does not forward rejected promises from async handlers to the error
// middleware. Wrap async handlers with this so a thrown/rejected error reaches
// the central error handler instead of becoming an unhandled rejection.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
