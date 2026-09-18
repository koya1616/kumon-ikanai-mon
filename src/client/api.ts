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
  /** 表示順→元の番号のマップ。choicesは表示順に並べ替え済み。未設定=シャッフルなし(恒等写像) */
  choiceMap?: number[];
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
  durationSec: number | null;
}

export interface AttemptDetailItem {
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
}

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

/** 苦手一括復習用の1問 (練習扱い・採点はクライアントで行う) */
export interface MistakeItem {
  questionId: number;
  questionVersionId: number;
  quizId: number;
  quizTitle: string;
  topicTitle: string;
  categoryId: number;
  categoryTitle: string;
  statement: string;
  choices: string[];
  answer: number;
  explanation: string;
  mistakeCount: number;
  lastWrongAt: string | null;
}

export const fmtDuration = (sec: number | null | undefined): string => {
  if (sec === null || sec === undefined) return "";
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}分${s}秒` : `${m}分`;
};

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
