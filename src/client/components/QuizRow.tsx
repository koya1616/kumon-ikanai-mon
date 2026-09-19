// クイズ行の共通表示。Home / Category で重複していた
// マーク (優/再/未)・ベストスコア・準備中チップの判定を1箇所に集約する。
import type { ReactNode } from "react";
import { QUESTIONS_PER_QUIZ } from "../api";
import { useTree } from "../tree";
import { Stars } from "../ui";
import type { Quiz } from "../api";

interface QuizRowProps {
  quiz: Quiz;
  /** タイトル下の補足 (例: Home の `カテゴリ › トピック`)。省略時は難易度のみ。 */
  meta?: ReactNode;
  onPlay: () => void;
}

export const QuizRow = ({ quiz: q, meta, onPlay }: QuizRowProps) => {
  const { summary } = useTree();
  const sm = summary[q.id];
  const ready = q.questionCount >= QUESTIONS_PER_QUIZ;
  const perfect = !!sm?.attemptCount && sm.bestScore >= sm.bestTotal && sm.bestTotal > 0;
  const markCls = "quiz-mark" + (perfect ? " is-perfect" : sm?.attemptCount ? " is-tried" : "");

  return (
    <div className="quiz-row-wrap">
      <button
        type="button"
        className="quiz-row quiz-row-main"
        disabled={!ready}
        title={ready ? "" : "問題が10問そろっていません"}
        onClick={onPlay}
        aria-label={`${q.title}に挑戦する`}
      >
        <div className={markCls} aria-hidden="true">
          {perfect ? "優" : sm?.attemptCount ? "再" : "未"}
        </div>
        <div className="grow">
          <div className="quiz-row-title">{q.title}</div>
          <div className="quiz-row-meta">
            {meta}
            <Stars n={q.difficulty} />
          </div>
        </div>
        {ready ? (
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

/** 難易度絞り込みチップ列。Home / Category で重複していた。 */
export const DifficultyFilter = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (d: number) => void;
}) => (
  <div className="diff-filter" role="group" aria-label="難易度で絞り込み">
    {[0, 1, 2, 3, 4, 5].map((d) => (
      <button
        key={d}
        type="button"
        className="chip chip-btn"
        aria-pressed={value === d ? "true" : "false"}
        onClick={() => onChange(d)}
      >
        {d === 0 ? "すべて" : `★${d}`}
      </button>
    ))}
  </div>
);
