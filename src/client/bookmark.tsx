import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** ブックマークトグルボタン (★/☆)。questionId さえあればどの画面でも使える */
export const BookmarkButton = ({ questionId }: { questionId: number }) => {
  const [bookmarked, setBookmarked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBookmarked(null);
    api<{ bookmarked: boolean }>(`/api/bookmarks/${questionId}`)
      .then((d) => {
        if (alive) setBookmarked(d.bookmarked);
      })
      .catch(() => {
        if (alive) setBookmarked(false);
      });
    return () => {
      alive = false;
    };
  }, [questionId]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !(bookmarked ?? false);
    // 楽観的更新 (失敗時は戻す)
    setBookmarked(next);
    try {
      if (next) {
        await api("/api/bookmarks", { method: "POST", body: { questionId } });
      } else {
        await api(`/api/bookmarks/${questionId}`, { method: "DELETE" });
      }
    } catch {
      setBookmarked(!next);
    } finally {
      setBusy(false);
    }
  }, [bookmarked, busy, questionId]);

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost bookmark-btn"
      onClick={(e) => {
        // summary / 親ボタンの開閉に波及させない
        e.stopPropagation();
        void toggle();
      }}
      disabled={busy || bookmarked === null}
      aria-pressed={bookmarked ?? false}
      title={bookmarked ? "ブックマークを外す" : "ブックマークする"}
      aria-label={bookmarked ? "ブックマークを外す" : "ブックマークする"}
    >
      {bookmarked ? "★" : "☆"}
    </button>
  );
};
