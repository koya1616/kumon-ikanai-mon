import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { api, QUESTIONS_PER_QUIZ } from "../api";
import type { Category, Quiz, QuizStatus, Topic } from "../api";
import { useDialog } from "../dialog";
import { Crumbs, EmptyState, Icon, Skeletons, Stars, StatusChip } from "../ui";
import { useToast } from "../toast";
import { useTree } from "../tree";
import { JsonImportCard } from "./JsonImport";
import { QuestionEditor } from "./QuestionEditor";

type Kind = "" | "c" | "t" | "q";

interface Selection {
  categories: Category[];
  topics: Topic[];
  quizzes: Quiz[];
  catId: number | null;
  topicId: number | null;
  quizId: number | null;
}

export const Admin = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const toast = useToast();
  const dialog = useDialog();
  const { invalidate } = useTree();

  const kind: Kind = location.pathname.startsWith("/admin/c/")
    ? "c"
    : location.pathname.startsWith("/admin/t/")
      ? "t"
      : location.pathname.startsWith("/admin/q/")
        ? "q"
        : "";
  const id = Number(params.id);

  const [sel, setSel] = useState<Selection | null>(null);

  const resolveSelection = useCallback(async () => {
    const cats = await api<Category[]>("/api/categories");
    const next: Selection = {
      categories: cats,
      topics: [],
      quizzes: [],
      catId: null,
      topicId: null,
      quizId: null,
    };
    if (kind === "c") {
      next.catId = id;
      next.topics = await api<Topic[]>(`/api/topics?categoryId=${id}`);
    } else if (kind === "t") {
      const all = await api<Topic[]>("/api/topics");
      const t = all.find((x) => x.id === id);
      if (t) {
        next.catId = t.categoryId;
        next.topicId = t.id;
        next.topics = await api<Topic[]>(`/api/topics?categoryId=${t.categoryId}`);
        next.quizzes = await api<Quiz[]>(`/api/quizzes?topicId=${t.id}`);
      }
    } else if (kind === "q") {
      const all = await api<Quiz[]>("/api/quizzes");
      const q = all.find((x) => x.id === id);
      if (q) {
        next.quizId = q.id;
        next.topicId = q.topicId;
        next.catId = q.categoryId ?? null;
        if (next.catId != null) {
          next.topics = await api<Topic[]>(`/api/topics?categoryId=${next.catId}`);
        }
        next.quizzes = await api<Quiz[]>(`/api/quizzes?topicId=${q.topicId}`);
      }
    }
    setSel(next);
  }, [kind, id]);

  useEffect(() => {
    let alive = true;
    setSel(null);
    resolveSelection().catch(() => {
      if (alive) {
        setSel({
          categories: [],
          topics: [],
          quizzes: [],
          catId: null,
          topicId: null,
          quizId: null,
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [resolveSelection]);

  const refreshAll = useCallback(async () => {
    invalidate();
    await resolveSelection();
  }, [invalidate, resolveSelection]);

  const renameEntity = useCallback(
    (title: string, current: string, path: string) => {
      dialog({ title, input: { value: current }, okLabel: "保存" }).then((v) => {
        if (v == null) return;
        const name = String(v).trim();
        if (!name) {
          toast("名前を入力してください", "ng");
          return;
        }
        api(path, { method: "PUT", body: { title: name } })
          .then(() => {
            toast("保存しました", "ok");
            void refreshAll();
          })
          .catch((e: Error) => toast(e.message, "ng"));
      });
    },
    [dialog, toast, refreshAll],
  );

  const deleteEntity = useCallback(
    (title: string, message: string, path: string, after: string) => {
      dialog({ title, message, okLabel: "削除する", danger: true }).then((yes) => {
        if (!yes) return;
        api(path, { method: "DELETE" })
          .then(() => {
            toast("削除しました", "ok");
            invalidate();
            navigate(after);
          })
          .catch((e: Error) => toast(e.message, "ng"));
      });
    },
    [dialog, toast, invalidate, navigate],
  );

  const editQuizDialog = useCallback(
    (q: Quiz) => {
      dialog({
        title: "クイズの設定",
        okLabel: "保存",
        fields: (setValue) => <QuizSettingsFields quiz={q} setValue={setValue} />,
      }).then((v) => {
        if (!v) return;
        const { title, difficulty, status } = v as {
          title: string;
          difficulty: number;
          status: QuizStatus;
        };
        if (!title) {
          toast("クイズ名を入力してください", "ng");
          return;
        }
        api(`/api/quizzes/${q.id}`, { method: "PUT", body: { title, difficulty, status } })
          .then(() => {
            toast("保存しました", "ok");
            void refreshAll();
          })
          .catch((e: Error) => toast(e.message, "ng"));
      });
    },
    [dialog, toast, refreshAll],
  );

  return (
    <div className="screen">
      <div className="admin">
        <aside className="admin-side">{!sel ? <Skeletons n={2} /> : <AdminSide sel={sel} />}</aside>
        <div className="admin-main">
          {!sel ? (
            <Skeletons n={2} />
          ) : (
            <AdminMain
              sel={sel}
              kind={kind}
              onRename={renameEntity}
              onDelete={deleteEntity}
              onEditQuiz={editQuizDialog}
              onRefresh={refreshAll}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const AddForm = ({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (title: string) => Promise<void>;
}) => {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    onAdd(v)
      .then(() => setValue(""))
      .catch((e: Error) => toast(e.message, "ng"))
      .finally(() => setBusy(false));
  };
  return (
    <div className="tree-add">
      <input
        className="input"
        placeholder={placeholder}
        maxLength={100}
        aria-label={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        className="btn btn-icon btn-ink"
        aria-label="追加"
        disabled={busy}
        onClick={submit}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
};

const AdminSide = ({ sel }: { sel: Selection }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const cat = sel.categories.find((c) => c.id === sel.catId);
  return (
    <>
      <div className="card card-pad">
        <div className="side-title">
          <span>カテゴリ</span>
          <span>{sel.categories.length}件</span>
        </div>
        <div className="tree-level" role="list">
          {sel.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="tree-item"
              role="listitem"
              aria-current={sel.catId === c.id ? "true" : undefined}
              onClick={() => navigate(`/admin/c/${c.id}`)}
            >
              <span className="grow">{c.title}</span>
              <span className="count">{c.quizCount ?? 0}Q</span>
            </button>
          ))}
          {!sel.categories.length && <p className="muted">まだありません</p>}
        </div>
        <AddForm
          placeholder="新しいカテゴリ"
          onAdd={(title) =>
            api<{ id: number }>("/api/categories", { method: "POST", body: { title } }).then(
              (r) => {
                toast("カテゴリを追加しました", "ok");
                navigate(`/admin/c/${r.id}`);
              },
            )
          }
        />
      </div>

      {sel.catId != null && (
        <div className="card card-pad">
          <div className="side-title">
            <span>{(cat?.title ?? "") + " のトピック"}</span>
            <span>{sel.topics.length}件</span>
          </div>
          <div className="tree-level" role="list">
            {sel.topics.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tree-item"
                role="listitem"
                aria-current={sel.topicId === t.id ? "true" : undefined}
                onClick={() => navigate(`/admin/t/${t.id}`)}
              >
                <span className="grow">{t.title}</span>
                <span className="count">{t.quizCount ?? 0}Q</span>
              </button>
            ))}
            {!sel.topics.length && <p className="muted">まだありません</p>}
          </div>
          <AddForm
            placeholder="新しいトピック"
            onAdd={(title) =>
              api<{ id: number }>("/api/topics", {
                method: "POST",
                body: { categoryId: sel.catId, title },
              }).then((r) => {
                toast("トピックを追加しました", "ok");
                navigate(`/admin/t/${r.id}`);
              })
            }
          />
        </div>
      )}
    </>
  );
};

const EntityHead = ({
  kind,
  title,
  actions,
  extra,
}: {
  kind: string;
  title: string;
  actions: { label: string; danger?: boolean; fn: () => void }[];
  extra?: React.ReactNode;
}) => {
  return (
    <header className="entity-head">
      <div className="grow">
        <span className="eyebrow">{kind}</span>
        <h1 className="title-lg">{title}</h1>
        {extra}
      </div>
      <div className="entity-actions">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={`btn btn-sm ${a.danger ? "btn-danger" : ""}`}
            onClick={a.fn}
          >
            {a.label}
          </button>
        ))}
      </div>
    </header>
  );
};

const DifficultySelect = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) => {
  return (
    <select
      className="select"
      aria-label="難易度"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          ★{n}
        </option>
      ))}
    </select>
  );
};

