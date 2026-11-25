import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { errorMiddleware } from "./common/error-middleware.js";
import { MODELS } from "./config/models.js";
import { requireAuth } from "./modules/auth/auth.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { interviewsRouter } from "./modules/interviews/interview.routes.js";
import { resumesRouter } from "./modules/resumes/resumes.routes.js";
import { roomRouter } from "./modules/room/room.routes.js";
import { adminRouter, peopleRouter } from "./modules/users/users.routes.js";

// Builds and configures the Express app. Kept separate from the listen() call
// so it can be imported by tests (supertest) without opening a port.
export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Model list (requires auth so the catalogue isn't public).
  app.get("/api/models", requireAuth, (_req, res) => res.json(MODELS));

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", peopleRouter);
  app.use("/api/resumes", resumesRouter);
  app.use("/api/interviews", interviewsRouter);
  app.use("/api/interviews", roomRouter);

  // Centralized error handler (last).
  app.use(errorMiddleware);

  return app;
}
