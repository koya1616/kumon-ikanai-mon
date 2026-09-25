import { useCallback, useEffect, useRef, useState } from "react";
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
  /** 全クイズ (概要・集計・サイドの件数表示用)。常に取得する */
  allQuizzes: Quiz[];
  /** 全トピック (横断検索・サイドのインライン展開・作成フォーム用)。常に取得する */
  allTopics: Topic[];
  catId: number | null;
  topicId: number | null;
  quizId: number | null;
}

const isIncomplete = (q: Quiz): boolean => q.questionCount < QUESTIONS_PER_QUIZ;

const norm = (s: string): string => s.trim().toLowerCase();

const matchesQuery = (haystacks: (string | undefined)[], q: string): boolean => {
  const v = norm(q);
  if (!v) return true;
  const parts = v.split(/\s+/).filter(Boolean);
  const hay = haystacks.filter(Boolean).join(" ").toLowerCase();
  return parts.every((p) => hay.includes(p));
};

type QuizFilter = "all" | QuizStatus | "incomplete";

const quizFilterCounts = (quizzes: Quiz[]): Record<QuizFilter, number> => ({
  all: quizzes.length,
  published: quizzes.filter((q) => q.status === "published").length,
  draft: quizzes.filter((q) => q.status === "draft").length,
  archived: quizzes.filter((q) => q.status === "archived").length,
  incomplete: quizzes.filter(isIncomplete).length,
});

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
    const [cats, allQuizzes, allTopics] = await Promise.all([
      api<Category[]>("/api/categories"),
      api<Quiz[]>("/api/quizzes"),
      api<Topic[]>("/api/topics"),
    ]);
    const next: Selection = {
      categories: cats,
      topics: [],
      quizzes: [],
      allQuizzes,
      allTopics,
      catId: null,
      topicId: null,
      quizId: null,
    };
    // JSON一括登録・新規作成は階層選択と分離した専用画面。カテゴリ一覧と全体集計だけ持つ。
    if (kind === "import" || kind === "new") {
      setSel(next);
      return;
    }
    if (kind === "c") {
      next.catId = id;
      next.topics = allTopics.filter((t) => t.categoryId === id);
      next.quizzes = allQuizzes.filter((q) => q.categoryId === id);
    } else if (kind === "t") {
      const t = allTopics.find((x) => x.id === id);
      if (t) {
        next.catId = t.categoryId;
        next.topicId = t.id;
        next.topics = allTopics.filter((x) => x.categoryId === t.categoryId);
        next.quizzes = allQuizzes.filter((q) => q.topicId === t.id);
      }
    } else if (kind === "q") {
      const q = allQuizzes.find((x) => x.id === id);
      if (q) {
        next.quizId = q.id;
        next.topicId = q.topicId;
        next.catId = q.categoryId ?? null;
        if (next.catId != null) {
          next.topics = allTopics.filter((x) => x.categoryId === next.catId);
        }
        next.quizzes = allQuizzes.filter((x) => x.topicId === q.topicId);
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
          allQuizzes: [],
          allTopics: [],
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
        <AdminTabs kind={kind} />
        {kind !== "import" && sel && <ManageSubTabs kind={kind} sel={sel} />}
        {kind !== "import" &&
          kind !== "new" &&
          (sel ? <AdminSteps sel={sel} /> : <p className="muted">読み込み中…</p>)}
      </header>
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
  // クイック切替用: 今の文脈に合う候補だけに絞る
  const topicOptions =
    sel.catId != null ? sel.allTopics.filter((t) => t.categoryId === sel.catId) : sel.allTopics;
  const quizOptions =
    sel.topicId != null
      ? sel.allQuizzes.filter((z) => z.topicId === sel.topicId)
      : sel.catId != null
        ? sel.allQuizzes.filter((z) => z.categoryId === sel.catId)
        : sel.allQuizzes;
  const cat = sel.categories.find((c) => c.id === sel.catId);
  return (
    <ol className="steps steps-jump" aria-label="管理の手順 (直接切り替えできます)">
      <li
        className={`step${sel.catId != null ? " is-done" : ""} is-next`}
        aria-current={sel.catId == null ? "step" : undefined}
      >
        <span className="step-btn step-jump">
          <span className="step-no">{sel.catId != null ? "✓" : "1"}</span>
          <span className="step-body">
            <span className="step-label">1 · カテゴリ ({sel.categories.length})</span>
            <select
              className="select select-sm step-select"
              aria-label="カテゴリを直接切り替え"
              value={sel.catId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") navigate("/admin");
                else navigate(`/admin/c/${Number(v)}`);
              }}
            >
              <option value="">カテゴリを選ぶ…</option>
              {sel.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.quizCount ?? 0}Q)
                </option>
              ))}
            </select>
            {cat && <span className="step-value">{cat.title}</span>}
          </span>
        </span>
      </li>
      <li
        className={`step${sel.topicId != null ? " is-done" : ""}${sel.catId != null ? " is-next" : ""}`}
        aria-current={sel.catId != null && sel.topicId == null ? "step" : undefined}
      >
        <span className="step-btn step-jump">
          <span className="step-no">{sel.topicId != null ? "✓" : "2"}</span>
          <span className="step-body">
            <span className="step-label">2 · トピック ({topicOptions.length})</span>
            <select
              className="select select-sm step-select"
              aria-label="トピックを直接切り替え"
              value={sel.topicId ?? ""}
              disabled={sel.catId == null && topicOptions.length === 0}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "") navigate(`/admin/t/${Number(v)}`);
              }}
            >
              <option value="">
                {sel.catId == null ? "全トピックから選ぶ…" : "トピックを選ぶ…"}
              </option>
              {topicOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </span>
        </span>
      </li>
      <li
        className={`step${sel.quizId != null ? " is-done" : ""}${sel.topicId != null ? " is-next" : ""}`}
        aria-current={sel.topicId != null && sel.quizId == null ? "step" : undefined}
      >
        <span className="step-btn step-jump">
          <span className="step-no">{sel.quizId != null ? "✓" : "3"}</span>
          <span className="step-body">
            <span className="step-label">3 · クイズ・問題 ({quizOptions.length})</span>
            <select
              className="select select-sm step-select"
              aria-label="クイズを直接切り替え"
              value={sel.quizId ?? ""}
              disabled={quizOptions.length === 0}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "") navigate(`/admin/q/${Number(v)}`);
              }}
            >
              <option value="">クイズを選ぶ…</option>
              {quizOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.title} ({z.questionCount}/{QUESTIONS_PER_QUIZ})
                </option>
              ))}
            </select>
          </span>
        </span>
      </li>
    </ol>
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

