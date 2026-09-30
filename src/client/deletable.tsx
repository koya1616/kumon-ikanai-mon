import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** 「消しても良いかも」トグルボタン。questionId さえあればどの画面でも使える */
export const DeletableButton = ({ questionId }: { questionId: number }) => {
  const [deletable, setDeletable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setDeletable(null);
    api<{ deletable: boolean }>(`/api/questions/${questionId}`)
      .then((d) => {
        if (alive) setDeletable(d.deletable);
      })
      .catch(() => {
        if (alive) setDeletable(false);
      });
    return () => {
      alive = false;
    };
  }, [questionId]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !(deletable ?? false);
    // 楽観的更新 (失敗時は戻す)
    setDeletable(next);
    try {
      await api(`/api/questions/${questionId}`, { method: "PATCH", body: { deletable: next } });
    } catch {
      setDeletable(!next);
    } finally {
      setBusy(false);
    }
  }, [deletable, busy, questionId]);

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost deletable-btn"
      onClick={(e) => {
        // summary / 親ボタンの開閉に波及させない
        e.stopPropagation();
        void toggle();
      }}
      disabled={busy || deletable === null}
      aria-pressed={deletable ?? false}
      title={deletable ? "「消しても良いかも」を外す" : "「消しても良いかも」にする"}
      aria-label={deletable ? "「消しても良いかも」を外す" : "「消しても良いかも」にする"}
    >
      {deletable ? "☑ 消しても良いかも" : "☐ 消しても良いかも"}
    </button>
  );
};
