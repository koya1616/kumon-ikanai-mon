/// <reference types="@cloudflare/workers-types" />
import type {
  AnswerResult,
  Attempt,
  AttemptSummary,
  Category,
  CategoryTreeNode,
  ClozeBlank,
  ClozeDetail,
  OrderDetail,
  PlayQuestion,
  Question,
  QuestionType,
  Quiz,
  QuizStatus,
  ReviewAnswerResult,
  Topic,
} from "./domain";
import {
  QUESTIONS_PER_QUIZ,
  REVIEW_CLEAR_STREAK,
  isClozeAnswerEqual,
  isOrderItemEqual,
} from "./domain";

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
  questionType?: "single_choice" | undefined;
  statement: string;
  choice1: string;
  choice2: string;
  choice3: string;
  choice4: string;
  answer: number;
  explanation: string;
}

export interface NewClozeQuestion {
  questionType: "cloze_text";
  statement: string;
  /** 空欄番号順 (1始まり連番) の正答 */
  answers: string[];
  explanation: string;
}

export interface NewOrderQuestion {
  questionType: "order_blocks";
  statement: string;
  /** 正解順 (1始まり連番) のブロック */
  items: string[];
  explanation: string;
}

/** 版ごとの空欄+正答を取得する (正答は代表1件。将来の複数正答はsort_order先頭) */
async function loadClozeBlanks(db: DB, versionIds: number[]): Promise<Map<number, ClozeBlank[]>> {
  const out = new Map<number, ClozeBlank[]>();
  if (!versionIds.length) return out;
  // 全件復習で件数が増えてもバインド上限を踏まないよう分割取得する
  for (let i = 0; i < versionIds.length; i += 50) {
    const chunk = versionIds.slice(i, i + 50);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT b.question_version_id AS "versionId", b.blank_index AS "blankIndex",
          (SELECT a.answer_text FROM question_cloze_answers a
            WHERE a.blank_id = b.id ORDER BY a.sort_order, a.id LIMIT 1) AS "answer"
         FROM question_cloze_blanks b
         WHERE b.question_version_id IN (${placeholders}) ORDER BY b.question_version_id, b.blank_index`,
      )
      .bind(...chunk)
      .all<{ versionId: number; blankIndex: number; answer: string | null }>();
    for (const r of results) {
      const arr = out.get(r.versionId) ?? [];
      arr.push({ index: Number(r.blankIndex), answer: r.answer ?? "" });
      out.set(r.versionId, arr);
    }
  }
  return out;
}

/** trim後の完全一致 (英字の大文字小文字は区別しない)。不足分は空文字扱い */
function gradeCloze(inputs: string[], corrects: string[]): boolean[] {
  return corrects.map((c, i) => isClozeAnswerEqual(inputs[i] ?? "", c));
}

/** 版ごとの正順ブロックを取得する (position順) */
async function loadOrderItems(db: DB, versionIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!versionIds.length) return out;
  // 全件復習で件数が増えてもバインド上限を踏まないよう分割取得する
  for (let i = 0; i < versionIds.length; i += 50) {
    const chunk = versionIds.slice(i, i + 50);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT question_version_id AS "versionId", position, item_text AS "text"
         FROM question_order_items
         WHERE question_version_id IN (${placeholders}) ORDER BY question_version_id, position`,
      )
      .bind(...chunk)
      .all<{ versionId: number; position: number; text: string }>();
    for (const r of results) {
      const arr = out.get(r.versionId) ?? [];
      arr[Number(r.position) - 1] = r.text;
      out.set(r.versionId, arr);
    }
  }
  return out;
}

/** trim後の完全一致 (大文字小文字は区別する)。不足分は空文字扱い */
function gradeOrder(inputs: string[], corrects: string[]): boolean[] {
  return corrects.map((c, i) => isOrderItemEqual(inputs[i] ?? "", c));
}

