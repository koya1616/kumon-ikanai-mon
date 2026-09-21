// API クライアントとドメイン型 (サーバの REST 契約に対応)。
// サーバのルート定義 (src/index.ts) と 1:1 に対応させること。
import {
  ORDER_ITEM_MAX_LENGTH,
  ORDER_MAX_ITEMS,
  ORDER_MIN_ITEMS,
  QUESTIONS_PER_QUIZ,
} from "../domain";

export { ORDER_ITEM_MAX_LENGTH, ORDER_MAX_ITEMS, ORDER_MIN_ITEMS, QUESTIONS_PER_QUIZ };

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

export type QuestionType = "single_choice" | "cloze_text" | "order_blocks";

export interface ClozeBlank {
  index: number;
  answer: string;
}

export interface ClozeDetail {
  blank: number;
  correct: boolean;
  answer: string;
}

export interface OrderDetail {
  position: number;
  correct: boolean;
  answer: string;
}

export const isCloze = (t: QuestionType | undefined): boolean => t === "cloze_text";
export const isOrder = (t: QuestionType | undefined): boolean => t === "order_blocks";

export interface Question {
  id: number;
  quizId: number;
  questionType: QuestionType;
  statement: string;
  choices: string[];
  answer: number;
  blanks: ClozeBlank[];
  /** order_blocks の正順ブロック (他型では空配列) */
  items: string[];
  explanation: string;
}

export interface PlayQuestion {
  questionId: number;
  questionVersionId: number;
  attemptQuestionId?: number;
  position?: number;
  questionType: QuestionType;
  statement: string;
  choices: string[];
  blankCount: number;
  /** order_blocks の出題ブロック (シャッフル済み。他型では空配列) */
  items: string[];
  itemCount: number;
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
  answers: string[];
  details: ClozeDetail[];
  /** order_blocks の提出順・位置単位明細 (他型では空配列) */
  order: string[];
  orderDetails: OrderDetail[];
}

export interface AttemptState {
  attemptId: number;
  quizId: number;
  completedAt: string | null;
  questions: PlayQuestion[];
  answers: AttemptStateAnswer[];
}

/** GET /api/attempts/in-progress の1件 (端末非依存の「つづきから」用) */
export interface InProgressAttempt {
  attemptId: number;
  quizId: number;
  done: number;
  total: number;
  lastAnsweredAt: string | null;
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

/** クイズ横断の完了履歴1件 (GET /api/attempts/recent の返却形) */
export interface AttemptHistoryItem extends AttemptRecord {
  quizTitle: string;
  topicId: number;
  topicTitle: string;
  categoryId: number;
  categoryTitle: string;
}

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
  pickedAnswers: string[];
  correctAnswers: string[];
  pickedOrder: string[];
  correctOrder: string[];
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

/** 問題別集計の1問 (GET /api/quizzes/:id/insights) */
export interface QuestionInsight {
  questionId: number;
  questionType: QuestionType;
  statement: string;
  choices: string[];
  correctAnswer: number;
  correctAnswers: string[];
  correctOrder: string[];
  explanation: string;
  /** 古い順。null = 未回答 */
  results: (boolean | null)[];
}

export interface QuizInsights {
  attemptCount: number;
  questions: QuestionInsight[];
}

/** 苦手一括復習用の1問 (練習扱い・採点はサーバで行い記録する) */
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
  correctAnswers: string[];
  /** order_blocks の出題ブロック (シャッフル済み)・正順 */
  items: string[];
  correctOrder: string[];
  explanation: string;
  mistakeCount: number;
  lastWrongAt: string | null;
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
  correctAnswers: string[];
  correctOrder: string[];
  explanation: string;
  bookmarkedAt: string;
}

/** POST /api/review/answers の返却形 (サーバ採点・連続正解数付き) */
export interface ReviewAnswerResult {
  correct: boolean;
  correctAnswer: number;
  explanation: string;
  details: ClozeDetail[];
  orderDetails: OrderDetail[];
  correctOrder: string[];
  streak: number;
  resolved: boolean;
  remaining: number;
}

/** POST /api/attempts/:id/answers の返却形 */
export interface AnswerResult {
  correct: boolean;
  correctAnswer: number;
  explanation: string;
  details: ClozeDetail[];
  orderDetails: OrderDetail[];
  correctOrder: string[];
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
