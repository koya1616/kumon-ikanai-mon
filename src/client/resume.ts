// 中断再開のための出題順管理。
// 以前は localStorage (kmon:resume:*) に表示順を保存していたが、端末・ブラウザ間で
// 共有できないため、サーバ駆動に移行した。表示順は attemptId を seed とする
// 決定的シャッフルで復元する (サーバの seededShuffle と同一アルゴリズム)。
// 旧 localStorage データは無視し、見つけ次第掃除する。
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

/** サーバ (repository.ts) と同一の決定的シャッフル。同一attemptではどの端末でも同じ並びになる */
export const seededShuffle = <T>(arr: T[], seed: number): T[] => {
  const a = [...arr];
  let s = seed >>> 0 || 0x9e3779b9;
  const rand = (): number => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
};

/** 出題表示順。サーバは position 順で返すため、クライアントで決定的に並べ替える */
export const displayOrder = (questions: PlayQuestion[], attemptId: number): PlayQuestion[] =>
  seededShuffle(questions, attemptId);

/** 旧 localStorage データ (kmon:resume:*) の掃除用。見つけたら消すだけ */
export const clearLegacyResumes = (): void => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("kmon:resume:")) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* private mode などでは何もしない */
  }
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

/** 選択肢はシャッフルしない (DB登録順のまま表示)。choiceMapは恒等写像で付与する */
export const withShuffledChoices = (q: PlayQuestion): PlayQuestion => {
  return { ...q, choiceMap: q.choices.map((_, i) => i + 1) };
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

export type { PlayQuestion };
