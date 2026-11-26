-- Reusable system-prompt templates owned by a user (manager/admin). Selected or
-- customised when creating an interview; the interview still stores its own
-- system_prompt text, so this table is purely a personal library.
CREATE TABLE system_prompts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_system_prompts_owner ON system_prompts (owner_id);
