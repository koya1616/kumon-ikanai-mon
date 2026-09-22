// 回答直後のフィードバックUIの共通化 (Play / Review の bottom sheet)。
// 判定・文言・遷移は呼び出し側に残し、見た目 (sheet-card 構造) だけをここに集約する。
// ついで部品: CorrectAnswerBlock (正解リストの出し分け) / ExplanationBody (解説本文)。
import type { ReactNode, Ref } from "react";
import { isCloze, isOrder } from "../api";
import type { QuestionType } from "../api";
import { ClozeAnswerList } from "../cloze";
import { OrderAnswerList } from "../order";
import { RichText } from "../rich";

export const ExplanationBody = ({
  text,
  variant,
  fallback,
}: {
  text: string | null | undefined;
  variant: "sheet" | "plain";
  fallback?: string | undefined;
}) => {
  const body = text || "";
  if (!body && fallback === undefined) return null;
  return (
    <div className={variant === "sheet" ? "sheet-exp rich" : "exp rich"}>
      <RichText text={body || fallback} />
    </div>
  );
};

export const CorrectAnswerBlock = ({
  questionType,
  clozeAnswers,
  correctOrder,
}: {
  questionType: QuestionType;
  clozeAnswers?: string[] | undefined;
  correctOrder?: string[] | undefined;
}) => {
  if (isCloze(questionType)) return <ClozeAnswerList answers={clozeAnswers ?? []} />;
  if (isOrder(questionType)) return <OrderAnswerList answers={correctOrder ?? []} />;
  return null;
};

export const AnswerSheet = ({
  open,
  ok,
  title,
  scoreText,
  explanation,
  correctAnswerNode,
  collapsed,
  onToggleCollapsed,
  nextLabel,
  nextVariant,
  onNext,
  nextRef,
  nextDisabled,
}: {
  open: boolean;
  ok: boolean;
  title: ReactNode;
  scoreText: ReactNode;
  explanation: string;
  correctAnswerNode?: ReactNode | undefined;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  nextLabel: string;
  nextVariant: "primary" | "ink";
  onNext: () => void;
  nextRef?: Ref<HTMLButtonElement> | undefined;
  nextDisabled?: boolean | undefined;
}) => {
  return (
    <div className={`sheet${open ? " is-open" : ""}${collapsed ? " is-collapsed" : ""}`}>
      {open && (
        <div className={`sheet-card ${ok ? "is-ok" : "is-ng"}`}>
          <div className="sheet-title">
            <span className="sheet-badge" aria-hidden="true">
              {ok ? "○" : "×"}
            </span>
            <span>{title}</span>
            <span className="sheet-score">{scoreText}</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost sheet-toggle"
              onClick={onToggleCollapsed}
              aria-expanded={!collapsed}
            >
              {collapsed ? "解説を見る" : "隠す"}
            </button>
          </div>
          {correctAnswerNode}
          {!collapsed && (
            <ExplanationBody text={explanation} variant="sheet" fallback="（解説はありません）" />
          )}
          <div className="sheet-actions">
            <span className="kbd sheet-hint">Enterで次へ</span>
            <button
              ref={nextRef}
              type="button"
              className={`btn ${nextVariant === "primary" ? "btn-primary" : "btn-ink"}`}
              onClick={onNext}
              disabled={nextDisabled}
            >
              {nextLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
