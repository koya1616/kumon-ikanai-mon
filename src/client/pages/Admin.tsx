import { useCallback, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { api, QUESTIONS_PER_QUIZ } from "../api";
import type { Category, Quiz, QuizStatus, Topic } from "../api";
import { useDialog } from "../dialog";
import { Crumbs, EmptyState, Icon, Skeletons, Stars, StatusChip } from "../ui";
import { useToast } from "../toast";
import { useTree } from "../tree";
import { JsonImportCard } from "./JsonImport";
import { QuestionEditor } from "./QuestionEditor";

type Kind = "" | "c" | "t" | "q" | "new" | "import";

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

  const kind: Kind = location.pathname.startsWith("/admin/import")
    ? "import"
    : location.pathname.startsWith("/admin/new")
      ? "new"
      : location.pathname.startsWith("/admin/c/")
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
    // JSON一括登録・新規作成は階層選択と分離した専用画面。カテゴリ一覧だけ持つ。
    if (kind === "import" || kind === "new") {
      setSel(next);
      return;
    }
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
        fields: <QuizSettingsFields quiz={q} />,
        readFields: (form) => ({
          title: String(form.get("title") ?? "").trim(),
          difficulty: Number(form.get("difficulty")),
          status: form.get("status") as QuizStatus,
        }),
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
      <header className="admin-head">
        <span className="eyebrow">管理画面</span>
        <h1 className="title-lg">
          {kind === "import"
            ? "JSONで一括登録"
            : kind === "new"
              ? "新規作成"
              : "カテゴリ › トピック › クイズを管理"}
        </h1>
        <AdminTabs kind={kind} />
        {kind !== "import" && sel && <ManageSubTabs kind={kind} sel={sel} />}
        {kind !== "import" &&
          kind !== "new" &&
          (sel ? <AdminSteps sel={sel} /> : <p className="muted">読み込み中…</p>)}
      </header>
      {kind === "import" || kind === "new" ? (
        <div className="admin admin-single">
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
      ) : (
        <div className="admin">
          <aside className="admin-side">
            {!sel ? <Skeletons n={2} /> : <AdminSide sel={sel} />}
          </aside>
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
      )}
    </div>
  );
};

const AdminTabs = ({ kind }: { kind: Kind }) => {
  const isJson = kind === "import";
  return (
    <nav className="hx-tabs" aria-label="管理の方法" style={{ margin: "12px 0 0" }}>
      <Link className="hx-tab" to="/admin" aria-selected={!isJson}>
        通常管理（追加・更新・削除）
      </Link>
      <Link className="hx-tab" to="/admin/import" aria-selected={isJson}>
        JSONで一括登録
      </Link>
    </nav>
  );
};

const ManageSubTabs = ({ kind, sel }: { kind: Kind; sel: Selection }) => {
  const isCreate = kind === "new";
  // 閲覧タブに戻るときは今の選択を維持する (深い階層を優先)。
  const browseHref =
    sel.quizId != null
      ? `/admin/q/${sel.quizId}`
      : sel.topicId != null
        ? `/admin/t/${sel.topicId}`
        : sel.catId != null
          ? `/admin/c/${sel.catId}`
          : "/admin";
  return (
    <nav className="hx-tabs" aria-label="通常管理の操作" style={{ margin: "12px 0 0" }}>
      <Link className="hx-tab" to={browseHref} aria-selected={!isCreate}>
        閲覧・編集・削除
      </Link>
      <Link className="hx-tab" to="/admin/new" aria-selected={isCreate}>
        新規作成
      </Link>
    </nav>
  );
};

const AdminSteps = ({ sel }: { sel: Selection }) => {
  const navigate = useNavigate();
  const cat = sel.categories.find((c) => c.id === sel.catId);
  const topic = sel.topics.find((t) => t.id === sel.topicId);
  const quiz = sel.quizzes.find((q) => q.id === sel.quizId);
  const steps = [
    {
      no: "1",
      label: "カテゴリ",
      value: cat?.title ?? "未選択",
      done: sel.catId != null,
      onClick: undefined as undefined | (() => void),
    },
    {
      no: "2",
      label: "トピック",
      value: topic?.title ?? (sel.catId != null ? "未選択" : "—"),
      done: sel.topicId != null,
      onClick:
        sel.catId != null && sel.topicId == null
          ? undefined
          : sel.catId != null
            ? () => navigate(`/admin/c/${sel.catId}`)
            : undefined,
    },
    {
      no: "3",
      label: "クイズ・問題",
      value: quiz?.title ?? (sel.topicId != null ? "未選択" : "—"),
      done: sel.quizId != null,
      onClick:
        sel.topicId != null && sel.quizId == null
          ? undefined
          : sel.topicId != null
            ? () => navigate(`/admin/t/${sel.topicId}`)
            : undefined,
    },
  ];
  return (
    <ol className="steps" aria-label="管理の手順">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={`step${s.done ? " is-done" : ""}${i === 0 || steps[i - 1]?.done ? " is-next" : ""}`}
          aria-current={s.done ? undefined : i === 0 || steps[i - 1]?.done ? "step" : undefined}
        >
          {s.onClick ? (
            <button type="button" className="step-btn" onClick={s.onClick}>
              <span className="step-no">{s.done ? "✓" : s.no}</span>
              <span className="step-body">
                <span className="step-label">{s.label}</span>
                <span className="step-value">{s.value}</span>
              </span>
            </button>
          ) : (
            <span className="step-btn" aria-hidden={s.onClick == null ? undefined : false}>
              <span className="step-no">{s.done ? "✓" : s.no}</span>
              <span className="step-body">
                <span className="step-label">{s.label}</span>
                <span className="step-value">{s.value}</span>
              </span>
            </span>
          )}
          {i < steps.length - 1 && (
            <span className="step-sep" aria-hidden="true">
              ›
            </span>
          )}
        </li>
      ))}
    </ol>
  );
};

