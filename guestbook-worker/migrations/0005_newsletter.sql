CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','unsubscribed')),
  token_hash TEXT,
  token_expires_at TEXT,
  consent_at TEXT NOT NULL,
  confirmed_at TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  form_version TEXT NOT NULL DEFAULT '2026-09-29-v1',
  resend_synced INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_token_hash
  ON newsletter_subscribers(token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_status
  ON newsletter_subscribers(status);