const StatusSelect = ({
  value,
  onChange,
}: {
  value: QuizStatus;
  onChange: (s: QuizStatus) => void;
}) => {
  return (
    <select
      className="select"
      aria-label="公開状態"
      value={value}
      onChange={(e) => onChange(e.target.value as QuizStatus)}
    >
      <option value="published">公開中</option>
      <option value="draft">下書き</option>
      <option value="archived">公開終了</option>
    </select>
  );
};

const QuizSettingsFields = ({ quiz, setValue }: { quiz: Quiz; setValue: (v: unknown) => void }) => {
  const [title, setTitle] = useState(quiz.title);
  const [difficulty, setDifficulty] = useState(quiz.difficulty);
  const [status, setStatus] = useState<QuizStatus>(quiz.status);
  const stateRef = useRef({ title, difficulty, status });
  stateRef.current = { title, difficulty, status };
  useEffect(() => {
    setValue(() => ({
      title: stateRef.current.title.trim(),
      difficulty: stateRef.current.difficulty,
      status: stateRef.current.status,
    }));
  }, [setValue, title, difficulty, status]);
  return (
    <div className="form-grid">
      <label className="field">
        <span className="label">クイズ名</span>
        <input
          className="input"
          value={title}
          maxLength={100}
          aria-label="クイズ名"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="form-grid cols-2">
        <label className="field">
          <span className="label">難易度</span>
          <DifficultySelect value={difficulty} onChange={setDifficulty} />
        </label>
        <label className="field">
          <span className="label">公開状態</span>
          <StatusSelect value={status} onChange={setStatus} />
        </label>
      </div>
    </div>
  );
};

