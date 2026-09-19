// クイズ別履歴ページ (/h/:id)。「次に何を直すか」を決めるための画面。
// 1. 概況: 挑戦回数・ベスト・直近(前回比)・平均所要 + スコア推移グラフ (棒クリックでその回へ)
// 2. 問題別: 問題ごとの正誤時系列から 苦手 / あと少し / 定着 を判定し、苦手順に並べる
// 3. 回ごと: 1回分の答案 (10マスの答案用紙 + 間違いだけ表示) を前後移動で見比べる
// ?a=<attemptId> で特定の回を開いた状態で表示できる (結果画面などからの導線)。
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api, fmtDuration, isCloze } from "../api";
import type {
  AttemptDetail,
  AttemptRecord,
  MistakeItem,
  QuestionInsight,
  QuizInsights,
  QuizMeta,
} from "../api";
import { BookmarkButton } from "../bookmark";
import { ClozeAnswerList, ClozeStatement } from "../cloze";
import { RichText } from "../rich";
import { Crumbs, EmptyState, Skeletons, Stars } from "../ui";
import { isClozeAnswerEqual } from "../../domain";

/** 定着とみなす直近の連続正解数 (苦手復習の解消条件と揃える) */
const SOLID_STREAK = 2;
/** 問題別の正誤ドットに並べる最大件数 (新しい方から) */
const DOTS_MAX = 10;
/** 推移グラフに並べる最大件数 (新しい方から) */
const TREND_MAX = 30;

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | {
      name: "ready";
      quiz: QuizMeta;
      attempts: AttemptRecord[];
      insights: QuizInsights;
      reviewCount: number;
    };

type Tab = "questions" | "attempts";
type Level = "weak" | "shaky" | "solid";
type LevelFilter = Level | "all";

const pctOf = (r: { score: number; total: number }) => (r.total ? r.score / r.total : 0);
const toneOf = (pct: number) => (pct >= 0.7 ? "is-good" : pct >= 0.4 ? "is-mid" : "is-bad");

