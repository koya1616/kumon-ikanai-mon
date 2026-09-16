import { useEffect, useState } from "react";
import { Link } from "react-router";
import { categoryStats, useTree } from "../tree";
import { EmptyState, Icon, Ring, Skeletons, fmtDate } from "../ui";
import type { AttemptState, CategoryTreeNode } from "../api";
import { api } from "../api";
import { clearResume, listResumes } from "../resume";

interface InProgress {
  quizId: number;
  attemptId: number;
  done: number;
  total: number;
}

export const Home = () => {
  const { loadTree, summary, findQuiz } = useTree();
  const [tree, setTree] = useState<CategoryTreeNode[] | null>(null);
  const [inProgress, setInProgress] = useState<InProgress[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadTree(true).then((t) => {
      if (alive) setTree(t);
    });
    return () => {
      alive = false;
    };
  }, [loadTree]);

  // 回答途中のクイズ: このブラウザの localStorage (kmon:resume:*) を列挙し、
  // サーバ状態で未完了かつ 1問以上回答ずみ・全問未満のものだけ残す。
  // Play の再開判定 (answers 0件は新規扱い) と合わせる。
  useEffect(() => {
    if (!tree) return;
    let alive = true;
    const saved = listResumes();
    if (!saved.length) {
      setInProgress([]);
      return;
    }
    void Promise.all(
      saved.map(async (r): Promise<InProgress | null> => {
        try {
          const st = await api<AttemptState>(`/api/attempts/${r.attemptId}`);
          if (
            !st ||
            st.completedAt ||
            st.quizId !== r.quizId ||
            !st.questions?.length ||
            st.questions.length !== r.order.length
          ) {
            if (st?.completedAt) clearResume(r.quizId);
            return null;
          }
          const done = st.answers?.length ?? 0;
          if (done < 1 || done >= st.questions.length) return null;
          return { quizId: r.quizId, attemptId: r.attemptId, done, total: st.questions.length };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (alive) setInProgress(rows.filter((r): r is InProgress => r !== null));
    });
    return () => {
      alive = false;
    };
  }, [tree]);

  if (!tree) {
    return (
      <div className="screen home-screen">
        <div className="home-band">
          <div className="home-band-inner">
            <span className="eyebrow">今日のドリル</span>
            <h1 className="title-xl">どれから解く？</h1>
            <p className="muted">カテゴリを選んで、10問ずつ解いていこう。</p>
          </div>
        </div>
        <div className="home-body">
          <Skeletons n={3} />
        </div>
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

  const resumable = (inProgress ?? []).flatMap((p) => {
    const f = findQuiz(p.quizId);
    return f ? [{ ...p, ...f }] : [];
  });

  return (
    <div className="screen home-screen">
      <div className="home-band">
        <div className="home-band-inner">
          <div className="home-band-text">
            <span className="eyebrow">今日のドリル</span>
            <h1 className="title-xl">どれから解く？</h1>
            <p className="muted">カテゴリを選んで、10問ずつ解いていこう。</p>
          </div>
          <div className="home-stats">
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
        </div>
      </div>

      <div className="home-body">
        {!tree.length ? (
          <>
            <div className="card card-pad">
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
            {resumable.length > 0 && (
              <section aria-label="回答途中">
                <div className="section-head">
                  <h2 className="title-md">つづきから</h2>
                  <span className="chip chip-shu">{resumable.length} 件</span>
                </div>
                <div className="resume-grid">
                  {resumable.map((p) => (
                    <Link key={p.quizId} className="resume-card" to={`/play/${p.quizId}`}>
                      <div className="grow">
                        <div style={{ fontWeight: 700 }}>{p.quiz.title}</div>
                        <div className="muted">{`${p.category.title} › ${p.topic.title}`}</div>
                        <div className="resume-bar" aria-hidden="true" style={{ marginTop: 8 }}>
                          <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                        </div>
                        <div className="muted tnum" style={{ marginTop: 4 }}>
                          {p.done} / {p.total} 問まで回答ずみ
                        </div>
                      </div>
                      <span className="chip chip-moegi">▶ つづきから</span>
                      <Icon name="arrow" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <div className="home-layout">
              <section aria-label="カテゴリ">
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
              </section>

              {recent.length > 0 && (
                <aside aria-label="最近の挑戦">
                  <div className="section-head">
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
                </aside>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
