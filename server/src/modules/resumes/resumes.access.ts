import { asyncHandler } from "../../common/async-handler.js";
import { NotFoundError } from "../../common/errors.js";
import { canAccessResume } from "../auth/auth.permissions.js";

// Guards a resume route by the id in the path: 404 (not 403) when the caller
// may not access it, so existence is not leaked. Replaces the canAccessResume
// check that was repeated at the top of every resume handler.
export const requireResumeAccess = asyncHandler(async (req, _res, next) => {
  if (!(await canAccessResume(req.user!, req.params.id))) {
    throw new NotFoundError("Resume not found");
  }
  next();
});
