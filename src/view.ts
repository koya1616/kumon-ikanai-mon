/**
 * フロントエンドのシェル HTML。
 * React SPA のソースは src/client/ 配下にあり、
 * `pnpm build:client` で src/ui/app.client.js (生成物) にバンドルされる。
 * wrangler の Text モジュールで CSS/JS を文字列 import し、ここでは骨組みだけを持つ。
 */
import styles from "./ui/styles.css";
import script from "./ui/app.client.js";

// テンプレートリテラルに CSS/JS を直接埋めると ${} や ` が衝突するため、文字列連結で組み立てる
export const html: string =
  '<!DOCTYPE html>\n<html lang="ja">\n<head>\n' +
  '<meta charset="UTF-8" />\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n' +
  '<meta name="color-scheme" content="light dark" />\n' +
  '<meta name="theme-color" content="#f7f2e8" media="(prefers-color-scheme: light)" />\n' +
  '<meta name="theme-color" content="#17140f" media="(prefers-color-scheme: dark)" />\n' +
  "<title>kumon-ikanai-mon | ドリル帳</title>\n" +
  "<style>\n" +
  styles +
  "\n</style>\n</head>\n<body>\n" +
  '<a href="#main" class="vh">本文へスキップ</a>\n' +
  '<div class="app">\n' +
  '  <header class="nav">\n' +
  '    <a class="brand" href="#/">\n' +
  '      <span class="brand-mark" aria-hidden="true">問</span>\n' +
  '      <span class="brand-text"><span class="brand-name">kumon-ikanai-mon</span><span class="brand-sub">ドリル帳 · 10問4択</span></span>\n' +
  "    </a>\n" +
  '    <span class="nav-spacer"></span>\n' +
  '    <nav class="nav-links" aria-label="メイン">\n' +
  '      <a id="nav-home" class="nav-link" href="#/">ホーム</a>\n' +
  '      <a id="nav-admin" class="nav-link" href="#/admin">管理</a>\n' +
  "    </nav>\n" +
  "  </header>\n" +
  '  <main id="main" class="main" aria-live="polite"></main>\n' +
  '  <nav class="tabbar" aria-label="メイン (モバイル)">\n' +
  '    <a id="tab-home" class="tab-link" href="#/">ホーム</a>\n' +
  '    <a id="tab-admin" class="tab-link" href="#/admin">管理</a>\n' +
  "  </nav>\n" +
  "</div>\n" +
  '<div id="toasts" class="toasts" aria-live="assertive"></div>\n' +
  '<dialog id="dialog" class="dialog"><div id="dialog-body" class="dialog-body"></div></dialog>\n' +
  "<script>\n" +
  script +
  "\n</script>\n</body>\n</html>\n";
