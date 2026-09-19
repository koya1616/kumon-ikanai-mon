// 出題セッション (Play → Result への引き継ぎ) を Context で共有する。
// メモリ保持のみ (リロードで失われる)。
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
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

interface SessionContextValue {
  session: PlaySession | null;
  setSession: (s: PlaySession | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<PlaySession | null>(null);
  const value = useMemo(() => ({ session, setSession }), [session]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const usePlaySession = (): SessionContextValue => {
  const v = useContext(SessionContext);
  if (!v) throw new Error("SessionProvider の外で usePlaySession が呼ばれました");
  return v;
};
