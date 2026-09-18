// クイズ別履歴ページ (/h/:id)。回ごとの掘り下げ専用。
// 一覧: 各回の日時・スコア・正答率・所要時間 + 展開で10問分の詳細 (スナップショット)。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, fmtDuration } from "../api";
import type { AttemptDetail, AttemptRecord, QuizMeta } from "../api";
import { BookmarkButton } from "../bookmark";
import { RichText } from "../rich";
import { Crumbs, EmptyState, Skeletons, Stars } from "../ui";

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; quiz: QuizMeta; attempts: AttemptRecord[] };

export const History = () => {
  const { id } = useParams();
  const quizId = Number(id);
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ name: "loading" });
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isInteger(quizId) || quizId <= 0) {
      setState({ name: "error", message: "idが不正です" });
      return;
    }
    let alive = true;
    Promise.all([
      api<{ quiz: QuizMeta }>(`/api/quizzes/${quizId}`),
      api<AttemptRecord[]>(`/api/quizzes/${quizId}/attempts?limit=50`),
    ])
      .then(([meta, rows]) => {
        if (!alive) return;
        setState({
          name: "ready",
          quiz: meta.quiz,
          attempts: (rows ?? []).filter((r) => r.completedAt),
        });
      })
      .catch((e: Error) => {
        if (alive) setState({ name: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [quizId]);

  const toggle = useCallback((attemptId: number) => {
    setOpenId((cur) => (cur === attemptId ? null : attemptId));
  }, []);

  const trend = useMemo(() => {
    if (state.name !== "ready" || !state.attempts.length) return null;
    // 古い→新しい順の正答率でスパークラインを作る
    const asc = [...state.attempts].reverse();
    const pts = asc.map((r) => (r.total ? r.score / r.total : 0));
    const w = 200;
    const h = 44;
    const step = asc.length > 1 ? w / (asc.length - 1) : 0;
    const d = pts
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - 4 - p * (h - 10)).toFixed(1)}`,
      )
      .join(" ");
    const last = pts[pts.length - 1]!;
    return { d, w, h, last, count: asc.length };
  }, [state]);

  if (state.name === "loading") {
    return (
      <div className="screen">
        <div className="hist-body">
          <Skeletons n={4} />
        </div>
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <div className="screen">
        <div className="hist-body">
          <div className="card card-pad">
            <EmptyState glyph="！" title="履歴を取得できません" sub={state.message} />
          </div>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { quiz, attempts } = state;
  const best = attempts.reduce((m, r) => Math.max(m, r.total ? r.score / r.total : 0), 0);

  return (
    <div className="screen">
      <div className="hist-band">
        <div className="hist-band-inner">
          <Crumbs
            items={[
              { label: "ホーム", href: "/" },
              { label: quiz.categoryTitle, href: `/c/${quiz.categoryId}` },
              { label: `${quiz.title} の履歴` },
            ]}
          />
          <h1 className="title-lg">{quiz.title} の履歴</h1>
          <p className="muted">
            {quiz.categoryTitle} › {quiz.topicTitle} <Stars n={quiz.difficulty} />
          </p>
          <div className="hist-summary">
            <span className="score-chip is-rate">{attempts.length} 回挑戦</span>
            {attempts.length > 0 && (
              <span className="score-chip is-ok">最高 {Math.round(best * 100)}%</span>
            )}
            {trend && (
              <svg
                className="hist-spark"
                viewBox={`0 0 ${trend.w} ${trend.h}`}
                role="img"
                aria-label={`正答率の推移 (直近${trend.count}回、最新${Math.round(trend.last * 100)}%)`}
              >
                <path d={trend.d} fill="none" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <div className="row mt">
            <button
              type="button"
              className="btn btn-ink"
              onClick={() => navigate(`/play/${quizId}`)}
            >
              このクイズに挑戦
            </button>
          </div>
        </div>
      </div>

      <div className="hist-body">
        {!attempts.length ? (
          <div className="card card-pad">
            <EmptyState
              glyph="空"
              title="まだ完了した挑戦がありません"
              sub="挑戦して完了するとここに記録が残ります。"
            />
          </div>
        ) : (
          <ol className="hist-list">
            {attempts.map((r, idx) => (
              <HistoryRow
                key={r.id}
                record={r}
                isLatest={idx === 0}
                open={openId === r.id}
                onToggle={() => toggle(r.id)}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

const HistoryRow = ({
  record: r,
  isLatest,
  open,
  onToggle,
}: {
  record: AttemptRecord;
  isLatest: boolean;
  open: boolean;
  onToggle: () => void;
}) => {
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || detail || loading) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    api<AttemptDetail>(`/api/attempts/${r.id}?detail=full`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // 開いた時だけ取得する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, r.id]);

  const pct = r.total ? r.score / r.total : 0;
  const barTone = pct >= 0.7 ? "" : pct >= 0.4 ? "is-mid" : "is-low";
  const scoreTone = pct >= 0.7 ? "is-good" : pct >= 0.4 ? "" : "is-bad";

  return (
    <li className={`hist-card${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="hist-head"
        onClick={onToggle}
        aria-expanded={open ? "true" : "false"}
      >
        <span className="hist-head-main">
          <span className="hist-date">
            {isLatest ? "最新 · " : ""}第{r.id}回 · <HistDate value={r.completedAt} />
            {r.durationSec !== null && r.durationSec !== undefined && (
              <span className="muted"> · {fmtDuration(r.durationSec)}</span>
            )}
          </span>
          <span className="history-bar" aria-hidden="true">
            <i className={barTone} style={{ width: `${pct * 100}%` }} />
          </span>
        </span>
        <strong className={`tnum ${scoreTone}`}>{`${r.score} / ${r.total}`}</strong>
        <span className="hist-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div className="hist-detail">
          {loading && <div className="skeleton" />}
          {failed && <p className="muted">詳細を取得できませんでした</p>}
          {detail && (
            <ol className="hist-items">
              {detail.items.map((it) => (
                <li
                  key={it.attemptQuestionId}
                  className={`review-item ${it.correct ? "is-ok" : "is-ng"}`}
                >
                  <div className="hist-qhead">
                    <span
                      className={`review-mark ${it.correct ? "is-ok" : "is-ng"}`}
                      aria-hidden="true"
                    >
                      {it.picked === null ? "－" : it.correct ? "○" : "×"}
                    </span>
                    <span className="grow">
                      <span>第{it.position}問　</span>
                      <span className="review-statement rich">
                        <RichText text={it.statement} />
                      </span>
                    </span>
                    <BookmarkButton questionId={it.questionId} />
                  </div>
                  <div className="review-body">
                    {it.picked === null ? (
                      <div className="muted">未回答</div>
                    ) : (
                      <div className={`review-your ${it.correct ? "is-ok" : "is-ng"}`}>
                        あなたの回答: {it.picked}.{" "}
                        <span className="review-inline rich">
                          <RichText text={it.choices[it.picked - 1] ?? it.pickedText ?? ""} />
                        </span>
                      </div>
                    )}
                    {(it.picked === null || !it.correct) && (
                      <div className="review-correct">
                        正解: {it.correctAnswer}.{" "}
                        <span className="review-inline rich">
                          <RichText text={it.choices[it.correctAnswer - 1] ?? ""} />
                        </span>
                      </div>
                    )}
                    {it.explanation && (
                      <div className="exp rich">
                        <RichText text={it.explanation} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
};

const HistDate = ({ value }: { value: string | null }) => {  if (!value) return <span />;
  const d = new Date(
    String(value).replace(" ", "T") +
      (String(value).includes("Z") || String(value).includes("+") ? "" : "Z"),
  );
  if (Number.isNaN(d.getTime())) return <span>{String(value).slice(0, 16)}</span>;
  return (
    <span>
      {d.getFullYear()}/{d.getMonth() + 1}/{d.getDate()} {String(d.getHours()).padStart(2, "0")}:
      {String(d.getMinutes()).padStart(2, "0")}
    </span>
  );
};

// Result 側の aside から再利用する導線リンク
export const HistoryLink = ({ quizId }: { quizId: number }) => (
  <Link className="btn btn-block" to={`/h/${quizId}`}>
    詳しい履歴を見る
  </Link>
);
