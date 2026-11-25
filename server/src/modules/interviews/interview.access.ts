import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../common/async-handler.js";
import { ForbiddenError, NotFoundError } from "../../common/errors.js";
import type { InterviewRow } from "../../common/types.js";
import { canAccessInterview, canManageInterview } from "../auth/auth.permissions.js";
import { loadInterview } from "./interview.context.js";

// Load the interview named by :id, enforce read access, and attach it to the
// request. 404 (not 403) when the caller may not see it, so existence is not
// leaked. Shared by the interview and room routers (was duplicated in both).
export const requireInterviewRead = asyncHandler(async (req, _res, next) => {
  const interview = await loadInterview(req.params.id);
  if (!interview || !(await canAccessInterview(req.user!, interview))) {
    throw new NotFoundError("Interview not found");
  }
  req.interview = interview;
  next();
});

// Requires manage rights on the already-loaded interview (run after
// requireInterviewRead).
export function requireInterviewManage(req: Request, _res: Response, next: NextFunction) {
  if (!canManageInterview(req.user!, req.interview!)) throw new ForbiddenError();
  next();
}

// Convenience accessor for the interview attached by requireInterviewRead.
export function currentInterview(req: Request): InterviewRow {
  return req.interview!;
}
