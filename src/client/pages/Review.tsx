// 苦手一括復習ページ (#/review)。練習扱いのため attempt は作らず、
// POST /api/review/answers で1回答ずつ記録する。attempts系の履歴・スコアには影響しない。
// 直近REVIEW_CLEAR_STREAK連続正解で苦手解消となる。
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, isCloze, isOrder } from "../api";
import type { MistakeItem, ReviewAnswerResult } from "../api";
import { BookmarkButton } from "../bookmark";
import { useDialogOpen } from "../dialog";
import { ClozeFieldList, ClozeStatement } from "../cloze";
import { OrderBlocks } from "../order";
import { AnswerSheet, CorrectAnswerBlock } from "../components/AnswerSheet";
import { RichText } from "../rich";
import { shuffle } from "../resume";
import { Crumbs, EmptyState, Skeletons } from "../ui";

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; items: MistakeItem[] };

// 残り1回で苦手解消 (remaining === 1) の問題は配列の最後に配置する。
// グループ内はランダム順を保つため、先にシャッフルしてから安定パーティションする。
export const orderForReview = (items: MistakeItem[]): MistakeItem[] => {
  const shuffled = shuffle(items);
  return [
    ...shuffled.filter((it) => it.remaining !== 1),
    ...shuffled.filter((it) => it.remaining === 1),
  ];
};

