// クイズ横断の挑戦履歴ページ (/history)。完了した挑戦を新しい順に並べる。
// 問題単位の掘り下げはクイズ別履歴 (/h/:id) に寄せ、ここでは回遊用の目次に徹する。
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, fmtDuration } from "../api";
import type { AttemptHistoryItem } from "../api";
import { EmptyState, Icon, Skeletons } from "../ui";
import { HistDate } from "./History";

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; items: AttemptHistoryItem[] };

export const HistoryAll = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ name: "loading" });

  useEffect(() => {
    let alive = true;
    api<AttemptHistoryItem[]>(`/api/attempts/recent?limit=50`)
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

  const { items } = state;

  return (
    <div className="screen">
      <div className="hist-body">
        {!items.length ? (
          <div className="card card-pad">
            <EmptyState
              glyph="空"
              title="まだ挑戦履歴がありません"
              sub="クイズに挑戦して完了するとここに記録が残ります。"
            />
          </div>
        ) : (
          <HistoryTabs items={items} />
        )}
      </div>
    </div>
  );
};

/** 履歴のタブ切り替え: カテゴリ一覧 / トピック一覧 / クイズ一覧 (履歴があるものだけ)。
 * 項目タップでその場で履歴を絞り込む。 */
type HistoryTab = "categories" | "topics" | "quizzes";

interface HistoryGroup {
  id: number;
  title: string;
  parentTitle: string;
  count: number;
  latest: AttemptHistoryItem;
  best: number;
  bestTotal: number;
}

const groupItems = (items: AttemptHistoryItem[]) => {
  const cats = new Map<number, HistoryGroup>();
  const topics = new Map<number, HistoryGroup>();
  const quizzes = new Map<number, HistoryGroup>();
  for (const r of items) {
    const put = (m: Map<number, HistoryGroup>, id: number, title: string, parentTitle: string) => {
      const g = m.get(id);
      if (!g) {
        m.set(id, {
          id,
          title,
          parentTitle,
          count: 1,
          latest: r,
          best: r.score,
          bestTotal: r.total,
        });
      } else {
        g.count++;
        if (r.score / Math.max(1, r.total) > g.best / Math.max(1, g.bestTotal)) {
          g.best = r.score;
          g.bestTotal = r.total;
        }
      }
    };
    put(cats, r.categoryId, r.categoryTitle, "");
    put(topics, r.topicId, r.topicTitle, r.categoryTitle);
    put(quizzes, r.quizId, r.quizTitle, `${r.categoryTitle} › ${r.topicTitle}`);
  }
  return {
    // items は新しい順なので Map 挿入順 = 最新順になる
    categories: [...cats.values()],
    topics: [...topics.values()],
    quizzes: [...quizzes.values()],
  };
};

const HistoryTabs = ({ items }: { items: AttemptHistoryItem[] }) => {
  const [tab, setTab] = useState<HistoryTab>("categories");
  const [sel, setSel] = useState<{ tab: HistoryTab; id: number } | null>(null);
  const groups = useMemo(() => groupItems(items), [items]);

  const list =
    tab === "categories" ? groups.categories : tab === "topics" ? groups.topics : groups.quizzes;

  const selectedGroup = sel && sel.tab === tab ? (list.find((g) => g.id === sel.id) ?? null) : null;

  const filtered = selectedGroup
    ? items.filter((r) =>
        tab === "categories"
          ? r.categoryId === selectedGroup.id
          : tab === "topics"
            ? r.topicId === selectedGroup.id
            : r.quizId === selectedGroup.id,
      )
    : items;

  const switchTab = (t: HistoryTab) => {
    setTab(t);
    setSel(null);
  };
  const toggle = (g: HistoryGroup) => {
    setSel((cur) => (cur && cur.tab === tab && cur.id === g.id ? null : { tab, id: g.id }));
  };

  return (
    <section aria-label="履歴の一覧切り替え">
      <div className="hx-tabs" role="tablist" aria-label="カテゴリ・トピック・クイズ">
        {(
          [
            { id: "categories", label: `カテゴリ(${groups.categories.length})` },
            { id: "topics", label: `トピック(${groups.topics.length})` },
            { id: "quizzes", label: `クイズ(${groups.quizzes.length})` },
          ] as { id: HistoryTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="hx-tab"
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ marginBottom: 20 }}>
        {list.length ? (
          <div className="cat-grid">
            {list.map((g) => {
              const active = selectedGroup?.id === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  className="cat-card"
                  aria-pressed={active}
                  onClick={() => toggle(g)}
                >
                  <div className="cat-card-body">
                    {g.parentTitle && <div className="muted">{g.parentTitle}</div>}
                    <div className="cat-card-title">{g.title}</div>
                    <div className="cat-card-meta">
                      {g.count}回挑戦 · 最高 {g.best}/{g.bestTotal} · 最新{" "}
                      <HistDate value={g.latest.completedAt} />
                    </div>
                  </div>
                  {active ? (
                    <span className="chip chip-shu">絞り込み中</span>
                  ) : (
                    <span className="chip">{g.count}件</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card card-pad">
            <EmptyState glyph="無" title="該当する履歴がありません" />
          </div>
        )}
      </div>
      {selectedGroup && (
        <div className="row wrap mb between">
          <div className="title-md">
            {selectedGroup.title} <span className="muted">({filtered.length}件)</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setSel(null)}>
            絞り込みをクリア
          </button>
        </div>
      )}
      {!filtered.length ? (
        <div className="card card-pad">
          <EmptyState glyph="無" title="該当する履歴がありません" />
        </div>
      ) : (
        <ol className="recent-list">
          {filtered.map((r) => {
            const pct = r.total ? r.score / r.total : 0;
            return (
              <li key={r.id} className="recent-item">
                <Link
                  className="recent-main"
                  to={`/play/${r.quizId}`}
                  aria-label={`${r.quizTitle}に挑戦する`}
                >
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{r.quizTitle}</div>
                    <div className="muted">
                      {`${r.categoryTitle} › ${r.topicTitle} · `}
                      <HistDate value={r.completedAt} />
                      {r.durationSec !== null && r.durationSec !== undefined && (
                        <> · {fmtDuration(r.durationSec)}</>
                      )}
                    </div>
                    <div className="history-bar" aria-hidden="true" style={{ maxWidth: 220 }}>
                      <i
                        className={pct >= 0.7 ? "" : pct >= 0.4 ? "is-mid" : "is-low"}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="recent-score tnum">
                    {r.score}/{r.total}
                  </div>
                  <Icon name="arrow" />
                </Link>
                <Link
                  className="btn btn-sm btn-ghost"
                  to={`/h/${r.quizId}`}
                  aria-label={`${r.quizTitle}の履歴を見る`}
                >
                  履歴
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