/** 件数が増えても選びやすい検索式セレクト (入力で絞り込み + ↑↓/Enter対応) */
const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
}: {
  options: { value: number; label: string; sub?: string }[];
  value: number | "";
  onChange: (v: number | "") => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
}) => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // 選択が変わったら検索文をリセット
  useEffect(() => {
    setQ("");
    setActive(0);
  }, [value]);

  const filtered = options.filter((o) => matchesQuery([o.label, o.sub], q)).slice(0, 60);

  return (
    <div className={`combo${disabled ? " is-disabled" : ""}`} ref={boxRef}>
      <div className="combo-input-wrap">
        <input
          className="input input-sm combo-input"
          type="search"
          placeholder={selected ? `${selected.label} — 変更は入力` : placeholder}
          aria-label={ariaLabel}
          disabled={disabled}
          value={open ? q : (selected?.label ?? q)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={(e) => {
            setQ("");
            setOpen(true);
            // フォーカス時は全件から探せるよう選択テキストを外す
            if (selected) e.target.select();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (filtered.length ? (a - 1 + filtered.length) % filtered.length : 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const f = open ? filtered[active] : filtered[0];
              if (f) {
                onChange(f.value);
                setOpen(false);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {value !== "" && !disabled && (
          <button
            type="button"
            className="btn btn-ghost btn-sm combo-clear"
            aria-label={`${ariaLabel}の選択を解除`}
            onClick={() => onChange("")}
          >
            ✕
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="card combo-list" role="listbox" aria-label={ariaLabel}>
          {filtered.length === 0 && <p className="muted combo-empty">一致しません</p>}
          {filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`combo-item${i === active ? " is-active" : ""}${o.value === value ? " is-selected" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="grow">
                {o.label}
                {o.sub && <span className="omni-sub">{o.sub}</span>}
              </span>
              {o.value === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          {options.length > filtered.length && (
            <p className="muted combo-more">
              {filtered.length}/{options.length}件を表示中。入力で絞り込めます
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const CreateView = ({ sel }: { sel: Selection }) => {
  return (
    <div className="stack">
      <CategoryCreateCard existingCount={sel.categories.length} />
      <TopicCreateCard categories={sel.categories} />
      <QuizCreateSection categories={sel.categories} allTopics={sel.allTopics} />
    </div>
  );
};

const CreateField = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span className="label">{label}</span>
    {children}
  </label>
);

const CategoryCreateCard = ({ existingCount }: { existingCount: number }) => {
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
          <p className="muted">
            大分類（例: プログラミング）。作るとトピックを入れられます。
            {existingCount > 0 && `現在${existingCount}件。重複名に注意してください。`}
          </p>
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
            <CreateField label={`カテゴリ (${categories.length}件から検索)`}>
              <SearchableSelect
                options={categories.map((c) => ({
                  value: c.id,
                  label: c.title,
                  sub: `${c.quizCount ?? 0}Q`,
                }))}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="カテゴリ名を入力して絞り込む"
                ariaLabel="カテゴリ"
              />
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

const QuizCreateSection = ({
  categories,
  allTopics,
}: {
  categories: Category[];
  allTopics: Topic[];
}) => {
  const navigate = useNavigate();
  const { invalidate } = useTree();
  const [categoryId, setCategoryId] = useState<number | "">(
    categories.length === 1 ? (categories[0]?.id ?? "") : "",
  );
  const [topicId, setTopicId] = useState<number | "">("");

  const topics = categoryId === "" ? [] : allTopics.filter((t) => t.categoryId === categoryId);

  useEffect(() => {
    setTopicId("");
  }, [categoryId]);

  const topic = topics.find((t) => t.id === topicId) ?? allTopics.find((t) => t.id === topicId);
  return (
    <section aria-label="クイズの新規作成">
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <div className="form-grid cols-2">
          <CreateField label={`カテゴリ (${categories.length}件から検索)`}>
            <SearchableSelect
              options={categories.map((c) => ({
                value: c.id,
                label: c.title,
                sub: `${c.quizCount ?? 0}Q`,
              }))}
              value={categoryId}
              onChange={setCategoryId}
              placeholder="カテゴリ名を入力して絞り込む"
              ariaLabel="カテゴリ"
            />
          </CreateField>
          <CreateField label={`トピック${topics.length ? ` (${topics.length}件から検索)` : ""}`}>
            <SearchableSelect
              options={topics.map((t) => ({ value: t.id, label: t.title }))}
              value={topicId}
              onChange={setTopicId}
              placeholder={
                categoryId === "" ? "先にカテゴリを選んでください" : "トピック名を入力して絞り込む"
              }
              ariaLabel="トピック"
              disabled={categoryId === ""}
            />
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

const QuizRow = ({
  q,
  onEdit,
  showCrumb = false,
}: {
  q: Quiz;
  onEdit: (q: Quiz) => void;
  showCrumb?: boolean;
}) => {
  const navigate = useNavigate();
  const full = q.questionCount >= QUESTIONS_PER_QUIZ;
  const tone = q.status === "draft" ? "is-draft" : q.status === "archived" ? "is-archived" : "";
  const attention = q.status === "draft" || !full ? "is-attention" : "";
  return (
    <div className={`admin-quiz ${tone} ${attention}`.trim()}>
      <div className="grow">
        {showCrumb && (q.categoryTitle || q.topicTitle) && (
          <p className="admin-quiz-crumb">
            {[q.categoryTitle, q.topicTitle].filter(Boolean).join(" › ")}
          </p>
        )}
        <div className="admin-quiz-title">
          <span>{q.title}</span>
          <StatusChip status={q.status} />
          {!full && <span className="chip chip-shu">未完成</span>}
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

const AdminQuizStats = ({
  quizzes,
  filter,
  onSelect,
}: {
  quizzes: Quiz[];
  filter: QuizFilter;
  onSelect: (f: QuizFilter) => void;
}) => {
  const c = quizFilterCounts(quizzes);
  const items: { value: QuizFilter; label: string; n: number; cls: string }[] = [
    { value: "all", label: "合計", n: c.all, cls: "" },
    { value: "published", label: "公開中", n: c.published, cls: "is-published" },
    { value: "draft", label: "下書き", n: c.draft, cls: "is-draft" },
    { value: "incomplete", label: "未完成", n: c.incomplete, cls: "is-incomplete" },
    { value: "archived", label: "公開終了", n: c.archived, cls: "is-archived" },
  ];
  return (
    <div className="admin-stats" role="group" aria-label="クイズの集計">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className={`stat-card ${it.cls}${filter === it.value ? " is-active" : ""}`}
          aria-pressed={filter === it.value ? "true" : "false"}
          onClick={() => onSelect(it.value)}
          title={`${it.label}で絞り込む`}
        >
          <span className="stat-num">{it.n}</span>
          <span className="stat-label">{it.label}</span>
        </button>
      ))}
    </div>
  );
};

const AdminQuizList = ({
  quizzes,
  onEdit,
  showCrumb = false,
  emptySub = "条件に合うクイズがありません。",
}: {
  quizzes: Quiz[];
  onEdit: (q: Quiz) => void;
  showCrumb?: boolean;
  emptySub?: string;
}) => {
  const [filter, setFilter] = useState<QuizFilter>("all");

  const filtered = quizzes
    .filter((q) => {
      if (filter === "incomplete") return isIncomplete(q);
      if (filter !== "all" && q.status !== filter) return false;
      return true;
    })
    .sort((a, b) => a.id - b.id);

  return (
    <div className="stack">
      <AdminQuizStats quizzes={quizzes} filter={filter} onSelect={setFilter} />
      <div className="admin-quiz-list">
        {!quizzes.length && (
          <div className="card">
            <EmptyState
              glyph="問"
              title="クイズがありません"
              sub="「新規作成」タブからクイズを作成してください。"
            />
          </div>
        )}
        {!!quizzes.length && !filtered.length && (
          <div className="card">
            <EmptyState glyph="検" title="該当なし" sub={emptySub} />
          </div>
        )}
        {filtered.map((q) => (
          <QuizRow key={q.id} q={q} onEdit={onEdit} showCrumb={showCrumb} />
        ))}
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
        <div className="section-head">
          <h2 className="title-md">クイズ一覧</h2>
          <span className="chip">{sel.allQuizzes.length}件</span>
        </div>
        <AdminQuizList key="all" quizzes={sel.allQuizzes} onEdit={onEditQuiz} showCrumb />
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
        {!sel.topics.length ? (
          <div className="card">
            <EmptyState
              glyph="題"
              title="まだトピックがありません"
              sub="「新規作成」タブから最初のトピックを作りましょう。"
            />
          </div>
        ) : (
          <>
            <div className="section-head">
              <h2 className="title-md">「{cat.title}」のクイズ</h2>
              <span className="chip">{sel.quizzes.length}件</span>
            </div>
            <p className="muted" style={{ marginTop: -8 }}>
              カテゴリ配下の全トピックを横断表示しています。トピック名付きで見通せます。
            </p>
            <AdminQuizList
              key={`cat-${cat.id}`}
              quizzes={sel.quizzes}
              onEdit={onEditQuiz}
              showCrumb
            />
          </>
        )}
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
        <AdminQuizList key={`topic-${topic.id}`} quizzes={sel.quizzes} onEdit={onEditQuiz} />
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
