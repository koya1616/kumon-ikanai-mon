/// <reference types="@cloudflare/workers-types" />
import { z } from "zod";

/**
 * ドメインモデル (APIの正規形は camelCase)
 *
 * 階層: Category > Topic > Quiz
 * Quiz は difficulty を持ち、QUESTIONS_PER_QUIZ 問の Question を持つ。
 */

// 拡張用定数: 1箇所で変更できるように集約
export const QUESTIONS_PER_QUIZ = 10;
export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;
export const TITLE_MAX_LENGTH = 100;
export const CHOICE_COUNT = 4;
/** 苦手解消に必要な直近の連続正解数 (本番+復習の統合時系列で判定) */
export const REVIEW_CLEAR_STREAK = 2;

export type QuizStatus = "draft" | "published" | "archived";
export const QUIZ_STATUSES: QuizStatus[] = ["draft", "published", "archived"];

export type QuestionType = "single_choice" | "cloze_text" | "order_blocks";
export const QUESTION_TYPES: QuestionType[] = ["single_choice", "cloze_text", "order_blocks"];
/** 穴埋め1問あたりの最大空欄数 (誤爆・巨大入力の防止) */
export const CLOZE_MAX_BLANKS = 20;
/** 空欄正答・回答の最大文字数 */
export const CLOZE_ANSWER_MAX_LENGTH = 100;
/** 並べ替え1問あたりの最小・最大ブロック数 */
export const ORDER_MIN_ITEMS = 4;
export const ORDER_MAX_ITEMS = 20;
/** 並べ替え1ブロックの最大文字数 (コード行・SQL行を想定) */
export const ORDER_ITEM_MAX_LENGTH = 500;
/** 解説画像の最大バイト数 (R2保存用) */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** 解説画像として受け付けるMIME (拡張子マップ付き) */
export const IMAGE_MIME_TO_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
/** R2オブジェクトキー (randomUUID + 拡張子のみ許可し、パストラバーサルを防ぐ) */
export const imageKeySchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/);

export interface Category {
  id: number;
  title: string;
  topicCount?: number;
  quizCount?: number;
  questionCount?: number;
}

export interface Topic {
  id: number;
  categoryId: number;
  categoryTitle?: string;
  title: string;
  quizCount?: number;
  questionCount?: number;
}

export interface Quiz {
  id: number;
  topicId: number;
  topicTitle?: string;
  categoryId?: number;
  categoryTitle?: string;
  title: string;
  difficulty: number;
  status: QuizStatus;
  questionCount: number;
}

export interface ClozeBlank {
  index: number; // 1始まり。statement中の {{n}} に対応
  answer: string;
}

export interface Question {
  id: number;
  quizId: number;
  currentVersionId: number | null;
  version: number;
  questionVersionId: number;
  questionType: QuestionType;
  statement: string;
  choices: string[];
  answer: number; // 1始まりのposition (clozeでは0)
  /** cloze_text の正答一覧 (single_choiceでは空) */
  blanks: ClozeBlank[];
  /** order_blocks の正順ブロック (正解順。他型では空) */
  items: string[];
  explanation: string;
}

/** 解答用 (答え・解説なし) */
export interface PlayQuestion {
  questionId: number;
  questionVersionId: number;
  attemptQuestionId?: number;
  position?: number;
  questionType: QuestionType;
  statement: string;
  choices: string[];
  /** cloze_text の空欄数 (single_choiceでは0) */
  blankCount: number;
  /** order_blocks の出題ブロック (シャッフル済み。他型では空) */
  items: string[];
  /** order_blocks のブロック数 (他型では0) */
  itemCount: number;
}

/** 並べ替えの位置単位の採点明細 */
export interface OrderDetail {
  position: number;
  correct: boolean;
  /** 正解ブロック (回答後に開示する) */
  answer: string;
}

/** 空欄単位の採点明細 */
export interface ClozeDetail {
  blank: number;
  correct: boolean;
  /** 正答 (回答後に開示する) */
  answer: string;
}

export interface AttemptQuestion {
  id: number;
  attemptId: number;
  questionVersionId: number;
  position: number;
}

export interface CategoryTreeNode {
  id: number;
  title: string;
  topics: {
    id: number;
    categoryId: number;
    title: string;
    quizzes: Quiz[];
  }[];
}

