// JSON一括取込カード (data/quizzes/*.json と同形式をフォームから登録)。
import { useState } from "react";
import { useNavigate } from "react-router";
import { api, QUESTIONS_PER_QUIZ } from "../api";
import { useToast } from "../toast";
import { useTree } from "../tree";

interface PreviewQuestion {
  no: number;
  kind: "4択" | "穴埋め" | "並べ替え";
  statement: string;
  detail: string;
}

interface ParsedSummary {
  category: string;
  topic: string;
  title: string;
  count: number;
  questions: PreviewQuestion[];
}

const toText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const previewOne = (q: unknown, index: number): PreviewQuestion => {
  const no = index + 1;
  const rec = (q ?? {}) as Record<string, unknown>;
  const statement = toText(rec.statement);
  if (rec.questionType === "cloze_text") {
    const answers = Array.isArray(rec.answers) ? rec.answers.map(toText).filter(Boolean) : [];
    return {
      no,
      kind: "穴埋め",
      statement,
      detail: answers.length ? `正答: ${answers.join(" / ")}` : "正答: (なし)",
    };
  }
  if (rec.questionType === "order_blocks") {
    const items = Array.isArray(rec.items) ? rec.items.map(toText).filter(Boolean) : [];
    return {
      no,
      kind: "並べ替え",
      statement,
      detail: items.length ? `${items.length}ブロック: ${items.join(" → ")}` : "ブロック: (なし)",
    };
  }
  const answer = Number(rec.answer);
  return {
    no,
    kind: "4択",
    statement,
    detail:
      Number.isInteger(answer) && answer >= 1 && answer <= 4
        ? `正答: 選択肢${answer}`
        : "正答: (なし)",
  };
};

const parseQuizJson = (text: string): ParsedSummary => {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("JSONはオブジェクトである必要があります");
  }
  const { category, topic, quiz, questions } = data as Record<string, unknown>;
  if (typeof category !== "string" || !category.trim()) {
    throw new Error("category は1〜100文字の文字列が必須です");
  }
  if (typeof topic !== "string" || !topic.trim()) {
    throw new Error("topic は1〜100文字の文字列が必須です");
  }
  if (
    !quiz ||
    typeof quiz !== "object" ||
    typeof (quiz as { title?: unknown }).title !== "string" ||
    !(quiz as { title: string }).title.trim()
  ) {
    throw new Error("quiz.title は1〜100文字の文字列が必須です");
  }
  if (!Array.isArray(questions) || questions.length !== QUESTIONS_PER_QUIZ) {
    throw new Error(
      `questions はちょうど${QUESTIONS_PER_QUIZ}問必要です (現在${Array.isArray(questions) ? questions.length : "非配列"}問)`,
    );
  }
  return {
    category: category.trim(),
    topic: topic.trim(),
    title: (quiz as { title: string }).title.trim(),
    count: questions.length,
    questions: (questions as unknown[]).map(previewOne),
  };
};

const SAMPLE = {
  category: "プログラミング",
  topic: "Golang",
  quiz: { title: "Golang基礎1", difficulty: 1, status: "published" },
  questions: [
    {
      statement: "問題文",
      choice1: "選択肢1",
      choice2: "選択肢2",
      choice3: "選択肢3",
      choice4: "選択肢4",
      answer: 1,
      explanation: "解説",
    },
  ],
};

export const JsonImportCard = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { invalidate } = useTree();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(
    "category / topic は同名再利用、quiz重複は中断、status省略時はpublishedになります。",
  );
  const [preview, setPreview] = useState<ParsedSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const check = (raw: string): unknown | null => {
    const src = raw.trim();
    if (!src) {
      setMsg("JSONを貼り付けか、ファイルを選択してください。");
      setPreview(null);
      return null;
    }
    try {
      const summary = parseQuizJson(src);
      setMsg("");
      setPreview(summary);
      return JSON.parse(src) as unknown;
    } catch (e) {
      setMsg(`エラー: ${(e as Error).message ?? String(e)}`);
      setPreview(null);
      return null;
    }
  };

  const submit = () => {
    const body = check(text);
    if (!body) {
      setMsg((m) => m || "エラー: 先に内容を確認してください");
      return;
    }
    setBusy(true);
    setMsg("登録中…");
    api<{ quizId: number; count: number }>("/api/quizzes/import", { method: "POST", body })
      .then((r) => {
        toast(`クイズを登録しました (${r.count}問)`, "ok");
        invalidate();
        setText("");
        setPreview(null);
        setMsg("");
        navigate(`/admin/q/${r.quizId}`);
      })
      .catch((e: Error) => {
        setMsg(`エラー: ${e.message}`);
        toast(e.message, "ng");
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="card card-pad">
      <div className="side-title">
        <span>JSONで一括登録 (10問)</span>
      </div>
      <div className="field">
        <span className="label">JSONファイル</span>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="JSONファイルを選択"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              const v = String(reader.result ?? "");
              setText(v);
              check(v);
            };
            reader.onerror = () => setMsg("エラー: ファイルを読み込めませんでした");
            reader.readAsText(f);
          }}
        />
      </div>
      <div className="field mt">
        <span className="label">JSON貼り付け</span>
        <textarea
          className="textarea code-input"
          style={{ minHeight: 180 }}
          placeholder={
            '{\n  "category": "プログラミング",\n  "topic": "Golang",\n  "quiz": { "title": "Golang基礎1", "difficulty": 1, "status": "published" },\n  "questions": [ { "statement": "...", "choice1": "...", "choice2": "...", "choice3": "...", "choice4": "...", "answer": 1, "explanation": "..." } ]\n} の形式で貼り付け (10問)'
          }
          aria-label="クイズJSON"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMsg("");
            setPreview(null);
          }}
        />
        <span className="muted">
          data/quizzes/example.json と同形式。questionsは10問ちょうど。穴埋めは{" "}
          {`{ "questionType": "cloze_text", "statement": "徳川{{1}}は…", "answers": ["家康"], "explanation": "…" }`}
          、並べ替えは{" "}
          {`{ "questionType": "order_blocks", "statement": "正しい順に並べ替えよ", "items": ["SELECT *", "FROM t", "WHERE x = 1", "ORDER BY y"], "explanation": "…" }`}{" "}
          の形式で混在可（並べ替えは4〜20ブロック・重複不可）。
        </span>
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setText(JSON.stringify(SAMPLE, null, 2));
            setMsg("雛形を入れました。questionsを10問に増やして登録してください。");
            setPreview(null);
          }}
        >
          雛形を入れる
        </button>
        <button type="button" className="btn btn-sm" onClick={() => check(text)}>
          内容を確認
        </button>
      </div>
      {preview && (
        <div className="mt">
          <div className="row wrap">
            <span className="chip chip-moegi">
              「{preview.category} › {preview.topic} › {preview.title}」 {preview.count}問
            </span>
          </div>
          <ol className="json-preview">
            {preview.questions.map((q) => (
              <li key={q.no} className="json-preview-item">
                <div className="row wrap">
                  <span className="tnum" aria-label={`${q.no}問目`}>
                    Q{q.no}
                  </span>
                  <span className="chip">{q.kind}</span>
                </div>
                <p className="json-preview-statement">{q.statement || "(問題文なし)"}</p>
                <p className="muted">{q.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="muted">{msg}</p>
      <div className="actions actions-end">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          JSONで登録する
        </button>
      </div>
    </div>
  );
};