/**
 * 出題表示用のシャッフル (決定的seed版)。
 * 同一attempt内では再取得しても同じ並びになるよう、attemptQuestionIdをseedにする。
 * 中断再開で並びが変わらないための措置。非attempt系 (mistakes等) はseed=0で都度ランダム。
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 0x9e3779b9;
  const rand = (): number => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
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

/** 穴埋め版の version + blanks + answers を作り、current_version_id を更新する */
async function insertClozeVersion(
  db: DB,
  questionId: number,
  q: NewClozeQuestion,
): Promise<number> {
  const cur = await db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM question_versions WHERE question_id = ?")
    .bind(questionId)
    .first<{ v: number }>();
  const version = Number(cur?.v ?? 0) + 1;
  const vr = await db
    .prepare(
      "INSERT INTO question_versions (question_id, version, statement, explanation, question_type, points_possible) VALUES (?,?,?,?, 'cloze_text', ?)",
    )
    .bind(questionId, version, q.statement, q.explanation, q.answers.length)
    .run();
  const versionId = Number(vr.meta.last_row_id);
  for (let i = 0; i < q.answers.length; i++) {
    const br = await db
      .prepare("INSERT INTO question_cloze_blanks (question_version_id, blank_index) VALUES (?,?)")
      .bind(versionId, i + 1)
      .run();
    await db
      .prepare(
        "INSERT INTO question_cloze_answers (blank_id, answer_text, sort_order) VALUES (?,?,0)",
      )
      .bind(Number(br.meta.last_row_id), q.answers[i])
      .run();
  }
  await db
    .prepare(
      "UPDATE questions SET current_version_id = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(versionId, questionId)
    .run();
  return versionId;
}

/** 管理用: 穴埋め1問作成 */
export async function createClozeQuestion(
  db: DB,
  quizId: number,
  q: NewClozeQuestion,
): Promise<number> {
  const r = await db.prepare("INSERT INTO questions (quiz_id) VALUES (?)").bind(quizId).run();
  const questionId = Number(r.meta.last_row_id);
  await insertClozeVersion(db, questionId, q);
  return questionId;
}

/** 管理用: 穴埋め1問更新 (= 新しい version を発行する。履歴は残る) */
export async function updateClozeQuestion(db: DB, id: number, q: NewClozeQuestion): Promise<void> {
  const row = await db.prepare("SELECT id FROM questions WHERE id = ?").bind(id).first();
  if (!row) throw new Error("問題がありません");
  await insertClozeVersion(db, id, q);
}

/** 並べ替え版の version + items を作り、current_version_id を更新する */
async function insertOrderVersion(
  db: DB,
  questionId: number,
  q: NewOrderQuestion,
): Promise<number> {
  const cur = await db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM question_versions WHERE question_id = ?")
    .bind(questionId)
    .first<{ v: number }>();
  const version = Number(cur?.v ?? 0) + 1;
  const vr = await db
    .prepare(
      "INSERT INTO question_versions (question_id, version, statement, explanation, question_type, points_possible) VALUES (?,?,?,?, 'order_blocks', ?)",
    )
    .bind(questionId, version, q.statement, q.explanation, q.items.length)
    .run();
  const versionId = Number(vr.meta.last_row_id);
  const stmts = q.items.map((text, i) =>
    db
      .prepare(
        "INSERT INTO question_order_items (question_version_id, position, item_text) VALUES (?,?,?)",
      )
      .bind(versionId, i + 1, text),
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

/** 管理用: 並べ替え1問作成 */
export async function createOrderQuestion(
  db: DB,
  quizId: number,
  q: NewOrderQuestion,
): Promise<number> {
  const r = await db.prepare("INSERT INTO questions (quiz_id) VALUES (?)").bind(quizId).run();
  const questionId = Number(r.meta.last_row_id);
  await insertOrderVersion(db, questionId, q);
  return questionId;
}

/** 管理用: 並べ替え1問更新 (= 新しい version を発行する。履歴は残る) */
export async function updateOrderQuestion(db: DB, id: number, q: NewOrderQuestion): Promise<void> {
  const row = await db.prepare("SELECT id FROM questions WHERE id = ?").bind(id).first();
  if (!row) throw new Error("問題がありません");
  await insertOrderVersion(db, id, q);
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
  questionType: QuestionType;
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
  const blanksByVersion = await loadClozeBlanks(
    db,
    versionRows.map((r) => r.questionVersionId),
  );
  const orderByVersion = await loadOrderItems(
    db,
    versionRows.map((r) => r.questionVersionId),
  );
  return versionRows.map((r) => {
    const e = byVersion.get(r.questionVersionId) ?? { choices: [], answer: 1 };
    const blanks = blanksByVersion.get(r.questionVersionId) ?? [];
    const isOrder = r.questionType === "order_blocks";
    return {
      id: r.questionId,
      quizId: r.quizId,
      currentVersionId: r.questionVersionId,
      version: r.version,
      questionVersionId: r.questionVersionId,
      questionType: r.questionType,
      statement: r.statement,
      choices: r.questionType === "cloze_text" || isOrder ? [] : e.choices,
      answer: r.questionType === "cloze_text" || isOrder ? 0 : e.answer,
      blanks,
      items: orderByVersion.get(r.questionVersionId) ?? [],
      explanation: r.explanation,
    };
  });
}

export async function listQuestionsByQuiz(db: DB, quizId: number): Promise<Question[]> {
  const { results } = await db
    .prepare(
      `SELECT q.id AS "questionId", q.quiz_id AS "quizId",
        v.id AS "questionVersionId", v.version AS "version",
        v.question_type AS "questionType",
        v.statement AS "statement", v.explanation AS "explanation"
       FROM questions q JOIN question_versions v ON v.id = q.current_version_id
       WHERE q.quiz_id = ? ORDER BY q.id`,
    )
    .bind(quizId)
    .all<VersionRow>();
  return assembleQuestions(db, results);
}

type PlayRow = {
  questionId: number;
  questionVersionId: number;
  questionType: QuestionType;
  statement: string;
  blankCount: number;
  itemCount: number;
  /** 出題表示の安定seed (attempt系はattemptQuestionId、プレビュー系は0=ランダム) */
  seed: number;
};

/** 出題用: 現在のversion (答え・解説なし) */
export async function listPlayQuestions(db: DB, quizId: number): Promise<PlayQuestion[]> {
  const { results } = await db
    .prepare(
      `SELECT q.id AS "questionId", v.id AS "questionVersionId",
        v.question_type AS "questionType", v.statement AS "statement",
        (SELECT COUNT(*) FROM question_cloze_blanks b WHERE b.question_version_id = v.id) AS "blankCount",
        (SELECT COUNT(*) FROM question_order_items o WHERE o.question_version_id = v.id) AS "itemCount"
       FROM questions q JOIN question_versions v ON v.id = q.current_version_id
       WHERE q.quiz_id = ? ORDER BY q.id`,
    )
    .bind(quizId)
    .all<PlayRow>();
  return assemblePlayQuestions(
    db,
    results.map((r) => ({ ...r, seed: 0 })),
  );
}

async function assemblePlayQuestions(db: DB, rows: PlayRow[]): Promise<PlayQuestion[]> {
  if (!rows.length) return [];
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
  const orderByVersion = await loadOrderItems(db, ids);
  return rows.map((r) => {
    const isOrder = r.questionType === "order_blocks";
    const correct = orderByVersion.get(r.questionVersionId) ?? [];
    // 並べ替えは正順をそのまま返すと答え漏れになるため、表示用にシャッフルする。
    // seed>0 (attempt系) では決定的にし、中断再開で並びが変わらないようにする。
    const items = isOrder
      ? r.seed > 0
        ? seededShuffle(correct, r.seed)
        : seededShuffle(correct, (Date.now() ^ (Math.random() * 1e9)) >>> 0)
      : [];
    return {
      questionId: r.questionId,
      questionVersionId: r.questionVersionId,
      questionType: r.questionType,
      statement: r.statement,
      choices:
        r.questionType === "cloze_text" || isOrder
          ? []
          : (byVersion.get(r.questionVersionId) ?? []),
      blankCount: Number(r.blankCount ?? 0),
      items,
      itemCount: Number(r.itemCount ?? correct.length ?? 0),
    };
  });
}

/** attemptに紐づく出題リスト (回答時点のスナップショット) */
export async function listAttemptPlayQuestions(db: DB, attemptId: number): Promise<PlayQuestion[]> {
  const { results } = await db
    .prepare(
      `SELECT aq.id AS "attemptQuestionId", aq.position AS "position",
        v.question_id AS "questionId",
        v.id AS "questionVersionId", v.question_type AS "questionType", v.statement AS "statement",
        (SELECT COUNT(*) FROM question_cloze_blanks b WHERE b.question_version_id = v.id) AS "blankCount",
        (SELECT COUNT(*) FROM question_order_items o WHERE o.question_version_id = v.id) AS "itemCount"
       FROM attempt_questions aq JOIN question_versions v ON v.id = aq.question_version_id
       WHERE aq.attempt_id = ? ORDER BY aq.position`,
    )
    .bind(attemptId)
    .all<{
      attemptQuestionId: number;
      position: number;
      questionId: number;
      questionVersionId: number;
      questionType: QuestionType;
      statement: string;
      blankCount: number;
      itemCount: number;
    }>();
  if (!results.length) return [];
  const base = await assemblePlayQuestions(
    db,
    results.map((r) => ({
      questionId: r.questionId,
      questionVersionId: r.questionVersionId,
      questionType: r.questionType,
      statement: r.statement,
      blankCount: Number(r.blankCount ?? 0),
      itemCount: Number(r.itemCount ?? 0),
      seed: r.attemptQuestionId,
    })),
  );
  const byVersion = new Map(base.map((q) => [q.questionVersionId, q] as const));
  return results.map((r) => ({
    ...(byVersion.get(r.questionVersionId) as PlayQuestion),
    attemptQuestionId: r.attemptQuestionId,
    position: r.position,
  }));
}

export async function countQuestions(db: DB, quizId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM questions WHERE quiz_id = ?")
    .bind(quizId)
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

/** quizの問題を保存 (管理UI用: 新規version発行方式。削除は履歴なし分のみ。4択・穴埋め・並べ替え混在可) */
export async function replaceQuestions(
  db: DB,
  quizId: number,
  questions: (NewQuestion | NewClozeQuestion | NewOrderQuestion)[],
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
      const questionId = existing[i]!.id;
      if (q.questionType === "cloze_text") {
        await insertClozeVersion(db, questionId, q);
      } else if (q.questionType === "order_blocks") {
        await insertOrderVersion(db, questionId, q);
      } else {
        await insertVersion(db, questionId, q);
      }
    } else {
      if (q.questionType === "cloze_text") {
        await createClozeQuestion(db, quizId, q);
      } else if (q.questionType === "order_blocks") {
        await createOrderQuestion(db, quizId, q);
      } else {
        await createQuestion(db, quizId, q);
      }
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
  /** cloze_text の入力・空欄単位明細 (single_choiceでは空配列) */
  answers: string[];
  details: ClozeDetail[];
  /** order_blocks の提出順・位置単位明細 (他型では空配列) */
  order: string[];
  orderDetails: OrderDetail[];
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
      choice: number | null;
      correct: number;
      correctAnswer: number | null;
      explanation: string | null;
    }>();
  const clozeByAq = await loadAttemptClozeDetails(db, attemptId);
  const orderByAq = await loadAttemptOrderDetails(db, attemptId);
  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    completedAt: attempt.completedAt,
    questions,
    answers: results.map((r) => {
      const cloze = clozeByAq.get(r.attemptQuestionId) ?? { inputs: [], details: [] };
      const ord = orderByAq.get(r.attemptQuestionId) ?? { inputs: [], details: [] };
      return {
        attemptQuestionId: r.attemptQuestionId,
        choice: Number(r.choice ?? 0),
        correct: r.correct === 1,
        correctAnswer: Number(r.correctAnswer ?? 0),
        explanation: r.explanation ?? "",
        answers: cloze.inputs,
        details: cloze.details,
        order: ord.inputs,
        orderDetails: ord.details,
      };
    }),
  };
}

/** attempt内の穴埋め回答明細 (出題id → 入力・正誤・正答) */
async function loadAttemptClozeDetails(
  db: DB,
  attemptId: number,
): Promise<Map<number, { inputs: string[]; details: ClozeDetail[] }>> {
  const out = new Map<number, { inputs: string[]; details: ClozeDetail[] }>();
  const { results } = await db
    .prepare(
      `SELECT aca.attempt_question_id AS "aqId", aca.blank_index AS "blank",
        aca.user_answer_text AS "input", aca.correct AS "correct",
        (SELECT a.answer_text FROM question_cloze_answers a
          JOIN question_cloze_blanks b ON b.id = a.blank_id
          WHERE b.question_version_id = aq.question_version_id AND b.blank_index = aca.blank_index
          ORDER BY a.sort_order, a.id LIMIT 1) AS "answer"
       FROM attempt_cloze_answers aca
       JOIN attempt_questions aq ON aq.id = aca.attempt_question_id
       WHERE aq.attempt_id = ? ORDER BY aq.position, aca.blank_index`,
    )
    .bind(attemptId)
    .all<{ aqId: number; blank: number; input: string; correct: number; answer: string | null }>();
  for (const r of results) {
    const cur = out.get(r.aqId) ?? { inputs: [], details: [] };
    cur.inputs.push(r.input);
    cur.details.push({
      blank: Number(r.blank),
      correct: Number(r.correct) === 1,
      answer: r.answer ?? "",
    });
    out.set(r.aqId, cur);
  }
  return out;
}

/** attempt内の並べ替え回答明細 (出題id → 提出順・正誤・正解ブロック) */
async function loadAttemptOrderDetails(
  db: DB,
  attemptId: number,
): Promise<Map<number, { inputs: string[]; details: OrderDetail[] }>> {
  const out = new Map<number, { inputs: string[]; details: OrderDetail[] }>();
  const { results } = await db
    .prepare(
      `SELECT aoa.attempt_question_id AS "aqId", aoa.position AS "pos",
        aoa.user_item_text AS "input", aoa.correct AS "correct",
        (SELECT o.item_text FROM question_order_items o
          WHERE o.question_version_id = aq.question_version_id AND o.position = aoa.position
          LIMIT 1) AS "answer"
       FROM attempt_order_answers aoa
       JOIN attempt_questions aq ON aq.id = aoa.attempt_question_id
       WHERE aq.attempt_id = ? ORDER BY aq.position, aoa.position`,
    )
    .bind(attemptId)
    .all<{ aqId: number; pos: number; input: string; correct: number; answer: string | null }>();
  for (const r of results) {
    const cur = out.get(r.aqId) ?? { inputs: [], details: [] };
    cur.inputs.push(r.input);
    cur.details.push({
      position: Number(r.pos),
      correct: Number(r.correct) === 1,
      answer: r.answer ?? "",
    });
    out.set(r.aqId, cur);
  }
  return out;
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
  input: {
    choice?: number | undefined;
    answers?: string[] | undefined;
    order?: string[] | undefined;
  },
): Promise<AnswerResult> {
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
    .prepare(
      "SELECT explanation, question_type AS questionType FROM question_versions WHERE id = ?",
    )
    .bind(aq.versionId)
    .first<{ explanation: string; questionType: QuestionType }>();
  if (!version) throw new Error("問題がありません");
  if (version.questionType === "cloze_text") {
    return recordClozeAnswer(
      db,
      attemptId,
      attemptQuestionId,
      aq.versionId,
      version.explanation ?? "",
      input.answers,
    );
  }
  if (version.questionType === "order_blocks") {
    return recordOrderAnswer(
      db,
      attemptId,
      attemptQuestionId,
      aq.versionId,
      version.explanation ?? "",
      input.order,
    );
  }
  const choice = input.choice;
  if (choice === undefined) throw new Error("choiceを指定してください");
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
  await insertAttemptHeader(db, attemptId, attemptQuestionId, choice, picked.text, "", correct);
  return {
    correct: correct === 1,
    correctAnswer,
    explanation: version.explanation ?? "",
    details: [],
    orderDetails: [],
    correctOrder: [],
  };
}

/** 回答ヘッダ1行の挿入 (二重回答・完了後回答の競合を検出する) */
async function insertAttemptHeader(
  db: DB,
  attemptId: number,
  attemptQuestionId: number,
  choice: number | null,
  choiceText: string,
  answerText: string,
  correct: number,
): Promise<void> {
  try {
    const write = await db
      .prepare(
        `INSERT INTO attempt_answers (attempt_question_id, choice_position, choice_text_snapshot, answer_text_snapshot, correct)
         SELECT aq.id, ?, ?, ?, ?
         FROM attempt_questions aq JOIN attempts a ON a.id = aq.attempt_id
         WHERE aq.id = ? AND aq.attempt_id = ? AND a.completed_at IS NULL`,
      )
      .bind(choice, choiceText, answerText, correct, attemptQuestionId, attemptId)
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
}

/** 穴埋め1問分の解答を記録し、空欄単位で採点する */
async function recordClozeAnswer(
  db: DB,
  attemptId: number,
  attemptQuestionId: number,
  versionId: number,
  explanation: string,
  rawAnswers: string[] | undefined,
): Promise<AnswerResult> {
  const blanks = (await loadClozeBlanks(db, [versionId])).get(versionId) ?? [];
  if (!blanks.length) throw new Error("問題がありません");
  if (!rawAnswers || rawAnswers.length !== blanks.length) {
    throw new Error(`回答は${blanks.length}個の空欄分すべて入力してください`);
  }
  const trimmed = rawAnswers.map((s) => (typeof s === "string" ? s.trim() : ""));
  if (trimmed.some((s) => !s)) throw new Error("空欄が未入力です");
  const per = gradeCloze(
    trimmed,
    blanks.map((b) => b.answer),
  );
  const allOk = per.every(Boolean) ? 1 : 0;
  await insertAttemptHeader(db, attemptId, attemptQuestionId, null, "", trimmed.join(" / "), allOk);
  const stmts = blanks.map((b, i) =>
    db
      .prepare(
        "INSERT INTO attempt_cloze_answers (attempt_question_id, blank_index, user_answer_text, correct) VALUES (?,?,?,?)",
      )
      .bind(attemptQuestionId, b.index, trimmed[i], per[i] ? 1 : 0),
  );
  await db.batch(stmts);
  return {
    correct: allOk === 1,
    correctAnswer: 0,
    explanation,
    details: blanks.map((b, i) => ({ blank: b.index, correct: per[i]!, answer: b.answer })),
    orderDetails: [],
    correctOrder: [],
  };
}

/** 並べ替え1問分の解答を記録し、位置単位で採点する (完全一致のみ正解) */
async function recordOrderAnswer(
  db: DB,
  attemptId: number,
  attemptQuestionId: number,
  versionId: number,
  explanation: string,
  rawOrder: string[] | undefined,
): Promise<AnswerResult> {
  const correct = (await loadOrderItems(db, [versionId])).get(versionId) ?? [];
  if (!correct.length) throw new Error("問題がありません");
  if (!rawOrder || rawOrder.length !== correct.length) {
    throw new Error(`回答は${correct.length}個のブロックをすべて並べてください`);
  }
  const trimmed = rawOrder.map((s) => (typeof s === "string" ? s.trim() : ""));
  if (trimmed.some((s) => !s)) throw new Error("空のブロックがあります");
  const per = gradeOrder(trimmed, correct);
  const allOk = per.every(Boolean) ? 1 : 0;
  await insertAttemptHeader(db, attemptId, attemptQuestionId, null, "", trimmed.join(" / "), allOk);
  const stmts = correct.map((_, i) =>
    db
      .prepare(
        "INSERT INTO attempt_order_answers (attempt_question_id, position, user_item_text, correct) VALUES (?,?,?,?)",
      )
      .bind(attemptQuestionId, i + 1, trimmed[i], per[i] ? 1 : 0),
  );
  await db.batch(stmts);
  return {
    correct: allOk === 1,
    correctAnswer: 0,
    explanation,
    details: [],
    orderDetails: correct.map((c, i) => ({ position: i + 1, correct: per[i]!, answer: c })),
    correctOrder: correct,
  };
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
    questionId: number;
    questionVersionId: number;
    questionType: QuestionType;
    statement: string;
    choices: string[];
    picked: number | null;
    pickedText: string | null;
    correctAnswer: number;
    correct: boolean | null;
    pickedAnswers: string[];
    correctAnswers: string[];
    pickedOrder: string[];
    correctOrder: string[];
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
        v.question_id AS "questionId",
        v.id AS "questionVersionId", v.question_type AS "questionType",
        v.statement AS "statement",
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
      questionId: number;
      questionVersionId: number;
      questionType: QuestionType;
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
  const clozeDetails = await loadAttemptClozeDetails(db, attemptId);
  const clozeBlanks = await loadClozeBlanks(
    db,
    rows.filter((r) => r.questionType === "cloze_text").map((r) => r.questionVersionId),
  );
  const orderDetails = await loadAttemptOrderDetails(db, attemptId);
  const orderItems = await loadOrderItems(
    db,
    rows.filter((r) => r.questionType === "order_blocks").map((r) => r.questionVersionId),
  );
  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    score: Number(attempt.score),
    total: Number(attempt.total),
    completedAt: attempt.completedAt,
    createdAt: attempt.createdAt,
    durationSec: attempt.durationSec === null ? null : Number(attempt.durationSec),
    items: rows.map((r) => {
      const isCloze = r.questionType === "cloze_text";
      const isOrder = r.questionType === "order_blocks";
      const cloze = clozeDetails.get(r.attemptQuestionId) ?? { inputs: [], details: [] };
      const ord = orderDetails.get(r.attemptQuestionId) ?? { inputs: [], details: [] };
      return {
        position: Number(r.position),
        attemptQuestionId: Number(r.attemptQuestionId),
        questionId: Number(r.questionId),
        questionVersionId: Number(r.questionVersionId),
        questionType: r.questionType,
        statement: r.statement,
        choices: isCloze || isOrder ? [] : (byVersion.get(r.questionVersionId) ?? []),
        picked: r.picked === null ? null : Number(r.picked),
        pickedText: r.pickedText,
        correctAnswer: Number(r.correctAnswer ?? 0),
        correct: r.correct === null ? null : r.correct === 1,
        pickedAnswers: cloze.inputs,
        correctAnswers: (clozeBlanks.get(r.questionVersionId) ?? []).map((b) => b.answer),
        pickedOrder: ord.inputs,
        correctOrder: orderItems.get(r.questionVersionId) ?? [],
        explanation: r.explanation ?? "",
      };
    }),
  };
}

/** 履歴ページの問題別集計: 完了済み挑戦の正誤を問題 (question_id) 単位の時系列に束ねる */
export interface QuestionInsight {
  questionId: number;
  questionType: QuestionType;
  /** 最後に出題された版のスナップショット */
  statement: string;
  choices: string[];
  correctAnswer: number;
  /** cloze_text の正答一覧 (single_choiceでは空配列) */
  correctAnswers: string[];
  /** order_blocks の正順ブロック (他型では空配列) */
  correctOrder: string[];
  explanation: string;
  /** 古い順。null = 未回答 */
  results: (boolean | null)[];
}

export async function getQuizInsights(
  db: DB,
  quizId: number,
): Promise<{ attemptCount: number; questions: QuestionInsight[] }> {
  const { results: rows } = await db
    .prepare(
      `SELECT a.id AS "attemptId", v.question_id AS "questionId", v.id AS "versionId",
        v.question_type AS "questionType",
        v.statement AS "statement", v.explanation AS "explanation", aa.correct AS "correct"
       FROM attempts a
       JOIN attempt_questions aq ON aq.attempt_id = a.id
       JOIN question_versions v ON v.id = aq.question_version_id
       LEFT JOIN attempt_answers aa ON aa.attempt_question_id = aq.id
       WHERE a.quiz_id = ? AND a.completed_at IS NOT NULL
       ORDER BY a.id, aq.position`,
    )
    .bind(quizId)
    .all<{
      attemptId: number;
      questionId: number;
      versionId: number;
      questionType: QuestionType;
      statement: string;
      explanation: string | null;
      correct: number | null;
    }>();
  const attemptIds = new Set<number>();
  const byQuestion = new Map<
    number,
    {
      versionId: number;
      questionType: QuestionType;
      statement: string;
      explanation: string;
      results: (boolean | null)[];
    }
  >();
  for (const r of rows) {
    attemptIds.add(Number(r.attemptId));
    const qid = Number(r.questionId);
    const cur = byQuestion.get(qid) ?? {
      versionId: 0,
      questionType: "single_choice" as QuestionType,
      statement: "",
      explanation: "",
      results: [],
    };
    // 古い順に走査するので最後に見た版が最新スナップショットになる
    cur.versionId = Number(r.versionId);
    cur.questionType = r.questionType;
    cur.statement = r.statement;
    cur.explanation = r.explanation ?? "";
    cur.results.push(r.correct === null ? null : Number(r.correct) === 1);
    byQuestion.set(qid, cur);
  }
  if (!byQuestion.size) return { attemptCount: attemptIds.size, questions: [] };

  const versionIds = [...new Set([...byQuestion.values()].map((q) => q.versionId))];
  const placeholders = versionIds.map(() => "?").join(",");
  const { results: choiceRows } = await db
    .prepare(
      `SELECT question_version_id AS "versionId", position, choice_text AS "text", is_correct AS "isCorrect"
       FROM question_choices WHERE question_version_id IN (${placeholders})
       ORDER BY question_version_id, position`,
    )
    .bind(...versionIds)
    .all<{ versionId: number; position: number; text: string; isCorrect: number }>();
  const choicesByVersion = new Map<number, { choices: string[]; correct: number }>();
  for (const c of choiceRows) {
    const entry = choicesByVersion.get(Number(c.versionId)) ?? { choices: [], correct: 0 };
    entry.choices[Number(c.position) - 1] = c.text;
    if (Number(c.isCorrect) === 1) entry.correct = Number(c.position);
    choicesByVersion.set(Number(c.versionId), entry);
  }

  const clozeByVersion = await loadClozeBlanks(
    db,
    [...byQuestion.values()].filter((q) => q.questionType === "cloze_text").map((q) => q.versionId),
  );
  const orderByVersion = await loadOrderItems(
    db,
    [...byQuestion.values()]
      .filter((q) => q.questionType === "order_blocks")
      .map((q) => q.versionId),
  );
  return {
    attemptCount: attemptIds.size,
    questions: [...byQuestion.entries()].map(([questionId, q]) => {
      const c = choicesByVersion.get(q.versionId);
      const isCloze = q.questionType === "cloze_text";
      const isOrder = q.questionType === "order_blocks";
      return {
        questionId,
        questionType: q.questionType,
        statement: q.statement,
        choices: isCloze || isOrder ? [] : (c?.choices ?? []),
        correctAnswer: isCloze || isOrder ? 0 : (c?.correct ?? 0),
        correctAnswers: (clozeByVersion.get(q.versionId) ?? []).map((b) => b.answer),
        correctOrder: orderByVersion.get(q.versionId) ?? [],
        explanation: q.explanation,
        results: q.results,
      };
    }),
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

/** 回答途中の挑戦 (未完了かつ1問以上回答ずみ・全問未満)。端末非依存の「つづきから」用 */
export interface InProgressAttempt {
  attemptId: number;
  quizId: number;
  done: number;
  total: number;
  lastAnsweredAt: string | null;
}

export async function listInProgressAttempts(
  db: DB,
  limit: number,
  quizId?: number,
): Promise<InProgressAttempt[]> {
  const where =
    quizId === undefined ? "a.completed_at IS NULL" : "a.completed_at IS NULL AND a.quiz_id = ?";
  const { results } = await db
    .prepare(
      `SELECT a.id AS "attemptId", a.quiz_id AS "quizId",
        COUNT(aq.id) AS "total",
        COUNT(aa.attempt_question_id) AS "done",
        MAX(aa.created_at) AS "lastAnsweredAt"
       FROM attempts a
       JOIN attempt_questions aq ON aq.attempt_id = a.id
       LEFT JOIN attempt_answers aa ON aa.attempt_question_id = aq.id
        WHERE ${where}
        GROUP BY a.id
        HAVING COUNT(aa.attempt_question_id) >= 1
          AND COUNT(aa.attempt_question_id) < COUNT(aq.id)
        ORDER BY a.id DESC LIMIT ?`,
    )
    .bind(...(quizId === undefined ? [limit] : [quizId, limit]))
    .all<{
      attemptId: number;
      quizId: number;
      done: number;
      total: number;
      lastAnsweredAt: string | null;
    }>();
  return results.map((r) => ({
    attemptId: Number(r.attemptId),
    quizId: Number(r.quizId),
    done: Number(r.done),
    total: Number(r.total),
    lastAnsweredAt: r.lastAnsweredAt,
  }));
}

/** クイズ横断の完了履歴 (新しい順)。パンくず付きで返す */
export interface RecentAttempt extends Attempt {
  quizTitle: string;
  topicId: number;
  topicTitle: string;
  categoryId: number;
  categoryTitle: string;
  /** そのクイズで何回目の完了挑戦か (古い順の通し番号) */
  attemptNumber: number;
  /** そのクイズの完了挑戦の累計回数 */
  attemptCount: number;
}

export async function listRecentAttempts(db: DB, limit: number): Promise<RecentAttempt[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.quiz_id AS "quizId", a.score, a.total,
        a.completed_at AS "completedAt", a.created_at AS "createdAt",
        CASE WHEN a.completed_at IS NULL THEN NULL
          ELSE CAST((julianday(a.completed_at) - julianday(a.created_at)) * 86400 AS INTEGER)
        END AS "durationSec",
        q.title AS "quizTitle",
        t.id AS "topicId", t.title AS "topicTitle",
        c.id AS "categoryId", c.title AS "categoryTitle",
        (SELECT COUNT(*) FROM attempts a2
          WHERE a2.quiz_id = a.quiz_id AND a2.completed_at IS NOT NULL AND a2.id <= a.id) AS "attemptNumber",
        (SELECT COUNT(*) FROM attempts a3
          WHERE a3.quiz_id = a.quiz_id AND a3.completed_at IS NOT NULL) AS "attemptCount"
       FROM attempts a
       JOIN quizzes q ON q.id = a.quiz_id
       JOIN topics t ON t.id = q.topic_id
       JOIN categories c ON c.id = t.category_id
       WHERE a.completed_at IS NOT NULL
       ORDER BY a.id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<RecentAttempt>();
  return results.map((r) => ({
    ...r,
    durationSec: r.durationSec === null ? null : Number(r.durationSec),
    attemptNumber: Number(r.attemptNumber),
    attemptCount: Number(r.attemptCount),
  }));
}

// ---------- Review (苦手一括復習: 練習扱い・attempts系と完全分離) ----------

export interface MistakeItem {
  questionId: number;
  questionVersionId: number;
  quizId: number;
  quizTitle: string;
  topicTitle: string;
  categoryId: number;
  categoryTitle: string;
  questionType: QuestionType;
  statement: string;
  choices: string[];
  answer: number;
  /** cloze_text の正答一覧 (single_choiceでは空配列) */
  correctAnswers: string[];
  /** order_blocks の正順ブロック (出題時はシャッフル表示。採点はサーバ) */
  items: string[];
  correctOrder: string[];
  explanation: string;
  mistakeCount: number;
  lastWrongAt: string | null;
}

/** 復習回答が参照しているか (コンテンツ削除ガード用。attempts系とは別建て) */
export async function questionHasReviewAnswers(db: DB, questionId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS one FROM review_answers WHERE question_id = ? LIMIT 1")
    .bind(questionId)
    .first();
  return row !== null;
}

/**
 * 復習の1問分を記録し、サーバ側で採点する (クライアントの答えは信用しない)。
 * attempts系には一切書き込まない。履歴・ベスト・サマリーに影響しない。
 * streak は本番+復習の統合時系列 (unified_answer_history) での直近連続正解数。
 */
export async function createReviewAnswer(
  db: DB,
  input: {
    questionVersionId: number;
    choice?: number | undefined;
    answers?: string[] | undefined;
    order?: string[] | undefined;
    sessionId?: string | undefined;
  },
): Promise<ReviewAnswerResult> {
  const version = await db
    .prepare(
      `SELECT v.id AS "versionId", v.question_id AS "questionId", v.explanation AS "explanation",
        v.question_type AS "questionType", q.quiz_id AS "quizId"
       FROM question_versions v JOIN questions q ON q.id = v.question_id
       WHERE v.id = ?`,
    )
    .bind(input.questionVersionId)
    .first<{
      versionId: number;
      questionId: number;
      explanation: string | null;
      questionType: QuestionType;
      quizId: number;
    }>();
  if (!version) throw new Error("問題がありません");
  if (version.questionType === "cloze_text") {
    return createReviewClozeAnswer(db, version, input.answers, input.sessionId);
  }
  if (version.questionType === "order_blocks") {
    return createReviewOrderAnswer(db, version, input.order, input.sessionId);
  }
  if (input.choice === undefined) throw new Error("choiceを指定してください");
  const { results: choices } = await db
    .prepare(
      "SELECT position, choice_text AS text, is_correct AS isCorrect FROM question_choices WHERE question_version_id = ? ORDER BY position",
    )
    .bind(input.questionVersionId)
    .all<{ position: number; text: string; isCorrect: number }>();
  if (!choices.length) throw new Error("問題がありません");
  const picked = choices.find((c) => c.position === input.choice);
  if (!picked) throw new Error("選択肢がありません");
  const correctAnswer = choices.find((c) => c.isCorrect === 1)?.position ?? 0;
  const correct = input.choice === correctAnswer ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO review_answers
        (session_id, question_id, question_version_id, quiz_id, choice_position, choice_text_snapshot, correct)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .bind(
      input.sessionId ?? null,
      version.questionId,
      input.questionVersionId,
      version.quizId,
      input.choice,
      picked.text,
      correct,
    )
    .run();
  const streakInfo = await calcReviewStreak(db, version.questionId);
  return {
    correct: correct === 1,
    correctAnswer,
    explanation: version.explanation ?? "",
    details: [],
    orderDetails: [],
    correctOrder: [],
    ...streakInfo,
  };
}

/** 復習の穴埋め回答を記録し、空欄単位で採点する */
async function createReviewClozeAnswer(
  db: DB,
  version: { versionId: number; questionId: number; explanation: string | null; quizId: number },
  rawAnswers: string[] | undefined,
  sessionId: string | undefined,
): Promise<ReviewAnswerResult> {
  const blanks = (await loadClozeBlanks(db, [version.versionId])).get(version.versionId) ?? [];
  if (!blanks.length) throw new Error("問題がありません");
  if (!rawAnswers || rawAnswers.length !== blanks.length) {
    throw new Error(`回答は${blanks.length}個の空欄分すべて入力してください`);
  }
  const trimmed = rawAnswers.map((s) => (typeof s === "string" ? s.trim() : ""));
  if (trimmed.some((s) => !s)) throw new Error("空欄が未入力です");
  const per = gradeCloze(
    trimmed,
    blanks.map((b) => b.answer),
  );
  const allOk = per.every(Boolean) ? 1 : 0;
  const r = await db
    .prepare(
      `INSERT INTO review_answers
        (session_id, question_id, question_version_id, quiz_id, choice_position, choice_text_snapshot, answer_text_snapshot, correct)
       VALUES (?,?,?,?,NULL,'',?,?)`,
    )
    .bind(
      sessionId ?? null,
      version.questionId,
      version.versionId,
      version.quizId,
      trimmed.join(" / "),
      allOk,
    )
    .run();
  const reviewId = Number(r.meta.last_row_id);
  await db.batch(
    blanks.map((b, i) =>
      db
        .prepare(
          "INSERT INTO review_cloze_answers (review_answer_id, blank_index, user_answer_text, correct) VALUES (?,?,?,?)",
        )
        .bind(reviewId, b.index, trimmed[i], per[i] ? 1 : 0),
    ),
  );
  const streakInfo = await calcReviewStreak(db, version.questionId);
  return {
    correct: allOk === 1,
    correctAnswer: 0,
    explanation: version.explanation ?? "",
    details: blanks.map((b, i) => ({ blank: b.index, correct: per[i]!, answer: b.answer })),
    orderDetails: [],
    correctOrder: [],
    ...streakInfo,
  };
}

/** 復習の並べ替え回答を記録し、位置単位で採点する */
async function createReviewOrderAnswer(
  db: DB,
  version: { versionId: number; questionId: number; explanation: string | null; quizId: number },
  rawOrder: string[] | undefined,
  sessionId: string | undefined,
): Promise<ReviewAnswerResult> {
  const correct = (await loadOrderItems(db, [version.versionId])).get(version.versionId) ?? [];
  if (!correct.length) throw new Error("問題がありません");
  if (!rawOrder || rawOrder.length !== correct.length) {
    throw new Error(`回答は${correct.length}個のブロックをすべて並べてください`);
  }
  const trimmed = rawOrder.map((s) => (typeof s === "string" ? s.trim() : ""));
  if (trimmed.some((s) => !s)) throw new Error("空のブロックがあります");
  const per = gradeOrder(trimmed, correct);
  const allOk = per.every(Boolean) ? 1 : 0;
  const r = await db
    .prepare(
      `INSERT INTO review_answers
        (session_id, question_id, question_version_id, quiz_id, choice_position, choice_text_snapshot, answer_text_snapshot, correct)
       VALUES (?,?,?,?,NULL,'',?,?)`,
    )
    .bind(
      sessionId ?? null,
      version.questionId,
      version.versionId,
      version.quizId,
      trimmed.join(" / "),
      allOk,
    )
    .run();
  const reviewId = Number(r.meta.last_row_id);
  await db.batch(
    correct.map((_, i) =>
      db
        .prepare(
          "INSERT INTO review_order_answers (review_answer_id, position, user_item_text, correct) VALUES (?,?,?,?)",
        )
        .bind(reviewId, i + 1, trimmed[i], per[i] ? 1 : 0),
    ),
  );
  const streakInfo = await calcReviewStreak(db, version.questionId);
  return {
    correct: allOk === 1,
    correctAnswer: 0,
    explanation: version.explanation ?? "",
    details: [],
    orderDetails: correct.map((c, i) => ({ position: i + 1, correct: per[i]!, answer: c })),
    correctOrder: correct,
    ...streakInfo,
  };
}

/** 直近N件から連続正解数を数える (本番+復習の統合時系列) */
async function calcReviewStreak(
  db: DB,
  questionId: number,
): Promise<{ streak: number; resolved: boolean; remaining: number }> {
  const { results: recent } = await db
    .prepare(
      `SELECT correct FROM unified_answer_history
       WHERE question_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?`,
    )
    .bind(questionId, REVIEW_CLEAR_STREAK)
    .all<{ correct: number }>();
  let streak = 0;
  for (const r of recent) {
    if (Number(r.correct) === 1) streak++;
    else break;
  }
  return {
    streak,
    resolved: streak >= REVIEW_CLEAR_STREAK,
    remaining: Math.max(0, REVIEW_CLEAR_STREAK - streak),
  };
}

/**
 * 苦手集計: question_id単位で、直近REVIEW_CLEAR_STREAK件がすべて正解なら解消扱いで除外する。
 * - mistakeCount / lastWrongAt: 本番+復習を通算 (unified_answer_history)
 * - 解消判定: ROW_NUMBERで直近N件を切り出し、全正解なら除外
 * 出題は current_version の最新スナップショットで行う (版ズレを踏まない)。
 * published のクイズのみ対象。
 * 上限なしで全件返し、順序は毎回ランダム (ORDER BY RANDOM())。
 */
export async function listMistakes(
  db: DB,
  filter: {
    quizId?: number | undefined;
    categoryId?: number | undefined;
  },
): Promise<MistakeItem[]> {
  const streak = REVIEW_CLEAR_STREAK;
  const conds: string[] = ["qz.status = 'published'"];
  const filterParams: unknown[] = [];
  if (filter.quizId !== undefined) {
    conds.push("qz.id = ?");
    filterParams.push(filter.quizId);
  }
  if (filter.categoryId !== undefined) {
    conds.push("c.id = ?");
    filterParams.push(filter.categoryId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { results: rows } = await db
    .prepare(
      `WITH ranked AS (
         SELECT question_id AS "qid", correct, created_at,
           ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY created_at DESC, seq DESC) AS "rn"
         FROM unified_answer_history
       ),
       agg AS (
         SELECT "qid",
           SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) AS "mistakeCount",
           MAX(CASE WHEN correct = 0 THEN created_at ELSE NULL END) AS "lastWrongAt",
           SUM(CASE WHEN "rn" <= ? AND correct = 1 THEN 1 ELSE 0 END) AS "recentCorrectCount",
           SUM(CASE WHEN "rn" <= ? THEN 1 ELSE 0 END) AS "recentCount"
         FROM ranked GROUP BY "qid"
       )
       SELECT q.id AS "questionId",
        q.current_version_id AS "questionVersionId",
        qz.id AS "quizId", qz.title AS "quizTitle",
        t.title AS "topicTitle",
        c.id AS "categoryId", c.title AS "categoryTitle",
        cv.question_type AS "questionType",
        cv.statement AS "statement", cv.explanation AS "explanation",
        agg."mistakeCount", agg."lastWrongAt"
       FROM questions q
       JOIN agg ON agg."qid" = q.id
       JOIN quizzes qz ON qz.id = q.quiz_id
       JOIN topics t ON t.id = qz.topic_id
       JOIN categories c ON c.id = t.category_id
       JOIN question_versions cv ON cv.id = q.current_version_id
       ${where}
         AND agg."mistakeCount" > 0
         AND NOT (agg."recentCount" = ? AND agg."recentCorrectCount" = ?)
        ORDER BY RANDOM()`,
    )
    .bind(streak, streak, ...filterParams, streak, streak)
    .all<{
      questionId: number;
      questionVersionId: number;
      quizId: number;
      quizTitle: string;
      topicTitle: string;
      categoryId: number;
      categoryTitle: string;
      questionType: QuestionType;
      statement: string;
      explanation: string | null;
      mistakeCount: number;
      lastWrongAt: string | null;
    }>();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.questionVersionId);
  // 全件復習で件数が増えてもバインド上限を踏まないよう分割取得する
  const choiceRows: { versionId: number; position: number; text: string; isCorrect: number }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT question_version_id AS "versionId", position, choice_text AS "text", is_correct AS "isCorrect"
         FROM question_choices WHERE question_version_id IN (${placeholders}) ORDER BY question_version_id, position`,
      )
      .bind(...chunk)
      .all<{ versionId: number; position: number; text: string; isCorrect: number }>();
    choiceRows.push(...results);
  }
  const byVersion = new Map<number, { choices: string[]; answer: number }>();
  for (const ch of choiceRows) {
    let entry = byVersion.get(ch.versionId);
    if (!entry) {
      entry = { choices: [], answer: 1 };
      byVersion.set(ch.versionId, entry);
    }
    entry.choices[ch.position - 1] = ch.text;
    if (ch.isCorrect === 1) entry.answer = ch.position;
  }
  const clozeByVersion = await loadClozeBlanks(
    db,
    rows.filter((r) => r.questionType === "cloze_text").map((r) => r.questionVersionId),
  );
  const orderByVersion = await loadOrderItems(
    db,
    rows.filter((r) => r.questionType === "order_blocks").map((r) => r.questionVersionId),
  );
  return rows.map((r) => {
    const e = byVersion.get(r.questionVersionId) ?? { choices: [], answer: 1 };
    const isCloze = r.questionType === "cloze_text";
    const isOrder = r.questionType === "order_blocks";
    const correctOrder = orderByVersion.get(r.questionVersionId) ?? [];
    return {
      questionId: Number(r.questionId),
      questionVersionId: Number(r.questionVersionId),
      quizId: Number(r.quizId),
      quizTitle: r.quizTitle,
      topicTitle: r.topicTitle,
      categoryId: Number(r.categoryId),
      categoryTitle: r.categoryTitle,
      questionType: r.questionType,
      statement: r.statement,
      choices: isCloze || isOrder ? [] : e.choices,
      answer: isCloze || isOrder ? 0 : e.answer,
      correctAnswers: (clozeByVersion.get(r.questionVersionId) ?? []).map((b) => b.answer),
      // 復習出題時はシャッフル表示 (正順漏洩防止)。採点はサーバ側で正順と照合する。
      items: isOrder ? seededShuffle(correctOrder, 0) : [],
      correctOrder,
      explanation: r.explanation ?? "",
      mistakeCount: Number(r.mistakeCount),
      lastWrongAt: r.lastWrongAt,
    };
  });
}

// ---------- Random (全体から1問だけ: 練習扱い・attempts系に影響しない) ----------

/**
 * 全体ランダムで1問だけ取得する (絞り込みなし)。
 * published のクイズの current_version スナップショットを返す。
 * 返却形は MistakeItem と同形 (mistakeCount=0, lastWrongAt=null) にし、
 * クライアントの復習単問UIをそのまま流用できるようにする。
 * 回答の記録・採点は既存 POST /api/review/answers を使うためここでは行わない。
 */
export async function getRandomQuestion(db: DB): Promise<MistakeItem | null> {
  const row = await db
    .prepare(
      `SELECT q.id AS "questionId",
        q.current_version_id AS "questionVersionId",
        qz.id AS "quizId", qz.title AS "quizTitle",
        t.title AS "topicTitle",
        c.id AS "categoryId", c.title AS "categoryTitle",
        cv.question_type AS "questionType",
        cv.statement AS "statement", cv.explanation AS "explanation"
       FROM questions q
       JOIN quizzes qz ON qz.id = q.quiz_id
       JOIN topics t ON t.id = qz.topic_id
       JOIN categories c ON c.id = t.category_id
       JOIN question_versions cv ON cv.id = q.current_version_id
       WHERE qz.status = 'published' AND q.current_version_id IS NOT NULL
       ORDER BY RANDOM() LIMIT 1`,
    )
    .first<{
      questionId: number;
      questionVersionId: number;
      quizId: number;
      quizTitle: string;
      topicTitle: string;
      categoryId: number;
      categoryTitle: string;
      questionType: QuestionType;
      statement: string;
      explanation: string | null;
    }>();
  if (!row) return null;
  const versionId = Number(row.questionVersionId);
  const { results: choiceRows } = await db
    .prepare(
      `SELECT position, choice_text AS "text", is_correct AS "isCorrect"
       FROM question_choices WHERE question_version_id = ? ORDER BY position`,
    )
    .bind(versionId)
    .all<{ position: number; text: string; isCorrect: number }>();
  const choices: string[] = [];
  let answer = 1;
  for (const ch of choiceRows) {
    choices[Number(ch.position) - 1] = ch.text;
    if (Number(ch.isCorrect) === 1) answer = Number(ch.position);
  }
  const isCloze = row.questionType === "cloze_text";
  const isOrder = row.questionType === "order_blocks";
  const clozeBlanks = isCloze
    ? ((await loadClozeBlanks(db, [versionId])).get(versionId) ?? [])
    : [];
  const correctOrder = isOrder
    ? ((await loadOrderItems(db, [versionId])).get(versionId) ?? [])
    : [];
  return {
    questionId: Number(row.questionId),
    questionVersionId: versionId,
    quizId: Number(row.quizId),
    quizTitle: row.quizTitle,
    topicTitle: row.topicTitle,
    categoryId: Number(row.categoryId),
    categoryTitle: row.categoryTitle,
    questionType: row.questionType,
    statement: row.statement,
    choices: isCloze || isOrder ? [] : choices,
    answer: isCloze || isOrder ? 0 : answer,
    correctAnswers: clozeBlanks.map((b) => b.answer),
    // 出題時はシャッフル表示 (正順漏洩防止)。採点はサーバ側で正順と照合する。
    items: isOrder ? seededShuffle(correctOrder, 0) : [],
    correctOrder,
    explanation: row.explanation ?? "",
    mistakeCount: 0,
    lastWrongAt: null,
  };
}

// ---------- Bookmark (1問保存: 解答履歴と分離。成績・集計に影響しない) ----------

/** ブックマーク追加 (冪等: 既存は無視)。存在しない問題は 404 用エラーを投げる */
export async function addBookmark(db: DB, questionId: number): Promise<void> {
  const q = await db.prepare("SELECT id FROM questions WHERE id = ?").bind(questionId).first();
  if (!q) throw new Error("問題がありません");
  await db
    .prepare("INSERT OR IGNORE INTO question_bookmarks (question_id) VALUES (?)")
    .bind(questionId)
    .run();
}

/** ブックマーク削除 (冪等: 無くても成功) */
export async function removeBookmark(db: DB, questionId: number): Promise<void> {
  await db.prepare("DELETE FROM question_bookmarks WHERE question_id = ?").bind(questionId).run();
}

/** ブックマーク済みか */
export async function isBookmarked(db: DB, questionId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS one FROM question_bookmarks WHERE question_id = ?")
    .bind(questionId)
    .first();
  return row !== null;
}

/**
 * ブックマーク一覧: 最新版スナップショット付きでランダム順に返す。
 * ランダム表示が要件のため ORDER BY RANDOM() に固定する。
 */
export async function listBookmarks(
  db: DB,
  filter: { quizId?: number | undefined; limit?: number | undefined },
): Promise<
  {
    questionId: number;
    questionVersionId: number;
    quizId: number;
    quizTitle: string;
    questionType: QuestionType;
    statement: string;
    choices: string[];
    answer: number;
    correctAnswers: string[];
    correctOrder: string[];
    explanation: string;
    bookmarkedAt: string;
  }[]
> {
  const limit = Math.min(Math.max(filter.limit ?? 30, 1), 100);
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filter.quizId !== undefined) {
    conds.push("q.quiz_id = ?");
    params.push(filter.quizId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { results: rows } = await db
    .prepare(
      `SELECT q.id AS "questionId",
        q.current_version_id AS "questionVersionId",
        q.quiz_id AS "quizId", qz.title AS "quizTitle",
        cv.question_type AS "questionType",
        cv.statement AS "statement", cv.explanation AS "explanation",
        b.created_at AS "bookmarkedAt"
       FROM question_bookmarks b
       JOIN questions q ON q.id = b.question_id
       JOIN quizzes qz ON qz.id = q.quiz_id
       JOIN question_versions cv ON cv.id = q.current_version_id
       ${where}
       ORDER BY RANDOM() LIMIT ?`,
    )
    .bind(...params, limit)
    .all<{
      questionId: number;
      questionVersionId: number;
      quizId: number;
      quizTitle: string;
      questionType: QuestionType;
      statement: string;
      explanation: string | null;
      bookmarkedAt: string;
    }>();
  if (!rows.length) return [];
  const ids = rows.map((r) => r.questionVersionId);
  const placeholders = ids.map(() => "?").join(",");
  const { results: choiceRows } = await db
    .prepare(
      `SELECT question_version_id AS "versionId", position, choice_text AS "text", is_correct AS "isCorrect"
       FROM question_choices WHERE question_version_id IN (${placeholders}) ORDER BY question_version_id, position`,
    )
    .bind(...ids)
    .all<{ versionId: number; position: number; text: string; isCorrect: number }>();
  const byVersion = new Map<number, { choices: string[]; answer: number }>();
  for (const ch of choiceRows) {
    let entry = byVersion.get(ch.versionId);
    if (!entry) {
      entry = { choices: [], answer: 1 };
      byVersion.set(ch.versionId, entry);
    }
    entry.choices[ch.position - 1] = ch.text;
    if (ch.isCorrect === 1) entry.answer = ch.position;
  }
  const clozeByVersion = await loadClozeBlanks(
    db,
    rows.filter((r) => r.questionType === "cloze_text").map((r) => r.questionVersionId),
  );
  const orderByVersion = await loadOrderItems(
    db,
    rows.filter((r) => r.questionType === "order_blocks").map((r) => r.questionVersionId),
  );
  return rows.map((r) => {
    const e = byVersion.get(r.questionVersionId) ?? { choices: [], answer: 1 };
    const isCloze = r.questionType === "cloze_text";
    const isOrder = r.questionType === "order_blocks";
    return {
      questionId: Number(r.questionId),
      questionVersionId: Number(r.questionVersionId),
      quizId: Number(r.quizId),
      quizTitle: r.quizTitle,
      questionType: r.questionType,
      statement: r.statement,
      choices: isCloze || isOrder ? [] : e.choices,
      answer: isCloze || isOrder ? 0 : e.answer,
      correctAnswers: (clozeByVersion.get(r.questionVersionId) ?? []).map((b) => b.answer),
      correctOrder: orderByVersion.get(r.questionVersionId) ?? [],
      explanation: r.explanation ?? "",
      bookmarkedAt: r.bookmarkedAt,
    };
  });
}