// ---------- validation (拡張時はここだけ触る) ----------
// Zod v4 推奨: ルート層では下のスキーマで safeParse し、失敗時は 400 { error } を返すこと。
// 既存の assert* は後方互換のため残す (内部実装はスキーマに委譲)。

export const titleSchema = z.string().trim().min(1).max(TITLE_MAX_LENGTH);
export const difficultySchema = z.coerce.number().int().min(DIFFICULTY_MIN).max(DIFFICULTY_MAX);
export const answerSchema = z.coerce.number().int().min(1).max(CHOICE_COUNT);
export const quizStatusSchema = z.enum(["draft", "published", "archived"]);
export const idParamSchema = z.coerce.number().int().positive();
export const optionalIdQuerySchema = z.coerce.number().int().positive().optional();

const nonEmptyTrimmed = (field: string) =>
  z.unknown().refine((v): v is string => typeof v === "string" && v.trim().length > 0, {
    message: `${field}は必須です`,
  });

export const categoryBodySchema = z.object({ title: titleSchema });

export const topicBodySchema = z.object({
  categoryId: z.coerce.number().int().positive({ message: "categoryIdが必要です" }),
  title: titleSchema,
});

export const topicPatchSchema = z.object({
  title: titleSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export const quizBodySchema = z.object({
  topicId: z.coerce.number().int().positive({ message: "topicIdが必要です" }),
  title: titleSchema,
  difficulty: difficultySchema.default(1),
  status: quizStatusSchema.default("published"),
});

export const quizPatchSchema = z.object({
  title: titleSchema.optional(),
  difficulty: difficultySchema.optional(),
  topicId: z.coerce.number().int().positive().optional(),
  status: quizStatusSchema.optional(),
});

export const questionSchema = z.object({
  statement: nonEmptyTrimmed("statement").transform((s) => s.trim()),
  choice1: nonEmptyTrimmed("choice1").transform((s) => s.trim()),
  choice2: nonEmptyTrimmed("choice2").transform((s) => s.trim()),
  choice3: nonEmptyTrimmed("choice3").transform((s) => s.trim()),
  choice4: nonEmptyTrimmed("choice4").transform((s) => s.trim()),
  answer: answerSchema,
  explanation: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim())),
});

export const questionCreateSchema = questionSchema.extend({
  quizId: z.coerce.number().int().positive({ message: "quizIdが必要です" }),
});

export const questionBatchSchema = z.object({
  quizId: z.coerce.number().int().positive({ message: "quizIdとquestions配列が必要です" }),
  questions: z.array(questionSchema, { message: "quizIdとquestions配列が必要です" }),
});

