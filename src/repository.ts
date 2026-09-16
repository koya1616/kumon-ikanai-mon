/// <reference types="@cloudflare/workers-types" />
import type {
  Attempt,
  AttemptSummary,
  Category,
  CategoryTreeNode,
  PlayQuestion,
  Question,
  Quiz,
  QuizStatus,
  Topic,
} from "./domain";
import { QUESTIONS_PER_QUIZ } from "./domain";

/**
 * D1 アクセス層: SQL (snake_case) とドメイン (camelCase) の変換はここに集約。
 * コンテンツ (categories/topics/quizzes/questions/versions/choices) と
 * 学習履歴 (attempts/attempt_questions/attempt_answers) を分離し、
 * 履歴は RESTRICT で保護する (DBが削除を拒否する)。
 */

type DB = D1Database;

export function isForeignKeyError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e ?? "");
  return /FOREIGN KEY|foreign key|constraint failed/i.test(msg);
}

// ---------- Category ----------

export async function listCategories(db: DB): Promise<Category[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.title,
        (SELECT COUNT(*) FROM topics t WHERE t.category_id = c.id) AS "topicCount",
        (SELECT COUNT(*) FROM quizzes q JOIN topics t ON t.id = q.topic_id WHERE t.category_id = c.id) AS "quizCount",
        (SELECT COUNT(*) FROM questions a JOIN quizzes q ON q.id = a.quiz_id JOIN topics t ON t.id = q.topic_id WHERE t.category_id = c.id) AS "questionCount"
       FROM categories c ORDER BY c.id`,
    )
    .all<Category>();
  return results;
}

export async function createCategory(db: DB, title: string): Promise<number> {
  const r = await db.prepare("INSERT INTO categories (title) VALUES (?)").bind(title).run();
  return Number(r.meta.last_row_id);
}

export async function renameCategory(db: DB, id: number, title: string): Promise<void> {
  await db
    .prepare("UPDATE categories SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(title, id)
    .run();
}

export async function deleteCategory(db: DB, id: number): Promise<void> {
  await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
}

// ---------- Topic ----------

export async function listTopics(db: DB, categoryId?: number): Promise<Topic[]> {
  let sql = `SELECT t.id, t.category_id AS "categoryId", c.title AS "categoryTitle", t.title,
      (SELECT COUNT(*) FROM quizzes q WHERE q.topic_id = t.id) AS "quizCount",
      (SELECT COUNT(*) FROM questions a JOIN quizzes q ON q.id = a.quiz_id WHERE q.topic_id = t.id) AS "questionCount"
    FROM topics t JOIN categories c ON c.id = t.category_id`;
  const params: unknown[] = [];
  if (categoryId !== undefined) {
    sql += " WHERE t.category_id = ?";
    params.push(categoryId);
  }
  sql += " ORDER BY t.id";
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<Topic>();
  return results;
}

export async function createTopic(db: DB, categoryId: number, title: string): Promise<number> {
  const r = await db
    .prepare("INSERT INTO topics (category_id, title) VALUES (?, ?)")
    .bind(categoryId, title)
    .run();
  return Number(r.meta.last_row_id);
}

export async function updateTopic(
  db: DB,
  id: number,
  patch: { title?: string | undefined; categoryId?: number | undefined },
): Promise<void> {
  if (patch.title !== undefined) {
    await db
      .prepare("UPDATE topics SET title = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(patch.title, id)
      .run();
  }
  if (patch.categoryId !== undefined) {
    await db
      .prepare("UPDATE topics SET category_id = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(patch.categoryId, id)
      .run();
  }
}

export async function deleteTopic(db: DB, id: number): Promise<void> {
  await db.prepare("DELETE FROM topics WHERE id = ?").bind(id).run();
}

// ---------- Quiz ----------

export async function listQuizzes(
  db: DB,
  filter: {
    topicId?: number | undefined;
    categoryId?: number | undefined;
    difficulty?: number | undefined;
    status?: QuizStatus | undefined;
  },
): Promise<Quiz[]> {
  let sql = `SELECT q.id, q.topic_id AS "topicId", t.title AS "topicTitle",
      t.category_id AS "categoryId", c.title AS "categoryTitle",
      q.title, q.difficulty, q.status,
      (SELECT COUNT(*) FROM questions a WHERE a.quiz_id = q.id) AS "questionCount"
    FROM quizzes q
    JOIN topics t ON t.id = q.topic_id
    JOIN categories c ON c.id = t.category_id`;
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filter.topicId !== undefined) {
    conds.push("q.topic_id = ?");
    params.push(filter.topicId);
  }
  if (filter.categoryId !== undefined) {
    conds.push("t.category_id = ?");
    params.push(filter.categoryId);
  }
  if (filter.difficulty !== undefined) {
    conds.push("q.difficulty = ?");
    params.push(filter.difficulty);
  }
  if (filter.status !== undefined) {
    conds.push("q.status = ?");
    params.push(filter.status);
  }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY q.id";
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all<Quiz>();
  return results;
}

export async function getQuizWithBreadcrumb(db: DB, id: number) {
  return db
    .prepare(
      `SELECT q.id, q.title, q.difficulty, q.status,
        t.id AS "topicId", t.title AS "topicTitle",
        c.id AS "categoryId", c.title AS "categoryTitle"
       FROM quizzes q
       JOIN topics t ON t.id = q.topic_id
       JOIN categories c ON c.id = t.category_id
       WHERE q.id = ?`,
    )
    .bind(id)
    .first();
}

export async function createQuiz(
  db: DB,
  topicId: number,
  title: string,
  difficulty: number,
  status: QuizStatus = "published",
): Promise<number> {
  const r = await db
    .prepare("INSERT INTO quizzes (topic_id, title, difficulty, status) VALUES (?, ?, ?, ?)")
    .bind(topicId, title, difficulty, status)
    .run();
  return Number(r.meta.last_row_id);
}

export async function updateQuiz(
  db: DB,
  id: number,
  patch: {
    title?: string | undefined;
    difficulty?: number | undefined;
    topicId?: number | undefined;
    status?: QuizStatus | undefined;
  },
): Promise<void> {
  if (patch.title !== undefined) {
    await db
      .prepare("UPDATE quizzes SET title = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(patch.title, id)
      .run();
  }
  if (patch.difficulty !== undefined) {
    await db
      .prepare("UPDATE quizzes SET difficulty = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(patch.difficulty, id)
      .run();
  }
  if (patch.topicId !== undefined) {
    await db
      .prepare("UPDATE quizzes SET topic_id = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(patch.topicId, id)
      .run();
  }
  if (patch.status !== undefined) {
    await db
      .prepare("UPDATE quizzes SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(patch.status, id)
      .run();
  }
}

export async function deleteQuiz(db: DB, id: number): Promise<void> {
  await db.prepare("DELETE FROM quizzes WHERE id = ?").bind(id).run();
}

// ---------- Question (versions + choices) ----------

export interface NewQuestion {
  statement: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  answer: number;
  explanation: string;
}

function toChoicesArray(q: NewQuestion): string[] {
  return [q.choice1, q.choice2, q.choice3, q.choice4];
}

/** 1問分の version + choices を作り、current_version_id を更新する */
async function insertVersion(db: DB, questionId: number, q: NewQuestion): Promise<number> {
  const cur = await db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM question_versions WHERE question_id = ?")
    .bind(questionId)
    .first<{ v: number }>();
  const version = Number(cur?.v ?? 0) + 1;
  const vr = await db
    .prepare(
      "INSERT INTO question_versions (question_id, version, statement, explanation, question_type) VALUES (?,?,?,?,'single_choice')",
    )
    .bind(questionId, version, q.statement, q.explanation)
    .run();
  const versionId = Number(vr.meta.last_row_id);
  const choices = toChoicesArray(q);
  const stmts = choices.map((text, i) =>
    db
      .prepare(
        "INSERT INTO question_choices (question_version_id, position, choice_text, is_correct) VALUES (?,?,?,?)",
      )
      .bind(versionId, i + 1, text, i + 1 === q.answer ? 1 : 0),
  );
  await db.batch(stmts);
  await db
    .prepare(
      "UPDATE questions SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(versionId, questionId)
    .run();
  return versionId;
}

/** 管理用: 1問作成 */
export async function createQuestion(db: DB, quizId: number, q: NewQuestion): Promise<number> {
  const r = await db.prepare("INSERT INTO questions (quiz_id) VALUES (?)").bind(quizId).run();
  const questionId = Number(r.meta.last_row_id);
  await insertVersion(db, questionId, q);
  return questionId;
}

/** 管理用: 1問更新 (= 新しい version を発行する。履歴は残る) */
export async function updateQuestion(db: DB, id: number, q: NewQuestion): Promise<void> {
  const row = await db.prepare("SELECT id FROM questions WHERE id = ?").bind(id).first();
  if (!row) throw new Error("問題がありません");
  await insertVersion(db, id, q);
}

/** 管理用: 1問削除 (履歴ありはDBのRESTRICTで失敗する) */
export async function deleteQuestion(db: DB, id: number): Promise<void> {
  await db.prepare("DELETE FROM questions WHERE id = ?").bind(id).run();
}

type VersionRow = {
  questionId: number;
  quizId: number;
  questionVersionId: number;
  version: number;
  statement: string;
  explanation: string;
};

async function assembleQuestions(db: DB, versionRows: VersionRow[]): Promise<Question[]> {
  if (!versionRows.length) return [];
  const versionIds = versionRows.map((r) => r.questionVersionId);
  const placeholders = versionIds.map(() => "?").join(",");
  const { results: choiceRows } = await db
    .prepare(
      `SELECT question_version_id AS "versionId", position, choice_text AS "text", is_correct AS "isCorrect"
       FROM question_choices WHERE question_version_id IN (${placeholders}) ORDER BY question_version_id, position`,
    )
    .bind(...versionIds)
    .all<{ versionId: number; position: number; text: string; isCorrect: number }>();
  const byVersion = new Map<number, { choices: string[]; answer: number }>();
  for (const c of choiceRows) {
    let entry = byVersion.get(c.versionId);
    if (!entry) {
      entry = { choices: [], answer: 1 };
      byVersion.set(c.versionId, entry);
    }
    entry.choices[c.position - 1] = c.text;
    if (c.isCorrect === 1) entry.answer = c.position;
  }
  return versionRows.map((r) => {
    const e = byVersion.get(r.questionVersionId) ?? { choices: [], answer: 1 };
    return {
      id: r.questionId,
      quizId: r.quizId,
      currentVersionId: r.questionVersionId,
      version: r.version,
      questionVersionId: r.questionVersionId,
      statement: r.statement,
      choices: e.choices,
      answer: e.answer,
      explanation: r.explanation,
    };
  });
}

export async function listQuestionsByQuiz(db: DB, quizId: number): Promise<Question[]> {
  const { results } = await db
    .prepare(
      `SELECT q.id AS "questionId", q.quiz_id AS "quizId",
        v.id AS "questionVersionId", v.version AS "version",
        v.statement AS "statement", v.explanation AS "explanation"
       FROM questions q JOIN question_versions v ON v.id = q.current_version_id
       WHERE q.quiz_id = ? ORDER BY q.id`,
    )
    .bind(quizId)
    .all<VersionRow>();
  return assembleQuestions(db, results);
}

/** 出題用: 現在のversion (答え・解説なし) */
export async function listPlayQuestions(db: DB, quizId: number): Promise<PlayQuestion[]> {
  const { results } = await db
    .prepare(
      `SELECT v.id AS "questionVersionId", v.statement AS "statement"
       FROM questions q JOIN question_versions v ON v.id = q.current_version_id
       WHERE q.quiz_id = ? ORDER BY q.id`,
    )
    .bind(quizId)
    .all<{ questionVersionId: number; statement: string }>();
  if (!results.length) return [];
  const ids = results.map((r) => r.questionVersionId);
  const placeholders = ids.map(() => "?").join(",");
  const { results: choiceRows } = await db
    .prepare(
      `SELECT question_version_id AS "versionId", position, choice_text AS "text"
       FROM question_choices WHERE question_version_id IN (${placeholders}) ORDER BY question_version_id, position`,
    )
    .bind(...ids)
    .all<{ versionId: number; position: number; text: string }>();
  const byVersion = new Map<number, string[]>();
  for (const c of choiceRows) {
    const arr = byVersion.get(c.versionId) ?? [];
    arr[c.position - 1] = c.text;
    byVersion.set(c.versionId, arr);
  }
  return results.map((r) => ({
    questionVersionId: r.questionVersionId,
    statement: r.statement,
    choices: byVersion.get(r.questionVersionId) ?? [],
  }));
}

/** attemptに紐づく出題リスト (回答時点のスナップショット) */
export async function listAttemptPlayQuestions(db: DB, attemptId: number): Promise<PlayQuestion[]> {
  const { results } = await db
    .prepare(
      `SELECT aq.id AS "attemptQuestionId", aq.position AS "position",
        v.id AS "questionVersionId", v.statement AS "statement"
       FROM attempt_questions aq JOIN question_versions v ON v.id = aq.question_version_id
       WHERE aq.attempt_id = ? ORDER BY aq.position`,
    )
    .bind(attemptId)
    .all<{
      attemptQuestionId: number;
      position: number;
      questionVersionId: number;
      statement: string;
    }>();
  if (!results.length) return [];
  const ids = results.map((r) => r.questionVersionId);
  const placeholders = ids.map(() => "?").join(",");
  const { results: choiceRows } = await db
    .prepare(
      `SELECT question_version_id AS "versionId", position, choice_text AS "text"
       FROM question_choices WHERE question_version_id IN (${placeholders}) ORDER BY question_version_id, position`,
    )
    .bind(...ids)
    .all<{ versionId: number; position: number; text: string }>();
  const byVersion = new Map<number, string[]>();
  for (const c of choiceRows) {
    const arr = byVersion.get(c.versionId) ?? [];
    arr[c.position - 1] = c.text;
    byVersion.set(c.versionId, arr);
  }
  return results.map((r) => ({
    questionVersionId: r.questionVersionId,
    attemptQuestionId: r.attemptQuestionId,
    position: r.position,
    statement: r.statement,
    choices: byVersion.get(r.questionVersionId) ?? [],
  }));
}

export async function countQuestions(db: DB, quizId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM questions WHERE quiz_id = ?")
    .bind(quizId)
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

/** quizの問題を保存 (管理UI用: 新規version発行方式。削除は履歴なし分のみ) */
export async function replaceQuestions(
  db: DB,
  quizId: number,
  questions: NewQuestion[],
): Promise<number> {
  if (questions.length > QUESTIONS_PER_QUIZ) {
    throw new Error(`1quizあたり最大${QUESTIONS_PER_QUIZ}問です`);
  }
  const { results: existing } = await db
    .prepare("SELECT id FROM questions WHERE quiz_id = ? ORDER BY id")
    .bind(quizId)
    .all<{ id: number }>();

  // 変更を始める前に、削除対象が履歴から参照されていないことを検証する。
  // D1 の各 statement は別々に実行されるため、途中で失敗を検出すると
  // 先行した version 作成だけが残ってしまう。
  const extras = existing.slice(questions.length);
  for (const ex of extras) {
    const hit = await db
      .prepare(
        `SELECT 1 AS one FROM attempt_questions aq
         JOIN question_versions v ON v.id = aq.question_version_id
         WHERE v.question_id = ? LIMIT 1`,
      )
      .bind(ex.id)
      .first();
    if (hit) {
      throw new Error(
        `履歴があるため問題数を減らせません（現在${existing.length}問→${questions.length}問）。archived化で対応してください。`,
      );
    }
  }
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    if (i < existing.length) {
      await insertVersion(db, existing[i]!.id, q);
    } else {
      await createQuestion(db, quizId, q);
    }
  }
  if (extras.length) {
    for (const ex of extras) {
      await db.prepare("DELETE FROM questions WHERE id = ?").bind(ex.id).run();
    }
  }
  return questions.length;
}

// ---------- Tree (publishedのみ出題対象) ----------

export async function getCategoryTree(db: DB): Promise<CategoryTreeNode[]> {
  const [{ results: categoryRows }, { results: topicRows }, { results: quizRows }] =
    await Promise.all([
      db
        .prepare("SELECT id, title FROM categories ORDER BY id")
        .all<{ id: number; title: string }>(),
      db.prepare('SELECT id, category_id AS "categoryId", title FROM topics ORDER BY id').all(),
      db
        .prepare(
          `SELECT q.id, q.topic_id AS "topicId", q.title, q.difficulty, q.status,
          COUNT(a.id) AS "questionCount"
         FROM quizzes q LEFT JOIN questions a ON a.quiz_id = q.id
         WHERE q.status = 'published'
         GROUP BY q.id ORDER BY q.id`,
        )
        .all<Quiz>(),
    ]);
  return categoryRows.map((category) => ({
    ...category,
    topics: (topicRows as { id: number; categoryId: number; title: string }[])
      .filter((topic) => topic.categoryId === category.id)
      .map((topic) => ({
        ...topic,
        quizzes: quizRows.filter((quiz) => quiz.topicId === topic.id),
      })),
  }));
}

// ---------- Attempt (解答結果の蓄積) ----------

/** 再開用: attemptの状態 (出題スナップショット + 回答済み分の結果) を返す */
export interface AttemptStateAnswer {
  attemptQuestionId: number;
  choice: number;
  correct: boolean;
  correctAnswer: number;
  explanation: string;
}

export async function getAttemptState(
  db: DB,
  attemptId: number,
): Promise<{
  attemptId: number;
  quizId: number;
  completedAt: string | null;
  questions: PlayQuestion[];
  answers: AttemptStateAnswer[];
} | null> {
  const attempt = await db
    .prepare(
      'SELECT id, quiz_id AS "quizId", completed_at AS "completedAt" FROM attempts WHERE id = ?',
    )
    .bind(attemptId)
    .first<{ id: number; quizId: number; completedAt: string | null }>();
  if (!attempt) return null;
  const questions = await listAttemptPlayQuestions(db, attemptId);
  const { results } = await db
    .prepare(
      `SELECT aa.attempt_question_id AS "attemptQuestionId",
        aa.choice_position AS "choice", aa.correct AS "correct",
        (SELECT position FROM question_choices
          WHERE question_version_id = aq.question_version_id AND is_correct = 1) AS "correctAnswer",
        v.explanation AS "explanation"
       FROM attempt_answers aa
       JOIN attempt_questions aq ON aq.id = aa.attempt_question_id
       JOIN question_versions v ON v.id = aq.question_version_id
       WHERE aq.attempt_id = ? ORDER BY aq.position`,
    )
    .bind(attemptId)
    .all<{
      attemptQuestionId: number;
      choice: number;
      correct: number;
      correctAnswer: number | null;
      explanation: string | null;
    }>();
  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    completedAt: attempt.completedAt,
    questions,
    answers: results.map((r) => ({
      attemptQuestionId: r.attemptQuestionId,
      choice: r.choice,
      correct: r.correct === 1,
      correctAnswer: Number(r.correctAnswer ?? 0),
      explanation: r.explanation ?? "",
    })),
  };
}

/** 挑戦開始: attempts行 + 現versionのスナップショットをattempt_questionsに作成 */
export async function createAttempt(
  db: DB,
  quizId: number,
): Promise<{ attemptId: number; questions: PlayQuestion[] }> {
  const r = await db.prepare("INSERT INTO attempts (quiz_id) VALUES (?)").bind(quizId).run();
  const attemptId = Number(r.meta.last_row_id);
  const { results: current } = await db
    .prepare("SELECT current_version_id AS v FROM questions WHERE quiz_id = ? ORDER BY id")
    .bind(quizId)
    .all<{ v: number | null }>();
  const versionIds = current.map((row) => row.v).filter((v): v is number => v !== null);
  const stmts = versionIds.map((versionId, i) =>
    db
      .prepare(
        "INSERT INTO attempt_questions (attempt_id, question_version_id, position) VALUES (?,?,?)",
      )
      .bind(attemptId, versionId, i + 1),
  );
  if (stmts.length) await db.batch(stmts);
  const questions = await listAttemptPlayQuestions(db, attemptId);
  return { attemptId, questions };
}

/** 1問分の解答を記録し、採点結果を返す。不正なattemptQuestionは拒否する */
export async function recordAnswer(
  db: DB,
  attemptId: number,
  attemptQuestionId: number,
  choice: number,
): Promise<{ correct: boolean; correctAnswer: number; explanation: string }> {
  const aq = await db
    .prepare(
      `SELECT aq.id, aq.question_version_id AS "versionId", a.quiz_id AS "attemptQuizId",
        a.completed_at AS "completedAt"
       FROM attempt_questions aq JOIN attempts a ON a.id = aq.attempt_id
       WHERE aq.id = ? AND aq.attempt_id = ?`,
    )
    .bind(attemptQuestionId, attemptId)
    .first<{ id: number; versionId: number; attemptQuizId: number; completedAt: string | null }>();
  if (!aq) throw new Error("この挑戦の問題ではありません");
  if (aq.completedAt !== null) throw new Error("この挑戦は完了しています");
  const version = await db
    .prepare("SELECT explanation FROM question_versions WHERE id = ?")
    .bind(aq.versionId)
    .first<{ explanation: string }>();
  if (!version) throw new Error("問題がありません");
  const { results: choices } = await db
    .prepare(
      "SELECT position, choice_text AS text, is_correct AS isCorrect FROM question_choices WHERE question_version_id = ? ORDER BY position",
    )
    .bind(aq.versionId)
    .all<{ position: number; text: string; isCorrect: number }>();
  if (!choices.length) throw new Error("問題がありません");
  const picked = choices.find((c) => c.position === choice);
  if (!picked) throw new Error("選択肢がありません");
  const correctRow = choices.find((c) => c.isCorrect === 1);
  const correctAnswer = correctRow?.position ?? 0;
  const correct = choice === correctAnswer ? 1 : 0;
  try {
    const write = await db
      .prepare(
        `INSERT INTO attempt_answers (attempt_question_id, choice_position, choice_text_snapshot, correct)
         SELECT aq.id, ?, ?, ?
         FROM attempt_questions aq JOIN attempts a ON a.id = aq.attempt_id
         WHERE aq.id = ? AND aq.attempt_id = ? AND a.completed_at IS NULL`,
      )
      .bind(choice, picked.text, correct, attemptQuestionId, attemptId)
      .run();
    if (write.meta.changes !== 1) throw new Error("この挑戦は完了しています");
  } catch {
    const answered = await db
      .prepare("SELECT 1 AS one FROM attempt_answers WHERE attempt_question_id = ?")
      .bind(attemptQuestionId)
      .first();
    if (answered) throw new Error("この問題は回答済みです");
    throw new Error("この挑戦は完了しています");
  }
  return { correct: correct === 1, correctAnswer, explanation: version.explanation ?? "" };
}

/** 挑戦を完了し、集計スコアを確定する。集計は単一UPDATE文で原子的に行う */
export async function completeAttempt(
  db: DB,
  attemptId: number,
): Promise<{ score: number; total: number }> {
  const attempt = await db
    .prepare('SELECT completed_at AS "completedAt" FROM attempts WHERE id = ?')
    .bind(attemptId)
    .first<{ completedAt: string | null }>();
  if (!attempt) throw new Error("挑戦がありません");
  if (attempt.completedAt !== null) throw new Error("この挑戦は既に完了しています");

  const update = await db
    .prepare(
      `UPDATE attempts SET
        score = (SELECT COALESCE(SUM(aa.correct), 0) FROM attempt_answers aa JOIN attempt_questions aq ON aq.id = aa.attempt_question_id WHERE aq.attempt_id = ?),
        total = (SELECT COUNT(*) FROM attempt_answers aa JOIN attempt_questions aq ON aq.id = aa.attempt_question_id WHERE aq.attempt_id = ?),
        completed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND completed_at IS NULL
         AND (SELECT COUNT(*) FROM attempt_answers aa JOIN attempt_questions aq ON aq.id = aa.attempt_question_id WHERE aq.attempt_id = ?) =
             (SELECT COUNT(*) FROM attempt_questions WHERE attempt_id = ?)`,
    )
    .bind(attemptId, attemptId, attemptId, attemptId, attemptId)
    .run();
  if (update.meta.changes !== 1) throw new Error("すべての問題に回答してから完了してください");
  const row = await db
    .prepare("SELECT score, total FROM attempts WHERE id = ?")
    .bind(attemptId)
    .first<{ score: number; total: number }>();
  if (!row) throw new Error("挑戦がありません");
  return { score: Number(row.score), total: Number(row.total) };
}

/** 受験履歴があるか (出題時点でattempt_questionsが作られるため、回答前でも履歴扱い) */
export async function questionHasAnswers(db: DB, questionId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS one FROM attempt_questions aq
       JOIN question_versions v ON v.id = aq.question_version_id
       WHERE v.question_id = ? LIMIT 1`,
    )
    .bind(questionId)
    .first();
  return row !== null;
}

