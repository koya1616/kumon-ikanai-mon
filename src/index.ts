/// <reference types="@cloudflare/workers-types" />
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { html } from "./view";
import { QUESTIONS_PER_QUIZ } from "./domain";
import {
  answerBodySchema,
  idParamSchema,
  questionBatchSchema,
  questionCreateSchema,
  questionSchema,
  quizBodySchema,
  quizPatchSchema,
  topicBodySchema,
  topicPatchSchema,
  categoryBodySchema,
} from "./domain";
import * as repo from "./repository";

// NOTE(2026 Cloudflare推奨): 本来は `wrangler types` 生成の
// `worker-configuration.d.ts` を使うこと。手書きEnvはズレの温床になるため、
// ここは最小限に留め、デプロイ前に `wrangler types` へ移行すること。
type Env = {
  DB: D1Database;
  BASIC_USER?: string;
  BASIC_PASS?: string;
};

const app = new Hono<{ Bindings: Env }>();

// 2026推奨ミドルウェア: ログ + セキュリティヘッダ (XSS/クリックジャッキング/CSP等の基礎)
app.use(logger());
app.use(secureHeaders());

// ヘルスチェックは認証の前に公開する (監視・死活確認のため)
app.get("/health", (c) => c.json({ ok: true }));
app.get("/", (c) => c.html(html));

// Basic認証: デフォルト認証情報へのフォールバックは禁止 (fail-closed)。
// BASIC_USER / BASIC_PASS 未設定は 500 で明示的に落とす。
app.use("*", async (c, next) => {
  const username = c.env.BASIC_USER;
  const password = c.env.BASIC_PASS;
  if (!username || !password) {
    throw new HTTPException(500, { message: "BASIC_USER / BASIC_PASS が未設定です" });
  }
  return basicAuth({ username, password })(c, next);
});

// 統一エラーレスポンス: { error: string }
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "内部エラーが発生しました" }, 500);
});
app.notFound((c) => c.json({ error: "見つかりません" }, 404));

const validationHook = (
  result: { success: boolean; error?: { issues?: { message?: string }[] } },
  c: { json: (o: unknown, s: number) => Response },
) => {
  if (!result.success) {
    const issue = result.error?.issues?.[0]?.message;
    return c.json({ error: issue ?? "入力が不正です" }, 400);
  }
  return undefined;
};

// zValidatorのhook型に合わせるための薄いラッパー (型は委譲し実態はvalidationHook)
const hook = validationHook as never;

