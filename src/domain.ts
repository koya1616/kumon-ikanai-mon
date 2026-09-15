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

export type QuizStatus = "draft" | "published" | "archived";
export const QUIZ_STATUSES: QuizStatus[] = ["draft", "published", "archived"];

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

export interface Question {
  id: number;
  quizId: number;
  currentVersionId: number | null;
  version: number;
  questionVersionId: number;
  statement: string;
  choices: string[];
  answer: number; // 1始まりのposition
  explanation: string;
}

/** 解答用 (答え・解説なし) */
export interface PlayQuestion {
  questionVersionId: number;
  attemptQuestionId?: number;
  position?: number;
  statement: string;
  choices: string[];
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
// Hono 4 + Zod v4 推奨: ルート層では下のスキーマ + zValidator を使うこと。
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

// JSON一括取込用 (data/quizzes/*.json と同形式。管理画面フォーム + scripts/add-quiz.mjs 共通)
export const quizImportSchema = z.object({
  category: titleSchema,
  topic: titleSchema,
  quiz: z.object({
    title: titleSchema,
    difficulty: difficultySchema.default(1),
    status: quizStatusSchema.default("draft"),
  }),
  questions: z
    .array(questionSchema, { message: "questionsはちょうど10問必要です" })
    .length(QUESTIONS_PER_QUIZ, { message: `questionsはちょうど${QUESTIONS_PER_QUIZ}問必要です` }),
});

export const answerBodySchema = z.object({
  attemptQuestionId: z.coerce
    .number()
    .int()
    .positive({ message: "attemptQuestionIdとchoiceが必要です" }),
  choice: z.coerce
    .number()
    .int()
    .min(1, { message: "attemptQuestionIdとchoiceが必要です" })
    .max(CHOICE_COUNT, { message: `choiceは1-${CHOICE_COUNT}で指定してください` }),
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
}

/** quizごとの挑戦サマリー (ツリーのベスト表示用) */
export interface AttemptSummary {
  quizId: number;
  attemptCount: number;
  bestScore: number;
  bestTotal: number;
  lastCompletedAt: string | null;
}
