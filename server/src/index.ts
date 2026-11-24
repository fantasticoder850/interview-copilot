import "dotenv/config";
import cors from "cors";
import express from "express";
import { MODELS } from "./models.js";
import { chatRouter } from "./routes/chat.js";
import { sessionsRouter } from "./routes/sessions.js";

const app = express();
const PORT = Number(process.env.PORT) || 9011;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/models", (_req, res) => res.json(MODELS));

app.use("/api/sessions", sessionsRouter);
app.use("/api/sessions", chatRouter);

// Centralized error handler.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Interview Assistant API listening on http://localhost:${PORT}`);
});
