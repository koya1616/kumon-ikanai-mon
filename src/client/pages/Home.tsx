import { useEffect, useState } from "react";
import { Link } from "react-router";
import { categoryStats, useTree } from "../tree";
import { EmptyState, Icon, Ring, Skeletons, fmtDate } from "../ui";
import type { CategoryTreeNode } from "../api";

export const Home = () => {
  const { loadTree, summary, findQuiz } = useTree();
  const [tree, setTree] = useState<CategoryTreeNode[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadTree(true).then((t) => {
      if (alive) setTree(t);
    });
    return () => {
      alive = false;
    };
  }, [loadTree]);

  if (!tree) {
    return (
      <div className="screen">
        <header className="hero">
          <span className="eyebrow">今日のドリル</span>
          <h1 className="title-xl">どれから解く？</h1>
          <p className="muted">カテゴリを選んで、10問ずつ解いていこう。</p>
        </header>
        <Skeletons n={3} />
      </div>
    );
  }

  const totals = { total: 0, tried: 0, perfect: 0 };
  // summary は loadTree 後に更新されるため、最新の summary で再計算される
  const statsOf = (c: CategoryTreeNode) => categoryStats(c, summary);
  for (const c of tree) {
    const s = statsOf(c);
    totals.total += s.total;
    totals.tried += s.tried;
    totals.perfect += s.perfect;
  }

  const recent = Object.values(summary)
    .filter((s) => s.lastCompletedAt)
    .sort((a, b) => String(b.lastCompletedAt).localeCompare(String(a.lastCompletedAt)))
    .slice(0, 5);

  return (
    <div className="screen">
      <header className="hero">
        <span className="eyebrow">今日のドリル</span>
        <h1 className="title-xl">どれから解く？</h1>
        <p className="muted">カテゴリを選んで、10問ずつ解いていこう。</p>
      </header>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-v tnum">{totals.total}</div>
          <div className="stat-k">挑戦できるクイズ</div>
        </div>
        <div className="stat">
          <div className="stat-v tnum">{totals.tried}</div>
          <div className="stat-k">挑戦ずみ</div>
        </div>
        <div className="stat">
          <div className="stat-v tnum" style={{ color: "var(--moegi)" }}>
            {totals.perfect}
          </div>
          <div className="stat-k">満点</div>
        </div>
      </div>

      {!tree.length ? (
        <>
          <div className="card">
            <EmptyState
              glyph="空"
              title="まだカテゴリがありません"
              sub="管理画面からカテゴリ・トピック・クイズを作成してください。"
            />
          </div>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" to="/admin">
              管理画面へ
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="section-head">
            <h2 className="title-md">カテゴリ</h2>
          </div>
          <div className="cat-grid">
            {tree.map((c) => {
              const s = statsOf(c);
              return (
                <Link key={c.id} className="cat-card" to={`/c/${c.id}`}>
                  <Ring
                    pct={s.mastery / 100}
                    label={`${s.mastery}%`}
                    tone={s.total > 0 && s.perfect === s.total}
                  />
                  <div className="cat-card-body">
                    <div className="cat-card-title">{c.title}</div>
                    <div className="cat-card-meta">
                      {c.topics.length}トピック · {s.total}クイズ · 満点{s.perfect}
                    </div>
                  </div>
                  <Icon name="arrow" />
                </Link>
              );
            })}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <div className="section-head mt">
            <h2 className="title-md">最近の挑戦</h2>
          </div>
          <div className="recent-list">
            {recent.map((s) => {
              const f = findQuiz(s.quizId);
              if (!f) return null;
              return (
                <Link key={s.quizId} className="recent-item" to={`/play/${s.quizId}`}>
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{f.quiz.title}</div>
                    <div className="muted">{`${f.category.title} › ${f.topic.title} · ${fmtDate(s.lastCompletedAt)}`}</div>
                  </div>
                  <div className="recent-score">
                    最高 {s.bestScore}/{s.bestTotal}
                  </div>
                  <Icon name="arrow" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
