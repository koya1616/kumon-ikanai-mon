// 非同期 effect の定型 (alive ガード + LoadState) を集約する。
// 各ページの `let alive = true ... return () => { alive = false }` を置き換える。
import { useEffect, useState } from "react";
import { useParams } from "react-router";

export type LoadState<T> =
  | { name: "loading" }
  | { name: "error"; message: string }
  | ({ name: "ready" } & T);

/** マウント中のガード付き effect。コールバックに alive 判定を渡す */
export const useAliveEffect = (
  fn: (isAlive: () => boolean) => void | (() => void),
  deps: unknown[],
): void => {
  useEffect(() => {
    let alive = true;
    const cleanup = fn(() => alive);
    return () => {
      alive = false;
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

/** 数値パスパラメータの取得 + NaN ガード */
export const useNumericParam = (key: string): number | null => {
  const params = useParams();
  const raw = params[key];
  const n = Number(raw);
  if (raw === undefined || !Number.isInteger(n) || n <= 0) return null;
  return n;
};

/** 準備完了フラグ付きのツリー読み込み (Category/Home の定型) */
export const useTreeReady = (loadTree: () => Promise<unknown>): boolean => {
  const [ready, setReady] = useState(false);
  useAliveEffect(
    (isAlive) => {
      void loadTree().then(() => {
        if (isAlive()) setReady(true);
      });
    },
    [loadTree],
  );
  return ready;
};