/** statement中の {{n}} マーカーを昇順・重複除去で返す */
export function parseClozeMarkers(statement: string): number[] {
  const out: number[] = [];
  const re = /\{\{(\d+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(statement)) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** 穴埋め採点の1空欄分の比較: 前後空白を除いた完全一致。英字の大文字小文字は区別しない */
export function isClozeAnswerEqual(input: string, correct: string): boolean {
  return input.trim().toLowerCase() === correct.trim().toLowerCase();
}

/** マーカー検証: 1〜Nの連番ちょうどN個であること。NG時はメッセージ、OK時はnull */
export function validateClozeMarkers(statement: string): string | null {
  const markers = parseClozeMarkers(statement);
  if (!markers.length) return "問題文に{{1}}のような空欄マーカーが必要です";
  if (markers.length > CLOZE_MAX_BLANKS) {
    return `空欄は最大${CLOZE_MAX_BLANKS}個です`;
  }
  for (let i = 0; i < markers.length; i++) {
    if (markers[i] !== i + 1) return "空欄マーカーは{{1}}から飛び番なく連番にしてください";
  }
  return null;
}

const clozeAnswerString = z
  .unknown()
  .refine((v): v is string => typeof v === "string" && v.trim().length > 0, {
    message: "空欄の正答はすべて必須です",
  })
  .transform((s) => s.trim())
  .pipe(z.string().max(CLOZE_ANSWER_MAX_LENGTH));

export const clozeQuestionSchema = z
  .object({
    questionType: z.literal("cloze_text"),
    statement: nonEmptyTrimmed("statement").transform((s) => s.trim()),
    answers: z
      .array(clozeAnswerString, { message: "answers配列が必要です" })
      .min(1, { message: "answers配列が必要です" })
      .max(CLOZE_MAX_BLANKS),
    explanation: z
      .unknown()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim())),
  })
  .superRefine((v, ctx) => {
    const markerError = validateClozeMarkers(v.statement);
    if (markerError) {
      ctx.addIssue({ code: "custom", message: markerError });
      return;
    }
    if (parseClozeMarkers(v.statement).length !== v.answers.length) {
      ctx.addIssue({
        code: "custom",
        message: "空欄マーカーの個数とanswersの個数を一致させてください",
      });
    }
  });

export const clozeQuestionCreateSchema = clozeQuestionSchema.extend({
  quizId: z.coerce.number().int().positive({ message: "quizIdが必要です" }),
});

/** 並べ替え採点の1位置分の比較: 前後空白を除いた完全一致。大文字小文字は区別する (コード/SQL向け) */
export function isOrderItemEqual(input: string, correct: string): boolean {
  return input.trim() === correct.trim();
}

const orderItemString = z
  .unknown()
  .refine((v): v is string => typeof v === "string" && v.trim().length > 0, {
    message: "ブロックはすべて必須です",
  })
  .transform((s) => s.trim())
  .pipe(z.string().max(ORDER_ITEM_MAX_LENGTH));

export const orderQuestionSchema = z
  .object({
    questionType: z.literal("order_blocks"),
    statement: nonEmptyTrimmed("statement").transform((s) => s.trim()),
    items: z
      .array(orderItemString, { message: "items配列が必要です" })
      .min(ORDER_MIN_ITEMS, {
        message: `ブロックは${ORDER_MIN_ITEMS}〜${ORDER_MAX_ITEMS}個必要です`,
      })
      .max(ORDER_MAX_ITEMS, {
        message: `ブロックは${ORDER_MIN_ITEMS}〜${ORDER_MAX_ITEMS}個必要です`,
      }),
    explanation: z
      .unknown()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim())),
  })
  .superRefine((v, ctx) => {
    const trimmed = v.items.map((s) => s.trim());
    if (new Set(trimmed).size !== trimmed.length) {
      ctx.addIssue({ code: "custom", message: "ブロックが重複しています" });
    }
  });

export const orderQuestionCreateSchema = orderQuestionSchema.extend({
  quizId: z.coerce.number().int().positive({ message: "quizIdが必要です" }),
});

/** batch用: 1要素が4択か穴埋めか並べ替えか (questionTypeの有無で判定する) */
export const batchQuestionItemSchema = z.union([
  questionSchema,
  clozeQuestionSchema,
  orderQuestionSchema,
]);

export const mixedQuestionBatchSchema = z.object({
  quizId: z.coerce.number().int().positive({ message: "quizIdとquestions配列が必要です" }),
  questions: z.array(batchQuestionItemSchema, { message: "quizIdとquestions配列が必要です" }),
});

// JSON一括取込用 (data/quizzes/*.json と同形式。管理画面フォーム用)
// 4択・穴埋め・並べ替え混在可 (要素ごとの questionType で判定する)
export const quizImportSchema = z.object({
  category: titleSchema,
  topic: titleSchema,
  quiz: z.object({
    title: titleSchema,
    difficulty: difficultySchema.default(1),
    status: quizStatusSchema.default("published"),
  }),
  questions: z
    .array(batchQuestionItemSchema, { message: "questionsはちょうど10問必要です" })
    .length(QUESTIONS_PER_QUIZ, { message: `questionsはちょうど${QUESTIONS_PER_QUIZ}問必要です` }),
});

/** batch・取込の外枠 (要素は normalizeImportQuestion で1件ずつ検証する) */
export const batchEnvelopeSchema = z.object({
  quizId: z.coerce.number().int().positive({ message: "quizIdとquestions配列が必要です" }),
  questions: z.array(z.unknown(), { message: "quizIdとquestions配列が必要です" }),
});

export const importEnvelopeSchema = z.object({
  category: titleSchema,
  topic: titleSchema,
  quiz: z.object({
    title: titleSchema,
    difficulty: difficultySchema.default(1),
    status: quizStatusSchema.default("published"),
  }),
  questions: z
    .array(z.unknown(), { message: "questionsはちょうど10問必要です" })
    .length(QUESTIONS_PER_QUIZ, { message: `questionsはちょうど${QUESTIONS_PER_QUIZ}問必要です` }),
});

