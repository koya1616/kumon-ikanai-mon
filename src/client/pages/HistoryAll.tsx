// クイズ横断の挑戦履歴ページ (/history)。完了した挑戦を新しい順に並べる。
// 問題単位の掘り下げはクイズ別履歴 (/h/:id) に寄せ、ここでは回遊用の目次に徹する。
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, fmtDuration } from "../api";
import type { AttemptHistoryItem } from "../api";
import { EmptyState, Icon, Skeletons } from "../ui";
import { HistDate } from "./History";

type LoadState =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; items: AttemptHistoryItem[] };

export const HistoryAll = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ name: "loading" });

  useEffect(() => {
    let alive = true;
    api<AttemptHistoryItem[]>(`/api/attempts/recent?limit=50`)
      .then((rows) => {
        if (alive) setState({ name: "ready", items: rows ?? [] });
      })
      .catch((e: Error) => {
        if (alive) setState({ name: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.name === "loading") {
    return (
      <div className="screen">
        <div className="hist-body">
          <Skeletons n={4} />
        </div>
      </div>
    );
  }

  if (state.name === "error") {
    return (
      <div className="screen">
        <div className="hist-body">
          <div className="card card-pad">
            <EmptyState glyph="！" title="履歴を取得できません" sub={state.message} />
          </div>
          <div className="row mt" style={{ justifyContent: "center" }}>
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { items } = state;

  return (
    <div className="screen">
      <div className="hist-body">
        {!items.length ? (
          <div className="card card-pad">
            <EmptyState
              glyph="空"
              title="まだ挑戦履歴がありません"
              sub="クイズに挑戦して完了するとここに記録が残ります。"
            />
          </div>
        ) : (
          <ol className="recent-list">
            {items.map((r) => {
              const pct = r.total ? r.score / r.total : 0;
              return (
                <li key={r.id} className="recent-item">
                  <Link
                    className="recent-main"
                    to={`/play/${r.quizId}`}
                    aria-label={`${r.quizTitle}に挑戦する`}
                  >
                    <div className="grow">
                      <div style={{ fontWeight: 700 }}>{r.quizTitle}</div>
                      <div className="muted">
                        {`${r.categoryTitle} › ${r.topicTitle} · `}
                        <HistDate value={r.completedAt} />
                        {r.durationSec !== null && r.durationSec !== undefined && (
                          <> · {fmtDuration(r.durationSec)}</>
                        )}
                      </div>
                      <div
                        className="history-bar"
                        aria-hidden="true"
                        style={{ maxWidth: 220 }}
                      >
                        <i
                          className={pct >= 0.7 ? "" : pct >= 0.4 ? "is-mid" : "is-low"}
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="recent-score tnum">
                      {r.score}/{r.total}
                    </div>
                    <Icon name="arrow" />
                  </Link>
                  <Link
                    className="btn btn-sm btn-ghost"
                    to={`/h/${r.quizId}`}
                    aria-label={`${r.quizTitle}の履歴を見る`}
                  >
                    履歴
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
