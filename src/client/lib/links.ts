// 画面遷移パスの組み立てを1箇所に集約する。
// 文字列リテラル `/play/${id}` 等が各ページに分散していた。

export const playHref = (quizId: number | string): string => `/play/${quizId}`;
export const historyHref = (quizId: number | string): string => `/h/${quizId}`;
export const categoryHref = (categoryId: number | string): string => `/c/${categoryId}`;
export const reviewHref = (quizId?: number | null): string =>
  quizId ? `/review?quiz=${quizId}` : "/review";
export const attemptHref = (quizId: number | string, attemptId: number | string): string =>
  `/h/${quizId}?a=${attemptId}`;
