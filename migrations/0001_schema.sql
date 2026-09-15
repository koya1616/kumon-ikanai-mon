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
-- question_type は当面 single_choice のみ。将来用に列だけ予約する。
CREATE TABLE IF NOT EXISTS question_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  statement TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  question_type TEXT NOT NULL DEFAULT 'single_choice' CHECK (question_type = 'single_choice'),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (question_id, version)
);
CREATE INDEX IF NOT EXISTS idx_versions_question ON question_versions(question_id);

-- 選択肢テーブル (4択固定をやめ、N択・○×に耐える)
CREATE TABLE IF NOT EXISTS question_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_version_id INTEGER NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  UNIQUE (question_version_id, position)
);
CREATE INDEX IF NOT EXISTS idx_choices_version ON question_choices(question_version_id);

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

-- 回答 (出題1行に回答1行の1:1)
CREATE TABLE IF NOT EXISTS attempt_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_question_id INTEGER NOT NULL UNIQUE REFERENCES attempt_questions(id) ON DELETE CASCADE,
  choice_position INTEGER NOT NULL CHECK (choice_position >= 1),
  choice_text_snapshot TEXT NOT NULL DEFAULT '',
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aanswers_aquestion ON attempt_answers(attempt_question_id);
