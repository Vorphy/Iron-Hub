-- Zdarzenia z gry (anonimowe statystyki testów). Bez adresu IP.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,       -- losowy identyfikator przeglądarki
  tester TEXT NOT NULL DEFAULT '', -- kod z linku ?tester=…
  company TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL,           -- start | new_game | playing
  minutes INTEGER NOT NULL DEFAULT 0,
  map_size INTEGER,
  version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS events_player ON events (player_id);
CREATE INDEX IF NOT EXISTS events_created ON events (created_at);
