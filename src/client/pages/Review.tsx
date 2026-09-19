// 苦手一括復習ページ (#/review)。練習扱いのため attempt は作らず、
// POST /api/review/answers で1回答ずつ記録する。attempts系の履歴・スコアには影響しない。
// 直近REVIEW_CLEAR_STREAK連続正解で苦手解消となる。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, isCloze } from "../api";
import type { MistakeItem, ReviewAnswerResult } from "../api";
import { BookmarkButton } from "../bookmark";
import { ClozeAnswerList, ClozeFieldList, ClozeStatement } from "../cloze";
import { RichText } from "../rich";
import { shuffle } from "../resume";
import { Crumbs, EmptyState, Skeletons } from "../ui";

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; items: MistakeItem[] };

const REVIEW_LIMIT = 30;

export const Review = () => {
  const navigate = useNavigate();
  // ?quiz=ID で1クイズの苦手だけに絞る (履歴ページからの導線)
  const [params] = useSearchParams();
  const quizFilter = Number(params.get("quiz")) || null;
  const [state, setState] = useState<LoadState>({ name: "loading" });
  const [order, setOrder] = useState<MistakeItem[]>([]);
  const [pos, setPos] = useState(0);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [clozeInputs, setClozeInputs] = useState<Record<number, string[]>>({});
  const [clozeResults, setClozeResults] = useState<Record<number, ReviewAnswerResult>>({});
  const [clozeBusy, setClozeBusy] = useState(false);
  const [expCollapsed, setExpCollapsed] = useState(false);
  // 1周回を束ねるID (集計用予約。サーバ側はNULL可だが常に送る)
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [serverInfo, setServerInfo] = useState<Record<number, ReviewAnswerResult>>({});

  useEffect(() => {
    let alive = true;
    api<{ items: MistakeItem[] }>(
      `/api/review/mistakes?limit=${REVIEW_LIMIT}${quizFilter ? `&quizId=${quizFilter}` : ""}`,
    )
      .then((d) => {
        if (!alive) return;
        const items = d.items ?? [];
        setState({ name: "ready", items });
        setOrder(shuffle(items));
        setPos(0);
        setPicks({});
      })
      .catch((e: Error) => {
        if (alive) setState({ name: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [quizFilter]);

  const reshuffle = useCallback(() => {
    if (state.name !== "ready") return;
    setOrder(shuffle(state.items));
    setPos(0);
    setPicks({});
    setClozeInputs({});
    setClozeResults({});
    setServerInfo({});
    setExpCollapsed(false);
    window.scrollTo(0, 0);
  }, [state]);

  const target = order[pos];
  const targetCloze = !!target && isCloze(target.questionType);
  const picked = target ? picks[target.questionVersionId] : undefined;
  const clozeResult = target ? clozeResults[target.questionVersionId] : undefined;
  const revealed = picked !== undefined || clozeResult !== undefined;

  const { doneCount, correctCount } = useMemo(() => {
    const entries = Object.entries(picks);
    let ok = 0;
    for (const [k, v] of entries) {
      const it = order.find((o) => o.questionVersionId === Number(k));
      if (it && it.answer === v) ok++;
    }
    const clozeEntries = Object.entries(clozeResults);
    for (const [, r] of clozeEntries) {
      if (r.correct) ok++;
    }
    return { doneCount: entries.length + clozeEntries.length, correctCount: ok };
  }, [picks, clozeResults, order]);

  const remaining = order.length - doneCount;
  const finished = order.length > 0 && revealed && doneCount >= order.length;

  const pick = useCallback(
    (n: number) => {
      if (!target || revealed) return;
      // 即時反映し、記録はバックグラウンドで送る (失敗しても復習を止めない)
      setPicks((p) => ({ ...p, [target.questionVersionId]: n }));
      void api<ReviewAnswerResult>("/api/review/answers", {
        method: "POST",
        body: { questionVersionId: target.questionVersionId, choice: n, sessionId },
      })
        .then((r) => {
          setServerInfo((s) => ({ ...s, [target.questionVersionId]: r }));
        })
        .catch(() => {
          /* 記録失敗は無視する */
        });
    },
    [target, revealed, sessionId],
  );

  const submitCloze = useCallback(() => {
    if (!target || revealed || clozeBusy) return;
    const inputs = clozeInputs[target.questionVersionId] ?? [];
    if (inputs.length !== target.correctAnswers.length || inputs.some((s) => !s.trim())) return;
    setClozeBusy(true);
    api<ReviewAnswerResult>("/api/review/answers", {
      method: "POST",
      body: { questionVersionId: target.questionVersionId, answers: inputs, sessionId },
    })
      .then((r) => {
        setClozeResults((s) => ({ ...s, [target.questionVersionId]: r }));
        setServerInfo((s) => ({ ...s, [target.questionVersionId]: r }));
      })
      .catch(() => {
        /* 記録失敗は無視する */
      })
      .finally(() => {
        setClozeBusy(false);
      });
  }, [target, revealed, clozeBusy, clozeInputs, sessionId]);

  const next = useCallback(() => {
    if (!revealed) return;
    if (pos + 1 < order.length) {
      setPos((p) => p + 1);
      setExpCollapsed(false);
      window.scrollTo(0, 0);
    }
  }, [revealed, pos, order.length]);

  useEffect(() => {
    if (revealed) {
      setExpCollapsed(false);
      document.getElementById("review-next")?.focus({ preventScroll: true });
    }
  }, [revealed, pos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dlg = document.getElementById("dialog") as HTMLDialogElement | null;
      if (dlg?.open) return;
      if (state.name !== "ready" || !target) return;
      if (e.key >= "1" && e.key <= "4" && !revealed) {
        if (!isCloze(target.questionType)) {
          const idx = Number(e.key) - 1;
          if (target.choices[idx] !== undefined) {
            e.preventDefault();
            pick(Number(e.key));
          }
        }
      } else if ((e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && revealed) {
        e.preventDefault();
        if (finished) {
          document.getElementById("review-again")?.focus();
        } else {
          next();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.name, target, revealed, finished, pick, next]);

  if (state.name === "loading") {
    return (
      <div className="screen">
        <div className="hist-body">
          <Skeletons n={3} />
        </div>
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <div className="screen">
        <div className="hist-body">
          <div className="card card-pad">
            <EmptyState glyph="！" title="苦手を取得できません" sub={state.message} />
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

  if (!state.items.length) {
    return (
      <div className="screen">
        <div className="hist-band">
          <div className="hist-band-inner">
            <Crumbs items={[{ label: "ホーム", href: "/" }, { label: "苦手だけ復習" }]} />
            <h1 className="title-lg">苦手だけ復習</h1>
            <p className="muted">練習モード · 成績には残りません</p>
          </div>
        </div>
        <div className="hist-body">
          <div className="card card-pad">
            <EmptyState
              glyph="◎"
              title="苦手はありません"
              sub="間違えた問題があると、ここに溜まっていきます。2回連続で正解するとリストから消えます。"
            />
          </div>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" to="/">
              ホームへ戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!target) return null;

  if (finished) {
    const pct = order.length ? Math.round((correctCount / order.length) * 100) : 0;
    return (
      <div className="screen">
        <div className="hist-band">
          <div className="hist-band-inner">
            <Crumbs items={[{ label: "ホーム", href: "/" }, { label: "苦手だけ復習" }]} />
            <h1 className="title-lg">復習おわり</h1>
            <p className="muted">
              {order.length}問中 {correctCount}問正解（正答率 {pct}%）· 成績には残っていません
            </p>
          </div>
        </div>
        <div className="hist-body">
          <div className="card card-pad">
            <p>
              <strong>
                {correctCount}/{order.length} 正解
              </strong>
              　
              {correctCount === order.length
                ? "全問正解！この調子で進もう。"
                : "2回連続で正解した問題は、次回の苦手リストから消えます。"}
            </p>
            <div className="row mt">
              <button
                id="review-again"
                type="button"
                className="btn btn-primary"
                onClick={reshuffle}
              >
                もう一周（シャッフル）
              </button>
              <Link className="btn" to="/">
                ホームへ戻る
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isOk = revealed && (targetCloze ? !!clozeResult?.correct : picked === target.answer);
  const clozeValues = targetCloze
    ? (clozeInputs[target.questionVersionId] ?? Array(target.correctAnswers.length).fill(""))
    : [];

  return (
    <div className="screen">
      <div className="play">
        <div className="play-top">
          <span className="chip chip-shu">練習中 · 復習記録に残ります</span>
          <div className="play-dots" aria-hidden="true">
            {order.map((o, i) => {
              const p = picks[o.questionVersionId];
              const cr = clozeResults[o.questionVersionId];
              const cls =
                p !== undefined
                  ? p === o.answer
                    ? " is-ok"
                    : " is-ng"
                  : cr !== undefined
                    ? cr.correct
                      ? " is-ok"
                      : " is-ng"
                    : i === pos
                      ? " is-now"
                      : "";
              return <i key={o.questionVersionId} className={"play-dot" + cls} />;
            })}
          </div>
          <div className="play-count" aria-live="polite">
            {pos + 1} / {order.length}
          </div>
        </div>
        <div className="play-body">
          <div className="play-crumb">
            {`${target.categoryTitle} › ${target.topicTitle} › ${target.quizTitle}`}
          </div>
          <div className="drill-card">
            <div className="section-head">
              <h1 className="title-md">苦手だけ復習 · 残り{remaining}問</h1>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => navigate("/")}>
                終わる
              </button>
            </div>
            <div className="drill-progress" aria-hidden="true">
              <i style={{ width: `${(doneCount / order.length) * 100}%` }} />
            </div>
            <p className="muted">
              {target.mistakeCount > 1 ? `${target.mistakeCount}回間違い · ` : ""}元クイズ:{" "}
              <Link to={`/play/${target.quizId}`}>{target.quizTitle}</Link>{" "}
              <BookmarkButton questionId={target.questionId} />
            </p>
            {targetCloze ? (
              <form
                className="cloze-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!revealed) submitCloze();
                }}
              >
                <div className="q-statement rich cloze-statement">
                  <ClozeStatement
                    statement={target.statement}
                    values={clozeValues}
                    status={
                      revealed
                        ? (clozeResult?.details ?? []).map((d) => (d.correct ? "ok" : "ng"))
                        : undefined
                    }
                    answers={
                      revealed ? (clozeResult?.details ?? []).map((d) => d.answer) : undefined
                    }
                    editable={!revealed}
                    disabled={clozeBusy}
                    autoFocusFirst={!revealed}
                    onChange={(n, v) =>
                      setClozeInputs((prev) => {
                        const cur = [...(prev[target.questionVersionId] ?? clozeValues)];
                        cur[n - 1] = v;
                        return { ...prev, [target.questionVersionId]: cur };
                      })
                    }
                  />
                </div>
                {!revealed &&
                  (target.correctAnswers.length >= 2 || target.statement.length > 100) && (
                    <ClozeFieldList
                      values={clozeValues}
                      disabled={clozeBusy}
                      onChange={(n, v) =>
                        setClozeInputs((prev) => {
                          const cur = [...(prev[target.questionVersionId] ?? clozeValues)];
                          cur[n - 1] = v;
                          return { ...prev, [target.questionVersionId]: cur };
                        })
                      }
                    />
                  )}
                {!revealed && (
                  <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={
                      clozeBusy ||
                      clozeValues.length !== target.correctAnswers.length ||
                      clozeValues.some((s) => !s.trim())
                    }
                  >
                    回答する
                  </button>
                )}
                <p className="muted" style={{ textAlign: "center" }}>
                  全{target.correctAnswers.length}個の空欄を埋めて回答 ·{" "}
                  <span className="kbd">Enter</span> で次へ
                </p>
              </form>
            ) : (
              <>
                <p className="q-statement rich">
                  <RichText text={target.statement} />
                </p>
                <div className="choices" role="group" aria-label="選択肢">
                  {target.choices.map((text, idx) => {
                    const n = idx + 1;
                    let cls = "choice";
                    if (revealed) {
                      if (n === target.answer) cls += " is-correct";
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
                <p className="muted" style={{ textAlign: "center" }}>
                  <span className="kbd">1</span> – <span className="kbd">4</span> で回答 ·{" "}
                  <span className="kbd">Enter</span> で次へ
                </p>
              </>
            )}
          </div>
        </div>
        <div className={`sheet${revealed ? " is-open" : ""}${expCollapsed ? " is-collapsed" : ""}`}>
          {revealed && (
            <div className={`sheet-card ${isOk ? "is-ok" : "is-ng"}`}>
              <div className="sheet-title">
                <span className="sheet-badge" aria-hidden="true">
                  {isOk ? "○" : "×"}
                </span>
                <span>
                  {isOk
                    ? "正解！よく直せたね"
                    : targetCloze
                      ? "不正解…"
                      : `不正解… 正解は ${target.answer} 番`}
                </span>
                <span className="sheet-score">
                  現在 {correctCount} / {doneCount} 正解
                  {(() => {
                    const info = serverInfo[target.questionVersionId];
                    if (!info) return null;
                    if (info.resolved) return " · 苦手解消！";
                    if (info.correct) return ` · あと${info.remaining}回で解消`;
                    return null;
                  })()}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost sheet-toggle"
                  onClick={() => setExpCollapsed((v) => !v)}
                  aria-expanded={!expCollapsed}
                >
                  {expCollapsed ? "解説を見る" : "隠す"}
                </button>
              </div>
              {!isOk && targetCloze && (
                <ClozeAnswerList answers={(clozeResult?.details ?? []).map((d) => d.answer)} />
              )}
              {!expCollapsed && (
                <div className="sheet-exp rich">
                  <RichText text={target.explanation || "（解説はありません）"} />
                </div>
              )}
              <div className="sheet-actions">
                <span className="kbd sheet-hint">Enterで次へ</span>
                <button
                  id="review-next"
                  type="button"
                  className={`btn ${pos + 1 >= order.length ? "btn-primary" : "btn-ink"}`}
                  onClick={next}
                >
                  {pos + 1 >= order.length ? "結果を見る" : "次の問題 →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
