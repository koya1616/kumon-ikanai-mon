// API クライアントとドメイン型 (サーバの REST 契約に対応)。
// サーバのルート定義 (src/index.ts) と 1:1 に対応させること。
import { QUESTIONS_PER_QUIZ } from "../domain";

export { QUESTIONS_PER_QUIZ };

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

export type QuizStatus = "draft" | "published" | "archived";

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
  statement: string;
  choices: string[];
  answer: number;
  explanation: string;
}

export interface PlayQuestion {
  questionVersionId: number;
  attemptQuestionId?: number;
  position?: number;
  statement: string;
  choices: string[];
}

export interface QuizMeta {
  id: number;
  title: string;
  difficulty: number;
  status: QuizStatus;
  topicId: number;
  topicTitle: string;
  categoryId: number;
  categoryTitle: string;
}

export interface AttemptSummary {
  quizId: number;
  attemptCount: number;
  bestScore: number;
  bestTotal: number;
  lastCompletedAt: string | null;
}

export interface CategoryTreeNode {
  id: number;
  title: string;
  topics: { id: number; categoryId: number; title: string; quizzes: Quiz[] }[];
}

export interface AttemptStateAnswer {
  attemptQuestionId: number;
  choice: number;
  correct: boolean;
  correctAnswer: number;
  explanation: string;
}

export interface AttemptState {
  attemptId: number;
  quizId: number;
  completedAt: string | null;
  questions: PlayQuestion[];
  answers: AttemptStateAnswer[];
}

export interface AttemptRecord {
  id: number;
  quizId: number;
  score: number;
  total: number;
  completedAt: string | null;
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = async <T>(
  path: string,
  opt?: { method?: string; body?: unknown },
): Promise<T> => {
  const init: RequestInit = {
    method: opt?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (opt?.body !== undefined) init.body = JSON.stringify(opt.body);
  const r = await fetch(path, init);
  if (r.status === 204) return null as T;
  const t = await r.text();
  let data: unknown = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error || t || `HTTP ${r.status}`;
    throw new ApiError(msg, r.status);
  }
  return data as T;
};