const AdminSide = ({ sel }: { sel: Selection }) => {
  const navigate = useNavigate();
  const cat = sel.categories.find((c) => c.id === sel.catId);
  return (
    <>
      <section className="card card-pad side-card" aria-label="カテゴリ一覧">
        <div className="side-title">
          <span>
            <span className="step-no step-no-sm">1</span> カテゴリ
          </span>
          <span className="chip">{sel.categories.length}件</span>
        </div>
        <p className="muted side-hint">大分類。選ぶとトピックが見られます</p>
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
      </section>

      {sel.catId != null && (
        <section className="card card-pad side-card" aria-label="トピック一覧">
          <div className="side-title">
            <span>
              <span className="step-no step-no-sm">2</span> トピック
            </span>
            <span className="chip">{sel.topics.length}件</span>
          </div>
          <p className="muted side-hint">「{cat?.title ?? ""}」の中分類</p>
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
        </section>
      )}
    </>
  );
};

const EntityHead = ({
  kind,
  kindLabel,
  tone,
  title,
  actions,
  extra,
}: {
  kind: string;
  kindLabel: string;
  tone: "cat" | "topic" | "quiz";
  title: string;
  actions: { label: string; danger?: boolean; primary?: boolean; fn: () => void }[];
  extra?: ReactNode;
}) => {
  return (
    <header className="entity-head">
      <div className="grow">
        <span className={`eyebrow kind kind-${tone}`}>
          {kind} · {kindLabel}
        </span>
        <h2 className="title-lg">{title}</h2>
        {extra}
      </div>
      <div className="entity-actions">
        {[...actions.filter((a) => a.danger), ...actions.filter((a) => !a.danger)].map((a) => (
          <button
            key={a.label}
            type="button"
            className={`btn btn-sm ${a.danger ? "btn-danger" : a.primary ? "btn-ink" : ""}`}
            onClick={a.fn}
          >
            {a.label}
          </button>
        ))}
      </div>
    </header>
  );
};

type SelectProps<T> = Omit<ComponentProps<"select">, "className" | "children" | "onChange"> & {
  onValueChange?: (v: T) => void;
};

/** 難易度セレクト。制御 (value + onValueChange) / 非制御 (name + defaultValue) の両方で使う */
const DifficultySelect = ({ onValueChange, ...rest }: SelectProps<number>) => {
  return (
    <select
      {...rest}
      className="select"
      aria-label="難易度"
      onChange={onValueChange && ((e) => onValueChange(Number(e.target.value)))}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          ★{n}
        </option>
      ))}
    </select>
  );
};

/** 公開状態セレクト。DifficultySelect と同じく制御/非制御の両対応 */
const StatusSelect = ({ onValueChange, ...rest }: SelectProps<QuizStatus>) => {
  return (
    <select
      {...rest}
      className="select"
      aria-label="公開状態"
      onChange={onValueChange && ((e) => onValueChange(e.target.value as QuizStatus))}
    >
      <option value="published">公開中</option>
      <option value="draft">下書き</option>
      <option value="archived">公開終了</option>
    </select>
  );
};

/** クイズ設定ダイアログの入力欄 (非制御。値は OK 時に FormData で読む) */
const QuizSettingsFields = ({ quiz }: { quiz: Quiz }) => {
  return (
    <div className="form-grid">
      <label className="field">
        <span className="label">クイズ名</span>
        <input
          className="input"
          name="title"
          defaultValue={quiz.title}
          maxLength={100}
          aria-label="クイズ名"
        />
      </label>
      <div className="form-grid cols-2">
        <label className="field">
          <span className="label">難易度</span>
          <DifficultySelect name="difficulty" defaultValue={quiz.difficulty} />
        </label>
        <label className="field">
          <span className="label">公開状態</span>
          <StatusSelect name="status" defaultValue={quiz.status} />
        </label>
      </div>
    </div>
  );
};

