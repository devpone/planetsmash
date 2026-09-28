CREATE TABLE IF NOT EXISTS game_highscores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(name, score, created_at)
);

CREATE INDEX IF NOT EXISTS idx_game_highscores_rank
ON game_highscores(score DESC, created_at ASC);
