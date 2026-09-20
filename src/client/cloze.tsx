// 穴埋め描画 (statement中の {{n}} を入力欄・表示欄に置換)。
// RichText の renderBlank 差し込み口を使い、フェンスコードブロック内は置換しない
// （inlineコード内は置換する）。
// XSS-safe (テキストノード組み立てのみ)。
import { useRef } from "react";
import type { KeyboardEvent } from "react";
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

/** 全角文字を2として数える (ch単位のwidth指定が和文で狭くなりすぎる対策) */
const textWidth = (s: string): number => {
  let w = 0;
  for (const ch of s) {
    w += ch.codePointAt(0)! > 0xff ? 2 : 1;
  }
  return w;
};

const widthOf = (value: string, answer?: string): number => {
  const len = Math.max(textWidth(value), textWidth(answer ?? ""), 8);
  return Math.min(Math.max(len + 2, 10), 30);
};

/**
 * 空欄 input を番号で保持し、Enter で次の空欄へフォーカス移動する。
 * 移動先が無ければ false を返し、フォームの submit (回答/次へ) に任せる。
 */
const useBlankFocus = (count: number) => {
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const register = (n: number) => (el: HTMLInputElement | null) => {
    if (el) inputs.current.set(n, el);
    else inputs.current.delete(n);
  };
  const onEnter = (n: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || n >= count) return;
    const next = inputs.current.get(n + 1);
    if (!next) return;
    e.preventDefault();
    next.focus();
  };
  return { register, onEnter };
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
  const { register, onEnter } = useBlankFocus(values.length);
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
          (editable ? "" : " is-readonly") +
          (!editable && !value ? " is-empty" : "");
        if (editable) {
          return (
            <span key={n} className="cloze-field">
              <span className="cloze-num" aria-hidden="true">
                {n}
              </span>
              <input
                ref={register(n)}
                type="text"
                className={cls}
                aria-label={`${ariaPrefix}${n}`}
                placeholder={`空欄${n}`}
                value={value}
                disabled={disabled}
                autoFocus={autoFocusFirst && n === 1}
                maxLength={100}
                autoComplete="off"
                style={{ width: `${widthOf(value, answer)}ch` }}
                onChange={(e) => onChange?.(n, e.target.value)}
                onKeyDown={onEnter(n)}
              />
            </span>
          );
        }
        return (
          <span key={n} className="cloze-result">
            <span className={cls}>{value || `空欄${n}`} </span>
            {st === "ng" && answer !== undefined && (
              <span className="cloze-answer">
                <span className="cloze-answer-label" aria-hidden="true">
                  正解
                </span>
                {answer}
              </span>
            )}
          </span>
        );
      }}
    />
  );
};

/** 正答リスト表示 (回答後の「正解は…」を見やすく番号バッジ付きで並べる) */
export const ClozeAnswerList = ({ answers }: { answers: string[] }) => {
  if (!answers.length) return null;
  return (
    <ol className="cloze-answers" aria-label="正解一覧">
      {answers.map((a, i) => (
        <li key={i} className="cloze-answers-row">
          <span className="cloze-num" aria-hidden="true">
            {i + 1}
          </span>
          <span className="cloze-answers-text">{a}</span>
        </li>
      ))}
    </ol>
  );
};

/**
 * 長文でも入力しやすい空欄一覧 (問題文の下に番号順の入力欄を並べる)。
 * 文中のinputと同一の values/onChange を共有するため両者は同期する。
 */
export const ClozeFieldList = ({
  values,
  status,
  disabled,
  onChange,
  ariaPrefix = "空欄",
}: {
  values: string[];
  status?: (BlankStatus | null)[] | undefined;
  disabled?: boolean | undefined;
  onChange?: ((blankIndex: number, value: string) => void) | undefined;
  ariaPrefix?: string | undefined;
}) => {
  const { register, onEnter } = useBlankFocus(values.length);
  if (!values.length) return null;
  return (
    <ol className="cloze-list" aria-label="空欄への回答欄">
      {values.map((value, i) => {
        const n = i + 1;
        const st = status?.[i] ?? null;
        return (
          <li key={n} className="cloze-list-row">
            <label className="cloze-list-label" htmlFor={`cloze-list-${n}`}>
              <span className="cloze-num" aria-hidden="true">
                {n}
              </span>
              <span className="vh">{`${ariaPrefix}${n}`}</span>
            </label>
            <input
              ref={register(n)}
              id={`cloze-list-${n}`}
              type="text"
              className={
                "cloze-blank cloze-list-input" +
                (st === "ok" ? " is-ok" : st === "ng" ? " is-ng" : "")
              }
              placeholder={`空欄${n}の回答を入力`}
              aria-label={`${ariaPrefix}${n}の回答`}
              value={value}
              disabled={disabled}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => onChange?.(n, e.target.value)}
              onKeyDown={onEnter(n)}
            />
          </li>
        );
      })}
    </ol>
  );
};
