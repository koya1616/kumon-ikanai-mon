// クイズ横断の挑戦履歴ページ (/history)。クイズ単位の目次に徹する。
// カテゴリ / トピックのタブは持たず、クイズだけを検索・並べ替えして探せる。
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api, fmtDuration } from "../api";
import type { AttemptHistoryItem } from "../api";
import { EmptyState, Skeletons, Stars } from "../ui";
import { BackButton, SearchBox } from "../components/feedback";
import { barToneOf, fmtDateTimeFull, pctOf } from "../lib/display";
import { historyHref, playHref } from "../lib/links";

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; items: AttemptHistoryItem[] };

type SortKey = "latest" | "oldest" | "count" | "countAsc" | "weak" | "name";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "latest", label: "最新順" },
  { id: "oldest", label: "古い順" },
  { id: "count", label: "回数が多い順" },
  { id: "countAsc", label: "回数が少ない順" },
  { id: "weak", label: "ベストが低い順" },
  { id: "name", label: "名前順" },
];

interface QuizGroup {
  quizId: number;
  quizTitle: string;
  difficulty: number;
  categoryTitle: string;
  topicTitle: string;
  attempts: AttemptHistoryItem[];
  count: number;
  latest: AttemptHistoryItem;
  best: number;
  bestTotal: number;
  bestPct: number;
  avgPct: number;
}

const groupByQuiz = (items: AttemptHistoryItem[]): QuizGroup[] => {
  const map = new Map<number, AttemptHistoryItem[]>();
  for (const r of items) {
    const arr = map.get(r.quizId);
    if (arr) arr.push(r);
    else map.set(r.quizId, [r]);
  }
  return [...map.values()].flatMap((attempts) => {
    // items は新しい順なので先頭が最新
    const latest = attempts[0];
    if (!latest) return [];
    let best = latest;
    let sum = 0;
    for (const a of attempts) {
      sum += pctOf(a.score, a.total);
      if (pctOf(a.score, a.total) > pctOf(best.score, best.total)) best = a;
    }
    return {
      quizId: latest.quizId,
      quizTitle: latest.quizTitle,
      difficulty: latest.difficulty,
      categoryTitle: latest.categoryTitle,
      topicTitle: latest.topicTitle,
      attempts,
      count: attempts.length,
      latest,
      best: best.score,
      bestTotal: best.total,
      bestPct: pctOf(best.score, best.total),
      avgPct: attempts.length ? sum / attempts.length : 0,
    };
  });
};

