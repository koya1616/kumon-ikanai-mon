// 読み込み・エラー・タブ・検索・進捗の共通 UI。
// Bookmarks / History / HistoryAll / Review / Category / Home の定型を集約する。
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { EmptyState, Icon, Skeletons } from "../ui";
import type { LoadState } from "../hooks/useAsync";

export const BackButton = ({ label = "戻る" }: { label?: string }) => {
  const navigate = useNavigate();
  return (
    <button type="button" className="btn" onClick={() => navigate(-1)}>
      {label}
    </button>
  );
};

/** loading → Skeletons / error → EmptyState + 戻る の定型 */
export const LoadFallback = ({
  state,
  skeletonN = 4,
  errorTitle,
}: {
  state: LoadState<unknown>;
  skeletonN?: number;
  errorTitle: string;
}) => {
  if (state.name === "loading") {
    return (
      <div className="screen">
        <div className="hist-body">
          <Skeletons n={skeletonN} />
        </div>
      </div>
    );
  }
  if (state.name === "error") {
    return (
      <div className="screen">
        <div className="hist-body">
          <div className="card card-pad">
            <EmptyState glyph="！" title={errorTitle} sub={state.message} />
          </div>
          <div className="actions actions-center">
            <BackButton />
          </div>
        </div>
      </div>
    );
  }
  return null;
};

/** hx-tabs の汎用版 */
export const Tabs = <T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (t: T) => void;
}) => (
  <div className="hx-tabs" role="tablist">
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        role="tab"
        aria-selected={active === t.id}
        className="hx-tab"
        onClick={() => onChange(t.id)}
      >
        {t.label}
      </button>
    ))}
  </div>
);

/** 検索ツールバー (虫眼鏡 + search input + クリア) */
export const SearchBox = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
}) => (
  <div className="search">
    <Icon name="search" />
    <input
      type="search"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    {value && (
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => onChange("")}
        aria-label="検索を取り消す"
      >
        <Icon name="close" />
      </button>
    )}
  </div>
);

/** 進捗バー (resume-bar / drill-progress / history-bar の共通形) */
export const ProgressBar = ({
  done,
  total,
  className = "resume-bar",
}: {
  done: number;
  total: number;
  className?: string;
}) => (
  <div className={className} aria-hidden="true">
    <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
  </div>
);

/** 正誤ドット列 (Play / Review の .play-dots) */
export const AnswerDots = ({
  results,
  index,
}: {
  results: (boolean | null | undefined)[];
  index: number;
}) => (
  <div className="play-dots" aria-hidden="true">
    {results.map((r, i) => (
      <span
        key={i}
        className={`play-dot${r === true ? " is-ok" : r === false ? " is-ng" : i === index ? " is-now" : ""}`}
      />
    ))}
  </div>
);

/** 絞り込み結果の件数バッジ */
export const CountBadge = ({ children }: { children: ReactNode }) => (
  <span className="bm-count tnum" aria-live="polite">
    {children}
  </span>
);