const CreateView = ({ sel }: { sel: Selection }) => {
  return (
    <div className="stack">
      <CategoryCreateCard />
      <TopicCreateCard categories={sel.categories} />
      <QuizCreateSection categories={sel.categories} />
    </div>
  );
};

const CreateField = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span className="label">{label}</span>
    {children}
  </label>
);

const CategoryCreateCard = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { invalidate } = useTree();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const v = title.trim();
    if (!v) return;
    setBusy(true);
    api<{ id: number }>("/api/categories", { method: "POST", body: { title: v } })
      .then((r) => {
        toast("カテゴリを追加しました", "ok");
        invalidate();
        navigate(`/admin/c/${r.id}`);
      })
      .catch((e: Error) => {
        toast(e.message, "ng");
        setBusy(false);
      });
  };
  return (
    <section className="card card-pad create-card" aria-label="カテゴリの新規作成">
      <div className="create-head">
        <span className="create-badge" aria-hidden="true">
          ＋
        </span>
        <div className="grow">
          <h2 className="title-md">新しいカテゴリを作成</h2>
          <p className="muted">大分類（例: プログラミング）。作るとトピックを入れられます。</p>
        </div>
        <span className="chip chip-shu">新規作成</span>
      </div>
      <div className="form-grid">
        <input
          className="input"
          placeholder="カテゴリ名（例: プログラミング）"
          maxLength={100}
          aria-label="カテゴリ名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <div className="actions actions-end">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !title.trim()}
          onClick={submit}
        >
          <Icon name="plus" />
          カテゴリを作成する
        </button>
      </div>
    </section>
  );
};

const TopicCreateCard = ({ categories }: { categories: Category[] }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const { invalidate } = useTree();
  const [categoryId, setCategoryId] = useState<number | "">(
    categories.length === 1 ? (categories[0]?.id ?? "") : "",
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const v = title.trim();
    if (categoryId === "" || !v) return;
    setBusy(true);
    api<{ id: number }>("/api/topics", {
      method: "POST",
      body: { categoryId, title: v },
    })
      .then((r) => {
        toast("トピックを追加しました", "ok");
        invalidate();
        navigate(`/admin/t/${r.id}`);
      })
      .catch((e: Error) => {
        toast(e.message, "ng");
        setBusy(false);
      });
  };
  return (
    <section className="card card-pad create-card" aria-label="トピックの新規作成">
      <div className="create-head">
        <span className="create-badge" aria-hidden="true">
          ＋
        </span>
        <div className="grow">
          <h2 className="title-md">新しいトピックを作成</h2>
          <p className="muted">選んだカテゴリの中分類として追加します。</p>
        </div>
        <span className="chip chip-shu">新規作成</span>
      </div>
      {!categories.length ? (
        <p className="muted">先にカテゴリを作成してください。</p>
      ) : (
        <>
          <div className="form-grid cols-2">
            <CreateField label="カテゴリ">
              <select
                className="select"
                aria-label="カテゴリ"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">カテゴリを選ぶ</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </CreateField>
            <CreateField label="トピック名">
              <input
                className="input"
                placeholder="トピック名（例: Golang）"
                maxLength={100}
                aria-label="トピック名"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </CreateField>
          </div>
          <div className="actions actions-end">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || categoryId === "" || !title.trim()}
              onClick={submit}
            >
              <Icon name="plus" />
              トピックを作成する
            </button>
          </div>
        </>
      )}
    </section>
  );
};

const QuizCreateSection = ({ categories }: { categories: Category[] }) => {
  const navigate = useNavigate();
  const { invalidate } = useTree();
  const [categoryId, setCategoryId] = useState<number | "">(
    categories.length === 1 ? (categories[0]?.id ?? "") : "",
  );
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicId, setTopicId] = useState<number | "">("");

  useEffect(() => {
    if (categoryId === "") {
      setTopics([]);
      setTopicId("");
      return;
    }
    let alive = true;
    api<Topic[]>(`/api/topics?categoryId=${categoryId}`)
      .then((ts) => {
        if (!alive) return;
        setTopics(ts);
        setTopicId("");
      })
      .catch(() => {
        if (!alive) return;
        setTopics([]);
        setTopicId("");
      });
    return () => {
      alive = false;
    };
  }, [categoryId]);

  const topic = topics.find((t) => t.id === topicId);
  return (
    <section aria-label="クイズの新規作成">
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="form-grid cols-2">
          <CreateField label="カテゴリ">
            <select
              className="select"
              aria-label="カテゴリ"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">カテゴリを選ぶ</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </CreateField>
          <CreateField label="トピック">
            <select
              className="select"
              aria-label="トピック"
              value={topicId}
              disabled={categoryId === ""}
              onChange={(e) => setTopicId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">トピックを選ぶ</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </CreateField>
        </div>
        {categoryId !== "" && !topics.length && (
          <p className="muted" style={{ marginBottom: 0 }}>
            このカテゴリにはまだトピックがありません。上の「新しいトピックを作成」から先に作ってください。
          </p>
        )}
      </div>
      {topic && (
        <QuizCreateCard
          topicId={topic.id}
          topicTitle={topic.title}
          onCreated={(newId) => {
            invalidate();
            navigate(`/admin/q/${newId}`);
          }}
        />
      )}
    </section>
  );
};

