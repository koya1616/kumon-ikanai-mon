// 問題エディタ (ステッパー式: 1問ずつ集中して編集)。
// 10枠 drafts を持ち、保存は POST /api/questions/batch 一括。
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { Link } from "react-router";
import {
  api,
  IMAGE_MAX_BYTES,
  isCloze,
  isOrder,
  ORDER_MAX_ITEMS,
  ORDER_MIN_ITEMS,
  QUESTIONS_PER_QUIZ,
} from "../api";
import type { Question, Quiz } from "../api";
import { useDialog } from "../dialog";
import { ClozeStatement, parseClozeBlanks } from "../cloze";
import { OrderAnswerList } from "../order";
import { RichText } from "../rich";
import { EmptyState, Skeletons } from "../ui";
import { useToast } from "../toast";
import { useTree } from "../tree";

type DraftKind = "single_choice" | "cloze_text" | "order_blocks";

interface Draft {
  id: number | null;
  kind: DraftKind;
  statement: string;
  choices: [string, string, string, string];
  answer: number;
  answers: string[];
  items: string[];
  explanation: string;
}

const blankDraft = (): Draft => ({
  id: null,
  kind: "single_choice",
  statement: "",
  choices: ["", "", "", ""],
  answer: 1,
  answers: [""],
  items: Array(ORDER_MIN_ITEMS).fill(""),
  explanation: "",
});

/** statement中のマーカー番号 */
const markersOf = (statement: string): number[] => parseClozeBlanks(statement);

const isClozeComplete = (d: Draft): boolean => {
  if (!d.statement.trim() || d.answers.some((a) => !a.trim())) return false;
  const markers = markersOf(d.statement);
  return markers.length > 0 && markers.length === d.answers.length;
};

const isOrderComplete = (d: Draft): boolean => {
  if (!d.statement.trim()) return false;
  const items = d.items.map((s) => s.trim());
  if (items.length < ORDER_MIN_ITEMS || items.some((s) => !s)) return false;
  return new Set(items).size === items.length;
};

const isComplete = (d: Draft): boolean =>
  isCloze(d.kind)
    ? isClozeComplete(d)
    : isOrder(d.kind)
      ? isOrderComplete(d)
      : !!d.statement.trim() && d.choices.every((c) => c.trim());

const isBlank = (d: Draft): boolean =>
  !d.statement.trim() &&
  d.choices.every((c) => !c.trim()) &&
  d.answers.every((a) => !a.trim()) &&
  d.items.every((s) => !s.trim()) &&
  !d.explanation.trim();

