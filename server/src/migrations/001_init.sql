-- v2 interview platform schema.
-- Old single-user chat tables are disposable test data; drop them.
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users ---------------------------------------------------------------------
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,                 -- stored lowercased
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'viewer')),
  requested_role TEXT CHECK (requested_role IN ('manager', 'viewer')),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which viewers each manager may see ----------------------------------------
CREATE TABLE manager_viewers (
  manager_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_id, viewer_id)
);
CREATE INDEX idx_manager_viewers_viewer ON manager_viewers (viewer_id);

-- Resumes -------------------------------------------------------------------
CREATE TABLE resumes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',            -- structured plain text
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resumes_owner ON resumes (owner_id);

-- Prepared question/answer pairs per resume (Basic Information) --------------
CREATE TABLE resume_qa (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id   UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resume_qa_resume ON resume_qa (resume_id, sort_order);

-- Interviews ----------------------------------------------------------------
CREATE TABLE interviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id           UUID REFERENCES interviews(id) ON DELETE SET NULL,
  version             INT NOT NULL DEFAULT 1,
  job_title           TEXT NOT NULL,
  job_description     TEXT,
  system_prompt       TEXT NOT NULL DEFAULT '',
  resume_id           UUID REFERENCES resumes(id) ON DELETE SET NULL,
  resume_text         TEXT,                             -- interview's own copy
  qa_snapshot         JSONB,                            -- copy of resume_qa at start
  resume_copied_at    TIMESTAMPTZ,
  interview_type      TEXT NOT NULL DEFAULT 'intro'
                        CHECK (interview_type IN ('intro', 'technical')),
  interviewers        TEXT NOT NULL DEFAULT '',
  company             TEXT NOT NULL DEFAULT '',
  company_notes       TEXT,
  answer_language     TEXT NOT NULL DEFAULT 'English',
  status              TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'interviewing', 'ended')),
  model               TEXT NOT NULL DEFAULT 'claude-opus-5-5',
  prep_pack           TEXT,
  summary             TEXT,
  carry_summary       BOOLEAN NOT NULL DEFAULT FALSE,
  history_summary     TEXT,
  history_summary_upto UUID,
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_interviews_owner ON interviews (owner_id);
CREATE INDEX idx_interviews_parent ON interviews (parent_id);

-- Which viewers are assigned to an interview --------------------------------
CREATE TABLE interview_viewers (
  interview_id  UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  viewer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (interview_id, viewer_id)
);
CREATE INDEX idx_interview_viewers_viewer ON interview_viewers (viewer_id);

-- Images pasted into a room (coding problems, diagrams) ---------------------
CREATE TABLE interview_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id  UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  media_type    TEXT NOT NULL,
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat transcript -----------------------------------------------------------
CREATE TABLE interview_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  kind        TEXT NOT NULL DEFAULT 'question'
                CHECK (kind IN ('question', 'answer', 'note')),
  image_id    UUID REFERENCES interview_images(id) ON DELETE SET NULL,
  quick       TEXT,                                      -- the say-now line
  content     TEXT NOT NULL DEFAULT '',                  -- question / note / detail
  qa_ref      UUID,                                      -- prepared answer used
  follow_ups  JSONB,
  author_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT CHECK (action IN ('shorter', 'detail', 'example', 'star')),
  model       TEXT,
  state       TEXT NOT NULL DEFAULT 'complete'
                CHECK (state IN ('complete', 'streaming', 'stopped', 'error')),
  quick_ms    INT,
  detail_ms   INT,
  input_tokens INT,
  output_tokens INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_interview_messages_interview
  ON interview_messages (interview_id, created_at);
