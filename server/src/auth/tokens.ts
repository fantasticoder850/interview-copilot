import jwt from "jsonwebtoken";
import { env } from "../env.js";

export const AUTH_COOKIE = "ia_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface TokenPayload {
  sub: string; // user id
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: MAX_AGE_SECONDS,
  });
}

export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProd,
    maxAge: MAX_AGE_SECONDS * 1000,
    path: "/",
  };
}
