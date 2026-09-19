-- NOTE: D1マイグレはトランザクション内で実行されるため PRAGMA foreign_keys=OFF は無効。
-- SQLite定石通り defer_foreign_keys で親テーブル再作成時の即時FK検査を遅延させる。
PRAGMA defer_foreign_keys = ON;
PRAGMA foreign_keys = OFF;

-- 0004: 記述式穴埋め (cloze_text) 対応。保守・拡張重視。
-- 方針:
-- - statement は1カラムのまま。本文中に {{1}}..{{N}} マーカーを埋め込む（長文OK）。
-- - 型別テーブルを question_choices と並列に足す。既存4択クエリに影響させない。
-- - 空欄定義(blanks)と正答(answers)を分離。今は1空欄1正答運用だが、別解解禁時は answers に行追加のみ。
-- - 回答はヘッダ+明細の2層。attempt_answers / review_answers は問題単位の集約行として残し、
--   correct = 全空欄正解時のみ1。部分点内訳は明細テーブルに持つ。attempts.score/total の意味は変えない。
-- - SQLiteはCHECKを後から緩和できないため、question_versions / attempt_answers / review_answers は再作成方式。

DROP VIEW IF EXISTS unified_answer_history;
DROP VIEW IF EXISTS unified_cloze_blank_history;

-- ---------- question_versions 再作成: 型拡張 + 配点予約 ----------
CREATE TABLE _new_question_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  statement TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  question_type TEXT NOT NULL DEFAULT 'single_choice' CHECK (question_type IN ('single_choice', 'cloze_text')),
  points_possible INTEGER NOT NULL DEFAULT 1 CHECK (points_possible >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (question_id, version)
);
INSERT INTO _new_question_versions (id, question_id, version, statement, explanation, question_type, points_possible, created_at)
  SELECT id, question_id, version, statement, explanation, question_type, 1, created_at FROM question_versions;
DROP TABLE question_versions;
ALTER TABLE _new_question_versions RENAME TO question_versions;
CREATE INDEX IF NOT EXISTS idx_versions_question ON question_versions(question_id);

-- ---------- 出題定義: 空欄 + 正答 ----------
CREATE TABLE IF NOT EXISTS question_cloze_blanks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_version_id INTEGER NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  blank_index INTEGER NOT NULL CHECK (blank_index >= 1),
  points INTEGER NOT NULL DEFAULT 1 CHECK (points >= 1),
  match_mode TEXT NOT NULL DEFAULT 'exact_trim' CHECK (match_mode = 'exact_trim'),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (question_version_id, blank_index)
);
CREATE INDEX IF NOT EXISTS idx_cloze_blanks_version ON question_cloze_blanks(question_version_id);

CREATE TABLE IF NOT EXISTS question_cloze_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blank_id INTEGER NOT NULL REFERENCES question_cloze_blanks(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (blank_id, answer_text)
);
CREATE INDEX IF NOT EXISTS idx_cloze_answers_blank ON question_cloze_answers(blank_id);

-- ---------- attempt_answers 再作成: cloze集約行のため choice_position NULL許容 + snapshot追加 ----------
CREATE TABLE _new_attempt_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_question_id INTEGER NOT NULL UNIQUE REFERENCES attempt_questions(id) ON DELETE CASCADE,
  choice_position INTEGER CHECK (choice_position IS NULL OR choice_position >= 1),
  choice_text_snapshot TEXT NOT NULL DEFAULT '',
  answer_text_snapshot TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO _new_attempt_answers (id, attempt_question_id, choice_position, choice_text_snapshot, answer_text_snapshot, correct, created_at)
  SELECT id, attempt_question_id, choice_position, choice_text_snapshot, '', correct, created_at FROM attempt_answers;
DROP TABLE attempt_answers;
ALTER TABLE _new_attempt_answers RENAME TO attempt_answers;
CREATE INDEX IF NOT EXISTS idx_aanswers_aquestion ON attempt_answers(attempt_question_id);

CREATE TABLE IF NOT EXISTS attempt_cloze_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_question_id INTEGER NOT NULL REFERENCES attempt_questions(id) ON DELETE CASCADE,
  blank_index INTEGER NOT NULL CHECK (blank_index >= 1),
  user_answer_text TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (attempt_question_id, blank_index)
);
CREATE INDEX IF NOT EXISTS idx_attempt_cloze_aquestion ON attempt_cloze_answers(attempt_question_id);

-- ---------- review_answers 再作成: 同上 ----------
CREATE TABLE _new_review_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  question_version_id INTEGER NOT NULL REFERENCES question_versions(id) ON DELETE RESTRICT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
  choice_position INTEGER CHECK (choice_position IS NULL OR choice_position >= 1),
  choice_text_snapshot TEXT NOT NULL DEFAULT '',
  answer_text_snapshot TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO _new_review_answers (id, session_id, question_id, question_version_id, quiz_id, choice_position, choice_text_snapshot, answer_text_snapshot, correct, created_at)
  SELECT id, session_id, question_id, question_version_id, quiz_id, choice_position, choice_text_snapshot, '', correct, created_at FROM review_answers;
DROP TABLE review_answers;
ALTER TABLE _new_review_answers RENAME TO review_answers;
CREATE INDEX IF NOT EXISTS idx_review_answers_question ON review_answers(question_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_review_answers_version ON review_answers(question_version_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_quiz ON review_answers(quiz_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_session ON review_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_created ON review_answers(created_at DESC);

CREATE TABLE IF NOT EXISTS review_cloze_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_answer_id INTEGER NOT NULL REFERENCES review_answers(id) ON DELETE CASCADE,
  blank_index INTEGER NOT NULL CHECK (blank_index >= 1),
  user_answer_text TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (review_answer_id, blank_index)
);
CREATE INDEX IF NOT EXISTS idx_review_cloze_answer ON review_cloze_answers(review_answer_id);

-- ---------- VIEW再作成: 問題単位の統合時系列は定義不変 ----------
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

-- ---------- VIEW新規: 空欄単位の統合時系列（将来の空欄別分析用） ----------
CREATE VIEW IF NOT EXISTS unified_cloze_blank_history AS
SELECT v.question_id AS question_id, aca.blank_index AS blank_index,
       aca.created_at AS created_at, aca.id AS seq,
       aca.correct AS correct, 'attempt' AS source
FROM attempt_cloze_answers aca
JOIN attempt_questions aq ON aq.id = aca.attempt_question_id
JOIN question_versions v ON v.id = aq.question_version_id
UNION ALL
SELECT ra.question_id AS question_id, rca.blank_index AS blank_index,
       rca.created_at AS created_at, (1000000000 + rca.id) AS seq,
       rca.correct AS correct, 'review' AS source
FROM review_cloze_answers rca
JOIN review_answers ra ON ra.id = rca.review_answer_id;

PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_keys = ON;
