#!/usr/bin/env node
/**
 * 新規クイズ一式 (category/topic/quiz + 10問) を API 経由で投入するスクリプト。
 *
 * 非破壊 (seed.sql のような DELETE はしない)。ID 直書きもしない。
 * 同名 category / topic は再利用し、quiz は同名重複があれば中断する (誤上書き防止)。
 *
 * 使い方:
 *   BASIC_USER=... BASIC_PASS=... node scripts/add-quiz.mjs --file data/quizzes/xxx.json --url https://<workers>.workers.dev
 *   BASIC_USER=... BASIC_PASS=... node scripts/add-quiz.mjs --file data/quizzes/xxx.json --url https://... --dry-run
 *
 * 入力JSON形式 (data/quizzes/example.json 参照):
 *   { category, topic, quiz: { title, difficulty?, status? }, questions: [...] }
 *   - questions はちょうど10問 (QUESTIONS_PER_QUIZ)
 *   - quiz.status 省略時は "published"
 */

import { readFile } from "node:fs/promises";

const QUESTIONS_PER_QUIZ = 10;
const TITLE_MAX = 100;

function usage() {
  return [
    "使い方:",
    "  BASIC_USER=... BASIC_PASS=... node scripts/add-quiz.mjs --file <json> --url <baseUrl> [--dry-run]",
    "",
    "オプション:",
    "  --file <path>   入力JSON (必須)",
    "  --url <baseUrl>  デプロイ先 (必須推奨。省略時は QUIZ_BASE_URL 環境変数, なければ http://127.0.0.1:8787)",
    "  --dry-run       バリデーションと既存照合のみ。POST しない",
    "  --help          この表示",
  ].join("\n");
}

function parseArgs(argv) {
  const out = { file: null, url: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i] ?? null;
    else if (a === "--url") out.url = argv[++i] ?? null;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else {
      throw new Error(`不明な引数: ${a}\n${usage()}`);
    }
  }
  return out;
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function isNonEmptyString(v, max = TITLE_MAX) {
  return typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
}