export const HistoryAll = () => {
  const [state, setState] = useState<LoadState>({ name: "loading" });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("latest");

  useEffect(() => {
    let alive = true;
    api<AttemptHistoryItem[]>(`/api/attempts/recent?limit=100`)
      .then((rows) => {
        if (alive) setState({ name: "ready", items: rows ?? [] });
      })
      .catch((e: Error) => {
        if (alive) setState({ name: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.name === "loading") {
    return (
      <div className="screen history-all-screen">
        <div className="ha-body">
          <Skeletons n={6} />
        </div>
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <div className="screen history-all-screen">
        <div className="ha-body ha-body-narrow">
          <div className="card card-pad">
            <EmptyState glyph="！" title="履歴を取得できません" sub={state.message} />
          </div>
          <div className="actions actions-center">
            <BackButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <HistoryQuizList
      items={state.items}
      query={query}
      sort={sort}
      onQuery={setQuery}
      onSort={setSort}
    />
  );
};

const HistoryQuizList = ({
  items,
  query,
  sort,
  onQuery,
  onSort,
}: {
  items: AttemptHistoryItem[];
  query: string;
  sort: SortKey;
  onQuery: (v: string) => void;
  onSort: (v: SortKey) => void;
}) => {
  const groups = useMemo(() => groupByQuiz(items), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = q
      ? groups.filter((g) =>
          `${g.quizTitle} ${g.categoryTitle} ${g.topicTitle}`.toLowerCase().includes(q),
        )
      : groups;
    const sorted = [...hit];
    switch (sort) {
      case "count":
        sorted.sort((a, b) => b.count - a.count);
        break;
      case "countAsc":
        sorted.sort((a, b) => a.count - b.count);
        break;
      case "weak":
        sorted.sort((a, b) => a.bestPct - b.bestPct);
        break;
      case "name":
        sorted.sort((a, b) => a.quizTitle.localeCompare(b.quizTitle, "ja"));
        break;
      case "latest":
        sorted.sort((a, b) =>
          (b.latest.completedAt ?? "").localeCompare(a.latest.completedAt ?? ""),
        );
        break;
      case "oldest":
        sorted.sort((a, b) =>
          (a.latest.completedAt ?? "").localeCompare(b.latest.completedAt ?? ""),
        );
        break;
      default:
        sorted.sort((a, b) =>
          (b.latest.completedAt ?? "").localeCompare(a.latest.completedAt ?? ""),
        );
        break;
    }
    return sorted;
  }, [groups, query, sort]);

  if (!groups.length) {
    return (
      <div className="screen history-all-screen">
        <div className="ha-body ha-body-narrow">
          <div className="card card-pad">
            <EmptyState
              glyph="空"
              title="まだ挑戦履歴がありません"
              sub="クイズに挑戦して完了するとここに記録が残ります。"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen history-all-screen">
      <div className="ha-body">
        <div className="ha-toolbar" role="search">
          <div className="ha-search">
            <SearchBox
              value={query}
              onChange={onQuery}
              placeholder="クイズ名で検索"
              ariaLabel="クイズ名で履歴を検索"
            />
          </div>
          <label className="ha-sort">
            <span className="ha-sort-label">並べ替え</span>
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value as SortKey)}
              aria-label="クイズの並べ替え"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <span className="ha-count tnum" aria-live="polite">
            {filtered.length}件
          </span>
        </div>

        {!filtered.length ? (
          <div className="card card-pad">
            <EmptyState
              glyph="無"
              title="該当するクイズがありません"
              sub="検索条件を変えて探してみてください。"
            />
          </div>
        ) : (
          <ol className="ha-grid">
            {filtered.map((g) => (
              <QuizCard key={g.quizId} group={g} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

const QuizCard = ({ group: g }: { group: QuizGroup }) => {
  const pct = pctOf(g.best, g.bestTotal);
  const tone = pct >= 0.7 ? "is-good" : pct >= 0.4 ? "is-mid" : "is-bad";
  // 古い→新しい順に最大12件のミニ推移
  const trend = [...g.attempts].reverse().slice(-12);

  return (
    <li className="ha-card">
      <div className="ha-card-top">
        <p className="ha-crumb muted">
          {g.categoryTitle} › {g.topicTitle}
        </p>
        <Link
          className="ha-title"
          to={historyHref(g.quizId)}
          aria-label={`${g.quizTitle}の履歴詳細を見る`}
        >
          {g.quizTitle}
        </Link>
        <p className="ha-meta">
          <span className={`ha-pill ${tone}`}>
            ベスト {g.best}/{g.bestTotal}
          </span>
          <Stars n={g.difficulty} />
          <span>{g.count}回挑戦</span>
          <span>
            <HistDateTime value={g.latest.completedAt} />
          </span>
        </p>
        <div className="ha-trend" aria-hidden="true" title="直近のスコア推移">
          {trend.map((a) => {
            const p = pctOf(a.score, a.total);
            return (
              <span key={a.id} className="ha-trend-bar">
                <i className={barToneOf(p)} style={{ height: `${Math.round(p * 100)}%` }} />
              </span>
            );
          })}
        </div>
        <div className="history-bar ha-bar" aria-hidden="true">
          <i className={barToneOf(pct)} style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
        <p className="ha-sub muted">
          第{g.latest.attemptNumber}回/全{g.latest.attemptCount}回 · {g.latest.score}/
          {g.latest.total}
          {g.latest.durationSec != null && <> · {fmtDuration(g.latest.durationSec)}</>}
        </p>
      </div>
      <div className="ha-card-foot">
        <Link
          className="btn btn-sm"
          to={historyHref(g.quizId)}
          aria-label={`${g.quizTitle}の履歴詳細を見る`}
        >
          履歴を見る
        </Link>
        <Link
          className="btn btn-sm btn-ink"
          to={playHref(g.quizId)}
          aria-label={`${g.quizTitle}に挑戦する`}
        >
          挑戦する
        </Link>
      </div>
    </li>
  );
};

const HistDateTime = ({ value }: { value: string | null }) => (
  <span>最新 {fmtDateTimeFull(value) || "—"}</span>
);