export const History = () => {
  const { id } = useParams();
  const quizId = Number(id);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialAttempt = Number(params.get("a")) || null;
  const [state, setState] = useState<LoadState>({ name: "loading" });
  const [tab, setTab] = useState<Tab>(initialAttempt ? "attempts" : "questions");
  const [selectedId, setSelectedId] = useState<number | null>(initialAttempt);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!Number.isInteger(quizId) || quizId <= 0) {
      setState({ name: "error", message: "idが不正です" });
      return;
    }
    let alive = true;
    Promise.all([
      api<{ quiz: QuizMeta }>(`/api/quizzes/${quizId}`),
      api<AttemptRecord[]>(`/api/quizzes/${quizId}/attempts?limit=50`),
      api<QuizInsights>(`/api/quizzes/${quizId}/insights`),
      // 復習導線の件数表示用。失敗しても本体は出す
      api<{ items: MistakeItem[] }>(`/api/review/mistakes?quizId=${quizId}&limit=100`).catch(
        () => ({ items: [] }),
      ),
    ])
      .then(([meta, rows, insights, mistakes]) => {
        if (!alive) return;
        setState({
          name: "ready",
          quiz: meta.quiz,
          attempts: (rows ?? []).filter((r) => r.completedAt),
          insights,
          reviewCount: mistakes.items?.length ?? 0,
        });
      })
      .catch((e: Error) => {
        if (alive) setState({ name: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [quizId]);

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
          <div className="actions actions-center">
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { quiz, attempts, insights, reviewCount } = state;
  // 取得は最新50件までなので、通し番号は全完了回数から逆算する
  const ordinalOf = (idx: number) => insights.attemptCount - idx;
  const current = attempts.find((a) => a.id === selectedId) ?? attempts[0] ?? null;

  const openAttempt = (attemptId: number) => {
    setSelectedId(attemptId);
    setTab("attempts");
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="screen">
      <header className="hist-band">
        <div className="hist-band-inner">
          <Crumbs
            items={[
              { label: "ホーム", href: "/" },
              { label: quiz.categoryTitle, href: `/c/${quiz.categoryId}` },
              { label: "履歴" },
            ]}
          />
          <div className="hx-head">
            <div className="hx-head-text">
              <h1 className="title-lg">{quiz.title}</h1>
              <p className="muted">
                {quiz.topicTitle} <Stars n={quiz.difficulty} />
              </p>
            </div>
            <div className="hx-actions">
              {reviewCount > 0 && (
                <Link className="btn" to={`/review?quiz=${quizId}`}>
                  苦手 {reviewCount}問を復習
                </Link>
              )}
              <button
                type="button"
                className="btn btn-ink"
                onClick={() => navigate(`/play/${quizId}`)}
              >
                {attempts.length ? "もう一度挑戦" : "挑戦する"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="hist-body">
        {!attempts.length ? (
          <div className="card card-pad">
            <EmptyState
              glyph="空"
              title="まだ完了した挑戦がありません"
              sub="挑戦して完了すると、成績の推移と問題ごとの得意・苦手がここに表示されます。"
            />
          </div>
        ) : (
          <>
            <Overview
              attempts={attempts}
              attemptCount={insights.attemptCount}
              selectedId={tab === "attempts" ? (current?.id ?? null) : null}
              onPick={openAttempt}
              ordinalOf={ordinalOf}
            />

            <div className="hx-tabs" role="tablist" aria-label="表示の切り替え" ref={tabsRef}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "questions"}
                className="hx-tab"
                onClick={() => setTab("questions")}
              >
                問題別
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "attempts"}
                className="hx-tab"
                onClick={() => setTab("attempts")}
              >
                回ごと
              </button>
            </div>

            {tab === "questions" ? (
              <QuestionsPanel questions={insights.questions} />
            ) : (
              current && (
                <AttemptPanel
                  attempts={attempts}
                  current={current}
                  ordinalOf={ordinalOf}
                  onSelect={setSelectedId}
                />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ---------- 概況: 数値タイル + 推移グラフ ---------- */

const Overview = ({
  attempts,
  attemptCount,
  selectedId,
  onPick,
  ordinalOf,
}: {
  attempts: AttemptRecord[];
  attemptCount: number;
  selectedId: number | null;
  onPick: (attemptId: number) => void;
  ordinalOf: (idx: number) => number;
}) => {
  const latest = attempts[0]!;
  const prev = attempts[1];
  const best = attempts.reduce((m, r) => Math.max(m, pctOf(r)), 0);
  const latestPct = pctOf(latest);
  const delta = prev ? Math.round(latestPct * 100) - Math.round(pctOf(prev) * 100) : null;
  const durations = attempts
    .slice(0, 10)
    .map((r) => r.durationSec)
    .filter((d): d is number => d !== null && d !== undefined);
  const avgSec = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  // 左=古い → 右=新しい
  const trend = attempts
    .slice(0, TREND_MAX)
    .map((r, idx) => ({ r, ordinal: ordinalOf(idx) }))
    .reverse();

  return (
    <section className="hx-overview" aria-label="成績の概況">
      <dl className="hx-stats">
        <div className="hx-stat">
          <dt>直近</dt>
          <dd>
            <b className={`tnum ${toneOf(latestPct)}`}>{Math.round(latestPct * 100)}%</b>
            {delta !== null && (
              <span
                className={`hx-delta ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}`}
                title="前回との差"
              >
                {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : "±0"}
              </span>
            )}
          </dd>
        </div>
        <div className="hx-stat">
          <dt>ベスト</dt>
          <dd>
            <b className="tnum">{Math.round(best * 100)}%</b>
          </dd>
        </div>
        <div className="hx-stat">
          <dt>挑戦</dt>
          <dd>
            <b className="tnum">{attemptCount}</b>
            <small>回</small>
          </dd>
        </div>
        <div className="hx-stat">
          <dt>平均所要</dt>
          <dd>
            <b className="tnum">{avgSec === null ? "—" : fmtDuration(avgSec)}</b>
          </dd>
        </div>
      </dl>

      {trend.length > 1 && (
        <figure className="hx-trend">
          <figcaption className="hx-trend-cap">
            スコアの推移
            <span className="muted">
              {trend.length < attemptCount ? `直近${trend.length}回 · ` : ""}
              棒を押すとその回の答案へ
            </span>
          </figcaption>
          <div className="hx-trend-plot">
            <span className="hx-trend-goal" aria-hidden="true" />
            {trend.map(({ r, ordinal }) => {
              const pct = pctOf(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`hx-bar ${toneOf(pct)}${selectedId === r.id ? " is-selected" : ""}`}
                  onClick={() => onPick(r.id)}
                  title={`第${ordinal}回 ${r.score}/${r.total}`}
                  aria-label={`第${ordinal}回 ${r.score}/${r.total}点`}
                >
                  <i style={{ height: `${Math.max(pct * 100, 3)}%` }} />
                </button>
              );
            })}
          </div>
        </figure>
      )}
    </section>
  );
};

/* ---------- 問題別: 苦手順に並べた問題リスト ---------- */

type RankedQuestion = QuestionInsight & {
  level: Level;
  correctCount: number;
  streak: number;
};

const LEVEL_LABEL: Record<Level, string> = {
  weak: "苦手",
  shaky: "あと少し",
  solid: "定着",
};

const rankQuestion = (q: QuestionInsight): RankedQuestion => {
  let streak = 0;
  for (let i = q.results.length - 1; i >= 0 && q.results[i] === true; i--) streak++;
  const last = q.results[q.results.length - 1];
  const level: Level = last !== true ? "weak" : streak >= SOLID_STREAK ? "solid" : "shaky";
  return {
    ...q,
    level,
    streak,
    correctCount: q.results.filter((r) => r === true).length,
  };
};

const LEVEL_ORDER: Record<Level, number> = { weak: 0, shaky: 1, solid: 2 };

const QuestionsPanel = ({ questions }: { questions: QuestionInsight[] }) => {
  const ranked = useMemo(
    () =>
      questions.map(rankQuestion).sort((a, b) => {
        if (a.level !== b.level) return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
        // 同じ段階なら正答率の低い順
        return a.correctCount / a.results.length - b.correctCount / b.results.length;
      }),
    [questions],
  );
  const counts = useMemo(() => {
    const c: Record<Level, number> = { weak: 0, shaky: 0, solid: 0 };
    for (const q of ranked) c[q.level]++;
    return c;
  }, [ranked]);
  const [filter, setFilter] = useState<LevelFilter>(() => (counts.weak ? "weak" : "all"));
  const [openId, setOpenId] = useState<number | null>(null);
  const shown = filter === "all" ? ranked : ranked.filter((q) => q.level === filter);

  return (
    <section className="hx-panel" aria-label="問題別の定着度">
      <div className="hx-meter" aria-hidden="true">
        {(["weak", "shaky", "solid"] as const).map(
          (lv) =>
            counts[lv] > 0 && (
              <i key={lv} className={`is-${lv}`} style={{ flexGrow: counts[lv] }} />
            ),
        )}
      </div>
      <div className="hx-filters" role="group" aria-label="絞り込み">
        {(["weak", "shaky", "solid", "all"] as const).map((lv) => (
          <button
            key={lv}
            type="button"
            className={`hx-filter${lv === "all" ? "" : ` is-${lv}`}`}
            aria-pressed={filter === lv}
            onClick={() => setFilter(lv)}
          >
            {lv === "all" ? "すべて" : LEVEL_LABEL[lv]}
            <span className="tnum">{lv === "all" ? ranked.length : counts[lv]}</span>
          </button>
        ))}
      </div>
      <p className="hx-note muted">
        本番の挑戦での正誤です。直近{SOLID_STREAK}回続けて正解で「定着」になります。
      </p>

      {!shown.length ? (
        <div className="card card-pad">
          <EmptyState
            glyph={filter === "weak" ? "○" : "空"}
            title={filter === "weak" ? "苦手な問題はありません" : "該当する問題はありません"}
          />
        </div>
      ) : (
        <ol className="hx-qlist">
          {shown.map((q) => (
            <QuestionRow
              key={q.questionId}
              q={q}
              open={openId === q.questionId}
              onToggle={() => setOpenId((cur) => (cur === q.questionId ? null : q.questionId))}
            />
          ))}
        </ol>
      )}
    </section>
  );
};

const QuestionRow = ({
  q,
  open,
  onToggle,
}: {
  q: RankedQuestion;
  open: boolean;
  onToggle: () => void;
}) => {
  const dots = q.results.slice(-DOTS_MAX);
  const hidden = q.results.length - dots.length;
  return (
    <li className={`hx-q is-${q.level}${open ? " is-open" : ""}`}>
      <div className="hx-q-head">
        <span className={`hx-level is-${q.level}`}>{LEVEL_LABEL[q.level]}</span>
        <div className="hx-q-statement rich">
          <RichText text={q.statement} />
        </div>
        <BookmarkButton questionId={q.questionId} />
      </div>
      <div className="hx-q-meta">
        <span
          className="hx-dots"
          role="img"
          aria-label={`正誤の記録 古い順: ${q.results.map((r) => (r === true ? "正解" : r === false ? "不正解" : "未回答")).join("、")}`}
        >
          {hidden > 0 && <span className="hx-dots-more">+{hidden}</span>}
          {dots.map((r, i) => (
            <i key={i} className={r === true ? "is-ok" : r === false ? "is-ng" : "is-skip"} />
          ))}
        </span>
        <span className="tnum hx-q-rate">
          {q.correctCount}/{q.results.length} 正解
        </span>
        <button
          type="button"
          className="btn btn-sm btn-ghost hx-q-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          {open ? "閉じる ▴" : "正解と解説 ▾"}
        </button>
      </div>
      {open && (
        <div className="hx-q-body">
          {isCloze(q.questionType) ? (
            <div className="hx-cloze-answer">
              <span>正解:</span>
              <ClozeAnswerList answers={q.correctAnswers} />
            </div>
          ) : (
            <ol className="hx-choices">
              {q.choices.map((c, i) => (
                <li key={i} className={i + 1 === q.correctAnswer ? "is-correct" : ""}>
                  <span className="hx-key">{i + 1 === q.correctAnswer ? "○" : i + 1}</span>
                  <span className="rich">
                    <RichText text={c} />
                  </span>
                </li>
              ))}
            </ol>
          )}
          {q.explanation && (
            <div className="exp rich">
              <RichText text={q.explanation} />
            </div>
          )}
        </div>
      )}
    </li>
  );
};

/* ---------- 回ごと: 1回分の答案 ---------- */

const AttemptPanel = ({
  attempts,
  current,
  ordinalOf,
  onSelect,
}: {
  attempts: AttemptRecord[];
  current: AttemptRecord;
  ordinalOf: (idx: number) => number;
  onSelect: (attemptId: number) => void;
}) => {
  const idx = attempts.findIndex((a) => a.id === current.id);
  const older = attempts[idx + 1];
  const newer = attempts[idx - 1];
  const [cache, setCache] = useState<Record<number, AttemptDetail>>({});
  const [failed, setFailed] = useState<number | null>(null);
  const [onlyWrong, setOnlyWrong] = useState(true);
  // 答案セルから該当問題へスクロールする。フィルタ解除の再描画後に実行するため state 経由にする
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);
  const itemRefs = useRef(new Map<number, HTMLLIElement>());
  const detail = cache[current.id];

  useEffect(() => {
    if (scrollTarget === null) return;
    itemRefs.current.get(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollTarget(null);
  }, [scrollTarget, onlyWrong]);

  useEffect(() => {
    if (cache[current.id]) return;
    let alive = true;
    setFailed(null);
    api<AttemptDetail>(`/api/attempts/${current.id}?detail=full`)
      .then((d) => {
        if (alive) setCache((c) => ({ ...c, [current.id]: d }));
      })
      .catch(() => {
        if (alive) setFailed(current.id);
      });
    return () => {
      alive = false;
    };
    // 取得済みの回は再取得しない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  const pct = pctOf(current);
  const wrongCount = detail ? detail.items.filter((it) => it.correct !== true).length : 0;
  const items = detail
    ? onlyWrong && wrongCount > 0
      ? detail.items.filter((it) => it.correct !== true)
      : detail.items
    : [];

  return (
    <section className="hx-panel" aria-label="回ごとの答案">
      <div className="hx-attempt-nav">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={!older}
          onClick={() => older && onSelect(older.id)}
          aria-label="前の回"
        >
          ‹ 前
        </button>
        <label className="hx-attempt-pick">
          <select
            className="select"
            aria-label="回を選ぶ"
            value={current.id}
            onChange={(e) => onSelect(Number(e.target.value))}
          >
            {attempts.map((a, i) => (
              <option key={a.id} value={a.id}>
                第{ordinalOf(i)}回{i === 0 ? "（最新）" : ""} · {a.score}/{a.total}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={!newer}
          onClick={() => newer && onSelect(newer.id)}
          aria-label="次の回"
        >
          次 ›
        </button>
      </div>

      <div className="hx-sheet card">
        <div className="hx-sheet-head">
          <strong className={`hx-sheet-score tnum ${toneOf(pct)}`}>
            {current.score}
            <small>/{current.total}</small>
          </strong>
          <span className="muted">
            <HistDate value={current.completedAt} />
            {current.durationSec !== null && current.durationSec !== undefined && (
              <> · {fmtDuration(current.durationSec)}</>
            )}
          </span>
        </div>
        {detail ? (
          <ol className="hx-cells" aria-label="答案用紙">
            {detail.items.map((it) => {
              const answered = isCloze(it.questionType)
                ? it.pickedAnswers.length > 0
                : it.picked !== null;
              const cell = it.correct === true ? "is-ok" : !answered ? "is-skip" : "is-ng";
              const label = it.correct === true ? "正解" : !answered ? "未回答" : "不正解";
              return (
                <li key={it.attemptQuestionId}>
                  <a
                    href={`#hx-item-${it.attemptQuestionId}`}
                    className={`hx-cell ${cell}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (it.correct === true) setOnlyWrong(false);
                      setScrollTarget(it.attemptQuestionId);
                    }}
                    aria-label={`第${it.position}問 ${label}`}
                  >
                    <small>{it.position}</small>
                    {it.correct === true ? "○" : !answered ? "－" : "×"}
                  </a>
                </li>
              );
            })}
          </ol>
        ) : failed === current.id ? (
          <p className="muted">詳細を取得できませんでした</p>
        ) : (
          <div className="skeleton" />
        )}
      </div>

      {detail && (
        <>
          <div className="hx-list-bar">
            <span className="hx-list-title">
              {onlyWrong && wrongCount > 0
                ? `間違えた ${wrongCount}問`
                : wrongCount === 0
                  ? "全問正解"
                  : `全 ${detail.items.length}問`}
            </span>
            {wrongCount > 0 && wrongCount < detail.items.length && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setOnlyWrong((v) => !v)}
              >
                {onlyWrong ? "正解した問題も表示" : "間違いだけにする"}
              </button>
            )}
          </div>
          <ol className="hist-items">
            {items.map((it) => (
              <li
                key={it.attemptQuestionId}
                id={`hx-item-${it.attemptQuestionId}`}
                ref={(el) => {
                  if (el) itemRefs.current.set(it.attemptQuestionId, el);
                  else itemRefs.current.delete(it.attemptQuestionId);
                }}
                className={`review-item ${it.correct ? "is-ok" : "is-ng"}`}
              >
                <div className="hist-qhead">
                  <span
                    className={`review-mark ${it.correct ? "is-ok" : "is-ng"}`}
                    aria-hidden="true"
                  >
                    {isCloze(it.questionType)
                      ? it.pickedAnswers.length
                        ? it.correct
                          ? "○"
                          : "×"
                        : "－"
                      : it.picked === null
                        ? "－"
                        : it.correct
                          ? "○"
                          : "×"}
                  </span>
                  <span className="grow">
                    <span className="hx-qno">第{it.position}問</span>
                    <span className="review-statement rich">
                      <RichText
                        text={
                          isCloze(it.questionType)
                            ? it.statement.replace(/\{\{(\d+)\}\}/g, "［空欄$1］")
                            : it.statement
                        }
                      />
                    </span>
                  </span>
                  <BookmarkButton questionId={it.questionId} />
                </div>
                <div className="review-body">
                  {isCloze(it.questionType) ? (
                    <>
                      {it.pickedAnswers.length ? (
                        <div className={`review-your ${it.correct ? "is-ok" : "is-ng"}`}>
                          <ClozeStatement
                            statement={it.statement}
                            values={it.pickedAnswers}
                            status={it.pickedAnswers.map((_, i) =>
                              it.correctAnswers[i] !== undefined &&
                              isClozeAnswerEqual(it.pickedAnswers[i]!, it.correctAnswers[i])
                                ? "ok"
                                : "ng",
                            )}
                            answers={it.correctAnswers}
                          />
                        </div>
                      ) : (
                        <div className="muted">未回答</div>
                      )}
                      {(!it.correct || !it.pickedAnswers.length) && (
                        <div className="review-correct">
                          <span>正解:</span>
                          <ClozeAnswerList answers={it.correctAnswers} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
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
                    </>
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
        </>
      )}
    </section>
  );
};

export const HistDate = ({ value }: { value: string | null }) => {
  if (!value) return <span />;
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
