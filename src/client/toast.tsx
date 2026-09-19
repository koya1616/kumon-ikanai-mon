// トースト通知。コンテナも含めて React ツリー内で描画する。
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type ToastKind = "" | "ok" | "ng";

interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
  leaving: boolean;
}

type ToastFn = (msg: string, kind?: ToastKind) => void;

const SHOW_MS = 2800;
const LEAVE_MS = 220;

const ToastContext = createContext<ToastFn>(() => {});

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  // アンマウント時に保留中のタイマーを破棄する
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timersRef.current.delete(t);
      fn();
    }, ms);
    timersRef.current.add(t);
  }, []);

  const toast = useCallback<ToastFn>(
    (msg, kind = "") => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, msg, kind, leaving: false }]);
      later(() => {
        setItems((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        later(() => setItems((prev) => prev.filter((t) => t.id !== id)), LEAVE_MS);
      }, SHOW_MS);
    },
    [later],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="assertive">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast${t.kind ? ` toast-${t.kind}` : ""}${t.leaving ? " is-leaving" : ""}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
