import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../api";
import type { AttemptState, PlayQuestion, QuizMeta } from "../api";
import { useDialog } from "../dialog";
import {
  applyChoiceOrder,
  clearResume,
  readResume,
  shuffle,
  toDisplayedPos,
  toOriginalPos,
  withShuffledChoices,
  writeResume,
} from "../resume";
import { RichText } from "../rich";
import { getSession, setSession } from "../session";
import type { PlaySession } from "../session";
import { EmptyState, Icon, Stars } from "../ui";
import { useToast } from "../toast";
import { useTree } from "../tree";

interface ResumeChoice {
  st: AttemptState;
  ordered: PlayQuestion[];
  ansById: Record<number, AttemptState["answers"][number]>;
}

interface LivePlay {
  attemptId: number;
  quiz: QuizMeta;
  questions: PlayQuestion[];
  index: number;
  answers: PlaySession["answers"];
  busy: boolean;
}

type Phase =
  | { name: "loading"; message: string }
  | { name: "resume"; choice: ResumeChoice }
  | { name: "playing"; play: LivePlay }
  | { name: "error"; message: string };

const fetchMeta = async (quizId: number): Promise<QuizMeta> => {
  const meta = await api<{ quiz: QuizMeta }>(`/api/quizzes/${quizId}/play`);
  return meta.quiz;
};

