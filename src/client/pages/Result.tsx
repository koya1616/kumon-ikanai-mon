import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import type { AttemptRecord } from "../api";
import { clearResume } from "../resume";
import { RichText } from "../rich";
import { getSession } from "../session";
import type { SessionAnswer } from "../session";
import { BookmarkButton } from "../bookmark";
import { Crumbs, fmtDate, Ring, Stars } from "../ui";
import { useTree } from "../tree";

type Tone = "is-full" | "is-good" | "is-mid" | "is-bad";

interface DrillState {
  order: number[];
  pos: number;
  picks: Record<number, number>;
  doneCount: number;
}

const toneOf = (score: number, total: number): Tone => {
  if (total > 0 && score === total) return "is-full";
  const pct = total ? score / total : 0;
  if (pct >= 0.7) return "is-good";
  if (pct >= 0.4) return "is-mid";
  return "is-bad";
};

const messageOf = (score: number, total: number): string => {
  if (total > 0 && score === total) return "全問正解！すばらしい！";
  const pct = total ? score / total : 0;
  if (pct >= 0.7) return "よくできました！";
  if (pct >= 0.4) return "もう少し！見直して定着させよう";
  return "ここからが本番。見直して再挑戦！";
};

export const Result = () => {
  const navigate = useNavigate();
  const { loadTree } = useTree();
  const [ses] = useState(getSession);
  const [score, setScore] = useState<number | null>(null);
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [drill, setDrill] = useState<DrillState | null>(null);

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

  const derived = useMemo(() => {
    if (!ses || score === null) return null;
    const total = ses.questions.length;
    const ng = ses.answers.map((a, i) => ({ a, i })).filter(({ a }) => !a.ok);
    const ok = ses.answers.map((a, i) => ({ a, i })).filter(({ a }) => a.ok);
    const others = (history ?? []).filter((r) => r.id !== ses.attemptId);
    const prev = others.length ? others[0]! : null;
    const best = others.reduce<number>((m, r) => Math.max(m, r.total ? r.score / r.total : 0), 0);
    const pct = total ? score / total : 0;
    const isBest = pct > best && others.length > 0;
    const delta = prev ? score - prev.score : null;
    return { total, ng, ok, prev, pct, isBest, delta, tone: toneOf(score, total) };
  }, [ses, score, history]);

  if (!ses || !ses.answers.length) return null;

  if (score === null || !derived) {
    return (
      <div className="screen result-screen">
        <div className="result-loading muted">採点中…</div>
      </div>
    );
  }

  const { total, ng, ok, prev, pct, isBest, delta, tone } = derived;

  const startDrill = () => {
    if (!ng.length) return;
    setDrill({ order: ng.map(({ i }) => i), pos: 0, picks: {}, doneCount: 0 });
    document.getElementById("review")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="screen result-screen">
      {/* ===== 全幅バンド: 要約 + 次行動 ===== */}
      <div className="result-band">
        <div className="result-band-inner">
          <Crumbs
            items={[
              { label: "ホーム", href: "/" },
              { label: ses.quiz.categoryTitle, href: `/c/${ses.quiz.categoryId}` },
              { label: ses.quiz.title },
            ]}
          />
          <div className="result-band-grid">
            <Ring
              pct={pct}
              size={`score-ring-sm ${tone}`}
              tone={tone}
              label={
                <>
                  <strong>{String(score)}</strong> <small>/ {total}</small>
                </>
              }
            />
            <div className="result-band-meta">
              <h1 className="title-lg">{ses.quiz.title}</h1>
              <p className="muted">
                {ses.quiz.categoryTitle} › {ses.quiz.topicTitle} <Stars n={ses.quiz.difficulty} />
              </p>
              <p
                className={`result-msg ${tone === "is-full" || tone === "is-good" ? "is-good" : tone}`}
              >
                {messageOf(score, total)}
              </p>
              <div className="result-delta-row">
                <span className="score-chip is-rate">正答率 {Math.round(pct * 100)}%</span>
                {prev && (
                  <span className="score-chip">
                    前回 {prev.score}/{prev.total}
                    {delta !== null && delta !== 0 && (
                      <b className={delta > 0 ? "is-good" : "is-bad"}>
                        {delta > 0 ? ` +${delta}` : ` ${delta}`}
                      </b>
                    )}
                  </span>
                )}
                {isBest && <span className="score-chip is-ok">ベスト更新</span>}
                {ng.length > 0 && <span className="score-chip is-ng">見直し {ng.length}問</span>}
              </div>
            </div>
            <div className="result-band-actions">
              {ng.length > 0 && (
                <button type="button" className="btn btn-primary btn-lg" onClick={startDrill}>
                  間違いだけ復習（{ng.length}）
                </button>
              )}
              <button
                type="button"
                className="btn btn-ink btn-lg"
                onClick={() => navigate(`/play/${ses.quiz.id}`)}
              >
                もう一度
              </button>
              <Link className="btn btn-lg" to={`/c/${ses.quiz.categoryId}`}>
                他のクイズへ
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 全幅ボディ: 復習 + 記録 ===== */}
      <div className="result-body">
        <div className="result-layout">
          <section id="review" aria-label="ふりかえり">
            {drill ? (
              <DrillCard
                ses_answers={ses.answers}
                drill={drill}
                onChange={setDrill}
                onExit={() => setDrill(null)}
              />
            ) : (
              <>
                <div className="section-head">
                  <h2 className="title-md">
                    見直そう {ng.length > 0 ? `· ${ng.length}問` : "· なし"}
                  </h2>
                  <span className="muted">間違い→解説の順に読むだけ</span>
                </div>
                {ng.length === 0 ? (
                  <div className="card result-perfect-card">
                    <p>
                      <strong>全問正解です。</strong>
                      この調子で次のクイズへ進もう。
                    </p>
                  </div>
                ) : (
                  <div className="review-grid">
                    {ng.map(({ a, i }) => (
                      <ReviewCard key={i} answer={a} index={i} open />
                    ))}
                  </div>
                )}

                {ok.length > 0 && (
                  <details className="result-ok-fold">
                    <summary>できた {ok.length}問を見る</summary>
                    <div className="review-grid is-ok-grid">
                      {ok.map(({ a, i }) => (
                        <ReviewCard key={i} answer={a} index={i} />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </section>

          <aside aria-label="記録と次の行動">
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
                      <strong className={`tnum ${scoreTone}`}>{`${r.score} / ${r.total}`}</strong>
                    </div>
                  );
                })
              )}
            </div>
            <div className="result-aside-actions">
              <Link className="btn btn-block" to={`/h/${ses.quiz.id}`}>
                詳しい履歴を見る
              </Link>
              <button
                type="button"
                className="btn btn-ink btn-block"
                onClick={() => navigate(`/play/${ses.quiz.id}`)}
              >
                もう一度挑戦
              </button>
              <Link className="btn btn-block" to="/">
                ホームへ戻る
              </Link>
            </div>
          </aside>
        </div>
      </div>

      {/* ===== 下部追従バー (モバイルで指が届く位置) ===== */}
      <div className="result-bottombar">
        {ng.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={startDrill}>
            間違いだけ（{ng.length}）
          </button>
        )}
        <button
          type="button"
          className="btn btn-ink"
          onClick={() => navigate(`/play/${ses.quiz.id}`)}
        >
          もう一度
        </button>
        <Link className="btn" to={`/c/${ses.quiz.categoryId}`}>
          一覧
        </Link>
      </div>
    </div>
  );
};