export async function quizHasAttempts(db: DB, quizId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS one FROM attempts WHERE quiz_id = ? LIMIT 1")
    .bind(quizId)
    .first();
  return row !== null;
}

export async function topicHasAttempts(db: DB, topicId: number): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS one FROM attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE q.topic_id = ? LIMIT 1",
    )
    .bind(topicId)
    .first();
  return row !== null;
}

export async function categoryHasAttempts(db: DB, categoryId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS one FROM attempts a
       JOIN quizzes q ON q.id = a.quiz_id JOIN topics t ON t.id = q.topic_id
       WHERE t.category_id = ? LIMIT 1`,
    )
    .bind(categoryId)
    .first();
  return row !== null;
}

export async function listAttemptsByQuiz(
  db: DB,
  quizId: number,
  limit: number,
): Promise<Attempt[]> {
  const { results } = await db
    .prepare(
      `SELECT id, quiz_id AS "quizId", score, total,
        completed_at AS "completedAt", created_at AS "createdAt",
        CASE WHEN completed_at IS NULL THEN NULL
          ELSE CAST((julianday(completed_at) - julianday(created_at)) * 86400 AS INTEGER)
        END AS "durationSec"
       FROM attempts WHERE quiz_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .bind(quizId, limit)
    .all<Attempt>();
  return results.map((r) => ({
    ...r,
    durationSec: r.durationSec === null ? null : Number(r.durationSec),
  }));
}

