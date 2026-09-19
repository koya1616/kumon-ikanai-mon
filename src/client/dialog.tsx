// 確認ダイアログ。<dialog> 要素も React ツリー内で描画し ref で開閉する。
// 契約: input ありなら入力値、fields ありなら readFields(FormData) の戻り値、
// どちらも無ければ true、キャンセル/close なら null。
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

export interface DialogOptions {
  title: string;
  message?: string;
  input?: { value?: string; placeholder?: string };
  /** カスタム入力欄 (name 属性付きの非制御フォーム部品)。 */
  fields?: ReactNode;
  /** OK 時にフォームの値から戻り値を組み立てる。 */
  readFields?: (form: FormData) => unknown;
  okLabel?: string;
  danger?: boolean;
}

type DialogFn = (opts: DialogOptions) => Promise<unknown>;

const DialogContext = createContext<DialogFn>(() => Promise.resolve(null));
const DialogOpenContext = createContext(false);

export const useDialog = () => useContext(DialogContext);

/** ダイアログ表示中か (キーボードショートカットの抑止用) */
export const useDialogOpen = () => useContext(DialogOpenContext);

export const DialogProvider = ({ children }: { children: ReactNode }) => {
  const [opts, setOpts] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolver = useRef<(v: unknown) => void>(() => {});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dialog = useCallback<DialogFn>((o) => {
    // 前のダイアログが開いたままなら キャンセル扱いで閉じる
    resolver.current(null);
    setOpts(o);
    setInputValue(o.input?.value ?? "");
    return new Promise<unknown>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const done = useCallback((v: unknown) => {
    resolver.current(v);
    resolver.current = () => {};
    setOpts(null);
  }, []);

  // opts の有無に <dialog> のモーダル状態を同期する
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (opts && !el.open) {
      el.showModal();
      if (opts.input) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    } else if (!opts && el.open) {
      el.close();
    }
  }, [opts]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (opts?.input) done(inputValue);
    else if (opts?.readFields) done(opts.readFields(new FormData(e.currentTarget)));
    else done(true);
  };

  return (
    <DialogContext.Provider value={dialog}>
      <DialogOpenContext.Provider value={opts !== null}>
        {children}
        {/* ネイティブの Esc 閉じはキャンセル扱い */}
        <dialog
          ref={dialogRef}
          className="dialog"
          aria-labelledby="dialog-title"
          onClose={() => done(null)}
        >
          {opts ? (
            <form className="dialog-body" onSubmit={submit}>
              <h3 id="dialog-title" className="title-md">
                {opts.title}
              </h3>
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
                />
              ) : null}
              {opts.fields ?? null}
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => done(null)}>
                  キャンセル
                </button>
                <button
                  type="submit"
                  className={`btn ${opts.danger ? "btn-danger" : "btn-primary"}`}
                >
                  {opts.okLabel ?? "OK"}
                </button>
              </div>
            </form>
          ) : null}
        </dialog>
      </DialogOpenContext.Provider>
    </DialogContext.Provider>
  );
};
