// ブックマーク自習ページ (#/bookmarks)。
// フルブリードのカードグリッド + 答え合わせ式の自習UX。
// GET /api/bookmarks はサーバ側でランダム順に返すため、シャッフル = 再取得。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import type { BookmarkItem } from "../api";
import { RichText } from "../rich";
import { EmptyState, Icon, Skeletons } from "../ui";

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; items: BookmarkItem[] };

const BOOKMARK_LIMIT = 100;

export const Bookmarks = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ name: "loading" });
  const [kw, setKw] = useState("");
  const [quizId, setQuizId] = useState<number | null>(null);

  const load = useCallback(() => {
    setState({ name: "loading" });
    let alive = true;
    api<{ items: BookmarkItem[] }>(`/api/bookmarks?limit=${BOOKMARK_LIMIT}`)
      .then((d) => {
        if (alive) setState({ name: "ready", items: d.items ?? [] });
      })
      .catch((e: Error) => {
        if (alive) setState({ name: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(load, [load]);

  const remove = useCallback(
    (questionId: number) => {
      // 楽観的に消す (失敗時は再取得)
      setState((s) => {
        if (s.name !== "ready") return s;
        return { name: "ready", items: s.items.filter((it) => it.questionId !== questionId) };
      });
      api(`/api/bookmarks/${questionId}`, { method: "DELETE" }).catch(load);
    },
    [load],
  );

  const quizzes = useMemo(() => {
    if (state.name !== "ready") return [];
    const map = new Map<number, string>();
    for (const it of state.items) map.set(it.quizId, it.quizTitle);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ja"));
  }, [state]);

  const visible = useMemo(() => {
    if (state.name !== "ready") return [];
    const q = kw.trim().toLowerCase();
    return state.items.filter((it) => {
      if (quizId !== null && it.quizId !== quizId) return false;
      if (!q) return true;
      return (
        it.statement.toLowerCase().includes(q) ||
        it.quizTitle.toLowerCase().includes(q) ||
        it.choices.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [state, kw, quizId]);

  const total = state.name === "ready" ? state.items.length : 0;

  return (
    <div className="screen">
      {state.name === "ready" && total > 0 && (
        <div className="bm-toolbar" role="search">
          <div className="search">
            <Icon name="search" />
            <input
              type="search"
              placeholder="問題文・選択肢・クイズ名で絞り込む"
              aria-label="ブックマークを絞り込む"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            {kw && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setKw("")}
                aria-label="検索を取り消す"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
          {quizzes.length > 1 && (
            <select
              className="select bm-quiz-filter"
              aria-label="クイズで絞り込む"
              value={quizId ?? ""}
              onChange={(e) => setQuizId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">すべてのクイズ</option>
              {quizzes.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          )}
          <span className="bm-count tnum" aria-live="polite">
            {visible.length} / {total}問
          </span>
          <button type="button" className="btn btn-ink" onClick={load}>
            ⟳ シャッフル
          </button>
        </div>
      )}

      <div className="bm-body">
        {state.name === "loading" && <Skeletons n={6} />}
        {state.name === "error" && (
          <>
            <div className="card card-pad">
              <EmptyState glyph="！" title="ブックマークを取得できません" sub={state.message} />
            </div>
            <div className="row mt" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => navigate(-1)}>
                戻る
              </button>
            </div>
          </>
        )}
        {state.name === "ready" &&
          (total === 0 ? (
            <div className="card card-pad">
              <EmptyState
                glyph="☆"
                title="ブックマークはありません"
                sub="履歴・復習・挑戦中・結果の ☆ から保存できます。"
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="card card-pad">
              <EmptyState
                glyph="∅"
                title="条件に合う問題がありません"
                sub="絞り込みを変えてみてください。"
              />
              <div className="row mt" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setKw("");
                    setQuizId(null);
                  }}
                >
                  絞り込みを消す
                </button>
              </div>
            </div>
          ) : (
            <ol className="bm-grid">
              {visible.map((it, i) => (
                <BookmarkCard key={it.questionId} item={it} index={i} onRemove={remove} />
              ))}
            </ol>
          ))}
      </div>
    </div>
  );
};

const BookmarkCard = ({
  item: it,
  index,
  onRemove,
}: {
  item: BookmarkItem;
  index: number;
  onRemove: (questionId: number) => void;
}) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <li
      className={`bm-card${revealed ? " is-revealed" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <div className="bm-head">
        <Link className="chip chip-moegi bm-quiz" to={`/play/${it.quizId}`} title={it.quizTitle}>
          {it.quizTitle}
        </Link>
        <button
          type="button"
          className="btn btn-sm btn-ghost bookmark-btn"
          onClick={() => onRemove(it.questionId)}
          title="ブックマークを外す"
          aria-label={`${it.quizTitle}のブックマークを外す`}
        >
          ★
        </button>
      </div>
      <p className="bm-statement rich">
        <RichText text={it.statement} />
      </p>
      <div className="bm-choices" role="list" aria-label="選択肢">
        {it.choices.map((c, i) => {
          const n = i + 1;
          const ok = n === it.answer;
          return (
            <div
              key={n}
              className={`bm-choice${ok ? " is-correct" : ""}`}
              role="listitem"
              aria-label={`${n}番${revealed && ok ? "（正解）" : ""}`}
            >
              <span className="bm-key" aria-hidden="true">
                {n}
              </span>
              <span className="choice-label rich">
                <RichText text={c} />
              </span>
              {revealed && ok && (
                <span className="bm-mark" aria-hidden="true">
                  ○
                </span>
              )}
            </div>
          );
        })}
      </div>
      {revealed && (
        <>
          <p className="bm-answer tnum">正解は {it.answer} 番</p>
          {it.explanation && (
            <div className="exp rich">
              <RichText text={it.explanation} />
            </div>
          )}
        </>
      )}
      <div className="bm-foot">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setRevealed((v) => !v)}
          aria-expanded={revealed}
        >
          {revealed ? "答えを隠す" : "答えを見る"}
        </button>
        <Link className="bm-solve" to={`/play/${it.quizId}`}>
          このクイズで解く →
        </Link>
      </div>
    </li>
  );
};