const ReviewCard = ({
  answer: a,
  index: i,
  open = false,
}: {
  answer: SessionAnswer;
  index: number;
  open?: boolean;
}) => {
  return (
    <details className={`review-item ${a.ok ? "is-ok" : "is-ng"}`} open={open || !a.ok}>
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
            {a.ok ? "できた" : "見直し"}
          </span>
        </span>
        <BookmarkButton questionId={a.q.questionId} />
      </summary>
      <div className="review-body">
        <div className={`review-your ${a.ok ? "is-ok" : "is-ng"}`}>
          あなたの回答: {a.choice}.{" "}
          <span className="review-inline rich">
            <RichText text={a.q.choices[a.choice - 1]} />
          </span>
        </div>
        {!a.ok && (
          <div className="review-correct">
            正解: {a.correct}.{" "}
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
  );
};

const DrillCard = ({
  ses_answers,
  drill,
  onChange,
  onExit,
}: {
  ses_answers: SessionAnswer[];
  drill: DrillState;
  onChange: (d: DrillState | null) => void;
  onExit: () => void;
}) => {
  const qIndex = drill.order[drill.pos]!;
  const target = ses_answers[qIndex]!;
  const picked = drill.picks[qIndex];
  const revealed = picked !== undefined;
  const correctCount = Object.entries(drill.picks).filter(
    ([k, v]) => ses_answers[Number(k)]!.correct === v,
  ).length;

  const pick = (n: number) => {
    if (revealed) return;
    onChange({
      ...drill,
      picks: { ...drill.picks, [qIndex]: n },
      doneCount: drill.doneCount + 1,
    });
  };

  const next = () => {
    if (drill.pos + 1 < drill.order.length) {
      onChange({ ...drill, pos: drill.pos + 1 });
    } else {
      onChange({ ...drill, pos: drill.pos, doneCount: drill.doneCount });
    }
  };

  const finished = drill.doneCount >= drill.order.length && revealed;

  return (
    <div className="drill-card">
      <div className="section-head">
        <h2 className="title-md">
          間違いだけ復習 · {Math.min(drill.pos + 1, drill.order.length)} / {drill.order.length}
        </h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onExit}>
          終わる
        </button>
      </div>
      <div className="drill-progress" aria-hidden="true">
        <i style={{ width: `${(drill.doneCount / drill.order.length) * 100}%` }} />
      </div>
      <p className="q-statement rich">
        <RichText text={target.q.statement} />
      </p>
      <div className="choices" role="group" aria-label="選択肢">
        {target.q.choices.map((text, idx) => {
          const n = idx + 1;
          let cls = "choice";
          if (revealed) {
            if (n === target.correct) cls += " is-correct";
            else if (n === picked) cls += " is-wrong";
            else cls += " is-dim";
          }
          return (
            <button
              key={n}
              type="button"
              className={cls}
              disabled={revealed}
              onClick={() => pick(n)}
            >
              <span className="choice-key" aria-hidden="true">
                {n}
              </span>
              <span className="choice-label rich">
                <RichText text={text} />
              </span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="drill-feedback">
          <p className={picked === target.correct ? "is-good" : "is-bad"}>
            {picked === target.correct ? "正解！よく直せたね" : `正解は ${target.correct} 番`}
            {" · "}
            現在 {correctCount} / {drill.doneCount} 正解
          </p>
          {target.exp && (
            <div className="exp rich">
              <RichText text={target.exp} />
            </div>
          )}
          <div className="drill-actions">
            {!finished ? (
              <button type="button" className="btn btn-ink" onClick={next}>
                次の見直しへ →
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onExit}>
                ふりかえりに戻る（{correctCount}/{drill.order.length}）
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
