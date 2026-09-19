import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api";
import { categoryStats, useTree } from "../tree";
import { EmptyState, Icon, Ring, Skeletons } from "../ui";
import { DifficultyFilter, QuizRow } from "../components/QuizRow";
import type { AttemptState, CategoryTreeNode, Quiz } from "../api";
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
            <div className="actions actions-center">
              <Link className="btn btn-primary" to="/admin">
                管理画面へ
              </Link>
            </div>
          </>
        ) : (
          <>
            <ShortcutRow mistakeCount={mistakeCount} />
            {resumable.length > 0 && <ResumeSection resumable={resumable} />}
            <HomeTabs tree={tree} statsOf={statsOf} />
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

/** ホームのタブ切り替え: カテゴリ一覧 / トピック一覧 / クイズ一覧。 */
type HomeTab = "categories" | "topics" | "quizzes";

const HomeTabs = ({
  tree,
  statsOf,
}: {
  tree: CategoryTreeNode[];
  statsOf: (c: CategoryTreeNode) => {
    total: number;
    tried: number;
    perfect: number;
    mastery: number;
  };
}) => {
  const [tab, setTab] = useState<HomeTab>("categories");
  const [kw, setKw] = useState("");
  const [diff, setDiff] = useState(0);
  const [onlyUntried, setOnlyUntried] = useState(false);
  const { summary } = useTree();
  const keyword = kw.trim();

  const topics = useMemo(
    () =>
      tree.flatMap((c) =>
        c.topics.map((t) => ({ ...t, categoryId: c.id, categoryTitle: c.title })),
      ),
    [tree],
  );
  const quizzes = useMemo(
    () =>
      tree.flatMap((c) =>
        c.topics.flatMap((t) =>
          t.quizzes.map((q) => ({
            ...q,
            categoryId: c.id,
            categoryTitle: c.title,
            topicId: t.id,
            topicTitle: t.title,
          })),
        ),
      ),
    [tree],
  );

  const filteredTopics = keyword
    ? topics.filter((t) => t.title.includes(keyword) || t.categoryTitle.includes(keyword))
    : topics;
  const filteredQuizzes = quizzes.filter(
    (q) =>
      (!keyword ||
        q.title.includes(keyword) ||
        q.topicTitle.includes(keyword) ||
        q.categoryTitle.includes(keyword)) &&
      (!diff || q.difficulty === diff) &&
      (!onlyUntried || !summary[q.id]?.attemptCount),
  );
  const quizFiltering = keyword !== "" || diff !== 0 || onlyUntried;
  const clearQuizFilter = () => {
    setKw("");
    setDiff(0);
    setOnlyUntried(false);
  };

  return (
    <section aria-label="一覧切り替え">
      <div className="hx-tabs" role="tablist" aria-label="カテゴリ・トピック・クイズ">
        {(
          [
            { id: "categories", label: `カテゴリ(${tree.length})` },
            { id: "topics", label: `トピック(${topics.length})` },
            { id: "quizzes", label: `クイズ(${quizzes.length})` },
          ] as { id: HomeTab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="hx-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab !== "categories" && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="search">
            <Icon name="search" />
            <input
              type="search"
              placeholder={tab === "topics" ? "トピック名で検索" : "クイズ名で検索"}
              aria-label={tab === "topics" ? "トピックを検索" : "クイズを検索"}
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
          </div>
          {tab === "quizzes" && (
            <>
              <DifficultyFilter value={diff} onChange={setDiff} />
              <div role="group" aria-label="実施状態で絞り込み">
                <button
                  type="button"
                  className="chip chip-btn"
                  aria-pressed={onlyUntried ? "true" : "false"}
                  onClick={() => setOnlyUntried((v) => !v)}
                >
                  未実施のみ
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div role="tabpanel">
        {tab === "categories" && <CategoryGrid tree={tree} statsOf={statsOf} />}
        {tab === "topics" && <TopicList topics={filteredTopics} />}
        {tab === "quizzes" && (
          <QuizList quizzes={filteredQuizzes} hasFilter={quizFiltering} onClear={clearQuizFilter} />
        )}
      </div>
    </section>
  );
};

type TopicWithCategory = {
  id: number;
  categoryId: number;
  title: string;
  categoryTitle: string;
  quizzes: Quiz[];
};

/** フラットなトピック一覧。選択で所属カテゴリへ移動する。 */
const TopicList = ({ topics }: { topics: TopicWithCategory[] }) => {
  if (!topics.length) {
    return (
      <div className="card card-pad">
        <EmptyState
          glyph="無"
          title="該当するトピックがありません"
          sub="検索条件を変えてみてください。"
        />
      </div>
    );
  }
  return (
    <div className="cat-grid">
      {topics.map((t) => (
        <Link key={t.id} className="cat-card" to={`/c/${t.categoryId}`}>
          <div className="cat-card-body">
            <div className="muted">{t.categoryTitle}</div>
            <div className="cat-card-title">{t.title}</div>
            <div className="cat-card-meta">{t.quizzes.length}クイズ</div>
          </div>
          <Icon name="arrow" />
        </Link>
      ))}
    </div>
  );
};

type QuizWithPath = Quiz & { categoryTitle: string; topicTitle: string };

/** フラットなクイズ一覧。Category の行表示を再利用する。 */
const QuizList = ({
  quizzes,
  hasFilter,
  onClear,
}: {
  quizzes: QuizWithPath[];
  hasFilter: boolean;
  onClear?: () => void;
}) => {
  const navigate = useNavigate();
  if (!quizzes.length) {
    return (
      <div className="card card-pad">
        <EmptyState
          glyph="無"
          title="該当するクイズがありません"
          sub={
            hasFilter ? "検索条件を変えてみてください。" : "管理画面でクイズを追加してください。"
          }
        />
        {hasFilter && onClear && (
          <div className="actions actions-center">
            <button type="button" className="btn" onClick={onClear}>
              絞り込みをクリア
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="quiz-list">
      {quizzes.map((q) => (
        <QuizRow
          key={q.id}
          quiz={q}
          meta={
            <span>
              {q.categoryTitle} › {q.topicTitle}
            </span>
          }
          onPlay={() => navigate(`/play/${q.id}`)}
        />
      ))}
    </div>
  );
};

/** 主役: カテゴリ選択グリッド。 */
const CategoryGrid = ({
  tree,
  statsOf,
}: {
  tree: CategoryTreeNode[];
  statsOf: (c: CategoryTreeNode) => {
    total: number;
    tried: number;
    perfect: number;
    mastery: number;
  };
}) => {
  return (
    <section aria-label="カテゴリ">
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
