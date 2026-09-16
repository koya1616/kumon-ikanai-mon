// React クライアント (src/client/*.tsx) を wrangler の Text モジュール用に
// 単一 IIFE へバンドルする。出力先は src/ui/app.client.js (生成物) で、
// view.ts が文字列として HTML に埋め込む。バックエンドの変更は不要。
// 使い方: node scripts/build-client.mjs [--watch]
import { context } from "esbuild";

const watch = process.argv.includes("--watch");

const ctx = await context({
  entryPoints: ["src/client/main.tsx"],
  bundle: true,
  minify: !watch,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  outfile: "src/ui/app.client.js",
  banner: { js: "/* 生成物: src/client を編集し `pnpm build:client` で再生成すること */" },
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
  console.log("watching src/client ...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
