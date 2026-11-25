import type { InterviewRow, User } from "../common/types.js";

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth; the freshly-loaded current user.
      user?: User;
      // Set by the interview access middleware (loadForRead).
      interview?: InterviewRow;
    }
  }
}

export {};
