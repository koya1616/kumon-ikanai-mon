-- 問題単体の「消しても良いかも」フラグ (boolean相当: 0=off / 1=on, デフォルトoff)
ALTER TABLE questions ADD COLUMN deletable INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_questions_deletable ON questions(deletable);