/** 履歴詳細: 1回の挑戦を問題単位まで掘り下げて返す (スナップショット固定) */
export async function getAttemptDetail(
  db: DB,
  attemptId: number,
): Promise<{
  attemptId: number;
  quizId: number;
  score: number;
  total: number;
  completedAt: string | null;
  createdAt: string;
  durationSec: number | null;
  items: {
    position: number;
    attemptQuestionId: number;
    questionVersionId: number;
    statement: string;
    choices: string[];
    picked: number | null;
    pickedText: string | null;
    correctAnswer: number;
    correct: boolean | null;
    explanation: string;
  }[];
} | null> {
  const attempt = await db
    .prepare(
      `SELECT id, quiz_id AS "quizId", score, total,
        completed_at AS "completedAt", created_at AS "createdAt",
        CASE WHEN completed_at IS NULL THEN NULL
          ELSE CAST((julianday(completed_at) - julianday(created_at)) * 86400 AS INTEGER)
        END AS "durationSec"
       FROM attempts WHERE id = ?`,
    )
    .bind(attemptId)
    .first<{
      id: number;
      quizId: number;
      score: number;
      total: number;
      completedAt: string | null;
      createdAt: string;
      durationSec: number | null;
    }>();
  if (!attempt) return null;
  const { results: rows } = await db
    .prepare(
      `SELECT aq.id AS "attemptQuestionId", aq.position AS "position",
        v.id AS "questionVersionId", v.statement AS "statement",
        v.explanation AS "explanation",
        aa.choice_position AS "picked", aa.choice_text_snapshot AS "pickedText",
        aa.correct AS "correct",
        (SELECT position FROM question_choices
          WHERE question_version_id = aq.question_version_id AND is_correct = 1) AS "correctAnswer"
       FROM attempt_questions aq
       JOIN question_versions v ON v.id = aq.question_version_id
       LEFT JOIN attempt_answers aa ON aa.attempt_question_id = aq.id
       WHERE aq.attempt_id = ? ORDER BY aq.position`,
    )
    .bind(attemptId)
    .all<{
      attemptQuestionId: number;
      position: number;
      questionVersionId: number;
      statement: string;
      explanation: string | null;
      picked: number | null;
      pickedText: string | null;
      correct: number | null;
      correctAnswer: number | null;
    }>();
  if (!rows.length) {
    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      score: Number(attempt.score),
      total: Number(attempt.total),
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
      durationSec: attempt.durationSec === null ? null : Number(attempt.durationSec),
      items: [],
    };
  }
  const ids = rows.map((r) => r.questionVersionId);
  const placeholders = ids.map(() => "?").join(",");
  const { results: choiceRows } = await db
    .prepare(
      `SELECT question_version_id AS "versionId", position, choice_text AS "text"
       FROM question_choices WHERE question_version_id IN (${placeholders}) ORDER BY question_version_id, position`,
    )
    .bind(...ids)
    .all<{ versionId: number; position: number; text: string }>();
  const byVersion = new Map<number, string[]>();
  for (const c of choiceRows) {
    const arr = byVersion.get(c.versionId) ?? [];
    arr[c.position - 1] = c.text;
    byVersion.set(c.versionId, arr);
  }
  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    score: Number(attempt.score),
    total: Number(attempt.total),
    completedAt: attempt.completedAt,
    createdAt: attempt.createdAt,
    durationSec: attempt.durationSec === null ? null : Number(attempt.durationSec),
    items: rows.map((r) => ({
      position: Number(r.position),
      attemptQuestionId: Number(r.attemptQuestionId),
      questionVersionId: Number(r.questionVersionId),
      statement: r.statement,
      choices: byVersion.get(r.questionVersionId) ?? [],
      picked: r.picked === null ? null : Number(r.picked),
      pickedText: r.pickedText,
      correctAnswer: Number(r.correctAnswer ?? 0),
      correct: r.correct === null ? null : r.correct === 1,
      explanation: r.explanation ?? "",
    })),
  };
}

export async function listAttemptSummaries(db: DB): Promise<AttemptSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT quiz_id AS "quizId", COUNT(*) AS "attemptCount",
        MAX(score) AS "bestScore",
        (SELECT total FROM attempts a2 WHERE a2.quiz_id = attempts.quiz_id AND a2.completed_at IS NOT NULL ORDER BY score DESC, id DESC LIMIT 1) AS "bestTotal",
        MAX(completed_at) AS "lastCompletedAt"
       FROM attempts WHERE completed_at IS NOT NULL GROUP BY quiz_id`,
    )
    .all<AttemptSummary>();
  return results;
}
