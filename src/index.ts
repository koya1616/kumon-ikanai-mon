/// <reference types="@cloudflare/workers-types" />
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
  quizImportSchema,
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

// ---------- レスポンス基盤 (Web標準のみ。フレームワーク不使用) ----------

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

function unauthorized(): Response {
  return json({ error: "認証が必要です" }, 401, {
    "WWW-Authenticate": 'Basic realm="Secure Area"',
  });
}

// ---------- Basic認証 (fail-closed + タイミングセーフ比較) ----------
// デフォルト認証情報へのフォールバックは禁止。BASIC_USER / BASIC_PASS 未設定は
// 500 で明示的に落とす。公開するのは /health のみ。

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const xa = new Uint8Array(da);
  const xb = new Uint8Array(db);
  if (xa.length !== xb.length) return false;
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i]! ^ xb[i]!;
  return diff === 0;
}

async function checkAuth(req: Request, env: Env): Promise<Response | null> {
  const username = env.BASIC_USER;
  const password = env.BASIC_PASS;
  if (!username || !password) {
    return json({ error: "BASIC_USER / BASIC_PASS が未設定です" }, 500);
  }
  const m = req.headers.get("Authorization")?.match(/^Basic (.+)$/);
  if (m?.[1]) {
    try {
      const decoded = atob(m[1]);
      const idx = decoded.indexOf(":");
      const u = idx < 0 ? decoded : decoded.slice(0, idx);
      const p = idx < 0 ? "" : decoded.slice(idx + 1);
      if ((await timingSafeEqual(u, username)) && (await timingSafeEqual(p, password))) {
        return null;
      }
    } catch {
      /* base64 不正は認証失敗として扱う */
    }
  }
  return unauthorized();
}

// ---------- 入力バリデーション (Zod 直利用) ----------

/** 失敗時は 400 { error } を返す。成功時はパース済みデータを返す。 */
function validated<T>(parsed: {
  success: boolean;
  data?: T;
  error?: { issues?: { message?: string }[] };
}): { data: T } | { res: Response } {
  if (parsed.success) return { data: parsed.data as T };
  const issue = parsed.error?.issues?.[0]?.message;
  return { res: json({ error: issue ?? "入力が不正です" }, 400) };
}

