PRAGMA foreign_keys = ON;

-- 1問ブックマーク: 1問1行。解答履歴とは完全分離し、成績・集計に影響させない。
-- 履歴保護 (RESTRICT) とは逆に、CASCADE で問題削除時は一緒に消える。
CREATE TABLE IF NOT EXISTS question_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON question_bookmarks(created_at DESC);