/** 単問POST/PUTの分岐用 */
export function isClozePayload(raw: unknown): boolean {
  return (
    raw !== null &&
    typeof raw === "object" &&
    (raw as { questionType?: unknown }).questionType === "cloze_text"
  );
}

/** 単問POST/PUTの分岐用 (並べ替え) */
export function isOrderPayload(raw: unknown): boolean {
  return (
    raw !== null &&
    typeof raw === "object" &&
    (raw as { questionType?: unknown }).questionType === "order_blocks"
  );
}

/** 取込・batch要素の正規化 (4択か穴埋めか並べ替えかを判別して検証する) */
export function normalizeImportQuestion(
  raw: unknown,
  index: number,
):
  | {
      questionType?: "single_choice";
      statement: string;
      choice1: string;
      choice2: string;
      choice3: string;
      choice4: string;
      answer: number;
      explanation: string;
    }
  | { questionType: "cloze_text"; statement: string; answers: string[]; explanation: string }
  | { questionType: "order_blocks"; statement: string; items: string[]; explanation: string } {
  const n = index + 1;
  if (isClozePayload(raw)) {
    const parsed = clozeQuestionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`questions[${n}]: ${parsed.error.issues[0]?.message ?? "入力が不正です"}`);
    }
    return {
      questionType: "cloze_text",
      statement: parsed.data.statement,
      answers: parsed.data.answers,
      explanation: parsed.data.explanation ?? "",
    };
  }
  if (isOrderPayload(raw)) {
    const parsed = orderQuestionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`questions[${n}]: ${parsed.error.issues[0]?.message ?? "入力が不正です"}`);
    }
    return {
      questionType: "order_blocks",
      statement: parsed.data.statement,
      items: parsed.data.items,
      explanation: parsed.data.explanation ?? "",
    };
  }
  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`questions[${n}]: ${parsed.error.issues[0]?.message ?? "入力が不正です"}`);
  }
  return { ...parsed.data, explanation: parsed.data.explanation ?? "" };
}

export const answerBodySchema = z.object({
  attemptQuestionId: z.coerce
    .number()
    .int()
    .positive({ message: "attemptQuestionIdとchoiceが必要です" }),
  choice: z.coerce
    .number()
    .int()
    .min(1, { message: "attemptQuestionIdとchoiceが必要です" })
    .max(CHOICE_COUNT, { message: `choiceは1-${CHOICE_COUNT}で指定してください` })
    .optional(),
  answers: z.array(z.string().max(CLOZE_ANSWER_MAX_LENGTH)).max(CLOZE_MAX_BLANKS).optional(),
  order: z.array(z.string().max(ORDER_ITEM_MAX_LENGTH)).max(ORDER_MAX_ITEMS).optional(),
});

/** 復習回答用 (練習扱い・attempts系に影響しない)。採点はサーバ側で行う */
export const reviewAnswerBodySchema = z.object({
  questionVersionId: z.coerce
    .number()
    .int()
    .positive({ message: "questionVersionIdとchoiceが必要です" }),
  choice: z.coerce
    .number()
    .int()
    .min(1, { message: "questionVersionIdとchoiceが必要です" })
    .max(CHOICE_COUNT, { message: `choiceは1-${CHOICE_COUNT}で指定してください` })
    .optional(),
  answers: z.array(z.string().max(CLOZE_ANSWER_MAX_LENGTH)).max(CLOZE_MAX_BLANKS).optional(),
  order: z.array(z.string().max(ORDER_ITEM_MAX_LENGTH)).max(ORDER_MAX_ITEMS).optional(),
  sessionId: z.string().trim().min(1).max(64).optional(),
});

export function assertCategoryTitle(title: unknown): asserts title is string {
  if (typeof title !== "string" || !title.trim() || title.trim().length > TITLE_MAX_LENGTH) {
    throw new Error(`titleは1〜${TITLE_MAX_LENGTH}文字で入力してください`);
  }
}

export function assertDifficulty(difficulty: unknown): asserts difficulty is number {
  const d = Number(difficulty);
  if (!Number.isInteger(d) || d < DIFFICULTY_MIN || d > DIFFICULTY_MAX) {
    throw new Error(`difficultyは${DIFFICULTY_MIN}-${DIFFICULTY_MAX}の整数です`);
  }
}

