// 共通 UI パーツ: Ring / Stars / Crumbs / EmptyState / Skeletons / Icons / fmtDate。
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { QuizStatus } from "./api";

export const fmtDate = (s: string | null | undefined): string => {
  if (!s) return "";
  const d = new Date(
    String(s).replace(" ", "T") + (String(s).includes("Z") || String(s).includes("+") ? "" : "Z"),
  );
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

type RingTone = "is-good" | "is-mid" | "is-bad" | "is-full";

/** pct: 0..1。tone 省略時は pct から自動判定 (旧 isFull=true 互換で "is-full" 指定可)。 */
export const Ring = ({
  pct,
  label,
  size,
  tone,
}: {
  pct: number;
  label: ReactNode;
  size?: string;
  tone?: RingTone | boolean;
}) => {
  const r = 24;
  const c = 2 * Math.PI * r;
  const resolved: RingTone =
    tone === true
      ? "is-full"
      : typeof tone === "string"
        ? tone
        : pct >= 1
          ? "is-full"
          : pct >= 0.7
            ? "is-good"
            : pct >= 0.4
              ? "is-mid"
              : "is-bad";
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setOffset(c * (1 - Math.max(0, Math.min(1, pct))));
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [c, pct]);
  return (
    <div className={`ring${size ? ` ${size}` : ""}`}>
      <svg viewBox="0 0 56 56">
        <circle className="ring-bg" cx="28" cy="28" r={r} />
        <circle
          className={`ring-fg ${resolved}`}
          cx="28"
          cy="28"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-label">{label}</div>
    </div>
  );
};

export const Stars = ({ n }: { n: number }) => {
  return (
    <span className="stars" aria-label={`難易度${n}`}>
      {"★".repeat(n)}
      <span className="stars-dim">{"★".repeat(5 - n)}</span>
    </span>
  );
};

export const Crumbs = ({ items }: { items: { label: string; href?: string | null }[] }) => {
  return (
    <nav className="crumbs" aria-label="パンくず">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span className="sep">›</span>}
          {it.href ? <Link to={it.href}>{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
};

export const EmptyState = ({
  glyph,
  title,
  sub,
}: {
  glyph: string;
  title: string;
  sub?: string;
}) => {
  return (
    <div className="empty">
      <div className="empty-glyph">{glyph}</div>
      <h3>{title}</h3>
      {sub ? <p className="muted">{sub}</p> : null}
    </div>
  );
};

export const Skeletons = ({ n }: { n: number }) => {
  return (
    <div className="stack">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
};

const STATUS_MAP: Record<QuizStatus, [string, string]> = {
  published: ["公開中", "chip-moegi"],
  draft: ["下書き", "chip-yamabuki"],
  archived: ["公開終了", "chip-outline"],
};

export const StatusChip = ({ status }: { status: QuizStatus }) => {
  const [label, cls] = STATUS_MAP[status] ?? [status, ""];
  return <span className={`chip ${cls}`}>{label}</span>;
};

const SvgPaths = ({ d }: { d: string[] }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.map((p, i) =>
        p.startsWith("CIRCLE:") ? <circle key={i} cx="11" cy="11" r="7" /> : <path key={i} d={p} />,
      )}
    </svg>
  );
};

export const Icon = ({
  name,
}: {
  name: "search" | "arrow" | "close" | "plus" | "home" | "admin";
}) => {
  switch (name) {
    case "home":
      return (
        <span aria-hidden="true">
          <SvgPaths d={["M3 11.5 12 4l9 7.5", "M5 10v10h5v-6h4v6h5V10"]} />
        </span>
      );
    case "admin":
      return (
        <span aria-hidden="true">
          <SvgPaths d={["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]} />
        </span>
      );
    case "search":
      return (
        <span className="row" aria-hidden="true">
          <SvgPaths d={["CIRCLE:", "m20 20-3.5-3.5"]} />
        </span>
      );
    case "arrow":
      return (
        <span className="cat-card-arrow" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      );
    case "close":
      return <SvgPaths d={["M6 6l12 12M18 6 6 18"]} />;
    case "plus":
      return <SvgPaths d={["M12 5v14M5 12h14"]} />;
  }
};