export const Play = () => {
  const { id } = useParams();
  const quizId = Number(id);
  const { loadTree } = useTree();
  const toast = useToast();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ name: "loading", message: "出題を準備しています…" });

  const startNew = useCallback(async () => {
    setPhase({ name: "loading", message: "出題を準備しています…" });
    try {
      const [quiz, started] = await Promise.all([
        fetchMeta(quizId),
        api<{ attemptId: number; questions: PlayQuestion[] }>(`/api/quizzes/${quizId}/attempts`, {
          method: "POST",
        }),
        loadTree(),
      ]);
      const shuffled = shuffle(started.questions ?? []).map(withShuffledChoices);
      const choiceOrders: Record<number, number[]> = {};
      for (const q of shuffled) {
        if (q.attemptQuestionId != null && q.choiceMap) {
          choiceOrders[q.attemptQuestionId] = q.choiceMap;
        }
      }
      writeResume(
        quizId,
        started.attemptId,
        shuffled.map((q) => q.attemptQuestionId as number),
        choiceOrders,
      );
      setPhase({
        name: "playing",
        play: {
          attemptId: started.attemptId,
          quiz,
          questions: shuffled,
          index: 0,
          answers: [],
          busy: false,
        },
      });
    } catch (e) {
      setPhase({ name: "error", message: (e as Error).message });
    }
  }, [quizId, loadTree]);

  const restoreSession = useCallback(
    async (choice: ResumeChoice) => {
      setPhase({ name: "loading", message: "つづきを読み込んでいます…" });
      try {
        const [quiz] = await Promise.all([fetchMeta(quizId), loadTree()]);
        const answers: PlaySession["answers"] = [];
        for (let i = 0; i < choice.st.answers.length; i++) {
          const q = choice.ordered[i]!;
          const a = choice.ansById[q.attemptQuestionId as number]!;
          answers.push({
            q,
            choice: toDisplayedPos(q, a.choice),
            ok: a.correct,
            correct: toDisplayedPos(q, a.correctAnswer),
            exp: a.explanation ?? "",
          });
        }
        setPhase({
          name: "playing",
          play: {
            attemptId: choice.st.attemptId,
            quiz,
            questions: choice.ordered,
            index: answers.length,
            answers,
            busy: false,
          },
        });
        toast("前回のつづきから再開しました", "");
      } catch {
        clearResume(quizId);
        await startNew();
      }
    },
    [quizId, loadTree, startNew, toast],
  );

  // 開始判定: 未完了の自分の挑戦が残っていれば「つづき/はじめ」を選ばせる。
  // 順序不明・不整合の場合は安全側で新規開始する。
  useEffect(() => {
    let alive = true;
    const saved = readResume(quizId);
    if (!saved) {
      void startNew();
      return () => {
        alive = false;
      };
    }
    api<AttemptState>(`/api/attempts/${saved.attemptId}`)
      .then((st) => {
        if (!alive) return;
        if (
          !st ||
          st.completedAt ||
          st.quizId !== quizId ||
          !st.questions ||
          st.questions.length !== saved.order.length ||
          !st.answers ||
          !st.answers.length ||
          st.answers.length >= st.questions.length
        ) {
          if (st?.completedAt) clearResume(quizId);
          void startNew();
          return;
        }
        const byId: Record<number, PlayQuestion> = {};
        for (const q of st.questions) byId[q.attemptQuestionId as number] = q;
        const ordered = saved.order.map((oid) => {
          const orig = byId[oid];
          if (!orig) return undefined;
          return applyChoiceOrder(orig, saved.choiceOrders?.[oid]);
        });
        if (ordered.some((q) => !q)) {
          clearResume(quizId);
          void startNew();
          return;
        }
        const ansById: ResumeChoice["ansById"] = {};
        for (const a of st.answers) ansById[a.attemptQuestionId] = a;
        // 回答は表示順の prefix のはず。崩れていたら新規開始する。
        for (let i = 0; i < st.answers.length; i++) {
          if (!ansById[(ordered[i] as PlayQuestion).attemptQuestionId as number]) {
            clearResume(quizId);
            void startNew();
            return;
          }
        }
        setPhase({ name: "resume", choice: { st, ordered: ordered as PlayQuestion[], ansById } });
      })
      .catch(() => {
        if (alive) void startNew();
      });
    return () => {
      alive = false;
    };
  }, [quizId, startNew]);

  if (phase.name === "loading") {
    return (
      <div className="screen">
        <div className="play">
          <div className="play-body">
            <div className="muted mt">{phase.message}</div>
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === "error") {
    return (
      <div className="screen">
        <div className="play">
          <div className="play-body">
            <div className="card mt">
              <EmptyState glyph="！" title="このクイズは開始できません" sub={phase.message} />
            </div>
            <div className="row" style={{ justifyContent: "center" }}>
              <button type="button" className="btn" onClick={() => navigate(-1)}>
                戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase.name === "resume") {
    const done = phase.choice.st.answers.length;
    const total = phase.choice.ordered.length;
    return (
      <div className="screen">
        <div className="play">
          <div className="play-body">
            <div className="card resume-card">
              <h1 className="title-md">前回のつづきがあります</h1>
              <div className="resume-count tnum">
                {done} / {total} 問まで回答ずみ
              </div>
              <div className="resume-bar" aria-hidden="true">
                <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
              <p className="muted">同じ並び順で再開できます。</p>
              <div className="resume-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void restoreSession(phase.choice)}
                >
                  つづきから
                </button>
                <button type="button" className="btn" onClick={() => void startNew()}>
                  はじめから
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PlayingScreen
      key={phase.play.attemptId}
      play={phase.play}
      onChange={(play) => setPhase({ name: "playing", play })}
    />
  );
};

const PlayingScreen = ({ play, onChange }: { play: LivePlay; onChange: (p: LivePlay) => void }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const dialog = useDialog();

  const q = play.questions[play.index]!;
  const revealed = play.answers.length > play.index;
  const result = revealed ? play.answers[play.index]! : null;
  const score = play.answers.filter((a) => a.ok).length;
  const answeredCount = play.answers.length;
  const last = play.index + 1 >= play.questions.length;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [play.index, play.attemptId]);

  const next = useCallback(() => {
    if (play.answers.length <= play.index) return;
    if (play.index + 1 < play.questions.length) {
      onChange({ ...play, index: play.index + 1 });
    } else {
      setSession({
        attemptId: play.attemptId,
        quiz: play.quiz,
        questions: play.questions,
        answers: play.answers,
        score: play.answers.filter((a) => a.ok).length,
      });
      navigate("/result");
    }
  }, [play, onChange, navigate]);

  const answer = useCallback(
    (displayed: number) => {
      if (play.answers.length > play.index || play.busy) return;
      const sending = { ...play, busy: true };
      onChange(sending);
      // 表示順→元の番号に読み替えて送信する (サーバは元のpositionで採点する)
      const original = toOriginalPos(q, displayed);
      api<{ correct: boolean; correctAnswer: number; explanation: string }>(
        `/api/attempts/${play.attemptId}/answers`,
        { method: "POST", body: { attemptQuestionId: q.attemptQuestionId, choice: original } },
      )
        .then((res) => {
          onChange({
            ...sending,
            busy: false,
            answers: [
              ...sending.answers,
              {
                q,
                choice: displayed,
                ok: !!res.correct,
                correct: toDisplayedPos(q, res.correctAnswer),
                exp: res.explanation ?? "",
              },
            ],
          });
        })
        .catch((e: Error) => {
          onChange({ ...sending, busy: false });
          toast(e.message || "回答を送信できませんでした", "ng");
        });
    },
    [play, q, onChange, toast],
  );

  // 次へボタンを回答後にフォーカス (Enter ですぐ進める)
  useEffect(() => {
    if (revealed) {
      document.getElementById("play-next")?.focus({ preventScroll: true });
    }
  }, [revealed, play.index]);

  const quit = useCallback(() => {
    dialog({
      title: "途中でやめますか？",
      message: "ここまでの回答は記録されます。このブラウザからは次回つづきから再開できます。",
      okLabel: "やめる",
      danger: true,
    }).then((yes) => {
      if (yes) navigate(`/c/${play.quiz.categoryId}`);
    });
  }, [dialog, navigate, play.quiz.categoryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dlg = document.getElementById("dialog") as HTMLDialogElement | null;
      if (dlg?.open) return;
      if (e.key >= "1" && e.key <= "4" && !revealed && !play.busy) {
        const idx = Number(e.key) - 1;
        if (play.questions[play.index]?.choices[idx] !== undefined) {
          e.preventDefault();
          answer(Number(e.key));
        }
      } else if ((e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && revealed) {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [play, revealed, answer, next]);

  // Result ガード用に最新の回答状況を保持 (Result へは next 経由でのみ遷移する)
  useEffect(() => {
    const cur = getSession();
    if (cur && cur.attemptId === play.attemptId) {
      setSession({ ...cur, answers: play.answers, score });
    }
  }, [play.attemptId, play.answers, score]);

  return (
    <div className="screen">
      <div className="play">
        <div className="play-top">
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            aria-label="やめる"
            onClick={quit}
          >
            <Icon name="close" />
          </button>
          <div className="play-dots" aria-hidden="true">
            {play.questions.map((qq, i) => {
              const a = play.answers[i];
              return (
                <i
                  key={qq.attemptQuestionId ?? i}
                  className={
                    "play-dot" +
                    (a ? (a.ok ? " is-ok" : " is-ng") : i === play.index ? " is-now" : "")
                  }
                />
              );
            })}
          </div>
          <div
            className={
              "play-score" +
              (answeredCount ? (score / answeredCount >= 0.5 ? " is-ok" : " is-ng") : "")
            }
            aria-live="polite"
          >
            ○{score} ×{answeredCount - score}
          </div>
          <div className="play-count" aria-live="polite">
            Q{play.index + 1} / {play.questions.length}
          </div>
        </div>
        <div className="play-body">
          <div className="play-crumb">
            {`${play.quiz.categoryTitle} › ${play.quiz.topicTitle} › ${play.quiz.title} `}
            <Stars n={play.quiz.difficulty} />
          </div>
          <div className="q-wrap">
            <div className="q-num">第 {play.index + 1} 問</div>
            <h1 className="q-statement rich">
              <RichText text={q.statement} />
            </h1>
            <div
              className={"stamp" + (result ? ` show ${result.ok ? "is-ok" : "is-ng"}` : "")}
              aria-hidden="true"
            >
              {result ? (result.ok ? "○" : "×") : ""}
            </div>
          </div>
          <div className="choices" role="group" aria-label="選択肢">
            {q.choices.map((text, i) => {
              const n = i + 1;
              let cls = "choice";
              if (result) {
                if (n === result.correct) cls += " is-correct";
                else if (n === result.choice) cls += " is-wrong";
                else cls += " is-dim";
              }
              return (
                <button
                  key={n}
                  type="button"
                  className={cls}
                  disabled={revealed || play.busy}
                  onClick={() => answer(n)}
                >
                  <span className="choice-key" aria-hidden="true">
                    {n}
                  </span>
                  <span className="choice-label rich">
                    <RichText text={text} />
                  </span>
                  {result && n === result.correct && (
                    <span className="choice-mark" aria-hidden="true">
                      ○
                    </span>
                  )}
                  {result && n === result.choice && n !== result.correct && (
                    <span className="choice-mark" aria-hidden="true">
                      ×
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="muted" style={{ textAlign: "center" }}>
            <span className="kbd">1</span> – <span className="kbd">4</span> で回答 ·{" "}
            <span className="kbd">Enter</span> で次へ
          </p>
        </div>
        <div className={`sheet${result ? " is-open" : ""}`}>
          {result && (
            <div className={`sheet-card ${result.ok ? "is-ok" : "is-ng"}`}>
              <div className="sheet-title">
                <span className="sheet-badge" aria-hidden="true">
                  {result.ok ? "○" : "×"}
                </span>
                <span>{result.ok ? "正解！" : `不正解… 正解は ${result.correct} 番`}</span>
                <span className="sheet-score">
                  現在 {score} / {play.index + 1} 正解
                </span>
                <span className="kbd">Enter</span>
              </div>
              <div className="sheet-exp rich">
                <RichText text={result.exp || "（解説はありません）"} />
              </div>
              <div className="sheet-actions">
                <button
                  id="play-next"
                  type="button"
                  className={`btn ${last ? "btn-primary" : "btn-ink"}`}
                  onClick={next}
                >
                  {last ? "結果を見る" : "次の問題 →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