function parseIdParam(raw: string): number | undefined {
  const parsed = idParamSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

async function readJson(req: Request): Promise<{ value: unknown } | { res: Response }> {
  try {
    return { value: (await req.json()) as unknown };
  } catch {
    return { res: json({ error: "入力が不正です" }, 400) };
  }
}

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

const HISTORY_LOCK_MESSAGE =
  "受験履歴があるため削除できません。履歴を残す仕様のため、削除ではなく新規作成で対応してください。";

const ANSWERED_LOCK_MESSAGE = "受験履歴のある問題は削除できません。archived化で対応してください。";

// ---------- ルーティング (exact match を :id より先に評価する) ----------

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();
  const db = env.DB;

  // ヘルスチェックは認証の前に公開する (監視・死活確認のため)
  if (method === "GET" && path === "/health") return json({ ok: true });

  const auth = await checkAuth(req, env);
  if (auth) return auth;

  if (method === "GET" && path === "/") {
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=UTF-8", ...SECURITY_HEADERS },
    });
  }

  // ---------- Category ----------
  if (path === "/api/categories") {
    if (method === "GET") return json(await repo.listCategories(db));
    if (method === "POST") {
      const body = await readJson(req);
      if ("res" in body) return body.res;
      const v = validated(categoryBodySchema.safeParse(body.value));
      if ("res" in v) return v.res;
      try {
        const id = await repo.createCategory(db, v.data.title);
        return json({ id, title: v.data.title }, 201);
      } catch {
        return json({ error: "同名のcategoryが既にあります" }, 409);
      }
    }
  }
  {
    const m = /^\/api\/categories\/([^/]+)$/.exec(path);
    if (m) {
      const id = parseIdParam(m[1]!);
      if (id === undefined) return json({ error: "idが不正です" }, 400);
      if (method === "PUT") {
        const body = await readJson(req);
        if ("res" in body) return body.res;
        const v = validated(categoryBodySchema.safeParse(body.value));
        if ("res" in v) return v.res;
        await repo.renameCategory(db, id, v.data.title);
        return json({ ok: true });
      }
      if (method === "DELETE") {
        if (await repo.categoryHasAttempts(db, id)) {
          return json({ error: HISTORY_LOCK_MESSAGE }, 409);
        }
        try {
          await repo.deleteCategory(db, id);
        } catch (e) {
          if (repo.isForeignKeyError(e)) return json({ error: HISTORY_LOCK_MESSAGE }, 409);
          throw e;
        }
        return json({ ok: true });
      }
    }
  }

  // ---------- Topic ----------
  if (path === "/api/topics") {
    if (method === "GET") {
      const raw = url.searchParams.get("categoryId") ?? undefined;
      const v = validated(
        z.object({ categoryId: idParamSchema.optional() }).safeParse({ categoryId: raw }),
      );
      if ("res" in v) return v.res;
      return json(await repo.listTopics(db, v.data.categoryId));
    }
    if (method === "POST") {
      const body = await readJson(req);
      if ("res" in body) return body.res;
      const v = validated(topicBodySchema.safeParse(body.value));
      if ("res" in v) return v.res;
      try {
        const id = await repo.createTopic(db, v.data.categoryId, v.data.title);
        return json({ id }, 201);
      } catch {
        return json({ error: "同名のtopicが既にあります / categoryが存在しません" }, 409);
      }
    }
  }
  {
    const m = /^\/api\/topics\/([^/]+)$/.exec(path);
    if (m) {
      const id = parseIdParam(m[1]!);
      if (id === undefined) return json({ error: "idが不正です" }, 400);
      if (method === "PUT") {
        const body = await readJson(req);
        if ("res" in body) return body.res;
        const v = validated(topicPatchSchema.safeParse(body.value));
        if ("res" in v) return v.res;
        await repo.updateTopic(db, id, v.data);
        return json({ ok: true });
      }
      if (method === "DELETE") {
        if (await repo.topicHasAttempts(db, id)) {
          return json({ error: HISTORY_LOCK_MESSAGE }, 409);
        }
        try {
          await repo.deleteTopic(db, id);
        } catch (e) {
          if (repo.isForeignKeyError(e)) return json({ error: HISTORY_LOCK_MESSAGE }, 409);
          throw e;
        }
        return json({ ok: true });
      }
    }
  }

  // ---------- Quiz ----------
  if (path === "/api/quizzes") {
    if (method === "GET") {
      const v = validated(
        z
          .object({
            topicId: idParamSchema.optional(),
            categoryId: idParamSchema.optional(),
            difficulty: z.coerce.number().int().min(1).max(5).optional(),
            status: z.enum(["draft", "published", "archived"]).optional(),
          })
          .safeParse({
            topicId: url.searchParams.get("topicId") ?? undefined,
            categoryId: url.searchParams.get("categoryId") ?? undefined,
            difficulty: url.searchParams.get("difficulty") ?? undefined,
            status: url.searchParams.get("status") ?? undefined,
          }),
      );
      if ("res" in v) return v.res;
      return json(await repo.listQuizzes(db, v.data));
    }
    if (method === "POST") {
      const body = await readJson(req);
      if ("res" in body) return body.res;
      const v = validated(quizBodySchema.safeParse(body.value));
      if ("res" in v) return v.res;
      try {
        const id = await repo.createQuiz(
          db,
          v.data.topicId,
          v.data.title,
          v.data.difficulty,
          v.data.status,
        );
        return json({ id }, 201);
      } catch {
        return json({ error: "同名のquizが既にあります / topicが存在しません" }, 409);
      }
    }
  }

  // JSON一括取込: category/topic を find-or-create し、quiz + 10問を作成する。
  // scripts/add-quiz.mjs と同等の処理を管理画面フォームから行うためのエンドポイント。
  // 同名quizが同一topicに存在する場合は409で中断する (誤上書き防止)。
  if (path === "/api/quizzes/import" && method === "POST") {
    const body = await readJson(req);
    if ("res" in body) return body.res;
    const v = validated(quizImportSchema.safeParse(body.value));
    if ("res" in v) return v.res;
    const input = v.data;

    // 1. category find-or-create
    const categories = await repo.listCategories(db);
    let categoryId: number | undefined = categories.find((x) => x.title === input.category)?.id;
    if (categoryId === undefined) {
      try {
        categoryId = await repo.createCategory(db, input.category);
      } catch {
        return json({ error: "同名のcategoryが既にあります" }, 409);
      }
    }

    // 2. topic find-or-create
    const topics = await repo.listTopics(db, categoryId);
    let topicId: number | undefined = topics.find((x) => x.title === input.topic)?.id;
    if (topicId === undefined) {
      try {
        topicId = await repo.createTopic(db, categoryId, input.topic);
      } catch {
        return json({ error: "同名のtopicが既にあります / categoryが存在しません" }, 409);
      }
    }

    // 3. quiz 重複チェック (同一topicに同名があれば中断)
    const existing = await repo.listQuizzes(db, { topicId });
    if (existing.some((q) => q.title === input.quiz.title)) {
      return json(
        { error: "同名のquizが既にあります。既存の編集は管理画面から行ってください" },
        409,
      );
    }

    // 4. quiz作成 + 10問登録
    let quizId: number;
    try {
      quizId = await repo.createQuiz(
        db,
        topicId,
        input.quiz.title,
        input.quiz.difficulty,
        input.quiz.status,
      );
    } catch {
      return json({ error: "同名のquizが既にあります / topicが存在しません" }, 409);
    }
    try {
      const count = await repo.replaceQuestions(
        db,
        quizId,
        input.questions.map((q) => ({ ...q, explanation: q.explanation ?? "" })),
      );
      return json({ categoryId, topicId, quizId, count }, 201);
    } catch (e) {
      // quizだけ作成済みの状態。管理画面から問題を追記できるようidを返す
      return json({ error: (e as Error).message, quizId, topicId, categoryId }, 400);
    }
  }

  {
    const m = /^\/api\/quizzes\/([^/]+)$/.exec(path);
    if (m && (method === "GET" || method === "PUT" || method === "DELETE")) {
      const id = parseIdParam(m[1]!);
      if (id === undefined) return json({ error: "idが不正です" }, 400);
      if (method === "GET") {
        const quiz = await repo.getQuizWithBreadcrumb(db, id);
        if (!quiz) return json({ error: "quizがありません" }, 404);
        return json({ quiz });
      }
      if (method === "PUT") {
        const body = await readJson(req);
        if ("res" in body) return body.res;
        const v = validated(quizPatchSchema.safeParse(body.value));
        if ("res" in v) return v.res;
        await repo.updateQuiz(db, id, v.data);
        return json({ ok: true });
      }
      if (await repo.quizHasAttempts(db, id)) {
        return json({ error: HISTORY_LOCK_MESSAGE }, 409);
      }
      try {
        await repo.deleteQuiz(db, id);
      } catch (e) {
        if (repo.isForeignKeyError(e)) return json({ error: HISTORY_LOCK_MESSAGE }, 409);
        throw e;
      }
      return json({ ok: true });
    }
  }

  // 出題用: 答え・解説は隠す。published以外は出題除外
  {
    const m = /^\/api\/quizzes\/([^/]+)\/play$/.exec(path);
    if (m && method === "GET") {
      const quizId = parseIdParam(m[1]!);
      if (quizId === undefined) return json({ error: "quizIdが不正です" }, 400);
      const quiz = await repo.getQuizWithBreadcrumb(db, quizId);
      if (!quiz) return json({ error: "quizがありません" }, 404);
      if ((quiz as { status?: string }).status === "archived") {
        return json({ error: "このクイズは公開終了のため受験できません" }, 410);
      }
      if ((quiz as { status?: string }).status !== "published") {
        return json({ error: "このクイズはまだ公開されていません" }, 403);
      }
      const questions = await repo.listPlayQuestions(db, quizId);
      if (questions.length !== QUESTIONS_PER_QUIZ) {
        return json(
          {
            error: `このクイズは${QUESTIONS_PER_QUIZ}問揃っていません（現在${questions.length}問）。管理タブで${QUESTIONS_PER_QUIZ}問登録してください。`,
          },
          422,
        );
      }
      return json({ quiz, questions: shuffle(questions) });
    }
  }

  // ---------- Question (管理: 答え付き) ----------
  if (path === "/api/questions") {
    if (method === "GET") {
      const v = validated(
        z.object({ quizId: idParamSchema }).safeParse({
          quizId: url.searchParams.get("quizId") ?? undefined,
        }),
      );
      if ("res" in v) return v.res;
      return json(await repo.listQuestionsByQuiz(db, v.data.quizId));
    }
    if (method === "POST") {
      const body = await readJson(req);
      if ("res" in body) return body.res;
      const v = validated(questionCreateSchema.safeParse(body.value));
      if ("res" in v) return v.res;
      const { quizId, ...q } = v.data;
      const id = await repo.createQuestion(db, quizId, {
        ...q,
        explanation: q.explanation ?? "",
      });
      return json({ id }, 201);
    }
  }

  // 10問保存: versioning方式 (履歴があっても新version発行で保存可。問題数削減のみ履歴ありは不可)
  if (path === "/api/questions/batch" && method === "POST") {
    const body = await readJson(req);
    if ("res" in body) return body.res;
    const v = validated(questionBatchSchema.safeParse(body.value));
    if ("res" in v) return v.res;
    try {
      const count = await repo.replaceQuestions(
        db,
        v.data.quizId,
        v.data.questions.map((q) => ({ ...q, explanation: q.explanation ?? "" })),
      );
      return json({ ok: true, count });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  {
    const m = /^\/api\/questions\/([^/]+)$/.exec(path);
    if (m && (method === "PUT" || method === "DELETE")) {
      const questionId = parseIdParam(m[1]!);
      if (questionId === undefined) return json({ error: "idが不正です" }, 400);
      if (method === "PUT") {
        const body = await readJson(req);
        if ("res" in body) return body.res;
        const v = validated(questionSchema.safeParse(body.value));
        if ("res" in v) return v.res;
        // versioningのため履歴があっても編集可 (= 新しいversionを発行する)
        try {
          await repo.updateQuestion(db, questionId, {
            ...v.data,
            explanation: v.data.explanation ?? "",
          });
        } catch (e) {
          return json({ error: (e as Error).message }, 404);
        }
        return json({ ok: true });
      }
      if (await repo.questionHasAnswers(db, questionId)) {
        return json({ error: ANSWERED_LOCK_MESSAGE }, 409);
      }
      try {
        await repo.deleteQuestion(db, questionId);
      } catch (e) {
        if (repo.isForeignKeyError(e)) return json({ error: ANSWERED_LOCK_MESSAGE }, 409);
        throw e;
      }
      return json({ ok: true });
    }
  }

  // ---------- Attempt (解答結果の蓄積: 上書きせず溜めていく) ----------

  // 挑戦開始 (出題スナップショットをattempt_questionsに固定して返す)
  {
    const m = /^\/api\/quizzes\/([^/]+)\/attempts$/.exec(path);
    if (m) {
      const quizId = parseIdParam(m[1]!);
      if (quizId === undefined) return json({ error: "quizIdが不正です" }, 400);
      if (method === "POST") {
        const quiz = await repo.getQuizWithBreadcrumb(db, quizId);
        if (!quiz) return json({ error: "quizがありません" }, 404);
        if ((quiz as { status?: string }).status === "archived") {
          return json({ error: "このクイズは公開終了のため受験できません" }, 410);
        }
        if ((quiz as { status?: string }).status !== "published") {
          return json({ error: "このクイズはまだ公開されていません" }, 403);
        }
        const ready = await repo.countQuestions(db, quizId);
        if (ready !== QUESTIONS_PER_QUIZ) {
          return json(
            {
              error: `このクイズは${QUESTIONS_PER_QUIZ}問揃っていません（現在${ready}問）。管理タブで${QUESTIONS_PER_QUIZ}問登録してください。`,
            },
            422,
          );
        }
        const { attemptId, questions } = await repo.createAttempt(db, quizId);
        return json({ attemptId, questions }, 201);
      }
      if (method === "GET") {
        // quizの挑戦履歴
        const v = validated(
          z.object({ limit: z.coerce.number().int().optional() }).safeParse({
            limit: url.searchParams.get("limit") ?? undefined,
          }),
        );
        if ("res" in v) return v.res;
        const rawLimit = v.data.limit ?? 10;
        const limit = Math.min(Math.max(rawLimit, 1), 50);
        return json(await repo.listAttemptsByQuiz(db, quizId, limit));
      }
    }
  }

  // 全quizの挑戦サマリー (ツリーのベスト表示用)。
  // "/api/attempts/:id" より先に評価すること (:id に吸われないように)。
  if (path === "/api/attempts/summary" && method === "GET") {
    return json(await repo.listAttemptSummaries(db));
  }

  // 1問回答 (記録 + 採点)
  {
    const m = /^\/api\/attempts\/([^/]+)\/answers$/.exec(path);
    if (m && method === "POST") {
      const attemptId = parseIdParam(m[1]!);
      if (attemptId === undefined) return json({ error: "attemptIdが不正です" }, 400);
      const body = await readJson(req);
      if ("res" in body) return body.res;
      const v = validated(answerBodySchema.safeParse(body.value));
      if ("res" in v) return v.res;
      try {
        return json(
          await repo.recordAnswer(db, attemptId, v.data.attemptQuestionId, v.data.choice),
        );
      } catch (e) {
        const message = (e as Error).message;
        if (message === "挑戦がありません" || message === "問題がありません") {
          return json({ error: message }, 404);
        }
        if (message === "この挑戦の問題ではありません") {
          return json({ error: message }, 422);
        }
        return json({ error: message }, 400);
      }
    }
  }

  // 挑戦完了 (スコア確定)
  {
    const m = /^\/api\/attempts\/([^/]+)\/complete$/.exec(path);
    if (m && method === "POST") {
      const attemptId = parseIdParam(m[1]!);
      if (attemptId === undefined) return json({ error: "attemptIdが不正です" }, 400);
      try {
        return json(await repo.completeAttempt(db, attemptId));
      } catch (e) {
        const message = (e as Error).message;
        return json({ error: message }, message === "挑戦がありません" ? 404 : 400);
      }
    }
  }

  // 挑戦状態の取得 (中断からの再開用。回答済み分の結果のみ含み、未回答の正解は含まない)
  // ?detail=full で履歴詳細ページ用の問題単位の掘り下げ (出題スナップショット固定) を返す。
  {
    const m = /^\/api\/attempts\/([^/]+)$/.exec(path);
    if (m && method === "GET") {
      const attemptId = parseIdParam(m[1]!);
      if (attemptId === undefined) return json({ error: "attemptIdが不正です" }, 400);
      if (url.searchParams.get("detail") === "full") {
        const detail = await repo.getAttemptDetail(db, attemptId);
        if (!detail) return json({ error: "挑戦がありません" }, 404);
        return json(detail);
      }
      const state = await repo.getAttemptState(db, attemptId);
      if (!state) return json({ error: "挑戦がありません" }, 404);
      return json(state);
    }
  }

  // ---------- Tree ----------
  if (path === "/api/tree" && method === "GET") {
    return json(await repo.getCategoryTree(db));
  }

  return json({ error: "見つかりません" }, 404);
}

export default {
  // 統一エラーレスポンス: { error: string }。予期せぬ例外は500に丸める。
  async fetch(req: Request, env: Env): Promise<Response> {
    const start = Date.now();
    let res: Response;
    try {
      res = await route(req, env);
    } catch (e) {
      console.error(e);
      res = json({ error: "内部エラーが発生しました" }, 500);
    }
    // アクセスログ: メソッド・パス・ステータス・所要時間を記録する
    console.log(
      `${req.method} ${new URL(req.url).pathname} -> ${res.status} (${Date.now() - start}ms)`,
    );
    return res;
  },
};
