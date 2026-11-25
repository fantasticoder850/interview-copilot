import Anthropic from "@anthropic-ai/sdk";
import { MissingApiKeyError } from "../../common/errors.js";
import { query } from "../db.js";
import { decryptSecret } from "../crypto.js";

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

// The client for work done on behalf of a user: their own key only. Throws
// MissingApiKeyError if they have not set one — there is no shared fallback.
export async function clientForUser(userId: string): Promise<Anthropic> {
  const key = await getUserApiKey(userId);
  if (!key) throw new MissingApiKeyError();
  return anthropicWithKey(key);
}
