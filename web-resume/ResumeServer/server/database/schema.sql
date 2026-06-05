-- Resume-Suite Schema
-- Run via: node admin/scripts/setup.js (which calls init-database.js)

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50)  UNIQUE NOT NULL,
    full_name   VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role        VARCHAR(20)  NOT NULL DEFAULT 'user',
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug         VARCHAR(255) NOT NULL,
    title        VARCHAR(255) NOT NULL,
    content      TEXT         NOT NULL,
    folder_name  VARCHAR(255),
    folder_index INTEGER,
    created_at   TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS workflow_jobs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id  INTEGER     NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    step        VARCHAR(50) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    auto_chain  BOOLEAN     NOT NULL DEFAULT false,
    error       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_listing
    ON workflow_jobs(listing_id, step, created_at DESC);

-- Safe migration: indexes for common user-scoped queries
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_user_id ON workflow_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_listing_id ON artifacts(listing_id);

-- Safe migration: add profile column if it doesn't exist yet
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}';

-- Safe migration: store the source URL (e.g. Indeed job page) captured by the extension
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Safe migration: flag for server-side auto-chaining through the full pipeline
ALTER TABLE workflow_jobs ADD COLUMN IF NOT EXISTS auto_chain BOOLEAN NOT NULL DEFAULT false;

-- Safe migration: allow user-scoped jobs (e.g. build-parts) that are not tied to a listing
ALTER TABLE workflow_jobs ALTER COLUMN listing_id DROP NOT NULL;

-- Safe migration: ATS fit score (0-100) from the best scoring pass
ALTER TABLE listings ADD COLUMN IF NOT EXISTS fit_score INTEGER;

CREATE TABLE IF NOT EXISTS artifacts (
    id          SERIAL PRIMARY KEY,
    listing_id  INTEGER      NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    filename    VARCHAR(255) NOT NULL,
    step        VARCHAR(50)  NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(listing_id, filename)
);

-- Safe migration: require explicit access grant before a user can use the resume tools
ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_access BOOLEAN NOT NULL DEFAULT false;

-- Runtime-configurable key/value settings (e.g. LLM endpoint, model, API key)
CREATE TABLE IF NOT EXISTS settings (
    key        VARCHAR(100) PRIMARY KEY,
    value      TEXT         NOT NULL,
    updated_at TIMESTAMPTZ  DEFAULT NOW()
);
