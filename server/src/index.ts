import "dotenv/config";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { env } from "./env.js";
import { MODELS } from "./models.js";
import { seedAdmin } from "./auth/seedAdmin.js";
import { requireAuth } from "./auth/middleware.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { interviewsRouter } from "./routes/interviews.js";
import { peopleRouter } from "./routes/people.js";
import { resumesRouter } from "./routes/resumes.js";
import { roomRouter } from "./routes/room.js";

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

// Centralized error handler.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  },
);

async function start() {
  await seedAdmin();
  app.listen(env.port, () => {
    console.log(`Interview Assistant API listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
