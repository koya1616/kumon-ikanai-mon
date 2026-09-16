// 問題エディタ (ステッパー式: 1問ずつ集中して編集)。
// 10枠 drafts を持ち、保存は POST /api/questions/batch 一括。
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api, QUESTIONS_PER_QUIZ } from "../api";
import type { Question, Quiz } from "../api";
import { useDialog } from "../dialog";
import { RichText } from "../rich";
import { EmptyState, Skeletons } from "../ui";
import { useToast } from "../toast";
import { useTree } from "../tree";

interface Draft {
  id: number | null;
  statement: string;
  choices: [string, string, string, string];
  answer: number;
  explanation: string;
}

const blankDraft = (): Draft => ({
  id: null,
  statement: "",
  choices: ["", "", "", ""],
  answer: 1,
  explanation: "",
});

const isComplete = (d: Draft): boolean => !!d.statement.trim() && d.choices.every((c) => c.trim());

const isBlank = (d: Draft): boolean =>
  !d.statement.trim() && d.choices.every((c) => !c.trim()) && !d.explanation.trim();

export const QuestionEditor = ({ quiz, onSaved }: { quiz: Quiz; onSaved: () => void }) => {
  const toast = useToast();
  const dialog = useDialog();
  const { invalidate } = useTree();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [pristine, setPristine] = useState("");
  const [cur, setCur] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setDrafts(null);
    setLoadError("");
    api<Question[]>(`/api/questions?quizId=${quiz.id}`)
      .then((qs) => {
        if (!alive) return;
        const next: Draft[] = [];
        for (let i = 0; i < QUESTIONS_PER_QUIZ; i++) {
          const q = qs[i];
          next.push(
            q
              ? {
                  id: q.id,
                  statement: q.statement ?? "",
                  choices: [
                    q.choices[0] ?? "",
                    q.choices[1] ?? "",
                    q.choices[2] ?? "",
                    q.choices[3] ?? "",
                  ],
                  answer: q.answer ?? 1,
                  explanation: q.explanation ?? "",
                }
              : blankDraft(),
          );
        }
        setDrafts(next);
        setPristine(JSON.stringify(next));
        // 最初の未登録枠 (全部登録済なら最後)
        setCur(Math.min(qs.length, QUESTIONS_PER_QUIZ - 1));
      })
      .catch((e: Error) => {
        if (alive) setLoadError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [quiz.id]);

  const dirty = useMemo(
    () => (drafts ? JSON.stringify(drafts) !== pristine : false),
    [drafts, pristine],
  );

  // 未保存警告
  useEffect(() => {
    if (!dirty) {
      window.onbeforeunload = null;
      return;
    }
    window.onbeforeunload = () => "未保存の変更があります";
    return () => {
      window.onbeforeunload = null;
    };
  }, [dirty]);

  if (loadError) {
    return (
      <div className="card">
        <EmptyState glyph="！" title="問題を読み込めませんでした" sub={loadError} />
      </div>
    );
  }
  if (!drafts) return <Skeletons n={2} />;

  const done = drafts.filter(isComplete).length;
  const d = drafts[cur]!;

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts((prev) => (prev ? prev.map((x, k) => (k === i ? { ...x, ...p } : x)) : prev));

  const save = () => {
    const payload: {
      statement: string;
      choice1: string;
      choice2: string;
      choice3: string;
      choice4: string;
      answer: number;
      explanation: string;
    }[] = [];
    let partial = 0;
    for (const x of drafts) {
      if (isComplete(x)) {
        payload.push({
          statement: x.statement.trim(),
          choice1: x.choices[0].trim(),
          choice2: x.choices[1].trim(),
          choice3: x.choices[2].trim(),
          choice4: x.choices[3].trim(),
          answer: x.answer,
          explanation: x.explanation.trim(),
        });
      } else if (!isBlank(x)) {
        partial++;
      }
    }
    const doSave = () => {
      setSaving(true);
      api("/api/questions/batch", { method: "POST", body: { quizId: quiz.id, questions: payload } })
        .then(() => {
          toast(`${payload.length}問を保存しました`, "ok");
          invalidate();
          window.onbeforeunload = null;
          onSaved();
        })
        .catch((e: Error) => {
          toast(e.message, "ng");
          setSaving(false);
        });
    };
    if (partial) {
      dialog({
        title: "入力途中の問題があります",
        message: `${partial}問は問題文か選択肢が未入力のため保存されません。完成した${payload.length}問だけ保存しますか？`,
        okLabel: "保存する",
      }).then((yes) => {
        if (yes) doSave();
      });
    } else {
      doSave();
    }
  };

  return (
    <div className="editor">
      <div className="editor-head">
        <div className="qpills" role="tablist" aria-label="問題番号">
          {drafts.map((x, i) => (
            <button
              key={i}
              type="button"
              className={"qpill" + (isComplete(x) ? " is-done" : isBlank(x) ? "" : " is-partial")}
              role="tab"
              aria-current={i === cur ? "true" : undefined}
              aria-label={`第${i + 1}問`}
              onClick={() => setCur(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-pad qform">
        <div className="row">
          <span className="q-num">第 {cur + 1} 問</span>
          <span className="muted">{d.id ? `登録済み (ID ${d.id})` : "未登録"}</span>
        </div>
        <label className="field">
          <span className="label">問題文</span>
          <textarea
            className="textarea code-input"
            placeholder="問題文を入力（```js のように ``` で囲むとコードブロックになります）"
            aria-label="問題文"
            value={d.statement}
            onChange={(e) => patch(cur, { statement: e.target.value })}
          />
          <span className="muted">
            改行はそのまま表示・`code` で装飾・```言語名
            で囲むとコードブロック＆コピー付きで表示されます
          </span>
          <span className="label">プレビュー</span>
          <div className="admin-preview rich">
            <RichText text={d.statement || "（プレビュー）"} />
          </div>
        </label>
        <div className="field">
          <span className="label">選択肢 4つ　※左の番号をクリックして正解を選ぶ</span>
          <div className="qform-choices">
            {d.choices.map((c, i) => (
              <div key={i} className="qform-choice">
                <button
                  type="button"
                  className="ans"
                  aria-pressed={d.answer === i + 1 ? "true" : "false"}
                  aria-label={`選択肢${i + 1}を正解にする`}
                  title="クリックで正解に設定"
                  onClick={() => patch(cur, { answer: i + 1 })}
                >
                  {i + 1}
                </button>
                <input
                  className="input"
                  placeholder={`選択肢 ${i + 1}`}
                  aria-label={`選択肢${i + 1}`}
                  value={c}
                  onChange={(e) =>
                    patch(cur, {
                      choices: d.choices.map((x, k) =>
                        k === i ? e.target.value : x,
                      ) as Draft["choices"],
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">解説</span>
          <textarea
            className="textarea"
            style={{ minHeight: 72 }}
            placeholder="解説（任意。``` で囲むとコードブロックになります）"
            aria-label="解説"
            value={d.explanation}
            onChange={(e) => patch(cur, { explanation: e.target.value })}
          />
          <div className="admin-preview admin-preview-sm rich">
            <RichText text={d.explanation} />
          </div>
        </label>
        <div className="qform-nav">
          <button
            type="button"
            className="btn btn-sm"
            disabled={cur === 0}
            onClick={() => setCur(cur - 1)}
          >
            ← 前
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() =>
              patch(cur, { statement: "", choices: ["", "", "", ""], answer: 1, explanation: "" })
            }
          >
            この枠をクリア
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={cur === QUESTIONS_PER_QUIZ - 1}
            onClick={() => setCur(cur + 1)}
          >
            次 →
          </button>
        </div>
      </div>

      <div className="save-bar">
        <div className={`status${dirty ? " is-dirty" : ""}`}>
          完成 {done} / {QUESTIONS_PER_QUIZ}
          {dirty ? " · 未保存の変更があります" : ""}
        </div>
        <Link className="btn btn-ghost btn-sm" to={`/admin/t/${quiz.topicId}`}>
          一覧へ
        </Link>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          保存する
        </button>
      </div>
    </div>
  );
};
