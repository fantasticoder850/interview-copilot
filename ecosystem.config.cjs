/**
 * PM2 process definitions for the Interview Assistant.
 *
 * Build first (PM2 runs the built artifacts, not the dev servers):
 *   npm run build
 *
 * Then:
 *   pm2 start ecosystem.config.cjs            # start both
 *   pm2 restart ecosystem.config.cjs          # restart both
 *   pm2 reload  ecosystem.config.cjs --update-env
 *   pm2 stop    ecosystem.config.cjs
 *   pm2 logs                                  # tail both
 *
 * Override repo path: INTERVIEW_ROOT=/path/to/interview-assistant pm2 start ecosystem.config.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.INTERVIEW_ROOT || __dirname;

function loadDotEnv(filePath) {
  const env = {};
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  } catch {
    // server/.env may be missing until it is created from .env.example
  }
  return env;
}

// Backend reads server/.env (ANTHROPIC_API_KEY, DATABASE_URL, PORT).
const serverEnv = loadDotEnv(path.join(ROOT, "server", ".env"));
const apiPort = serverEnv.PORT || "9011";
const webPort = "9012";

module.exports = {
  apps: [
    {
      name: "interview-api",
      cwd: path.join(ROOT, "server"),
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "10s",
      env: {
        ...serverEnv,
        NODE_ENV: "production",
        PORT: apiPort,
      },
    },
    {
      name: "interview-web",
      cwd: path.join(ROOT, "web"),
      // Run Vite's node entry directly (not via `npm run preview`). npm does
      // not forward signals to its child, so on `pm2 stop` PM2 kills npm while
      // the real vite process is reparented to init and keeps holding the port
      // (the recurring "I stopped it but it's still up" orphan). Launching the
      // JS entry makes vite PM2's own child, so SIGINT reaches it and it exits.
      script: "node_modules/vite/bin/vite.js",
      args: `preview --port ${webPort} --host`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 15,
      min_uptime: "10s",
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