export const QuestionEditor = ({ quiz, onSaved }: { quiz: Quiz; onSaved: () => void }) => {
  const toast = useToast();
  const dialog = useDialog();
  const { invalidate } = useTree();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [pristine, setPristine] = useState("");
  const [cur, setCur] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const explanationRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
              ? isCloze(q.questionType)
                ? {
                    id: q.id,
                    kind: "cloze_text" as const,
                    statement: q.statement ?? "",
                    choices: ["", "", "", ""] as [string, string, string, string],
                    answer: 1,
                    answers:
                      q.blanks && q.blanks.length ? q.blanks.map((b) => b.answer ?? "") : [""],
                    items: Array(ORDER_MIN_ITEMS).fill(""),
                    explanation: q.explanation ?? "",
                  }
                : isOrder(q.questionType)
                  ? {
                      id: q.id,
                      kind: "order_blocks" as const,
                      statement: q.statement ?? "",
                      choices: ["", "", "", ""] as [string, string, string, string],
                      answer: 1,
                      answers: [""],
                      items:
                        q.items && q.items.length >= ORDER_MIN_ITEMS
                          ? [...q.items]
                          : [...(q.items ?? []), ...Array(ORDER_MIN_ITEMS).fill("")].slice(
                              0,
                              ORDER_MIN_ITEMS,
                            ),
                      explanation: q.explanation ?? "",
                    }
                  : {
                      id: q.id,
                      kind: "single_choice" as const,
                      statement: q.statement ?? "",
                      choices: [
                        q.choices[0] ?? "",
                        q.choices[1] ?? "",
                        q.choices[2] ?? "",
                        q.choices[3] ?? "",
                      ],
                      answer: q.answer ?? 1,
                      answers: [""],
                      items: Array(ORDER_MIN_ITEMS).fill(""),
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
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
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

  /** 解説用画像をR2に登録し、記法を解説文に挿入する */
  const uploadImage = async (file: File, index: number) => {
    if (!file.type.startsWith("image/")) {
      toast("画像ファイルを選んでください", "ng");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast(`画像は${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)}MB以下にしてください`, "ng");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/images", { method: "POST", body: form });
      const data = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !data.url) throw new Error(data.error ?? `HTTP ${r.status}`);
      const alt = file.name.replace(/\s+/g, "_").slice(0, 50) || "画像";
      const mark = `![${alt}](${data.url})`;
      const el = explanationRef.current;
      setDrafts((prev) => {
        if (!prev) return prev;
        const target = prev[index]!;
        // 編集中の枠にフォーカスが残っていればカーソル位置へ、そうでなければ末尾へ
        if (el && document.activeElement === el) {
          const s = el.selectionStart ?? target.explanation.length;
          const e = el.selectionEnd ?? target.explanation.length;
          const next = `${target.explanation.slice(0, s)}\n${mark}\n${target.explanation.slice(e)}`;
          return prev.map((x, k) => (k === index ? { ...x, explanation: next } : x));
        }
        const sep = target.explanation && !target.explanation.endsWith("\n") ? "\n" : "";
        return prev.map((x, k) =>
          k === index ? { ...x, explanation: `${target.explanation}${sep}${mark}\n` } : x,
        );
      });
      toast("画像を登録しました", "ok");
    } catch (e) {
      toast((e as Error).message, "ng");
    } finally {
      setUploading(false);
    }
  };

  /** 解説欄への画像ペースト (テキスト貼付けは通常通り通す) */
  const onExplanationPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    void uploadImage(file, cur);
  };

  const save = () => {
    const payload: (
      | {
          statement: string;
          choice1: string;
          choice2: string;
          choice3: string;
          choice4: string;
          answer: number;
          explanation: string;
        }
      | { questionType: "cloze_text"; statement: string; answers: string[]; explanation: string }
      | { questionType: "order_blocks"; statement: string; items: string[]; explanation: string }
    )[] = [];
    let partial = 0;
    for (const x of drafts) {
      if (isComplete(x)) {
        if (isCloze(x.kind)) {
          payload.push({
            questionType: "cloze_text",
            statement: x.statement.trim(),
            answers: x.answers.map((a) => a.trim()),
            explanation: x.explanation.trim(),
          });
        } else if (isOrder(x.kind)) {
          payload.push({
            questionType: "order_blocks",
            statement: x.statement.trim(),
            items: x.items.map((s) => s.trim()),
            explanation: x.explanation.trim(),
          });
        } else {
          payload.push({
            statement: x.statement.trim(),
            choice1: x.choices[0].trim(),
            choice2: x.choices[1].trim(),
            choice3: x.choices[2].trim(),
            choice4: x.choices[3].trim(),
            answer: x.answer,
            explanation: x.explanation.trim(),
          });
        }
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
          setPristine(JSON.stringify(drafts));
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
        <div className="row wrap">
          <span className="q-num">第 {cur + 1} 問</span>
          <span className="muted">{d.id ? `登録済み (ID ${d.id})` : "未登録"}</span>
          <span className="grow" />
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={isBlank(d)}
            onClick={() =>
              patch(cur, {
                statement: "",
                choices: ["", "", "", ""],
                answer: 1,
                answers: [""],
                items: Array(ORDER_MIN_ITEMS).fill(""),
                explanation: "",
              })
            }
          >
            この枠をクリア
          </button>
          <div className="seg" role="group" aria-label="問題形式">
            <button
              type="button"
              className={"seg-btn" + (!isCloze(d.kind) && !isOrder(d.kind) ? " is-active" : "")}
              aria-pressed={!isCloze(d.kind) && !isOrder(d.kind)}
              onClick={() => patch(cur, { kind: "single_choice" })}
            >
              4択
            </button>
            <button
              type="button"
              className={"seg-btn" + (isCloze(d.kind) ? " is-active" : "")}
              aria-pressed={isCloze(d.kind)}
              onClick={() => patch(cur, { kind: "cloze_text" })}
            >
              穴埋め
            </button>
            <button
              type="button"
              className={"seg-btn" + (isOrder(d.kind) ? " is-active" : "")}
              aria-pressed={isOrder(d.kind)}
              onClick={() => patch(cur, { kind: "order_blocks" })}
            >
              並べ替え
            </button>
          </div>
        </div>
        <label className="field">
          <span className="label">問題文</span>
          <textarea
            className="textarea code-input textarea-lg"
            rows={8}
            placeholder={
              isCloze(d.kind)
                ? "空欄は {{1}} {{2}} のように書く（{{1}}から連番・長文OK）"
                : isOrder(d.kind)
                  ? "指示文を入力（例: 正しい順序に並べ替えよ。下はシャッフルして出題されます）"
                  : "問題文を入力（```js のように ``` で囲むとコードブロックになります）"
            }
            aria-label="問題文"
            value={d.statement}
            onChange={(e) => patch(cur, { statement: e.target.value })}
          />
          <span className="muted">
            {isCloze(d.kind) ? (
              <>
                空欄マーカー
                {(() => {
                  const m = markersOf(d.statement);
                  return m.length
                    ? `（検出: ${m.map((n) => `{{${n}}}`).join(" ")}）`
                    : "（未検出）";
                })()}{" "}
                · 改行はそのまま表示・`code` で装飾できます
              </>
            ) : isOrder(d.kind) ? (
              <>
                下のブロックが正しい順序として保存され、出題時はシャッフルされます ·
                改行はそのまま表示・`code` で装飾できます
              </>
            ) : (
              <>
                改行はそのまま表示・`code` で装飾・```言語名
                で囲むとコードブロック＆コピー付きで表示されます
              </>
            )}
          </span>
          <span className="label">プレビュー</span>
          <div className="admin-preview admin-preview-cloze rich">
            {isCloze(d.kind) ? (
              <ClozeStatement statement={d.statement || "（プレビュー）"} values={d.answers} />
            ) : isOrder(d.kind) ? (
              <div>
                <RichText text={d.statement || "（プレビュー）"} />
                <OrderAnswerList answers={d.items.filter((s) => s.trim())} />
              </div>
            ) : (
              <RichText text={d.statement || "（プレビュー）"} />
            )}
          </div>
        </label>
        {isCloze(d.kind) ? (
          <div className="field">
            <span className="label">正答（空欄の順番どおり・すべて必須）</span>
            <div className="qform-choices">
              {d.answers.map((a, i) => (
                <div key={i} className="qform-choice is-cloze">
                  <span className="ans is-static" aria-hidden="true">
                    {i + 1}
                  </span>
                  <input
                    className="input"
                    placeholder={`空欄${i + 1}の正答`}
                    aria-label={`空欄${i + 1}の正答`}
                    value={a}
                    onChange={(e) =>
                      patch(cur, {
                        answers: d.answers.map((x, k) => (k === i ? e.target.value : x)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`空欄${i + 1}を削除`}
                    disabled={d.answers.length <= 1}
                    onClick={() => patch(cur, { answers: d.answers.filter((_, k) => k !== i) })}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={d.answers.length >= 20}
                onClick={() => patch(cur, { answers: [...d.answers, ""] })}
              >
                ＋ 空欄を追加
              </button>
            </div>
            {(() => {
              const m = markersOf(d.statement);
              return m.length !== d.answers.length ? (
                <div className="actions">
                  <span className="warn">
                    マーカー{m.length}個・正答{d.answers.length}個：個数を合わせてください
                  </span>
                  {m.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        patch(cur, {
                          answers: m.map((_, k) => d.answers[k] ?? ""),
                        })
                      }
                    >
                      正答欄をマーカー数に合わせる
                    </button>
                  )}
                </div>
              ) : null;
            })()}
          </div>
        ) : isOrder(d.kind) ? (
          <div className="field">
            <span className="label">
              正しい順序のブロック（上から順番どおり・{ORDER_MIN_ITEMS}〜{ORDER_MAX_ITEMS}
              個・すべて必須・重複不可）
            </span>
            <div className="qform-choices">
              {d.items.map((s, i) => (
                <div key={i} className="qform-choice is-order">
                  <span className="ans is-static" aria-hidden="true">
                    {i + 1}
                  </span>
                  <input
                    className="input code-input"
                    placeholder={`ブロック${i + 1}（正しい順序の${i + 1}番目）`}
                    aria-label={`ブロック${i + 1}`}
                    value={s}
                    onChange={(e) =>
                      patch(cur, {
                        items: d.items.map((x, k) => (k === i ? e.target.value : x)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`ブロック${i + 1}を1つ上へ`}
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...d.items];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      patch(cur, { items: next });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`ブロック${i + 1}を1つ下へ`}
                    disabled={i === d.items.length - 1}
                    onClick={() => {
                      const next = [...d.items];
                      [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
                      patch(cur, { items: next });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`ブロック${i + 1}を削除`}
                    disabled={d.items.length <= ORDER_MIN_ITEMS}
                    onClick={() => patch(cur, { items: d.items.filter((_, k) => k !== i) })}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={d.items.length >= ORDER_MAX_ITEMS}
                onClick={() => patch(cur, { items: [...d.items, ""] })}
              >
                ＋ ブロックを追加
              </button>
            </div>
            {(() => {
              const trimmed = d.items.map((s) => s.trim());
              const dup = new Set(trimmed).size !== trimmed.filter(Boolean).length;
              return dup ? (
                <div className="actions">
                  <span className="warn">ブロックが重複しています</span>
                </div>
              ) : null;
            })()}
          </div>
        ) : (
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
        )}
        <label className="field">
          <span className="label">解説</span>
          <div className="row wrap">
            <button
              type="button"
              className="btn btn-sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "画像を登録中…" : "画像を追加"}
            </button>
            {uploading && <span className="muted">アップロード中…</span>}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              aria-label="解説に使う画像を選択"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadImage(file, cur);
              }}
            />
          </div>
          <textarea
            ref={explanationRef}
            className="textarea"
            style={{ minHeight: 72 }}
            placeholder="解説（任意。``` で囲むとコードブロックになります。画像ボタンや貼付けで画像も登録できます）"
            aria-label="解説"
            value={d.explanation}
            onChange={(e) => patch(cur, { explanation: e.target.value })}
            onPaste={onExplanationPaste}
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
          <span className="spacer muted tnum" style={{ textAlign: "center" }}>
            {cur + 1} / {QUESTIONS_PER_QUIZ}
          </span>
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
