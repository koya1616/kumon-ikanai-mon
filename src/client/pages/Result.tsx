import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import type { AttemptRecord } from "../api";
import { clearResume } from "../resume";
import { RichText } from "../rich";
import { getSession } from "../session";
import { fmtDate, Ring } from "../ui";
import { useTree } from "../tree";

type Tone = "is-full" | "is-good" | "is-mid" | "is-bad";

export const Result = () => {
  const navigate = useNavigate();
  const { loadTree } = useTree();
  const [ses] = useState(getSession);
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    if (!ses || !ses.answers.length) {
      navigate("/", { replace: true });
      return;
    }
    let alive = true;
    const total = ses.questions.length;
    api<{ score: number; total: number }>(`/api/attempts/${ses.attemptId}/complete`, {
      method: "POST",
    })
      .then((done) => {
        clearResume(ses.quiz.id);
        return done;
      })
      .catch(() => ({ score: ses.score, total }))
      .then((done) => {
        if (alive) setScore(done.score);
      });
    api<AttemptRecord[]>(`/api/quizzes/${ses.quiz.id}/attempts?limit=8`)
      .then((rows) => {
        if (alive) setHistory(rows.filter((r) => r.completedAt));
      })
      .catch(() => {
        if (alive) setHistoryError(true);
      });
    void loadTree(true);
    return () => {
      alive = false;
    };
    // セッション確定後に1回だけ採点する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ses || !ses.answers.length) return null;

  const total = ses.questions.length;
  if (score === null) {
    return (
      <div className="screen">
        <div className="result-hero">
          <div className="muted">採点中…</div>
        </div>
      </div>
    );
  }

  const pct = total ? score / total : 0;
  const perfect = score === total;
  const tone: Tone = perfect
    ? "is-full"
    : pct >= 0.7
      ? "is-good"
      : pct >= 0.4
        ? "is-mid"
        : "is-bad";
  const msgTone = perfect || pct >= 0.7 ? "is-good" : pct >= 0.4 ? "is-mid" : "is-bad";
  const ngCount = total - score;

  return (
    <div className="screen">
      <div className="result-hero">
        <span className="eyebrow">{ses.quiz.title}</span>
        <Ring
          pct={pct}
          size={`score-ring ${tone}`}
          tone={tone}
          label={
            <>
              <strong>{String(score)}</strong> <small>/ {total}</small>
            </>
          }
        />
        <div className={`result-msg ${msgTone}`}>
          {perfect
            ? "○ 全問正解！すばらしい！"
            : pct >= 0.7
              ? "○ よくできました！"
              : pct >= 0.4
                ? "× もう少し！復習しよう"
                : "× ここからが本番。もう一度！"}
        </div>
        <div className="result-score-chips">
          <span className="score-chip is-ok">○ {score}問 正解</span>
          <span className="score-chip is-ng">× {ngCount}問 不正解</span>
          <span className="score-chip is-rate">正答率 {Math.round(pct * 100)}%</span>
        </div>
        <div className="result-sub">
          {ses.quiz.categoryTitle} › {ses.quiz.topicTitle}
        </div>
        <div className="result-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => navigate(`/play/${ses.quiz.id}`)}
          >
            もう一度
          </button>
          <Link className="btn btn-lg" to={`/c/${ses.quiz.categoryId}`}>
            他のクイズへ
          </Link>
        </div>
      </div>

      <div className="result-grid">
        <section>
          <div className="section-head">
            <h2 className="title-md">ふりかえり</h2>
            <span className="muted">まちがえた問題は開いています</span>
          </div>
          <div className="review">
            {ses.answers.map((a, i) => (
              <details key={i} className={`review-item ${a.ok ? "is-ok" : "is-ng"}`} open={!a.ok}>
                <summary>
                  <span className={`review-mark ${a.ok ? "is-ok" : "is-ng"}`} aria-hidden="true">
                    {a.ok ? "○" : "×"}
                  </span>
                  <span className="grow">
                    <span>第{i + 1}問　</span>
                    <span className="review-statement rich">
                      <RichText text={a.q.statement} />
                    </span>
                    <span className={`review-judge ${a.ok ? "is-ok" : "is-ng"}`}>
                      {a.ok ? "正解" : "不正解"}
                    </span>
                  </span>
                </summary>
                <div className="review-body">
                  <div className={`review-your ${a.ok ? "is-ok" : "is-ng"}`}>
                    {a.ok ? "○ あなたの回答: " : "× あなたの回答: "}
                    {a.choice}.{" "}
                    <span className="review-inline rich">
                      <RichText text={a.q.choices[a.choice - 1]} />
                    </span>
                  </div>
                  {!a.ok && (
                    <div className="review-correct">
                      ○ 正解: {a.correct}.{" "}
                      <span className="review-inline rich">
                        <RichText text={a.q.choices[a.correct - 1]} />
                      </span>
                    </div>
                  )}
                  {a.exp && (
                    <div className="exp rich">
                      <RichText text={a.exp} />
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section>
          <div className="section-head">
            <h2 className="title-md">このクイズの記録</h2>
          </div>
          <div className="history">
            {historyError ? (
              <p className="muted">記録を取得できませんでした</p>
            ) : history === null ? (
              <div className="skeleton" />
            ) : !history.length ? (
              <p className="muted">まだ記録がありません</p>
            ) : (
              history.map((r) => {
                const now = r.id === ses.attemptId;
                const rpct = r.total ? r.score / r.total : 0;
                const barTone = rpct >= 0.7 ? "" : rpct >= 0.4 ? "is-mid" : "is-low";
                const scoreTone = rpct >= 0.7 ? "is-good" : rpct >= 0.4 ? "" : "is-bad";
                return (
                  <div key={r.id} className={`history-row${now ? " is-now" : ""}`}>
                    <div>
                      <div>
                        {now ? "今回 · " : ""}
                        {fmtDate(r.completedAt)}
                      </div>
                      <div className="history-bar">
                        <i className={barTone} style={{ width: `${rpct * 100}%` }} />
                      </div>
                    </div>
                    <strong className={`tnum ${scoreTone}`}>
                      {(rpct >= 1 ? "○ " : rpct < 0.4 ? "× " : "") + `${r.score} / ${r.total}`}
                    </strong>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
