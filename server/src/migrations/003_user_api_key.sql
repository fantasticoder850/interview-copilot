-- Per-user Anthropic API key, encrypted at rest (AES-256-GCM, see crypto.ts).
ALTER TABLE users ADD COLUMN anthropic_api_key_enc TEXT;