export const Review = () => {
  const navigate = useNavigate();
  // ?quiz=ID で1クイズの苦手だけに絞る (履歴ページからの導線)
  // ?random=1 で全体からランダムに一問だけ出題する (Homeの「ランダム一問」導線用・練習扱い)
  const [params] = useSearchParams();
  const quizFilter = Number(params.get("quiz")) || null;
  const isRandom = params.get("random") === "1";
  const [state, setState] = useState<LoadState>({ name: "loading" });
  const dialogOpen = useDialogOpen();
  const nextRef = useRef<HTMLButtonElement>(null);
  const againRef = useRef<HTMLButtonElement>(null);
  const [order, setOrder] = useState<MistakeItem[]>([]);
  const [pos, setPos] = useState(0);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [clozeInputs, setClozeInputs] = useState<Record<number, string[]>>({});
  const [clozeResults, setClozeResults] = useState<Record<number, ReviewAnswerResult>>({});
  const [clozeBusy, setClozeBusy] = useState(false);
  const [orderInputs, setOrderInputs] = useState<Record<number, string[]>>({});
  const [orderResults, setOrderResults] = useState<Record<number, ReviewAnswerResult>>({});
  const [orderBusy, setOrderBusy] = useState(false);
  // 解説を折りたたんだ問題 (questionVersionId)。別の問題に進めば開いた状態に戻る
  const [collapsedFor, setCollapsedFor] = useState<number | null>(null);
  // スキップして答え・解説だけ表示中の問題 (questionVersionId)。未回答のまま後回しにするため、
  // 回答記録 (picks/clozeResults/orderResults) には含めない。次へ進むときに末尾へ回して解除する。
  const [skipped, setSkipped] = useState<Record<number, true>>({});
  // 1周回を束ねるID (集計用予約。サーバ側はNULL可だが常に送る)
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [serverInfo, setServerInfo] = useState<Record<number, ReviewAnswerResult>>({});
  const [randomBusy, setRandomBusy] = useState(false);
  // 回答POSTの二重送信ガード (questionVersionId単位)。revealed等のstateは非同期反映のため
  // 連打・再レンダー前の再入を防げず、1回答で2行記録されると連続正解数が2進んでしまう。
  // refは同期的にはじけるためここで抑止する。もう一周・再出題時にクリアする。
  const postingRef = useRef<Record<number, boolean>>({});

  const resetAnswers = useCallback(() => {
    setPos(0);
    setPicks({});
    setClozeInputs({});
    setClozeResults({});
    setOrderInputs({});
    setOrderResults({});
    setServerInfo({});
    setCollapsedFor(null);
    setSkipped({});
    postingRef.current = {};
  }, []);

  const loadRandom = useCallback(async () => {
    setRandomBusy(true);
    try {
      const d = await api<{ item: MistakeItem }>(`/api/random/question`);
      setState({ name: "ready", items: d.item ? [d.item] : [] });
      setOrder(d.item ? [d.item] : []);
      resetAnswers();
      window.scrollTo(0, 0);
    } catch (e) {
      setState({ name: "error", message: (e as Error).message });
    } finally {
      setRandomBusy(false);
    }
  }, [resetAnswers]);

  useEffect(() => {
    if (isRandom) {
      void loadRandom();
      return;
    }
    let alive = true;
    api<{ items: MistakeItem[] }>(
      `/api/review/mistakes${quizFilter ? `?quizId=${quizFilter}` : ""}`,
    )
      .then((d) => {
        if (!alive) return;
        const items = d.items ?? [];
        setState({ name: "ready", items });
        setOrder(orderForReview(items));
        setPos(0);
        setPicks({});
      })
      .catch((e: Error) => {
        if (alive) setState({ name: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [quizFilter, isRandom, loadRandom]);

  const reshuffle = useCallback(() => {
    if (state.name !== "ready") return;
    setOrder(orderForReview(state.items));
    setPos(0);
    setPicks({});
    setClozeInputs({});
    setClozeResults({});
    setOrderInputs({});
    setOrderResults({});
    setServerInfo({});
    setCollapsedFor(null);
    setSkipped({});
    postingRef.current = {};
    window.scrollTo(0, 0);
  }, [state]);

  const target = order[pos];
  const targetCloze = !!target && isCloze(target.questionType);
  const targetOrder = !!target && isOrder(target.questionType);
  const picked = target ? picks[target.questionVersionId] : undefined;
  const clozeResult = target ? clozeResults[target.questionVersionId] : undefined;
  const orderResult = target ? orderResults[target.questionVersionId] : undefined;
  const wasSkipped = !!target && !!skipped[target.questionVersionId];
  const revealed =
    picked !== undefined ||
    clozeResult !== undefined ||
    orderResult !== undefined ||
    wasSkipped;
  const expCollapsed = !!target && collapsedFor === target.questionVersionId;

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
    const orderEntries = Object.entries(orderResults);
    for (const [, r] of orderEntries) {
      if (r.correct) ok++;
    }
    return {
      doneCount: entries.length + clozeEntries.length + orderEntries.length,
      correctCount: ok,
    };
  }, [picks, clozeResults, orderResults, order]);

  const remaining = order.length - doneCount;
  // ランダム一問は1問完結の無限ループとし、まとめ画面には遷移しない (解説シートで「もう一問」へ進む)
  const finished = !isRandom && order.length > 0 && revealed && doneCount >= order.length;

  const pick = useCallback(
    (n: number) => {
      if (!target || revealed) return;
      if (postingRef.current[target.questionVersionId]) return;
      postingRef.current[target.questionVersionId] = true;
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
    if (postingRef.current[target.questionVersionId]) return;
    postingRef.current[target.questionVersionId] = true;
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

  const submitOrder = useCallback(() => {
    if (!target || revealed || orderBusy) return;
    const values = orderInputs[target.questionVersionId] ?? target.items;
    if (values.length !== target.correctOrder.length) return;
    if (postingRef.current[target.questionVersionId]) return;
    postingRef.current[target.questionVersionId] = true;
    setOrderBusy(true);
    api<ReviewAnswerResult>("/api/review/answers", {
      method: "POST",
      body: { questionVersionId: target.questionVersionId, order: values, sessionId },
    })
      .then((r) => {
        setOrderResults((s) => ({ ...s, [target.questionVersionId]: r }));
        setServerInfo((s) => ({ ...s, [target.questionVersionId]: r }));
      })
      .catch(() => {
        /* 記録失敗は無視する */
      })
      .finally(() => {
        setOrderBusy(false);
      });
  }, [target, revealed, orderBusy, orderInputs, sessionId]);

  const next = useCallback(() => {
    if (!revealed) return;
    if (isRandom) {
      if (!randomBusy) void loadRandom();
      return;
    }
    // スキップ表示中は「答え・解説を見た上で後回し」にする。現在位置の1問を末尾へ回し、
    // スキップ表示を解除して未回答に戻す。末尾でスキップした場合は先頭へ戻る。
    const curId = target?.questionVersionId;
    if (curId !== undefined && skipped[curId]) {
      setOrder((prev) => {
        if (pos < 0 || pos >= prev.length) return prev;
        const cur = prev[pos];
        if (!cur) return prev;
        return [...prev.slice(0, pos), ...prev.slice(pos + 1), cur];
      });
      setSkipped((prev) => {
        if (!prev[curId]) return prev;
        const nextSkipped = { ...prev };
        delete nextSkipped[curId];
        return nextSkipped;
      });
      if (pos + 1 >= order.length) {
        setPos(0);
      }
      window.scrollTo(0, 0);
      return;
    }
    if (pos + 1 < order.length) {
      setPos((p) => p + 1);
      window.scrollTo(0, 0);
    }
  }, [revealed, pos, order.length, isRandom, randomBusy, loadRandom, target, skipped]);

  // スキップ: まず答えと解説だけを表示する (サーバ記録なし)。AnswerSheet の「次の問題 →」で
  // 現在位置の1問を末尾へ回して後回しにする。残り1問のみの場合も表示だけして次へ進める。
  // ランダム一問では表示後に「もう一問」で次のランダム出題に進む。
  const skip = useCallback(() => {
    if (!target || revealed) return;
    setSkipped((prev) => ({ ...prev, [target.questionVersionId]: true }));
    setCollapsedFor(null);
    window.scrollTo(0, 0);
  }, [target, revealed]);

  useEffect(() => {
    if (revealed) nextRef.current?.focus({ preventScroll: true });
  }, [revealed, pos]);

  // ショートカット。最新の state を読むため effect event にし、購読は1回だけにする
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (dialogOpen) return;
    if (state.name !== "ready" || !target) return;
    if (e.key >= "1" && e.key <= "4" && !revealed) {
      if (!isCloze(target.questionType) && !isOrder(target.questionType)) {
        const idx = Number(e.key) - 1;
        if (target.choices[idx] !== undefined) {
          e.preventDefault();
          pick(Number(e.key));
        }
      }
    } else if ((e.key === "s" || e.key === "S") && !revealed) {
      // 入力欄での文字入力と衝突しないよう、フォーカスが入力欄にある場合は無視する
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      skip();
    } else if ((e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && revealed) {
      e.preventDefault();
      if (finished) {
        againRef.current?.focus();
      } else {
        next();
      }
    }
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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
            <EmptyState
              glyph="！"
              title={isRandom ? "ランダム一問を取得できません" : "苦手を取得できません"}
              sub={state.message}
            />
          </div>
          <div className="actions actions-center">
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state.items.length) {
    if (isRandom) {
      return (
        <div className="screen">
          <div className="hist-band">
            <div className="hist-band-inner">
              <Crumbs items={[{ label: "ホーム", href: "/" }, { label: "ランダム一問" }]} />
              <h1 className="title-lg">ランダム一問</h1>
              <p className="muted">練習モード · 本番成績には残りません（苦手記録には残ります）</p>
            </div>
          </div>
          <div className="hist-body">
            <div className="card card-pad">
              <EmptyState
                glyph="無"
                title="まだ問題がありません"
                sub="管理画面でクイズを公開すると、ここにランダムで1問出題されます。"
              />
            </div>
            <div className="actions actions-center">
              <Link className="btn btn-primary" to="/">
                ホームへ戻る
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="screen">
        <div className="hist-band">
          <div className="hist-band-inner">
            <Crumbs items={[{ label: "ホーム", href: "/" }, { label: "苦手だけ復習" }]} />
            <h1 className="title-lg">苦手だけ復習</h1>
            <p className="muted">練習モード · 本番成績には残りません（苦手記録には残ります）</p>
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
          <div className="actions actions-center">
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
              {order.length}問中 {correctCount}問正解（正答率 {pct}%）· 本番成績には残っていません（苦手記録には反映済み）
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
              <button ref={againRef} type="button" className="btn btn-primary" onClick={reshuffle}>
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

  const isOk =
    revealed &&
    (targetCloze
      ? !!clozeResult?.correct
      : targetOrder
        ? !!orderResult?.correct
        : picked === target.answer);
  // スキップは未回答時のみ表示。押すと答え・解説を表示し、「次の問題 →」で後回しにする
  const showSkip = !revealed;
  const clozeValues = targetCloze
    ? (clozeInputs[target.questionVersionId] ?? Array(target.correctAnswers.length).fill(""))
    : [];
  // 出題時点の残り回数 (回答前)。回答後は AnswerSheet 側でサーバ返却の最新値を表示する。
  const initialRemaining =
    typeof target.remaining === "number" && Number.isFinite(target.remaining)
      ? target.remaining
      : null;

  return (
    <div className="screen">
      <div className="play">
        <div className="play-top">
          <span className="chip chip-shu">
            <span className="play-status-full">練習中 · 本番成績外・苦手に記録</span>
            <span className="play-status-short">練習中</span>
          </span>
          <div className="play-dots" aria-hidden="true">
            {order.map((o, i) => {
              const p = picks[o.questionVersionId];
              const cr = clozeResults[o.questionVersionId];
              const or = orderResults[o.questionVersionId];
              const cls =
                p !== undefined
                  ? p === o.answer
                    ? " is-ok"
                    : " is-ng"
                  : cr !== undefined
                    ? cr.correct
                      ? " is-ok"
                      : " is-ng"
                    : or !== undefined
                      ? or.correct
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
              <h1 className="title-md">
                {isRandom ? "ランダム一問" : `苦手だけ復習 · 残り${remaining}問`}
              </h1>
              <div className="row">
                <BookmarkButton questionId={target.questionId} />
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => navigate("/")}
                >
                  終わる
                </button>
              </div>
            </div>
            <div className="drill-progress" aria-hidden="true">
              <i style={{ width: `${(doneCount / order.length) * 100}%` }} />
            </div>
            <p className="muted">
              {target.mistakeCount > 1 ? `${target.mistakeCount}回間違い · ` : ""}元クイズ:{" "}
              <Link to={`/play/${target.quizId}`}>{target.quizTitle}</Link>
              {!isRandom &&
                !revealed &&
                initialRemaining !== null &&
                initialRemaining > 0 &&
                ` · あと${initialRemaining}回正解で苦手解消`}
            </p>
            {targetCloze ? (
              <form
                className="cloze-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!revealed) submitCloze();
                }}
              >
                {" "}
                <div className="q-statement rich cloze-statement">
                  <ClozeStatement
                    statement={target.statement}
                    values={clozeValues}
                    status={
                      revealed
                        ? wasSkipped
                          ? target.correctAnswers.map((): "ng" => "ng")
                          : (clozeResult?.details ?? []).map((d): "ok" | "ng" =>
                              d.correct ? "ok" : "ng",
                            )
                        : undefined
                    }
                    answers={
                      revealed
                        ? wasSkipped
                          ? target.correctAnswers
                          : (clozeResult?.details ?? []).map((d) => d.answer)
                        : undefined
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
                {showSkip && (
                  <button type="button" className="btn btn-block btn-ghost" onClick={skip}>
                    スキップ（答えを見る） →
                  </button>
                )}
                <p className="muted" style={{ textAlign: "center" }}>
                  全{target.correctAnswers.length}個の空欄を埋めて回答 ·{" "}
                  <span className="kbd">Enter</span> で次へ
                  {showSkip && (
                    <>
                      {" "}
                      · <span className="kbd">S</span> でスキップ
                    </>
                  )}
                </p>
              </form>
            ) : targetOrder ? (
              <form
                className="order-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!revealed) submitOrder();
                }}
              >
                <p className="q-statement rich">
                  <RichText text={target.statement} />
                </p>
                <OrderBlocks
                  key={target.questionVersionId}
                  initial={orderInputs[target.questionVersionId] ?? target.items}
                  status={
                    revealed
                      ? (orderResult?.orderDetails ?? []).map((d) => (d.correct ? true : false))
                      : undefined
                  }
                  disabled={orderBusy}
                  onChange={(nextOrder) =>
                    setOrderInputs((prev) => ({ ...prev, [target.questionVersionId]: nextOrder }))
                  }
                />
                {!revealed && (
                  <button type="submit" className="btn btn-primary btn-block" disabled={orderBusy}>
                    回答する
                  </button>
                )}
                {showSkip && (
                  <button type="button" className="btn btn-block btn-ghost" onClick={skip}>
                    スキップ（答えを見る） →
                  </button>
                )}
                <p className="muted" style={{ textAlign: "center" }}>
                  全{target.correctOrder.length}個を正しい順序に並べて回答 ·{" "}
                  <span className="kbd">Enter</span> で次へ
                  {showSkip && (
                    <>
                      {" "}
                      · <span className="kbd">S</span> でスキップ
                    </>
                  )}
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
                {showSkip && (
                  <button type="button" className="btn btn-block btn-ghost" onClick={skip}>
                    スキップ（答えを見る） →
                  </button>
                )}
                <p className="muted" style={{ textAlign: "center" }}>
                  <span className="kbd">1</span> – <span className="kbd">4</span> で回答 ·{" "}
                  <span className="kbd">Enter</span> で次へ
                  {showSkip && (
                    <>
                      {" "}
                      · <span className="kbd">S</span> でスキップ
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
        <AnswerSheet
          open={revealed}
          ok={isOk}
          title={
            isOk
              ? isRandom
                ? "正解！"
                : "正解！よく直せたね"
              : wasSkipped
                ? targetCloze
                  ? "スキップ · 正解を確認しよう"
                  : targetOrder
                    ? "スキップ · 正しい順序を確認しよう"
                    : `スキップ · 正解は ${target.answer} 番`
                : targetCloze
                  ? "不正解…"
                  : targetOrder
                    ? "不正解… 正しい順序を確認しよう"
                    : `不正解… 正解は ${target.answer} 番`
          }
          scoreText={
            <>
              現在 {correctCount} / {doneCount} 正解
              {(() => {
                const info = serverInfo[target.questionVersionId];
                if (!info) return null;
                if (info.resolved) return " · 苦手解消！";
                return ` · あと${info.remaining}回で解消`;
              })()}
            </>
          }
          explanation={target.explanation}
          correctAnswerNode={
            !isOk ? (
              <CorrectAnswerBlock
                questionType={target.questionType}
                clozeAnswers={
                  wasSkipped
                    ? target.correctAnswers
                    : (clozeResult?.details ?? []).map((d) => d.answer)
                }
                correctOrder={orderResult?.correctOrder ?? target.correctOrder}
              />
            ) : undefined
          }
          collapsed={expCollapsed}
          onToggleCollapsed={() =>
            setCollapsedFor(expCollapsed ? null : (target?.questionVersionId ?? null))
          }
          nextLabel={
            isRandom
              ? randomBusy
                ? "出題中…"
                : "もう一問 →"
              : !wasSkipped && pos + 1 >= order.length
                ? "結果を見る"
                : "次の問題 →"
          }
          nextVariant={!wasSkipped && pos + 1 >= order.length ? "primary" : "ink"}
          onNext={next}
          nextRef={nextRef}
          nextDisabled={isRandom && randomBusy}
        />
      </div>
    </div>
  );
};
