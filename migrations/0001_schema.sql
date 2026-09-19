PRAGMA foreign_keys = ON;

-- コンテンツ階層: CASCADE (カテゴリ削除で配下も消えるのは許容)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category_id, title)
);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category_id);

CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (topic_id, title)
);
CREATE INDEX IF NOT EXISTS idx_quizzes_topic ON quizzes(topic_id);

-- 問題本体 (薄い行: 文面は versions に持つ)
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  current_version_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);

-- 問題の履歴 (編集時はUPDATEせず新規versionをINSERT)
-- 型別の出題定義は question_choices / question_cloze_* / question_order_items に並列に持つ。
CREATE TABLE IF NOT EXISTS question_versions (
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
CREATE INDEX IF NOT EXISTS idx_versions_question ON question_versions(question_id);

-- ---------- 出題定義: 選択式 (N択・○×に耐える) ----------
CREATE TABLE IF NOT EXISTS question_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_version_id INTEGER NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  UNIQUE (question_version_id, position)
);
CREATE INDEX IF NOT EXISTS idx_choices_version ON question_choices(question_version_id);

-- ---------- 出題定義: 記述式穴埋め (cloze_text) ----------
-- statement 本文中に {{1}}..{{N}} マーカーを埋め込む。
-- 空欄定義(blanks)と正答(answers)を分離。今は1空欄1正答運用だが、別解解禁時は answers に行追加のみ。
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

-- ---------- 出題定義: 並べ替え (order_blocks) ----------
-- position = 正しい順番 (1始まり連番)。出題時はサーバがシャッフルして返す (正順漏洩防止)。
-- is_distractor: Parsons式ダミーブロック予約。v1は0固定 (アプリ層で弾く)。
-- match_mode: 将来の採点緩和予約。v1は exact_trim_cs (trim後完全一致・大文字小文字区別) 固定。
-- 個数上限・重複禁止・文字数はアプリ層 (Zod) 責務とし、DB側CHECKは最小限に留める。
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

-- 1問ブックマーク: 1問1行。解答履歴とは完全分離し、成績・集計に影響させない。
-- 履歴保護 (RESTRICT) とは逆に、CASCADE で問題削除時は一緒に消える。
CREATE TABLE IF NOT EXISTS question_bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON question_bookmarks(created_at DESC);

-- 学習履歴: コンテンツ削除で消さない (RESTRICT)
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (score <= total)
);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);

-- このAttemptで何を出題したか (順番・スナップショット)
CREATE TABLE IF NOT EXISTS attempt_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_version_id INTEGER NOT NULL REFERENCES question_versions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (attempt_id, position),
  UNIQUE (attempt_id, question_version_id)
);
CREATE INDEX IF NOT EXISTS idx_aquestions_attempt ON attempt_questions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_aquestions_version ON attempt_questions(question_version_id);

-- 回答 (出題1行に回答1行の1:1)。回答はヘッダ+明細の2層。
-- この行は問題単位の集約行で correct = 全空欄/全位置正解時のみ1。部分点内訳は型別明細テーブルに持つ。
-- choice_position は選択式のみ (cloze/order では NULL)。
CREATE TABLE IF NOT EXISTS attempt_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_question_id INTEGER NOT NULL UNIQUE REFERENCES attempt_questions(id) ON DELETE CASCADE,
  choice_position INTEGER CHECK (choice_position IS NULL OR choice_position >= 1),
  choice_text_snapshot TEXT NOT NULL DEFAULT '',
  answer_text_snapshot TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aanswers_aquestion ON attempt_answers(attempt_question_id);

-- 本番明細: 穴埋めの空欄ごと
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

-- 本番明細: 並べ替えの提出順を位置ごとに保存
-- position = 提出順の何番目か。正順の同positionと照合する。
-- user_item_text は生提出を保存 (採点は trim 比較)。
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

-- 復習回答ログ: 1回答1行。attempts系と完全分離し、ベスト・サマリーに影響させない。
-- 履歴保護は attempts と同じく RESTRICT で統一する。
-- session_id はクライアント採番の1周回ID (将来の集計用予約。NULL可)。
CREATE TABLE IF NOT EXISTS review_answers (
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
CREATE INDEX IF NOT EXISTS idx_review_answers_question ON review_answers(question_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_review_answers_version ON review_answers(question_version_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_quiz ON review_answers(quiz_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_session ON review_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_review_answers_created ON review_answers(created_at DESC);

-- 復習明細: 本番と対称
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

-- 空欄単位の統合時系列 (将来の空欄別分析用)
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

-- 位置単位の統合時系列 (将来の位置別分析・部分点用)
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
