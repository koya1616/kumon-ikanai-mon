PRAGMA foreign_keys = ON;

-- 復習回答ログ: 1回答1行。attempts系と完全分離し、ベスト・サマリーに影響させない。
-- 履歴保護は attempts と同じく RESTRICT で統一する。
-- session_id はクライアント採番の1周回ID (将来の集計用予約。NULL可)。
CREATE TABLE IF NOT EXISTS review_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  question_version_id INTEGER NOT NULL REFERENCES question_versions(id) ON DELETE RESTRICT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
  choice_position INTEGER NOT NULL CHECK (choice_position >= 1),
  choice_text_snapshot TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_answers_question ON review_answers(question_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_review_answers_version ON review_answers(question_version_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_quiz ON review_answers(quiz_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_session ON review_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_created ON review_answers(created_at DESC);

-- 統合時系列ビュー: 本番 (attempt_answers) + 復習 (review_answers) を
-- question_id 単位の時系列として一元化する。苦手解消 (直近N連続正解) 判定や
-- 将来の統計はこのVIEWだけ見ること。UNION分岐を各クエリに分散させない。
-- seq は時系列のタイブレーク用 (attempt < review の衝突回避用オフセット)。
CREATE VIEW IF NOT EXISTS unified_answer_history AS
SELECT v.question_id AS question_id, aa.created_at AS created_at, aa.id AS seq,
       aa.correct AS correct, 'attempt' AS source
FROM attempt_answers aa
JOIN attempt_questions aq ON aq.id = aa.attempt_question_id
JOIN question_versions v ON v.id = aq.question_version_id
UNION ALL
SELECT question_id, created_at, (1000000000 + id) AS seq,
       correct, 'review' AS source
FROM review_answers;
