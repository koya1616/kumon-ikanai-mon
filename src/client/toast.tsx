// トースト通知。シェルの #toasts へポータル描画する。
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ToastKind = "" | "ok" | "ng";

interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
  leaving: boolean;
}

type ToastFn = (msg: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastFn>(() => {});

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback<ToastFn>((msg, kind = "") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, msg, kind, leaving: false }]);
    setTimeout(() => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 220);
    }, 2800);
  }, []);

  const box = typeof document !== "undefined" ? document.getElementById("toasts") : null;

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {box
        ? createPortal(
            items.map((t) => (
              <div
                key={t.id}
                role="status"
                className={`toast${t.kind ? ` toast-${t.kind}` : ""}${t.leaving ? " is-leaving" : ""}`}
              >
                {t.msg}
              </div>
            )),
            box,
          )
        : null}
    </ToastContext.Provider>
  );
};
