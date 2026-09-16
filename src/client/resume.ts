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

/** 表示位置(1始まり)→元の番号。choiceMap未設定は恒等写像 */
export const toOriginalPos = (q: PlayQuestion, displayed: number): number => {
  const m = q.choiceMap;
  if (!m || m.length !== q.choices.length) return displayed;
  return m[displayed - 1] ?? displayed;
};

/** 元の番号(1始まり)→表示位置。choiceMap未設定は恒等写像 */
export const toDisplayedPos = (q: PlayQuestion, original: number): number => {
  const m = q.choiceMap;
  if (!m || m.length !== q.choices.length) return original;
  const idx = m.indexOf(original);
  return idx < 0 ? original : idx + 1;
};

/** 1問分の選択肢を表示用にシャッフルし、choiceMapを付与する */
export const withShuffledChoices = (q: PlayQuestion): PlayQuestion => {
  if (q.choices.length <= 1) return { ...q, choiceMap: q.choices.map((_, i) => i + 1) };
  const map = shuffle(q.choices.map((_, i) => i + 1));
  return {
    ...q,
    choices: map.map((orig) => q.choices[orig - 1] as string),
    choiceMap: map,
  };
};

/** 保存済みマップをサーバ順の問題に適用する。不正なマップは無視して恒等写像にする */
export const applyChoiceOrder = (q: PlayQuestion, map: number[] | undefined): PlayQuestion => {
  if (!map || map.length !== q.choices.length) return q;
  const n = q.choices.length;
  const seen = new Set(map);
  if (seen.size !== n || map.some((v) => !Number.isInteger(v) || v < 1 || v > n)) return q;
  return {
    ...q,
    choices: map.map((orig) => q.choices[orig - 1] as string),
    choiceMap: [...map],
  };
};

export interface ResumeData {
  attemptId: number;
  order: number[];
  /** attemptQuestionId -> 表示順マップ (表示位置iの元番号)。旧データには無く、その場合は恒等写像扱い */
  choiceOrders?: Record<number, number[]> | undefined;
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
    const choiceOrders =
      v.choiceOrders && typeof v.choiceOrders === "object" ? v.choiceOrders : undefined;
    return { attemptId: v.attemptId, order: v.order, choiceOrders };
  } catch {
    return null;
  }
};

export const writeResume = (
  quizId: number,
  attemptId: number,
  order: number[],
  choiceOrders?: Record<number, number[]>,
): void => {
  try {
    localStorage.setItem(key(quizId), JSON.stringify({ attemptId, order, choiceOrders }));
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

const PREFIX = "kmon:resume:";

/** このブラウザに保存されている中断データをすべて列挙する */
export const listResumes = (): { quizId: number; attemptId: number; order: number[] }[] => {
  const out: { quizId: number; attemptId: number; order: number[] }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const quizId = Number(k.slice(PREFIX.length));
      if (!Number.isInteger(quizId) || quizId <= 0) continue;
      const saved = readResume(quizId);
      if (saved) out.push({ quizId, attemptId: saved.attemptId, order: saved.order });
    }
  } catch {
    /* private mode などでは空扱いにする */
  }
  return out;
};

export type { PlayQuestion };
