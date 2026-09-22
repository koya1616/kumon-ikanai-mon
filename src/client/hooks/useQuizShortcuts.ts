// 出題中のキーボード操作 (Play / Review で verbatim だった) を集約する。
// 1-4: 回答 / Enter・Space・→: 次へ。ダイアログ表示中と修飾キー付きは無視する。
import { useEffect, useEffectEvent } from "react";
import { useDialogOpen } from "../dialog";

export const useQuizShortcuts = ({
  revealed,
  onNumber,
  onNext,
}: {
  revealed: boolean;
  onNumber: (n: number) => void;
  onNext: () => void;
}): void => {
  const dialogOpen = useDialogOpen();
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (dialogOpen) return;
    if (!revealed && ["1", "2", "3", "4"].includes(e.key)) {
      onNumber(Number(e.key));
      return;
    }
    if (revealed && (e.key === "Enter" || e.key === " " || e.key === "ArrowRight")) {
      e.preventDefault();
      onNext();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);
};
