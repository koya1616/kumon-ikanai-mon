/**
 * フロントエンドのシェル HTML。
 *
 * - React SPA のソースは `src/client/` 配下 (TSX)。
 * - `pnpm build:client` で `dist/client/app.client.js` (生成物・git管理外) にバンドルされる。
 * - CSS は `src/ui/styles/` に機能別に分割し、ここで順序どおり結合する。
 *   (wrangler の Text モジュールで各 CSS / JS を文字列 import)
 * - シェル / トースト / ダイアログを含む UI はすべて React が描画する。
 *   ここではマウント先 (`#root`) だけを持つ。
 */
import layers from "./ui/styles/layers.css";
import reset from "./ui/styles/reset.css";
import tokens from "./ui/styles/tokens.css";
import base from "./ui/styles/base.css";
import layout from "./ui/styles/layout.css";
import components from "./ui/styles/components.css";
import screensHome from "./ui/styles/screens-home.css";
import screensCategory from "./ui/styles/screens-category.css";
import screensPlay from "./ui/styles/screens-play.css";
import screensResult from "./ui/styles/screens-result.css";
import screensAdmin from "./ui/styles/screens-admin.css";
import utilities from "./ui/styles/utilities.css";
import rich from "./ui/styles/rich.css";
// ビルド生成物 (scripts/build-client.ts の出力。リポジトリに含めない)
import script from "../dist/client/app.client.js";

interface ShellMeta {
  lang?: string;
  title?: string;
  lightTheme?: string;
  darkTheme?: string;
}

const DEFAULT_META: Required<ShellMeta> = {
  lang: "ja",
  title: "kumon-ikanai-mon | ドリル帳",
  lightTheme: "#f7f2e8",
  darkTheme: "#17140f",
};

/** 結合 CSS。本文のカスケード順 (layers → rich) をここで保証する。 */
export const bundleStyles = (parts: string[]): string => parts.join("\n");

const appStyles: string = bundleStyles([
  layers,
  reset,
  tokens,
  base,
  layout,
  components,
  screensHome,
  screensCategory,
  screensPlay,
  screensResult,
  screensAdmin,
  utilities,
  rich,
]);

const head = (meta: Required<ShellMeta>): string => `\
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="${meta.lightTheme}" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="${meta.darkTheme}" media="(prefers-color-scheme: dark)" />
<title>${meta.title}</title>
<style>
${appStyles}
</style>`;

const body = (bundle: string): string => `\
<div id="root"></div>
<script>
${bundle}
</script>`;

export const renderShell = (meta: ShellMeta = {}): string => {
  const m: Required<ShellMeta> = { ...DEFAULT_META, ...meta };
  return `<!DOCTYPE html>\n<html lang="${m.lang}">\n<head>\n${head(m)}\n</head>\n<body>\n${body(script)}\n</body>\n</html>\n`;
};

/** 後方互換: 従来の `html` 文字列 import。 */
export const html: string = renderShell();