export function assertAnswer(answer: unknown): asserts answer is number {
  const a = Number(answer);
  if (!Number.isInteger(a) || a < 1 || a > CHOICE_COUNT) {
    throw new Error(`answerは1-${CHOICE_COUNT}の整数です`);
  }
}

export function assertQuizStatus(status: unknown): asserts status is QuizStatus {
  if (status !== "draft" && status !== "published" && status !== "archived") {
    throw new Error("statusはdraft/published/archivedのいずれかです");
  }
}

export interface QuestionInput {
  quizId?: number;
  statement: unknown;
  choice1: unknown;
  choice2: unknown;
  choice3: unknown;
  choice4: unknown;
  answer: unknown;
  explanation?: unknown;
}

export function validateQuestionInput(input: QuestionInput): string | null {
  for (const key of ["statement", "choice1", "choice2", "choice3", "choice4"] as const) {
    if (typeof input[key] !== "string" || !(input[key] as string).trim()) return `${key}は必須です`;
  }
  try {
    assertAnswer(input.answer);
  } catch (e) {
    return (e as Error).message;
  }
  return null;
}

/** 1回の挑戦 (quizに何度でも挑戦でき、上書きせず蓄積する) */
export interface Attempt {
  id: number;
  quizId: number;
  score: number;
  total: number;
  completedAt: string | null;
  createdAt: string;
  /** 所要秒 (completedAt - createdAt。未完了は null) */
  durationSec: number | null;
}

/** 履歴詳細ページ用の1問分の掘り下げ (出題時点のスナップショット) */
export interface AttemptDetailItem {
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
  /** cloze_text の入力・正答 (single_choiceでは空配列) */
  pickedAnswers: string[];
  correctAnswers: string[];
  /** order_blocks の提出順・正順 (他型では空配列) */
  pickedOrder: string[];
  correctOrder: string[];
  explanation: string;
}

/** GET /api/attempts/:id?detail=full の返却形 */
export interface AttemptDetail {
  attemptId: number;
  quizId: number;
  score: number;
  total: number;
  completedAt: string | null;
  createdAt: string;
  durationSec: number | null;
  items: AttemptDetailItem[];
}

/** quizごとの挑戦サマリー (ツリーのベスト表示用) */
export interface AttemptSummary {
  quizId: number;
  attemptCount: number;
  bestScore: number;
  bestTotal: number;
  lastCompletedAt: string | null;
}

/** ブックマーク一覧用の1問 (最新版スナップショット + ブックマーク日時) */
export interface BookmarkItem {
  questionId: number;
  questionVersionId: number;
  quizId: number;
  quizTitle: string;
  questionType: QuestionType;
  statement: string;
  choices: string[];
  answer: number;
  /** cloze_text の正答一覧 (single_choiceでは空配列) */
  correctAnswers: string[];
  /** order_blocks の正順ブロック (他型では空配列) */
  correctOrder: string[];
  explanation: string;
  bookmarkedAt: string;
}

/** ブックマーク追加・削除用 */
export const bookmarkBodySchema = z.object({
  questionId: idParamSchema,
});

/** POST /api/review/answers の返却形 */
export interface ReviewAnswerResult {
  correct: boolean;
  correctAnswer: number;
  explanation: string;
  /** cloze_text の空欄単位明細 (single_choiceでは空配列) */
  details: ClozeDetail[];
  /** order_blocks の位置単位明細 (他型では空配列) */
  orderDetails: OrderDetail[];
  /** order_blocks の正順 (回答後の開示用。他型では空配列) */
  correctOrder: string[];
  /** 直近の連続正解数 (今回を含む。本番+復習の統合時系列) */
  streak: number;
  /** streak >= REVIEW_CLEAR_STREAK か */
  resolved: boolean;
  /** 解消までの残り正解数 */
  remaining: number;
}

/** POST /api/attempts/:id/answers の返却形 */
export interface AnswerResult {
  correct: boolean;
  correctAnswer: number;
  explanation: string;
  /** cloze_text の空欄単位明細 (single_choiceでは空配列) */
  details: ClozeDetail[];
  /** order_blocks の位置単位明細 (他型では空配列) */
  orderDetails: OrderDetail[];
  /** order_blocks の正順 (回答後の開示用。他型では空配列) */
  correctOrder: string[];
}