const QuizCreateCard = ({
  topicId,
  topicTitle,
  onCreated,
}: {
  topicId: number;
  topicTitle: string;
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
    <section className="card card-pad create-card" aria-label="新しいクイズの作成">
      <div className="create-head">
        <span className="create-badge" aria-hidden="true">
          ＋
        </span>
        <div className="grow">
          <h2 className="title-md">新しいクイズを作成</h2>
          <p className="muted">「{topicTitle}」に追加します。作成後に10問を登録します。</p>
        </div>
        <span className="chip chip-shu">新規作成</span>
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
        <DifficultySelect value={difficulty} onValueChange={setDifficulty} />
        <StatusSelect value={status} onValueChange={setStatus} />
      </div>
      <div className="actions actions-end">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !title.trim()}
          onClick={submit}
        >
          ＋ クイズを作成する
        </button>
      </div>
    </section>
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
        <button type="button" className="btn btn-sm" onClick={() => onEdit(q)}>
          設定を変更
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
  // JSON一括登録は通常CRUDと分離した専用画面 (/admin/import)。
  if (kind === "import") {
    return (
      <>
        <Crumbs items={[{ label: "管理", href: "/admin" }, { label: "JSONで一括登録" }]} />
        <JsonImportCard />
      </>
    );
  }

  // 新規作成は閲覧・編集・削除と分離した専用タブ (/admin/new)。
  if (kind === "new") {
    return (
      <>
        <Crumbs items={[{ label: "管理", href: "/admin" }, { label: "新規作成" }]} />
        <CreateView sel={sel} />
      </>
    );
  }

  if (!sel.catId) {
    return (
      <>
        <Crumbs items={[{ label: "管理" }]} />
        <div className="card">
          <EmptyState
            glyph="管"
            title="カテゴリを選んでください"
            sub="左の一覧からカテゴリを選ぶと、トピック・クイズを見られます。"
          />
        </div>
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
        <Crumbs items={[{ label: "管理", href: "/admin" }, { label: cat.title }]} />
        <EntityHead
          kind="STEP 1"
          kindLabel="カテゴリを編集"
          tone="cat"
          title={cat.title}
          actions={[
            {
              label: "名前を編集",
              primary: true,
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
            title={sel.topics.length ? "トピックを選んでください" : "まだトピックがありません"}
            sub={
              sel.topics.length
                ? "左の一覧からトピックを選ぶと、クイズを管理できます。"
                : "「新規作成」タブから最初のトピックを作りましょう。"
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
          kind="STEP 2"
          kindLabel="トピックを編集"
          tone="topic"
          title={topic.title}
          actions={[
            {
              label: "名前を編集",
              primary: true,
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
        <div className="section-head">
          <h2 className="title-md">登録済みクイズ</h2>
          <span className="chip">{sel.quizzes.length}件</span>
        </div>
        <p className="muted" style={{ marginTop: -8 }}>
          「問題を編集」で10問を登録・更新します。「設定を変更」はタイトル・難易度・公開状態の編集です。新しいクイズは「新規作成」タブから作れます。
        </p>
        <div className="admin-quiz-list">
          {!sel.quizzes.length && (
            <div className="card">
              <EmptyState
                glyph="問"
                title="クイズがありません"
                sub="「新規作成」タブからクイズを作成してください。"
              />
            </div>
          )}
          {sel.quizzes.map((q) => (
            <QuizRow key={q.id} q={q} onEdit={onEditQuiz} />
          ))}
        </div>
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
  return (
    <>
      <Crumbs
        items={[
          { label: "管理", href: "/admin" },
          { label: cat.title, href: `/admin/c/${cat.id}` },
          { label: topic.title, href: `/admin/t/${topic.id}` },
          { label: quiz.title },
        ]}
      />
      <EntityHead
        kind="STEP 3"
        kindLabel="クイズの問題を編集"
        tone="quiz"
        title={quiz.title}
        actions={[
          { label: "設定を変更", primary: true, fn: () => onEditQuiz(quiz) },
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