const parseIdParam = (raw: string): number | undefined => {
  const parsed = idParamSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

/** Fisher–Yates (crypto乱数版: Math.randomより予測困難) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const rand = new Uint32Array(1);
    crypto.getRandomValues(rand);
    const j = Number(rand[0]! % (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---------- Category ----------

app.get("/api/categories", async (c) => {
  return c.json(await repo.listCategories(c.env.DB));
});

app.post("/api/categories", zValidator("json", categoryBodySchema, hook), async (c) => {
  const { title } = c.req.valid("json");
  try {
    const id = await repo.createCategory(c.env.DB, title);
    return c.json({ id, title }, 201);
  } catch {
    return c.json({ error: "同名のcategoryが既にあります" }, 409);
  }
});

app.put("/api/categories/:id", zValidator("json", categoryBodySchema, hook), async (c) => {
  const id = parseIdParam(c.req.param("id"));
  if (id === undefined) return c.json({ error: "idが不正です" }, 400);
  const { title } = c.req.valid("json");
  await repo.renameCategory(c.env.DB, id, title);
  return c.json({ ok: true });
});

const HISTORY_LOCK_MESSAGE =
  "受験履歴があるため削除できません。履歴を残す仕様のため、削除ではなく新規作成で対応してください。";

app.delete("/api/categories/:id", async (c) => {
  const categoryId = parseIdParam(c.req.param("id"));
  if (categoryId === undefined) return c.json({ error: "idが不正です" }, 400);
  if (await repo.categoryHasAttempts(c.env.DB, categoryId)) {
    return c.json({ error: HISTORY_LOCK_MESSAGE }, 409);
  }
  try {
    await repo.deleteCategory(c.env.DB, categoryId);
  } catch (e) {
    if (repo.isForeignKeyError(e)) return c.json({ error: HISTORY_LOCK_MESSAGE }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

// ---------- Topic ----------

app.get(
  "/api/topics",
  zValidator("query", z.object({ categoryId: idParamSchema.optional() }), hook),
  async (c) => {
    const { categoryId } = c.req.valid("query");
    return c.json(await repo.listTopics(c.env.DB, categoryId));
  },
);

app.post("/api/topics", zValidator("json", topicBodySchema, hook), async (c) => {
  const { categoryId, title } = c.req.valid("json");
  try {
    const id = await repo.createTopic(c.env.DB, categoryId, title);
    return c.json({ id }, 201);
  } catch {
    return c.json({ error: "同名のtopicが既にあります / categoryが存在しません" }, 409);
  }
});

app.put("/api/topics/:id", zValidator("json", topicPatchSchema, hook), async (c) => {
  const id = parseIdParam(c.req.param("id"));
  if (id === undefined) return c.json({ error: "idが不正です" }, 400);
  await repo.updateTopic(c.env.DB, id, c.req.valid("json"));
  return c.json({ ok: true });
});

app.delete("/api/topics/:id", async (c) => {
  const topicId = parseIdParam(c.req.param("id"));
  if (topicId === undefined) return c.json({ error: "idが不正です" }, 400);
  if (await repo.topicHasAttempts(c.env.DB, topicId)) {
    return c.json({ error: HISTORY_LOCK_MESSAGE }, 409);
  }
  try {
    await repo.deleteTopic(c.env.DB, topicId);
  } catch (e) {
    if (repo.isForeignKeyError(e)) return c.json({ error: HISTORY_LOCK_MESSAGE }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

// ---------- Quiz ----------

app.get(
  "/api/quizzes",
  zValidator(
    "query",
    z.object({
      topicId: idParamSchema.optional(),
      categoryId: idParamSchema.optional(),
      difficulty: z.coerce.number().int().min(1).max(5).optional(),
      status: z.enum(["draft", "published", "archived"]).optional(),
    }),
    hook,
  ),
  async (c) => {
    return c.json(await repo.listQuizzes(c.env.DB, c.req.valid("query")));
  },
);

app.post("/api/quizzes", zValidator("json", quizBodySchema, hook), async (c) => {
  const { topicId, title, difficulty, status } = c.req.valid("json");
  try {
    const id = await repo.createQuiz(c.env.DB, topicId, title, difficulty, status ?? "published");
    return c.json({ id }, 201);
  } catch {
    return c.json({ error: "同名のquizが既にあります / topicが存在しません" }, 409);
  }
});

app.put("/api/quizzes/:id", zValidator("json", quizPatchSchema, hook), async (c) => {
  const id = parseIdParam(c.req.param("id"));
  if (id === undefined) return c.json({ error: "idが不正です" }, 400);
  await repo.updateQuiz(c.env.DB, id, c.req.valid("json"));
  return c.json({ ok: true });
});

app.delete("/api/quizzes/:id", async (c) => {
  const quizId = parseIdParam(c.req.param("id"));
  if (quizId === undefined) return c.json({ error: "idが不正です" }, 400);
  if (await repo.quizHasAttempts(c.env.DB, quizId)) {
    return c.json({ error: HISTORY_LOCK_MESSAGE }, 409);
  }
  try {
    await repo.deleteQuiz(c.env.DB, quizId);
  } catch (e) {
    if (repo.isForeignKeyError(e)) return c.json({ error: HISTORY_LOCK_MESSAGE }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

// 出題用: 答え・解説は隠す。published以外は出題除外
app.get("/api/quizzes/:id/play", async (c) => {
  const quizId = parseIdParam(c.req.param("id"));
  if (quizId === undefined) return c.json({ error: "quizIdが不正です" }, 400);
  const quiz = await repo.getQuizWithBreadcrumb(c.env.DB, quizId);
  if (!quiz) return c.json({ error: "quizがありません" }, 404);
  if ((quiz as { status?: string }).status === "archived") {
    return c.json({ error: "このクイズは公開終了のため受験できません" }, 410);
  }
  if ((quiz as { status?: string }).status !== "published") {
    return c.json({ error: "このクイズはまだ公開されていません" }, 403);
  }
  const questions = await repo.listPlayQuestions(c.env.DB, quizId);
  if (questions.length !== QUESTIONS_PER_QUIZ) {
    return c.json(
      {
        error: `このクイズは${QUESTIONS_PER_QUIZ}問揃っていません（現在${questions.length}問）。管理タブで${QUESTIONS_PER_QUIZ}問登録してください。`,
      },
      422,
    );
  }
  return c.json({ quiz, questions: shuffle(questions) });
});

// ---------- Question (管理: 答え付き) ----------

app.get(
  "/api/questions",
  zValidator("query", z.object({ quizId: idParamSchema }), hook),
  async (c) => {
    const { quizId } = c.req.valid("query");
    return c.json(await repo.listQuestionsByQuiz(c.env.DB, quizId));
  },
);

app.post("/api/questions", zValidator("json", questionCreateSchema, hook), async (c) => {
  const { quizId, ...q } = c.req.valid("json");
  const id = await repo.createQuestion(c.env.DB, quizId, {
    ...q,
    explanation: q.explanation ?? "",
  });
  return c.json({ id }, 201);
});

const ANSWERED_LOCK_MESSAGE = "受験履歴のある問題は削除できません。archived化で対応してください。";

app.put("/api/questions/:id", zValidator("json", questionSchema, hook), async (c) => {
  const questionId = parseIdParam(c.req.param("id"));
  if (questionId === undefined) return c.json({ error: "idが不正です" }, 400);
  // versioningのため履歴があっても編集可 (= 新しいversionを発行する)
  const q = c.req.valid("json");
  try {
    await repo.updateQuestion(c.env.DB, questionId, { ...q, explanation: q.explanation ?? "" });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 404);
  }
  return c.json({ ok: true });
});

app.delete("/api/questions/:id", async (c) => {
  const questionId = parseIdParam(c.req.param("id"));
  if (questionId === undefined) return c.json({ error: "idが不正です" }, 400);
  if (await repo.questionHasAnswers(c.env.DB, questionId)) {
    return c.json({ error: ANSWERED_LOCK_MESSAGE }, 409);
  }
  try {
    await repo.deleteQuestion(c.env.DB, questionId);
  } catch (e) {
    if (repo.isForeignKeyError(e)) return c.json({ error: ANSWERED_LOCK_MESSAGE }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

// 10問保存: versioning方式 (履歴があっても新version発行で保存可。問題数削減のみ履歴ありは不可)
app.post("/api/questions/batch", zValidator("json", questionBatchSchema, hook), async (c) => {
  const { quizId, questions } = c.req.valid("json");
  try {
    const count = await repo.replaceQuestions(
      c.env.DB,
      quizId,
      questions.map((q) => ({ ...q, explanation: q.explanation ?? "" })),
    );
    return c.json({ ok: true, count });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

// ---------- Attempt (解答結果の蓄積: 上書きせず溜めていく) ----------

// 挑戦開始 (出題スナップショットをattempt_questionsに固定して返す)
app.post("/api/quizzes/:id/attempts", async (c) => {
  const quizId = parseIdParam(c.req.param("id"));
  if (quizId === undefined) return c.json({ error: "quizIdが不正です" }, 400);
  const quiz = await repo.getQuizWithBreadcrumb(c.env.DB, quizId);
  if (!quiz) return c.json({ error: "quizがありません" }, 404);
  if ((quiz as { status?: string }).status === "archived") {
    return c.json({ error: "このクイズは公開終了のため受験できません" }, 410);
  }
  if ((quiz as { status?: string }).status !== "published") {
    return c.json({ error: "このクイズはまだ公開されていません" }, 403);
  }
  const ready = await repo.countQuestions(c.env.DB, quizId);
  if (ready !== QUESTIONS_PER_QUIZ) {
    return c.json(
      {
        error: `このクイズは${QUESTIONS_PER_QUIZ}問揃っていません（現在${ready}問）。管理タブで${QUESTIONS_PER_QUIZ}問登録してください。`,
      },
      422,
    );
  }
  const { attemptId, questions } = await repo.createAttempt(c.env.DB, quizId);
  return c.json({ attemptId, questions }, 201);
});

// 1問回答 (記録 + 採点)
app.post("/api/attempts/:id/answers", zValidator("json", answerBodySchema, hook), async (c) => {
  const attemptId = parseIdParam(c.req.param("id"));
  if (attemptId === undefined) return c.json({ error: "attemptIdが不正です" }, 400);
  const { attemptQuestionId, choice } = c.req.valid("json");
  try {
    return c.json(await repo.recordAnswer(c.env.DB, attemptId, attemptQuestionId, choice));
  } catch (e) {
    const message = (e as Error).message;
    if (message === "挑戦がありません" || message === "問題がありません") {
      return c.json({ error: message }, 404);
    }
    if (message === "この挑戦の問題ではありません") {
      return c.json({ error: message }, 422);
    }
    return c.json({ error: message }, 400);
  }
});

// 挑戦完了 (スコア確定)
app.post("/api/attempts/:id/complete", async (c) => {
  const attemptId = parseIdParam(c.req.param("id"));
  if (attemptId === undefined) return c.json({ error: "attemptIdが不正です" }, 400);
  try {
    return c.json(await repo.completeAttempt(c.env.DB, attemptId));
  } catch (e) {
    const message = (e as Error).message;
    return c.json({ error: message }, message === "挑戦がありません" ? 404 : 400);
  }
});

// quizの挑戦履歴
app.get(
  "/api/quizzes/:id/attempts",
  zValidator("query", z.object({ limit: z.coerce.number().int().optional() }), hook),
  async (c) => {
    const quizId = parseIdParam(c.req.param("id"));
    if (quizId === undefined) return c.json({ error: "quizIdが不正です" }, 400);
    const rawLimit = c.req.valid("query").limit ?? 10;
    const limit = Math.min(Math.max(rawLimit, 1), 50);
    return c.json(await repo.listAttemptsByQuiz(c.env.DB, quizId, limit));
  },
);

// 全quizの挑戦サマリー (ツリーのベスト表示用)
app.get("/api/attempts/summary", async (c) => {
  return c.json(await repo.listAttemptSummaries(c.env.DB));
});

// ---------- Tree ----------

app.get("/api/tree", async (c) => {
  return c.json(await repo.getCategoryTree(c.env.DB));
});

export default app;