/** 入力JSONの検証。正規化済みオブジェクトを返す。NG時は throw */
function validateInput(raw) {
  if (!raw || typeof raw !== "object") throw new Error("JSONはオブジェクトである必要があります");
  const { category, topic, quiz, questions } = raw;

  if (!isNonEmptyString(category)) throw new Error("category は1〜100文字の文字列が必須です");
  if (!isNonEmptyString(topic)) throw new Error("topic は1〜100文字の文字列が必須です");
  if (!quiz || typeof quiz !== "object")
    throw new Error("quiz { title, difficulty?, status? } が必須です");
  if (!isNonEmptyString(quiz.title)) throw new Error("quiz.title は1〜100文字の文字列が必須です");

  const difficulty = quiz.difficulty ?? 1;
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    throw new Error("quiz.difficulty は1〜5の整数です");
  }
  const status = quiz.status ?? "published";
  if (!["draft", "published", "archived"].includes(status)) {
    throw new Error("quiz.status は draft/published/archived のいずれかです (省略時 published)");
  }

  if (!Array.isArray(questions) || questions.length !== QUESTIONS_PER_QUIZ) {
    throw new Error(
      `questions はちょうど${QUESTIONS_PER_QUIZ}問必要です (現在${Array.isArray(questions) ? questions.length : "非配列"}問)`,
    );
  }
  const explanationOf = (q) =>
    typeof q.explanation === "string"
      ? q.explanation.trim()
      : q.explanation == null
        ? ""
        : String(q.explanation).trim();

  const normalized = questions.map((q, i) => {
    const n = i + 1;
    // 穴埋め (記述式): { questionType: "cloze_text", statement ({{1}}..{{N}}), answers: [...], explanation? }
    if (q?.questionType === "cloze_text") {
      if (typeof q.statement !== "string" || !q.statement.trim()) {
        throw new Error(`questions[${n}] statementは必須です`);
      }
      if (!Array.isArray(q.answers) || q.answers.length < 1 || q.answers.length > 20) {
        throw new Error(`questions[${n}] answersは1-20個の配列が必要です`);
      }
      const answers = q.answers.map((a, k) => {
        if (typeof a !== "string" || !a.trim() || a.trim().length > 100) {
          throw new Error(`questions[${n}] answers[${k + 1}]は1-100文字の文字列が必須です`);
        }
        return a.trim();
      });
      const markers = [
        ...new Set(
          [...q.statement.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])),
        ),
      ].sort((a, b) => a - b);
      if (!markers.length) {
        throw new Error(`questions[${n}] 問題文に{{1}}のような空欄マーカーが必要です`);
      }
      if (markers.length !== answers.length || markers.some((m, k) => m !== k + 1)) {
        throw new Error(
          `questions[${n}] 空欄マーカーは{{1}}からの連番かつanswersと同数にしてください`,
        );
      }
      return {
        questionType: "cloze_text",
        statement: q.statement.trim(),
        answers,
        explanation: explanationOf(q),
      };
    }
    for (const k of ["statement", "choice1", "choice2", "choice3", "choice4"]) {
      if (typeof q?.[k] !== "string" || !q[k].trim())
        throw new Error(`questions[${n}] ${k}は必須です`);
    }
    const answer = Number(q.answer);
    if (!Number.isInteger(answer) || answer < 1 || answer > 4) {
      throw new Error(`questions[${n}] answerは1-4の整数です`);
    }
    return {
      statement: q.statement.trim(),
      choice1: q.choice1.trim(),
      choice2: q.choice2.trim(),
      choice3: q.choice3.trim(),
      choice4: q.choice4.trim(),
      answer,
      explanation: explanationOf(q),
    };
  });

  return {
    category: category.trim(),
    topic: topic.trim(),
    quiz: { title: quiz.title.trim(), difficulty, status },
    questions: normalized,
  };
}

