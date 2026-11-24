import type { User } from "../domain.js";

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth; the freshly-loaded current user.
      user?: User;
    }
  }
}

export {};
