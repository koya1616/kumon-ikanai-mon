// 中断再開のための localStorage 管理とシャッフル。
// attempts 自体にユーザー概念がなく全体共有のため、サーバ状態の検証と
// 組み合わせて使う (表示順も保存し、再開時の並びを復元する)。
import type { PlayQuestion } from "./api";

export const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
};

export interface ResumeData {
  attemptId: number;
  order: number[];
}

const key = (quizId: number) => `kmon:resume:${quizId}`;

export const readResume = (quizId: number): ResumeData | null => {
  try {
    const raw = localStorage.getItem(key(quizId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ResumeData> | null;
    if (!v || typeof v.attemptId !== "number" || !Array.isArray(v.order) || !v.order.length) {
      return null;
    }
    return { attemptId: v.attemptId, order: v.order };
  } catch {
    return null;
  }
};

export const writeResume = (quizId: number, attemptId: number, order: number[]): void => {
  try {
    localStorage.setItem(key(quizId), JSON.stringify({ attemptId, order }));
  } catch {
    /* private mode などでは保存できなくても続行する */
  }
};

export const clearResume = (quizId: number): void => {
  try {
    localStorage.removeItem(key(quizId));
  } catch {
    /* ignore */
  }
};

export type { PlayQuestion };
