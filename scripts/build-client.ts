/// <reference types="node" />
// React クライアント (src/client/*.tsx) を wrangler の Text モジュール用に
// 単一 IIFE へバンドルする。出力先は dist/client/app.client.js (生成物・git管理外) で、
// view.ts が文字列として HTML に埋め込む。
// Node の型ストリップで直接実行する: node scripts/build-client.ts [--watch]
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
  outfile: "dist/client/app.client.js",
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