const QuizCreateCard = ({
  topicId,
  onCreated,
}: {
  topicId: number;
  onCreated: (id: number) => void;
}) => {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState(3);
  const [status, setStatus] = useState<QuizStatus>("published");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const v = title.trim();
    if (!v) return;
    setBusy(true);
    api<{ id: number }>("/api/quizzes", {
      method: "POST",
      body: { topicId, title: v, difficulty, status },
    })
      .then((r) => {
        toast("クイズを作成しました。問題を登録しましょう", "ok");
        onCreated(r.id);
      })
      .catch((e: Error) => {
        toast(e.message, "ng");
        setBusy(false);
      });
  };
  return (
    <div className="card card-pad">
      <div className="side-title">
        <span>新しいクイズ</span>
      </div>
      <div className="form-grid cols-3">
        <input
          className="input"
          placeholder="クイズ名（例: くり上がりあり）"
          maxLength={100}
          aria-label="クイズ名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <DifficultySelect value={difficulty} onChange={setDifficulty} />
        <StatusSelect value={status} onChange={setStatus} />
      </div>
      <div className="row mt" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ink" disabled={busy} onClick={submit}>
          クイズを作成
        </button>
      </div>
    </div>
  );
};

const QuizRow = ({ q, onEdit }: { q: Quiz; onEdit: (q: Quiz) => void }) => {
  const navigate = useNavigate();
  const full = q.questionCount >= QUESTIONS_PER_QUIZ;
  return (
    <div className="admin-quiz">
      <div className="grow">
        <div className="admin-quiz-title">
          <span>{q.title}</span>
          <StatusChip status={q.status} />
        </div>
        <div className="admin-quiz-meta">
          <Stars n={q.difficulty} />
          <span className="qc-bar" aria-hidden="true">
            <i
              className={full ? "is-full" : ""}
              style={{ width: `${(q.questionCount / QUESTIONS_PER_QUIZ) * 100}%` }}
            />
          </span>
          <span>
            {q.questionCount}/{QUESTIONS_PER_QUIZ}問{full ? "" : "（未完成）"}
          </span>
        </div>
      </div>
      <div className="entity-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(q)}>
          設定
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ink"
          onClick={() => navigate(`/admin/q/${q.id}`)}
        >
          問題を編集
        </button>
      </div>
    </div>
  );
};

