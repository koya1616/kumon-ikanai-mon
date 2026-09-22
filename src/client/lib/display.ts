// スコア・日付の表示判定を1箇所に集約する。
// History / Result / HistoryAll / ui.tsx(Ring) で閾値 0.7 / 0.4 が分散していた。

export type ScoreTone = "is-full" | "is-good" | "is-mid" | "is-bad";

export const pctOf = (score: number, total: number): number => (total ? score / total : 0);

/** Ring・結果バンド用の4値判定 (満点 → is-full) */
export const toneOf = (score: number, total: number): ScoreTone => {
  if (total > 0 && score === total) return "is-full";
  const pct = pctOf(score, total);
  if (pct >= 0.7) return "is-good";
  if (pct >= 0.4) return "is-mid";
  return "is-bad";
};

/** history-bar 用の3値判定 (good は空文字) */
export const barToneOf = (pct: number): "" | "is-mid" | "is-low" =>
  pct >= 0.7 ? "" : pct >= 0.4 ? "is-mid" : "is-low";

export const messageOf = (score: number, total: number): string => {
  if (total > 0 && score === total) return "全問正解！すばらしい！";
  const pct = pctOf(score, total);
  if (pct >= 0.7) return "よくできました！";
  if (pct >= 0.4) return "もう少し！見直して定着させよう";
  return "ここからが本番。見直して再挑戦！";
};

const parseLooseDate = (s: string): Date =>
  new Date(
    String(s).replace(" ", "T") + (String(s).includes("Z") || String(s).includes("+") ? "" : "Z"),
  );

/** 短い表示 (M/D HH:MM)。ui.tsx の fmtDate と同等 */
export const fmtDateTime = (s: string | null | undefined): string => {
  if (!s) return "";
  const d = parseLooseDate(String(s));
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 年付き表示 (YYYY/M/D HH:MM)。History の HistDate と同等 */
export const fmtDateTimeFull = (s: string | null | undefined): string => {
  if (!s) return "";
  const d = parseLooseDate(String(s));
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
