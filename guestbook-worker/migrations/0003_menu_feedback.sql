CREATE TABLE IF NOT EXISTS menu_feedback (
  id TEXT PRIMARY KEY,
  missing INTEGER NOT NULL CHECK (missing IN (0,1)),
  answer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_menu_feedback_created ON menu_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_menu_feedback_missing ON menu_feedback(missing, created_at DESC);
