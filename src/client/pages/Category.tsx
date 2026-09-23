import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { categoryStats, useTree } from "../tree";
import { Crumbs, EmptyState, Ring, Skeletons } from "../ui";
import { SearchBox } from "../components/feedback";
import { playHref } from "../lib/links";
import { DifficultyFilter, QuizRow } from "../components/QuizRow";

export const Category = () => {
  const { id } = useParams();
  const catId = Number(id);
  const navigate = useNavigate();
  const { tree, summary, loadTree } = useTree();
  const [ready, setReady] = useState(false);
  const [kw, setKw] = useState("");
  const [diff, setDiff] = useState(0);
  const [topicId, setTopicId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadTree().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [loadTree]);

  useEffect(() => {
    setKw("");
    setDiff(0);
    setTopicId(null);
  }, [catId]);

  const category = useMemo(() => (tree ?? []).find((c) => c.id === catId) ?? null, [tree, catId]);

  if (!ready) {
    return (
      <div className="screen cat-screen">
        <div className="cat-band">
          <div className="cat-band-inner">
            <Skeletons n={3} />
          </div>
        </div>
      </div>
    );
  }
  if (!category) {
    return (
      <div className="screen cat-screen">
        <div className="cat-body">
          <div className="card card-pad">
            <EmptyState glyph="？" title="カテゴリが見つかりません" />
          </div>
        </div>
      </div>
    );
  }

  const s = categoryStats(category, summary);
  const keyword = kw.trim();

  let shown = 0;
  const baseBlocks = category.topics
    .map((t) => {
      const qs = t.quizzes.filter(
        (q) => (!keyword || q.title.includes(keyword)) && (!diff || q.difficulty === diff),
      );
      return { topic: t, quizzes: qs };
    })
    .filter((b) => b.quizzes.length > 0);
  const blocks =
    topicId == null ? baseBlocks : baseBlocks.filter((b) => b.topic.id === topicId);
  shown = blocks.reduce((n, b) => n + b.quizzes.length, 0);
  const filtering = keyword !== "" || diff !== 0 || topicId != null;

  return (
    <div className="screen cat-screen">
      <div className="cat-band">
        <div className="cat-band-inner">
          <Crumbs items={[{ label: "ホーム", href: "/" }, { label: category.title }]} />
          <div className="cat-band-grid">
            <Ring
              pct={s.mastery / 100}
              label={`${s.mastery}%`}
              tone={s.total > 0 && s.perfect === s.total}
            />
            <div className="cat-band-meta">
              <h1 className="title-lg">{category.title}</h1>
              <p className="muted">
                {s.tried}/{s.total} クイズに挑戦ずみ
                {filtering && ` · ${shown}件表示中`}
              </p>
            </div>
          </div>
          <div className="toolbar">
            <SearchBox
              value={kw}
              onChange={setKw}
              placeholder="クイズ名で検索"
              ariaLabel="クイズを検索"
            />
            <DifficultyFilter value={diff} onChange={setDiff} />
          </div>
          {baseBlocks.length > 1 && (
            <nav className="cat-topic-nav" aria-label="トピックで絞り込み">
              <button
                type="button"
                className="chip chip-btn"
                aria-pressed={topicId == null ? "true" : "false"}
                onClick={() => setTopicId(null)}
              >
                すべて · {baseBlocks.reduce((n, b) => n + b.quizzes.length, 0)}
              </button>
              {baseBlocks.map(({ topic, quizzes }) => (
                <button
                  key={topic.id}
                  type="button"
                  className="chip chip-btn"
                  aria-pressed={topicId === topic.id ? "true" : "false"}
                  onClick={() => setTopicId((cur) => (cur === topic.id ? null : topic.id))}
                >
                  {topic.title} · {quizzes.length}
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="cat-body">
        {blocks.map(({ topic, quizzes }) => (
          <section key={topic.id} id={`topic-${topic.id}`} className="topic-block">
            <div className="topic-head">
              <h3>{topic.title}</h3>
              <span className="count">{quizzes.length} クイズ</span>
            </div>
            <div className="quiz-list">
              {quizzes.map((q) => (
                <QuizRow key={q.id} quiz={q} onPlay={() => navigate(playHref(q.id))} />
              ))}
            </div>
          </section>
        ))}
        {!shown && (
          <div className="card card-pad">
            <EmptyState
              glyph="無"
              title="該当するクイズがありません"
              sub={
                filtering
                  ? "検索条件を変えてみてください。"
                  : "管理画面でこのカテゴリにクイズを追加してください。"
              }
            />
            {filtering && (
              <div className="actions actions-center">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setKw("");
                    setDiff(0);
                    setTopicId(null);
                  }}
                >
                  絞り込みをクリア
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