function authHeader(user, pass) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function api(baseUrl, path, { method = "GET", body, user, pass } = {}) {
  const init = {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Authorization: authHeader(user, pass),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(baseUrl + path, init);
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error ?? text ?? `HTTP ${res.status}`;
    const err = new Error(`${method} ${path} -> ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!args.file) fail(`--file が必須です\n${usage()}`);

  const baseUrl =
    args.url ?? process.env.QUIZ_BASE_URL ?? process.env.APP_URL ?? "http://127.0.0.1:8787";
  const user = process.env.BASIC_USER;
  const pass = process.env.BASIC_PASS;
  if (!user || !pass) {
    fail(
      "BASIC_USER / BASIC_PASS 環境変数が必須です (〔例〕 BASIC_USER=admin BASIC_PASS=xxx node scripts/add-quiz.mjs ...)",
    );
  }

  let raw;
  try {
    raw = JSON.parse(await readFile(args.file, "utf-8"));
  } catch (e) {
    fail(`JSON読み込み失敗 (${args.file}): ${e.message}`);
  }
  let input;
  try {
    input = validateInput(raw);
  } catch (e) {
    fail(`入力検証エラー: ${e.message}`);
  }

  const base = String(baseUrl).replace(/\/+$/, "");
  console.log(`target: ${base}${args.dryRun ? " (dry-run: POSTしません)" : ""}`);

  // 接続・認証の早期確認 (認証NGならここで401になる)
  let categories;
  try {
    categories = await api(base, "/api/categories", { user, pass });
  } catch (e) {
    if (e.status === 401) fail("認証失敗 (401)。BASIC_USER / BASIC_PASS を確認してください");
    fail(`接続失敗: ${e.message}`);
  }

  // 1. category find-or-create
  let category = categories.find((c) => c.title === input.category) ?? null;
  if (category) {
    console.log(`category再利用: id=${category.id} 「${category.title}」`);
  } else if (args.dryRun) {
    console.log(`category新規作成予定: 「${input.category}」`);
  } else {
    try {
      const created = await api(base, "/api/categories", {
        method: "POST",
        body: { title: input.category },
        user,
        pass,
      });
      category = { id: created.id, title: input.category };
      console.log(`category作成: id=${category.id} 「${category.title}」`);
    } catch (e) {
      if (e.status === 409) fail(`同名category競合: ${e.message}`);
      fail(e.message);
    }
  }

  // 2. topic find-or-create (dry-runでcategory新規の場合は照合不可のため作成予定とだけ出す)
  let topic = null;
  if (category) {
    const topics = await api(base, `/api/topics?categoryId=${category.id}`, { user, pass });
    topic = topics.find((t) => t.title === input.topic) ?? null;
    if (topic) {
      console.log(`topic再利用: id=${topic.id} 「${topic.title}」`);
    } else if (!args.dryRun) {
      try {
        const created = await api(base, "/api/topics", {
          method: "POST",
          body: { categoryId: category.id, title: input.topic },
          user,
          pass,
        });
        topic = { id: created.id, title: input.topic };
        console.log(`topic作成: id=${topic.id} 「${topic.title}」`);
      } catch (e) {
        fail(e.message);
      }
    } else {
      console.log(`topic新規作成予定: 「${input.topic}」 (categoryId=${category.id})`);
    }
  } else {
    console.log(`topic新規作成予定: 「${input.topic}」 (category新規のためdry-runでは照合不可)`);
  }

  // 3. quiz 重複チェック (誤上書き防止: 同名があれば中断)
  if (topic) {
    const quizzes = await api(base, `/api/quizzes?topicId=${topic.id}`, { user, pass });
    const dup = quizzes.find((q) => q.title === input.quiz.title);
    if (dup) {
      fail(
        `同名quizが既にあります (id=${dup.id} 「${dup.title}」)。既存の編集は管理画面 (#/admin) か PUT /api/quizzes/:id を使ってください`,
      );
    }
    if (args.dryRun) {
      console.log(
        `quiz新規作成予定: 「${input.quiz.title}」 (topicId=${topic.id}, difficulty=${input.quiz.difficulty}, status=${input.quiz.status}) + ${input.questions.length}問`,
      );
      console.log("dry-run OK: 入力は有効で、重複もありません");
      return;
    }
    let quizId;
    try {
      const created = await api(base, "/api/quizzes", {
        method: "POST",
        body: {
          topicId: topic.id,
          title: input.quiz.title,
          difficulty: input.quiz.difficulty,
          status: input.quiz.status,
        },
        user,
        pass,
      });
      quizId = created.id;
      console.log(`quiz作成: id=${quizId} 「${input.quiz.title}」`);
    } catch (e) {
      fail(e.message);
    }

    // 4. 10問一括登録
    try {
      const res = await api(base, "/api/questions/batch", {
        method: "POST",
        body: { quizId, questions: input.questions },
        user,
        pass,
      });
      console.log(`questions登録: ${res.count}問 (quizId=${quizId})`);
    } catch (e) {
      fail(`${e.message} ※quiz(id=${quizId})は作成済み。問題は管理画面から追記してください`);
    }

    console.log("done.");
    console.log(`確認: ${base}/#/admin/t/${topic.id} / GET ${base}/api/quizzes/${quizId}/play`);
    if (input.quiz.status === "draft") {
      console.log(
        `※status=draft のため出題されません。確認後に PUT /api/quizzes/${quizId} { status: "published" } で公開してください`,
      );
    }
  } else {
    // dry-run かつ category/topic とも新規の場合
    console.log(
      `quiz新規作成予定: 「${input.quiz.title}」 (difficulty=${input.quiz.difficulty}, status=${input.quiz.status}) + ${input.questions.length}問`,
    );
    console.log("dry-run OK: 入力は有効です (既存照合は一部スキップ)");
  }
}

main().catch((e) => fail(e.message ?? String(e)));