const AdminMain = ({
  sel,
  kind,
  onRename,
  onDelete,
  onEditQuiz,
  onRefresh,
}: {
  sel: Selection;
  kind: Kind;
  onRename: (title: string, current: string, path: string) => void;
  onDelete: (title: string, message: string, path: string, after: string) => void;
  onEditQuiz: (q: Quiz) => void;
  onRefresh: () => void;
}) => {
  const navigate = useNavigate();
  const { invalidate } = useTree();

  if (!sel.catId) {
    return (
      <>
        <div className="card">
          <EmptyState
            glyph="管"
            title="管理画面"
            sub="左のリストからカテゴリを選ぶか、新しく作成してください。カテゴリ › トピック › クイズ (10問) の順に作ります。"
          />
        </div>
        <JsonImportCard />
      </>
    );
  }
  const cat = sel.categories.find((c) => c.id === sel.catId);
  if (!cat) {
    return (
      <div className="card">
        <EmptyState glyph="？" title="カテゴリが見つかりません" />
      </div>
    );
  }

  if (!sel.topicId) {
    return (
      <>
        <EntityHead
          kind="カテゴリ"
          title={cat.title}
          actions={[
            {
              label: "名前を変更",
              fn: () => onRename("カテゴリ名を変更", cat.title, `/api/categories/${cat.id}`),
            },
            {
              label: "削除",
              danger: true,
              fn: () =>
                onDelete(
                  `カテゴリ「${cat.title}」を削除しますか？`,
                  "配下のトピック・クイズ・問題もすべて削除されます。",
                  `/api/categories/${cat.id}`,
                  "/admin",
                ),
            },
          ]}
        />
        <div className="card">
          <EmptyState
            glyph="題"
            title={sel.topics.length ? "トピックを選んでください" : "最初のトピックを作りましょう"}
            sub={
              sel.topics.length
                ? "左の一覧からトピックを選ぶと、クイズを管理できます。"
                : "左の「新しいトピック」から追加できます。"
            }
          />
        </div>
      </>
    );
  }
  const topic = sel.topics.find((t) => t.id === sel.topicId);
  if (!topic) {
    return (
      <div className="card">
        <EmptyState glyph="？" title="トピックが見つかりません" />
      </div>
    );
  }

  if (!sel.quizId) {
    return (
      <>
        <Crumbs
          items={[
            { label: "管理", href: "/admin" },
            { label: cat.title, href: `/admin/c/${cat.id}` },
            { label: topic.title },
          ]}
        />
        <EntityHead
          kind="トピック"
          title={topic.title}
          actions={[
            {
              label: "名前を変更",
              fn: () => onRename("トピック名を変更", topic.title, `/api/topics/${topic.id}`),
            },
            {
              label: "削除",
              danger: true,
              fn: () =>
                onDelete(
                  `トピック「${topic.title}」を削除しますか？`,
                  "配下のクイズ・問題もすべて削除されます。",
                  `/api/topics/${topic.id}`,
                  `/admin/c/${cat.id}`,
                ),
            },
          ]}
        />
        <QuizCreateCard
          topicId={topic.id}
          onCreated={(newId) => {
            invalidate();
            navigate(`/admin/q/${newId}`);
          }}
        />
        <div className="section-head">
          <h2 className="title-md">クイズ</h2>
          <span className="muted">{sel.quizzes.length}件</span>
        </div>
        <div className="admin-quiz-list">
          {!sel.quizzes.length && (
            <div className="card">
              <EmptyState
                glyph="問"
                title="クイズがありません"
                sub="上のフォームから作成してください。"
              />
            </div>
          )}
          {sel.quizzes.map((q) => (
            <QuizRow key={q.id} q={q} onEdit={onEditQuiz} />
          ))}
        </div>
        <JsonImportCard />
      </>
    );
  }
  const quiz = sel.quizzes.find((q) => q.id === sel.quizId);
  if (!quiz) {
    return (
      <div className="card">
        <EmptyState glyph="？" title="クイズが見つかりません" />
      </div>
    );
  }
  void kind;
  return (
    <>
      <Crumbs
        items={[
          { label: "管理", href: "/admin" },
          { label: cat.title, href: `/admin/c/${cat.id}` },
          { label: topic.title, href: `/admin/t/${topic.id}` },
        ]}
      />
      <EntityHead
        kind="クイズ"
        title={quiz.title}
        actions={[
          { label: "設定", fn: () => onEditQuiz(quiz) },
          {
            label: "削除",
            danger: true,
            fn: () =>
              onDelete(
                `クイズ「${quiz.title}」を削除しますか？`,
                "配下の問題もすべて削除されます。",
                `/api/quizzes/${quiz.id}`,
                `/admin/t/${topic.id}`,
              ),
          },
        ]}
        extra={
          <div className="row wrap">
            <Stars n={quiz.difficulty} />
            <StatusChip status={quiz.status} />
          </div>
        }
      />
      <QuestionEditor quiz={quiz} onSaved={onRefresh} />
    </>
  );
};
