import { useEffect, useState } from "react";
import { Link } from "react-router";
import { categoryStats, useTree } from "../tree";
import { EmptyState, Icon, Ring, Skeletons } from "../ui";
import type { AttemptState, CategoryTreeNode } from "../api";
import { api } from "../api";
import { clearResume, listResumes } from "../resume";

interface InProgress {
  quizId: number;
  attemptId: number;
  done: number;
  total: number;
}

/** 苦手件数: 練習モードへの導線用。失敗しても導線自体は隠さない。 */
const useMistakeCount = (): number | null => {
  const [mistakeCount, setMistakeCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ items: unknown[] }>(`/api/review/mistakes?limit=30`)
      .then((d) => {
        if (alive) setMistakeCount((d.items ?? []).length);
      })
      .catch(() => {
        if (alive) setMistakeCount(null);
      });
    return () => {
      alive = false;
    };
  }, []);
  return mistakeCount;
};

// 回答途中のクイズ: このブラウザの localStorage (kmon:resume:*) を列挙し、
// サーバ状態で未完了かつ 1問以上回答ずみ・全問未満のものだけ残す。
// Play の再開判定 (answers 0件は新規扱い) と合わせる。
const useResumable = (tree: CategoryTreeNode[] | null): InProgress[] | null => {
  const [inProgress, setInProgress] = useState<InProgress[] | null>(null);
  useEffect(() => {
    if (!tree) return;
    let alive = true;
    const saved = listResumes();
    if (!saved.length) {
      setInProgress([]);
      return;
    }
    void Promise.all(
      saved.map(async (r): Promise<InProgress | null> => {
        try {
          const st = await api<AttemptState>(`/api/attempts/${r.attemptId}`);
          if (
            !st ||
            st.completedAt ||
            st.quizId !== r.quizId ||
            !st.questions?.length ||
            st.questions.length !== r.order.length
          ) {
            if (st?.completedAt) clearResume(r.quizId);
            return null;
          }
          const done = st.answers?.length ?? 0;
          if (done < 1 || done >= st.questions.length) return null;
          return { quizId: r.quizId, attemptId: r.attemptId, done, total: st.questions.length };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (alive) setInProgress(rows.filter((r): r is InProgress => r !== null));
    });
    return () => {
      alive = false;
    };
  }, [tree]);
  return inProgress;
};

export const Home = () => {
  const { loadTree, summary, findQuiz } = useTree();
  const [tree, setTree] = useState<CategoryTreeNode[] | null>(null);
  const mistakeCount = useMistakeCount();
  const inProgress = useResumable(tree);

  useEffect(() => {
    let alive = true;
    loadTree(true).then((t) => {
      if (alive) setTree(t);
    });
    return () => {
      alive = false;
    };
  }, [loadTree]);

  if (!tree) {
    return (
      <div className="screen home-screen">
        <div className="home-body">
          <Skeletons n={3} />
        </div>
      </div>
    );
  }

  // summary は loadTree 後に更新されるため、最新の summary で再計算される
  const statsOf = (c: CategoryTreeNode) => categoryStats(c, summary);

  const resumable = (inProgress ?? []).flatMap((p) => {
    const f = findQuiz(p.quizId);
    return f ? [{ ...p, ...f }] : [];
  });

  return (
    <div className="screen home-screen">
      <div className="home-body">
        {!tree.length ? (
          <>
            <div className="card card-pad">
              <EmptyState
                glyph="空"
                title="まだカテゴリがありません"
                sub="管理画面からカテゴリ・トピック・クイズを作成してください。"
              />
            </div>
            <div className="row mt" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary" to="/admin">
                管理画面へ
              </Link>
            </div>
          </>
        ) : (
          <>
            <ShortcutRow mistakeCount={mistakeCount} />
            {resumable.length > 0 && <ResumeSection resumable={resumable} />}
            <CategoryGrid tree={tree} statsOf={statsOf} />
          </>
        )}
      </div>
    </div>
  );
};

/**
 * 自習ショートカット行: 復習・ブックマーク・履歴への小型導線。
 * デスクトップ幅 (1020px+) ではサイドバーに同導線があるため CSS で非表示になる。
 */
const HistoryShortcut = () => (
  <Link className="shortcut-card" to="/history" aria-label="挑戦履歴をすべて見る">
    <span className="shortcut-glyph" aria-hidden="true">
      歴
    </span>
    <span className="grow">
      <span className="shortcut-title">履歴</span>
      <span className="muted">過去の挑戦記録を見る</span>
    </span>
    <Icon name="arrow" />
  </Link>
);

const BookmarkShortcut = () => (
  <Link className="shortcut-card" to="/bookmarks" aria-label="ブックマークした問題を見る">
    <span className="shortcut-glyph" aria-hidden="true">
      ★
    </span>
    <span className="grow">
      <span className="shortcut-title">ブックマーク</span>
      <span className="muted">保存した問題を復習</span>
    </span>
    <Icon name="arrow" />
  </Link>
);

const ShortcutRow = ({ mistakeCount }: { mistakeCount: number | null }) => {
  if (mistakeCount !== null && mistakeCount <= 0) {
    return (
      <section className="home-shortcuts" aria-label="自習ショートカット">
        <div className="shortcut-grid">
          <BookmarkShortcut />
          <HistoryShortcut />
        </div>
      </section>
    );
  }
  return (
    <section className="home-shortcuts" aria-label="自習ショートカット">
      <div className="shortcut-grid">
        <Link
          className="shortcut-card"
          to="/review"
          aria-label="苦手だけ復習する（練習・成績に残りません）"
        >
          <span className="shortcut-glyph" aria-hidden="true">
            弱
          </span>
          <span className="grow">
            <span className="shortcut-title">
              苦手だけ復習
              {mistakeCount !== null && mistakeCount > 0 && (
                <span className="chip chip-shu">{mistakeCount}問</span>
              )}
            </span>
            <span className="muted">練習なので成績に残りません</span>
          </span>
          <Icon name="arrow" />
        </Link>
        <BookmarkShortcut />
        <HistoryShortcut />
      </div>
    </section>
  );
};

type ResumableItem = InProgress & NonNullable<ReturnType<ReturnType<typeof useTree>["findQuiz"]>>;

/** 次の一手: 回答途中のクイズをすべて表示する。 */
const ResumeSection = ({ resumable }: { resumable: ResumableItem[] }) => {
  if (!resumable.length) return null;
  return (
    <section aria-label="回答途中">
      <div className="section-head">
        <h2 className="title-md">つづきから</h2>
        <span className="chip chip-shu">{resumable.length} 件</span>
      </div>
      <div className="resume-grid">
        {resumable.map((p) => (
          <ResumeCard key={p.quizId} p={p} />
        ))}
      </div>
    </section>
  );
};

const ResumeCard = ({ p }: { p: ResumableItem }) => {
  return (
    <Link key={p.quizId} className="resume-item" to={`/play/${p.quizId}`}>
      <div className="grow">
        <div style={{ fontWeight: 700 }}>{p.quiz.title}</div>
        <div className="muted">{`${p.category.title} › ${p.topic.title}`}</div>
        <div className="resume-bar" aria-hidden="true" style={{ marginTop: 8 }}>
          <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
        </div>
        <div className="muted tnum" style={{ marginTop: 4 }}>
          {p.done} / {p.total} 問まで回答ずみ
        </div>
      </div>
      <span className="chip chip-moegi">▶ つづきから</span>
      <Icon name="arrow" />
    </Link>
  );
};

/** 主役: カテゴリ選択グリッド。 */
const CategoryGrid = ({
  tree,
  statsOf,
}: {
  tree: CategoryTreeNode[];
  statsOf: (c: CategoryTreeNode) => { total: number; tried: number; perfect: number; mastery: number };
}) => {
  return (
    <section aria-label="カテゴリ">
      <div className="section-head">
        <h2 className="title-md">カテゴリ</h2>
      </div>
      <div className="cat-grid">
        {tree.map((c) => {
          const s = statsOf(c);
          return (
            <Link key={c.id} className="cat-card" to={`/c/${c.id}`}>
              <Ring
                pct={s.mastery / 100}
                label={`${s.mastery}%`}
                tone={s.total > 0 && s.perfect === s.total}
              />
              <div className="cat-card-body">
                <div className="cat-card-title">{c.title}</div>
                <div className="cat-card-meta">
                  {c.topics.length}トピック · {s.total}クイズ
                </div>
              </div>
              <Icon name="arrow" />
            </Link>
          );
        })}
      </div>
    </section>
  );
};

