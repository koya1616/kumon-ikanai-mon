// 出題セッション (Play → Result への引き継ぎ)。旧 state.session に対応。
// メモリ保持のみ (リロードで失われるのは旧仕様と同じ)。
import type { PlayQuestion, QuizMeta } from "./api";

export interface SessionAnswer {
  q: PlayQuestion;
  choice: number;
  ok: boolean;
  correct: number;
  exp: string;
}

export interface PlaySession {
  attemptId: number;
  quiz: QuizMeta;
  questions: PlayQuestion[];
  answers: SessionAnswer[];
  score: number;
}

let current: PlaySession | null = null;

export const getSession = (): PlaySession | null => {
  return current;
};

export const setSession = (s: PlaySession | null): void => {
  current = s;
};
