import Anthropic from "@anthropic-ai/sdk";
import { decryptSecret } from "./crypto.js";
import { query } from "./db.js";

// Env-key client, used as a fallback when a user has not set their own key.
export const anthropic = new Anthropic();

// Cache one client per API key so we don't rebuild on every request.
const clients = new Map<string, Anthropic>();

export function anthropicWithKey(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey });
    clients.set(apiKey, c);
  }
  return c;
}

export async function getUserApiKey(userId: string): Promise<string | null> {
  const { rows } = await query<{ anthropic_api_key_enc: string | null }>(
    `SELECT anthropic_api_key_enc FROM users WHERE id = $1`,
    [userId],
  );
  const enc = rows[0]?.anthropic_api_key_enc;
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

// The client for work done on behalf of a user: their own key if set,
// otherwise the env-key fallback.
export async function clientForUser(userId: string): Promise<Anthropic> {
  const key = await getUserApiKey(userId);
  return key ? anthropicWithKey(key) : anthropic;
}
