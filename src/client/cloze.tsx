// 穴埋め描画 (statement中の {{n}} を入力欄・表示欄に置換)。
// RichText の renderBlank 差し込み口を使い、コードブロック内は置換しない。
// XSS-safe (テキストノード組み立てのみ)。
import { RichText, splitClozeParts } from "./rich";

/** statement中のマーカー番号を出現順・重複除去で返す */
export const parseClozeBlanks = (statement: string): number[] => {
  const out: number[] = [];
  for (const seg of splitClozeParts(String(statement ?? ""))) {
    if ("blank" in seg && seg.blank >= 1 && !out.includes(seg.blank)) out.push(seg.blank);
  }
  return out.sort((a, b) => a - b);
};

/** 正答サマリー表示用 ("1: 家康 / 2: 260") */
export const formatClozeAnswers = (answers: string[]): string =>
  answers.map((a, i) => `${i + 1}: ${a}`).join(" / ");

type BlankStatus = "ok" | "ng";

const widthOf = (value: string, answer?: string): number => {
  const len = Math.max(value.length, (answer ?? "").length, 4);
  return Math.min(Math.max(len + 1, 5), 24);
};

export const ClozeStatement = ({
  statement,
  values,
  status,
  answers,
  editable,
  disabled,
  onChange,
  autoFocusFirst,
  ariaPrefix = "空欄",
}: {
  statement: string;
  /** 空欄番号順 (index = blank-1) の入力値 */
  values: string[];
  /** 回答後の正誤 (未回答時は省略) */
  status?: (BlankStatus | null)[] | undefined;
  /** 正答 (回答後の開示用。不正解欄の横に表示する) */
  answers?: string[] | undefined;
  editable?: boolean | undefined;
  disabled?: boolean | undefined;
  onChange?: ((blankIndex: number, value: string) => void) | undefined;
  autoFocusFirst?: boolean | undefined;
  ariaPrefix?: string | undefined;
}) => {
  return (
    <RichText
      text={statement}
      renderBlank={(n) => {
        const i = n - 1;
        const value = values[i] ?? "";
        const st = status?.[i] ?? null;
        const answer = answers?.[i];
        const cls =
          "cloze-blank" +
          (st === "ok" ? " is-ok" : st === "ng" ? " is-ng" : "") +
          (editable ? "" : " is-readonly");
        if (editable) {
          return (
            <input
              key={n}
              type="text"
              className={cls}
              aria-label={`${ariaPrefix}${n}`}
              value={value}
              disabled={disabled}
              autoFocus={autoFocusFirst && n === 1}
              maxLength={100}
              style={{ width: `${widthOf(value, answer)}ch` }}
              onChange={(e) => onChange?.(n, e.target.value)}
            />
          );
        }
        return (
          <span key={n}>
            <span className={cls}>{value || "（空欄）"}</span>
            {st === "ng" && answer !== undefined && (
              <span className="cloze-answer">正: {answer}</span>
            )}
          </span>
        );
      }}
    />
  );
};
