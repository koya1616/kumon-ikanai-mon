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
      <div className="screen">
        <Skeletons n={3} />
      </div>
    );
  }
  if (!category) {
    return (
      <div className="screen">
        <div className="card">
          <EmptyState glyph="？" title="カテゴリが見つかりません" />
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

  return (
    <div className="screen">
      <Crumbs items={[{ label: "ホーム", href: "/" }, { label: category.title }]} />
      <header className="row mt" style={{ gap: 16 }}>
        <Ring
          pct={s.mastery / 100}
          label={`${s.mastery}%`}
          tone={s.total > 0 && s.perfect === s.total}
        />
        <div className="grow">
          <h1 className="title-lg">{category.title}</h1>
          <p className="muted">
            {s.tried}/{s.total} クイズに挑戦ずみ · 満点 {s.perfect}
          </p>
        </div>
      </header>

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

      <div>
        {blocks.map(({ topic, quizzes }) => (
          <section key={topic.id} className="topic-block">
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
          <div className="card">
            <EmptyState
              glyph="無"
              title="該当するクイズがありません"
              sub={
                keyword || diff
                  ? "検索条件を変えてみてください。"
                  : "管理画面でこのカテゴリにクイズを追加してください。"
              }
            />
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
    <button
      type="button"
      className="quiz-row"
      disabled={!readyQ}
      title={readyQ ? "" : "問題が10問そろっていません"}
      onClick={onPlay}
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
        ) : (
          <div className="quiz-row-right">
            <span className="chip chip-moegi">▶ はじめる</span>
          </div>
        )
      ) : (
        <div className="quiz-row-right">
          <span className="chip chip-yamabuki">
            準備中 {q.questionCount}/{QUESTIONS_PER_QUIZ}
          </span>
        </div>
      )}
    </button>
  );
};
