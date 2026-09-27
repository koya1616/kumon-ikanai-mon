// 汎用リッチセレクト: 標準 select では表現できない件数チップ・進捗バー・
// ステータスドット・検索絞り込み付きのカスタム listbox。
// 管理ステップのカテゴリ/トピック/クイズ切替 + 今後の他画面置換用。
import { useEffect, useId, useRef, useState } from "react";

export type RichStatus = "ok" | "warn" | "bad" | "muted";

export interface RichOption<V extends string | number> {
  value: V;
  label: string;
  /** 2行目の補足 (トピック名・公開状態など) */
  sub?: string | undefined;
  /** 右端チップ (例: "3Q" / "7/10") */
  countText?: string | undefined;
  countStatus?: RichStatus | undefined;
  /** 0..1。渡すと候補行にミニ進捗バー + 先頭ドットが出る */
  progress?: number | undefined;
  /** 検索対象の追加語句 */
  keywords?: string | undefined;
  disabled?: boolean | undefined;
}

interface RichSelectProps<V extends string | number> {
  value: V | "";
  options: RichOption<V>[];
  onChange: (v: V | "") => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  /** false で検索入力を隠す。既定は候補が6件超で自動表示 */
  searchable?: boolean;
  /** true で選択解除 ✕ を出す */
  clearable?: boolean;
  size?: "sm" | "md";
}

const norm = (s: string): string => s.trim().toLowerCase();

const matches = (o: RichOption<string | number>, q: string): boolean => {
  const v = norm(q);
  if (!v) return true;
  const parts = v.split(/\s+/).filter(Boolean);
  const hay = [o.label, o.sub, o.countText, o.keywords].filter(Boolean).join(" ").toLowerCase();
  return parts.every((p) => hay.includes(p));
};

export const RichSelect = <V extends string | number>({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  searchable,
  clearable,
  size = "sm",
}: RichSelectProps<V>) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const selected = options.find((o) => o.value === value);
  const showSearch = searchable ?? options.length > 6;
  const filtered = options.filter((o) => matches(o, q));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setQ("");
    setActive(0);
  }, [value]);

  useEffect(() => {
    if (open) {
      setActive(0);
      if (showSearch) {
        // ポップ直後に検索へフォーカス (トリガー経由のEnter連打と競合しないよう1フレーム遅らせる)
        const raf = requestAnimationFrame(() => searchRef.current?.focus());
        return () => cancelAnimationFrame(raf);
      }
    }
  }, [open, showSearch]);

  useEffect(() => {
    // アクティブ候補へ追従スクロール
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (v: V | "") => {
    onChange(v);
    setOpen(false);
  };

  const stepActive = (dir: 1 | -1) => {
    if (!filtered.length) return;
    setActive((a) => {
      // disabled 行は飛ばす
      for (let i = 0; i < filtered.length; i++) {
        const n = (a + dir * (i + 1) + filtered.length * (i + 1)) % filtered.length;
        if (!filtered[n]?.disabled) return n;
      }
      return a;
    });
  };

  return (
    <div
      ref={boxRef}
      className={`rich-select is-${size}${disabled ? " is-disabled" : ""}${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className="rich-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected?.progress != null && (
          <span className={`rich-dot is-${selected.countStatus ?? "muted"}`} aria-hidden="true" />
        )}
        <span className="rich-trigger-body">
          {selected ? (
            <>
              <span className="rich-trigger-label">{selected.label}</span>
              {selected.sub && <span className="rich-trigger-sub">{selected.sub}</span>}
            </>
          ) : (
            <span className="rich-trigger-placeholder">{placeholder}</span>
          )}
        </span>
        {selected?.countText && (
          <span className={`rich-count is-${selected.countStatus ?? "muted"}`}>
            {selected.countText}
          </span>
        )}
        {clearable && value !== "" && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`${ariaLabel}の選択を解除`}
            className="rich-clear"
            onClick={(e) => {
              e.stopPropagation();
              commit("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                commit("");
              }
            }}
          >
            ✕
          </span>
        )}
        <svg
          className="rich-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="card rich-pop" role="dialog" aria-label={ariaLabel}>
          {showSearch && (
            <div className="rich-search">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                placeholder="絞り込む…"
                aria-label={`${ariaLabel}を絞り込む`}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    stepActive(1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    stepActive(-1);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const f = filtered[active] ?? filtered.find((o) => !o.disabled);
                    if (f && !f.disabled) commit(f.value);
                  }
                }}
              />
              {q && (
                <button
                  type="button"
                  className="rich-search-clear"
                  aria-label="絞り込みを消す"
                  onClick={() => setQ("")}
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <div ref={listRef} className="rich-list" role="listbox" aria-label={ariaLabel}>
            {filtered.length === 0 && <p className="muted rich-empty">一致しません</p>}
            {filtered.map((o, i) => {
              const id = `${baseId}-opt-${i}`;
              const isSel = o.value === value;
              const isActive = i === active;
              return (
                <button
                  key={`${o.value}`}
                  id={id}
                  data-idx={i}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  disabled={o.disabled}
                  className={`rich-option${isActive ? " is-active" : ""}${isSel ? " is-selected" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    if (!o.disabled) commit(o.value);
                  }}
                >
                  {o.progress != null ? (
                    <span
                      className={`rich-dot is-${o.countStatus ?? "muted"}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="rich-dot is-none" aria-hidden="true" />
                  )}
                  <span className="grow">
                    <span className="rich-option-label">{o.label}</span>
                    {o.sub && <span className="rich-option-sub">{o.sub}</span>}
                    {o.progress != null && (
                      <span className="rich-bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(o.progress * 100)}%` }} />
                      </span>
                    )}
                  </span>
                  {o.countText && (
                    <span className={`rich-count is-${o.countStatus ?? "muted"}`}>
                      {o.countText}
                    </span>
                  )}
                  {isSel && (
                    <span className="rich-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="muted rich-foot">
            {filtered.length}/{options.length}件{showSearch && q ? " · 入力で絞り込み中" : ""}
            {options.length === 0 ? " · 候補がありません" : ""}
          </p>
        </div>
      )}
    </div>
  );
};
