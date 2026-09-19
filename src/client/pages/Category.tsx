import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { QUESTIONS_PER_QUIZ } from "../api";
import { categoryStats, useTree } from "../tree";
import { Crumbs, EmptyState, Icon, Ring, Skeletons, Stars } from "../ui";
import type { Quiz } from "../api";

export const Category = () => {
  const { id } = useParams();
  const catId = Number(id);
  const navigate = useNavigate();
  const { tree, summary, loadTree } = useTree();
  const [ready, setReady] = useState(false);
  const [kw, setKw] = useState("");
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    let alive = true;
    loadTree().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [loadTree]);

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
  const blocks = category.topics
    .map((t) => {
      const qs = t.quizzes.filter(
        (q) => (!keyword || q.title.includes(keyword)) && (!diff || q.difficulty === diff),
      );
      return { topic: t, quizzes: qs };
    })
    .filter((b) => b.quizzes.length > 0);
  shown = blocks.reduce((n, b) => n + b.quizzes.length, 0);
  const filtering = keyword !== "" || diff !== 0;

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
            <div className="search">
              <Icon name="search" />
              <input
                type="search"
                placeholder="クイズ名で検索"
                aria-label="クイズを検索"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
              />
            </div>
            <div className="diff-filter" role="group" aria-label="難易度で絞り込み">
              {[0, 1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip chip-btn"
                  aria-pressed={diff === d ? "true" : "false"}
                  data-d={d}
                  onClick={() => setDiff(d)}
                >
                  {d === 0 ? "すべて" : `★${d}`}
                </button>
              ))}
            </div>
          </div>
          {blocks.length > 1 && (
            <nav className="cat-topic-nav" aria-label="トピック">
              {blocks.map(({ topic, quizzes }) => (
                <a key={topic.id} className="chip chip-btn" href={`#topic-${topic.id}`}>
                  {topic.title} · {quizzes.length}
                </a>
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
                <QuizRow key={q.id} quiz={q} onPlay={() => navigate(`/play/${q.id}`)} />
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
                keyword || diff
                  ? "検索条件を変えてみてください。"
                  : "管理画面でこのカテゴリにクイズを追加してください。"
              }
            />
            {filtering && (
              <div className="row mt" style={{ justifyContent: "center" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setKw("");
                    setDiff(0);
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

const QuizRow = ({ quiz: q, onPlay }: { quiz: Quiz; onPlay: () => void }) => {
  const { summary } = useTree();
  const sm = summary[q.id];
  const readyQ = q.questionCount >= QUESTIONS_PER_QUIZ;
  const perfect = !!sm?.attemptCount && sm.bestScore >= sm.bestTotal && sm.bestTotal > 0;
  const markCls = "quiz-mark" + (perfect ? " is-perfect" : sm?.attemptCount ? " is-tried" : "");
  return (
    <div className="quiz-row-wrap">
      <button
        type="button"
        className="quiz-row quiz-row-main"
        disabled={!readyQ}
        title={readyQ ? "" : "問題が10問そろっていません"}
        onClick={onPlay}
        aria-label={`${q.title}に挑戦する`}
      >
        <div className={markCls} aria-hidden="true">
          {perfect ? "優" : sm?.attemptCount ? "再" : "未"}
        </div>
        <div className="grow">
          <div className="quiz-row-title">{q.title}</div>
          <div className="quiz-row-meta">
            <Stars n={q.difficulty} />
          </div>
        </div>
        {readyQ ? (
          sm?.attemptCount ? (
            <div className="quiz-row-right">
              <strong>
                {sm.bestScore}/{sm.bestTotal}
              </strong>
              <span>{sm.attemptCount}回</span>
            </div>
          ) : null
        ) : (
          <div className="quiz-row-right">
            <span className="chip chip-yamabuki">
              準備中 {q.questionCount}/{QUESTIONS_PER_QUIZ}
            </span>
          </div>
        )}
      </button>
    </div>
  );
};
