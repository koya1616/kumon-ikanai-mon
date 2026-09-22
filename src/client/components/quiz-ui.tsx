// 出題・採点表示の共通部品 (Play / Review / Result / History / Bookmarks)。
// 4択リスト・正誤タイトル・空欄マーカー表示を集約する。
import { RichText } from "../rich";
import type { QuestionType } from "../api";

/** {{n}} → ［空欄n］の表示用変換 (一覧・見出し用) */
export const toDisplayStatement = (statement: string, questionType: QuestionType): string =>
  questionType === "cloze_text" ? statement.replace(/\{\{(\d+)\}\}/g, "［空欄$1］") : statement;

/** 回答シートのタイトル文言 (Play / Review で完全一致していた) */
export const sheetTitleOf = (ok: boolean, questionType: QuestionType, correct: number): string => {
  if (ok) return "正解！";
  if (questionType === "cloze_text") return "不正解…";
  if (questionType === "order_blocks") return "不正解…正しい順序を確認しよう";
  return `不正解…正解は${correct}番`;
};

/** インラインの穴埋め入力を出す条件 (文が長い / 空欄2つ以上) */
export const shouldShowInlineClozeFields = (statement: string, blankCount: number): boolean =>
  blankCount >= 2 || statement.length > 100;

/** 未回答判定 (History / Result に分散していた) */
export const isAnsweredDetail = (d: {
  questionType: QuestionType;
  picked: number | null;
  pickedAnswers: string[];
  pickedOrder: string[];
}): boolean => {
  if (d.questionType === "cloze_text") return d.pickedAnswers.length > 0;
  if (d.questionType === "order_blocks") return d.pickedOrder.length > 0;
  return d.picked !== null;
};

/** 4択の選択肢リスト (Play / Review / Result で verbatim だった) */
export const ChoiceList = ({
  choices,
  correct,
  picked,
  revealed,
  disabled,
  onPick,
  namePrefix = "q",
}: {
  choices: string[];
  correct?: number | undefined;
  picked?: number | null | undefined;
  revealed: boolean;
  disabled?: boolean | undefined;
  onPick?: ((n: number) => void) | undefined;
  namePrefix?: string;
}) => (
  <div className="choices" role="radiogroup" aria-label="選択肢">
    {choices.map((c, i) => {
      const n = i + 1;
      let cls = "choice";
      if (revealed) {
        if (n === correct) cls += " is-correct";
        else if (n === picked) cls += " is-wrong";
        else cls += " is-dim";
      } else if (n === picked) cls += " is-picked";
      const inner = (
        <>
          <span className="choice-key">{n}</span>
          <span className="choice-label rich">
            <RichText text={c} />
          </span>
          <span className="choice-mark" aria-hidden="true">
            {revealed ? (n === correct ? "○" : n === picked ? "×" : "") : ""}
          </span>
        </>
      );
      return onPick && !revealed ? (
        <button
          key={n}
          type="button"
          className={cls}
          disabled={disabled}
          onClick={() => onPick(n)}
          aria-checked={n === picked}
          role="radio"
          aria-label={`選択肢${n}`}
        >
          {inner}
        </button>
      ) : (
        <div key={`${namePrefix}-${n}`} className={cls} role="listitem" aria-label={`${n}番`}>
          {inner}
        </div>
      );
    })}
  </div>
);
