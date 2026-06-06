CREATE TABLE IF NOT EXISTS scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name  TEXT    NOT NULL,
  stage_id     INTEGER NOT NULL,
  stage_name   TEXT    NOT NULL DEFAULT '',
  tense        TEXT    NOT NULL DEFAULT '',
  score        INTEGER NOT NULL DEFAULT 0,
  badge        TEXT    NOT NULL DEFAULT 'bronze',
  pct          REAL    NOT NULL DEFAULT 0,
  submitted_at TEXT    NOT NULL,
  UNIQUE(player_name, stage_id)
);
CREATE INDEX IF NOT EXISTS idx_stage  ON scores(stage_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_player ON scores(player_name);
