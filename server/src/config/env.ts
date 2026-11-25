import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT) || 9011,
  databaseUrl: required("DATABASE_URL"),
  // No server-wide ANTHROPIC_API_KEY: every Claude call uses the user's own key.
  jwtSecret: required("JWT_SECRET"),
  isProd: process.env.NODE_ENV === "production",
};
