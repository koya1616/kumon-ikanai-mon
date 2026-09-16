// 確認ダイアログ。シェルの <dialog id="dialog"> へポータル描画する。
// 旧 confirmDialog(opts) と同じ契約: input ありなら入力値、fields ありなら
// fields() の戻り値、どちらも無ければ true、キャンセル/close なら null。
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export interface DialogOptions {
  title: string;
  message?: string;
  input?: { value?: string; placeholder?: string };
  /** カスタム入力欄。描画と値の取り出しを呼び出し側が持つ (クイズ設定用)。 */
  fields?: (setValue: (v: unknown) => void) => ReactNode;
  okLabel?: string;
  danger?: boolean;
}

type DialogFn = (opts: DialogOptions) => Promise<unknown>;

const DialogContext = createContext<DialogFn>(() => Promise.resolve(null));

export const useDialog = () => useContext(DialogContext);

export const DialogProvider = ({ children }: { children: ReactNode }) => {
  const [opts, setOpts] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolver = useRef<(v: unknown) => void>(() => {});
  const valueRef = useRef<unknown>(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const dialog = useCallback<DialogFn>((o) => {
    setOpts(o);
    setInputValue(o.input?.value ?? "");
    valueRef.current = true;
    return new Promise<unknown>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const dlgEl =
    typeof document !== "undefined"
      ? (document.getElementById("dialog") as HTMLDialogElement | null)
      : null;
  const bodyEl = typeof document !== "undefined" ? document.getElementById("dialog-body") : null;

  const done = useCallback(
    (v: unknown) => {
      resolver.current(v);
      setOpts(null);
      dlgEl?.close();
    },
    [dlgEl],
  );

  useEffect(() => {
    if (!opts || !dlgEl) return;
    if (!dlgEl.open) dlgEl.showModal();
    // ネイティブの × / Esc 閉じはキャンセル扱い
    const onClose = () => {
      resolver.current(null);
      setOpts(null);
    };
    dlgEl.onclose = onClose;
    if (opts.input) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    return () => {
      dlgEl.onclose = null;
    };
  }, [opts, dlgEl]);

  const submitFields = useCallback(() => {
    if (opts?.input) {
      done(inputValue);
      return;
    }
    // fields が getter を登録した場合は OK 押下時に評価する
    const v = valueRef.current;
    done(typeof v === "function" ? (v as () => unknown)() : v);
  }, [done, inputValue, opts]);

  return (
    <DialogContext.Provider value={dialog}>
      {children}
      {bodyEl && opts
        ? createPortal(
            <>
              <h3 className="title-md">{opts.title}</h3>
              {opts.message ? (
                <p className="muted" style={{ fontSize: 14 }}>
                  {opts.message}
                </p>
              ) : null}
              {opts.input ? (
                <input
                  ref={inputRef}
                  className="input"
                  value={inputValue}
                  maxLength={100}
                  placeholder={opts.input.placeholder ?? ""}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitFields();
                    }
                  }}
                />
              ) : null}
              {opts.fields ? opts.fields((v) => (valueRef.current = v)) : null}
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => done(null)}>
                  キャンセル
                </button>
                <button
                  type="button"
                  className={`btn ${opts.danger ? "btn-danger" : "btn-primary"}`}
                  onClick={submitFields}
                >
                  {opts.okLabel ?? "OK"}
                </button>
              </div>
            </>,
            bodyEl,
          )
        : null}
    </DialogContext.Provider>
  );
};
