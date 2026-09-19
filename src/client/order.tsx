// 並べ替え (order_blocks) の回答UI。
// ブロックの順序を ▲▼ボタン・タップ移動・ドラッグ&ドロップで入れ替える。
// 採点はサーバ側 (完全一致)。ここでは提出順の編集だけを担う。
// XSS-safe (テキストは RichText 経由で描画)。
import { useRef, useState } from "react";
import { RichText } from "./rich";

/** 正順リスト表示用 ("1: SELECT * ..." を番号バッジ付きで並べる) */
export const OrderAnswerList = ({ answers }: { answers: string[] }) => {
  if (!answers.length) return null;
  return (
    <ol className="order-answers" aria-label="正しい順序">
      {answers.map((a, i) => (
        <li key={i} className="order-answers-row">
          <span className="order-num" aria-hidden="true">
            {i + 1}
          </span>
          <span className="order-answers-text rich">
            <RichText text={a} />
          </span>
        </li>
      ))}
    </ol>
  );
};

export const OrderBlocks = ({
  initial,
  status,
  disabled,
  onChange,
}: {
  /** 出題時のブロック (シャッフル済み) */
  initial: string[];
  /** 回答後の位置単位の正誤 (未回答時は省略)。index = 提出順の位置-1 */
  status?: (boolean | null)[] | undefined;
  disabled?: boolean | undefined;
  onChange?: ((order: string[]) => void) | undefined;
}) => {
  const [order, setOrder] = useState<string[]>(() => [...initial]);
  const [selected, setSelected] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const revealed = status !== undefined;

  const commit = (next: string[]) => {
    setOrder(next);
    setSelected(null);
    onChange?.(next);
  };

  const move = (from: number, to: number) => {
    if (revealed || disabled) return;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t as string);
    commit(next);
  };

  const tap = (idx: number) => {
    if (revealed || disabled) return;
    if (selected === null) {
      setSelected(idx);
      return;
    }
    if (selected === idx) {
      setSelected(null);
      return;
    }
    const next = [...order];
    const [t] = next.splice(selected, 1);
    next.splice(idx, 0, t as string);
    commit(next);
  };

  return (
    <div>
      <ol className="order-list" aria-label="並べ替えブロック">
        {order.map((text, idx) => {
          const st = status?.[idx] ?? null;
          const cls =
            "order-item" +
            (st === true ? " is-ok" : st === false ? " is-ng" : "") +
            (selected === idx ? " is-selected" : "");
          return (
            <li
              key={`${idx}-${text}`}
              className={cls}
              draggable={!revealed && !disabled}
              onDragStart={(e) => {
                dragFrom.current = idx;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragFrom.current;
                dragFrom.current = null;
                if (from === null || from === idx) return;
                move(from, idx);
              }}
              onDragEnd={() => {
                dragFrom.current = null;
              }}
            >
              <span className="order-pos tnum" aria-hidden="true">
                {idx + 1}
              </span>
              <button
                type="button"
                className="order-text rich"
                disabled={revealed || disabled}
                onClick={() => tap(idx)}
                aria-label={`ブロック${idx + 1}: ${text}${selected === idx ? "（選択中）" : ""}`}
                title={revealed ? undefined : "タップで選択・入れ替え"}
              >
                <RichText text={text} />
              </button>
              {!revealed && (
                <span className="order-ops" aria-hidden={selected === idx ? undefined : false}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`ブロック${idx + 1}を1つ上へ`}
                    disabled={disabled || idx === 0}
                    onClick={() => move(idx, idx - 1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`ブロック${idx + 1}を1つ下へ`}
                    disabled={disabled || idx === order.length - 1}
                    onClick={() => move(idx, idx + 1)}
                  >
                    ▼
                  </button>
                </span>
              )}
              {revealed && st !== null && (
                <span className="order-mark" aria-hidden="true">
                  {st ? "○" : "×"}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!revealed && (
        <p className="muted" style={{ textAlign: "center" }}>
          タップ2回または▲▼・ドラッグで順序を入れ替え
        </p>
      )}
    </div>
  );
};
