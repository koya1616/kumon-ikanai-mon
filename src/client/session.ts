// 出題セッション (Play → Result への引き継ぎ)。旧 state.session に対応。
// メモリ保持のみ (リロードで失われるのは旧仕様と同じ)。
import type { ClozeDetail, PlayQuestion, QuizMeta } from "./api";

export interface SessionAnswer {
  q: PlayQuestion;
  choice: number;
  ok: boolean;
  correct: number;
  exp: string;
  /** cloze_text の入力 (single_choiceでは空配列) */
  inputs: string[];
  /** cloze_text の空欄単位明細 (single_choiceでは空配列) */
  details: ClozeDetail[];
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
