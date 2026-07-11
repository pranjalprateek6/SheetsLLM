-- SheetsLLM: Create all tables
-- Run this in Supabase Dashboard → SQL Editor → New query

-- ── Files ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    r2_key      TEXT NOT NULL,
    original_format TEXT NOT NULL DEFAULT 'csv',
    row_count   INTEGER NOT NULL DEFAULT 0,
    column_count INTEGER NOT NULL DEFAULT 0,
    schema_json JSONB NOT NULL DEFAULT '{}',
    size_bytes  BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (user_id);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at DESC);

-- ── Transformations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transformations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id             UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    step_number         INTEGER NOT NULL,
    instruction         TEXT NOT NULL,
    sql_query           TEXT NOT NULL,
    explain             TEXT,
    row_count_after     INTEGER,
    column_count_after  INTEGER,
    columns_after       JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (file_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_transformations_file_id ON transformations (file_id);

-- ── Audit Log ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    file_id     UUID REFERENCES files(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_file_id ON audit_log (file_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);

-- ── Chat Messages ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id         UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    message_type    TEXT NOT NULL DEFAULT 'text',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_file_id ON chat_messages (file_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages (created_at);

-- ── Auto-update updated_at on files ──────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
