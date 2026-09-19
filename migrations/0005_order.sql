-- NOTE: D1マイグレはトランザクション内で実行されるため PRAGMA foreign_keys=OFF は無効。
-- SQLite定石通り defer_foreign_keys で親テーブル再作成時の即時FK検査を遅延させる。
PRAGMA defer_foreign_keys = ON;
PRAGMA foreign_keys = OFF;

-- 0005: 並べ替え (order_blocks) 対応。保守・拡張重視。
-- 方針 (0004 cloze と対称):
-- - question_versions に型を追加するのみ。既存4択/clozeクエリに影響させない。
-- - 型別テーブルを question_choices と並列に足す (question_order_items)。
--   position が正解順。is_distractor / points / match_mode は将来予約 (v1は固定運用)。
-- - 回答はヘッダ+明細の2層。attempt_answers / review_answers は問題単位の集約行として残し、
--   correct = 全位置一致時のみ1。部分点内訳は明細テーブルに持つ。attempts.score/total の意味は変えない。
-- - SQLiteはCHECKを後から緩和できないため、question_versions は再作成方式。
--   個数上限・重複禁止・文字数はアプリ層 (Zod) 責務とし、DB側CHECKは最小限に留める。

DROP VIEW IF EXISTS unified_answer_history;
DROP VIEW IF EXISTS unified_cloze_blank_history;
DROP VIEW IF EXISTS unified_order_position_history;

-- ---------- question_versions 再作成: 型拡張 ----------
CREATE TABLE _new_question_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  statement TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  question_type TEXT NOT NULL DEFAULT 'single_choice' CHECK (question_type IN ('single_choice', 'cloze_text', 'order_blocks')),
  points_possible INTEGER NOT NULL DEFAULT 1 CHECK (points_possible >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (question_id, version)
);
INSERT INTO _new_question_versions (id, question_id, version, statement, explanation, question_type, points_possible, created_at)
  SELECT id, question_id, version, statement, explanation, question_type, points_possible, created_at FROM question_versions;
DROP TABLE question_versions;
ALTER TABLE _new_question_versions RENAME TO question_versions;
CREATE INDEX IF NOT EXISTS idx_versions_question ON question_versions(question_id);

-- ---------- 出題定義: 正順ブロック ----------
-- position = 正しい順番 (1始まり連番)。出題時はサーバがシャッフルして返す (正順漏洩防止)。
-- is_distractor: Parsons式ダミーブロック予約。v1は0固定 (アプリ層で弾く)。
-- match_mode: 将来の採点緩和予約。v1は exact_trim_cs (trim後完全一致・大文字小文字区別) 固定。
CREATE TABLE IF NOT EXISTS question_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_version_id INTEGER NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  item_text TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 1 CHECK (points >= 1),
  match_mode TEXT NOT NULL DEFAULT 'exact_trim_cs' CHECK (match_mode IN ('exact_trim_cs', 'exact_trim_ci')),
  is_distractor INTEGER NOT NULL DEFAULT 0 CHECK (is_distractor IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (question_version_id, position)
);
CREATE INDEX IF NOT EXISTS idx_order_items_version ON question_order_items(question_version_id);

-- ---------- 本番明細: 提出順を位置ごとに保存 ----------
-- position = 提出順の何番目か。正順の同positionと照合する。
-- user_item_text は生提出を保存 (採点は trim 比較)。将来の部分点・誤順分析はスキーマ変更なしで可能。
CREATE TABLE IF NOT EXISTS attempt_order_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_question_id INTEGER NOT NULL REFERENCES attempt_questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  user_item_text TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (attempt_question_id, position)
);
CREATE INDEX IF NOT EXISTS idx_attempt_order_aquestion ON attempt_order_answers(attempt_question_id);

-- ---------- 復習明細: 本番と対称 (attempts系と完全分離) ----------
CREATE TABLE IF NOT EXISTS review_order_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_answer_id INTEGER NOT NULL REFERENCES review_answers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  user_item_text TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (review_answer_id, position)
);
CREATE INDEX IF NOT EXISTS idx_review_order_answer ON review_order_answers(review_answer_id);

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

-- ---------- VIEW新規: 位置単位の統合時系列（将来の位置別分析・部分点用） ----------
CREATE VIEW IF NOT EXISTS unified_order_position_history AS
SELECT v.question_id AS question_id, aoa.position AS position,
       aoa.created_at AS created_at, aoa.id AS seq,
       aoa.correct AS correct, 'attempt' AS source
FROM attempt_order_answers aoa
JOIN attempt_questions aq ON aq.id = aoa.attempt_question_id
JOIN question_versions v ON v.id = aq.question_version_id
UNION ALL
SELECT ra.question_id AS question_id, roa.position AS position,
       roa.created_at AS created_at, (1000000000 + roa.id) AS seq,
       roa.correct AS correct, 'review' AS source
FROM review_order_answers roa
JOIN review_answers ra ON ra.id = roa.review_answer_id;

PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_keys = ON;
