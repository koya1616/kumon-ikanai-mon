/// <reference types="@cloudflare/workers-types" />
import { idParamSchema } from "./domain";

// ---------- レスポンス基盤 (Web標準のみ。フレームワーク不使用) ----------

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

export function unauthorized(): Response {
  return json({ error: "認証が必要です" }, 401, {
    "WWW-Authenticate": 'Basic realm="Secure Area"',
  });
}

export function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=UTF-8", ...SECURITY_HEADERS },
  });
}

// ---------- Basic認証 (fail-closed + タイミングセーフ比較) ----------

export type Env = {
  DB: D1Database;
  IMAGES: R2Bucket;
  BASIC_USER?: string;
  BASIC_PASS?: string;
};

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
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

export async function checkAuth(req: Request, env: Env): Promise<Response | null> {
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
export function validated<T>(parsed: {
  success: boolean;
  data?: T;
  error?: { issues?: { message?: string }[] };
}): { data: T } | { res: Response } {
  if (parsed.success) return { data: parsed.data as T };
  const issue = parsed.error?.issues?.[0]?.message;
  return { res: json({ error: issue ?? "入力が不正です" }, 400) };
}

export function parseIdParam(raw: string): number | undefined {
  const parsed = idParamSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function readJson(req: Request): Promise<{ value: unknown } | { res: Response }> {
  try {
    return { value: (await req.json()) as unknown };
  } catch {
    return { res: json({ error: "入力が不正です" }, 400) };
  }
}

/** Fisher–Yates (crypto乱数版: Math.randomより予測困難) */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const rand = new Uint32Array(1);
    crypto.getRandomValues(rand);
    const j = Number(rand[0]! % (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** limit クエリの正規化 (min〜max に丸める) */
export function clampLimit(raw: number | undefined, fallback: number, max: number): number {
  const v = raw ?? fallback;
  return Math.min(Math.max(v, 1), max);
}

export const HISTORY_LOCK_MESSAGE =
  "受験履歴があるため削除できません。履歴を残す仕様のため、削除ではなく新規作成で対応してください。";

export const ANSWERED_LOCK_MESSAGE =
  "受験履歴のある問題は削除できません。archived化で対応してください。";
