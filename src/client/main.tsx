import { createRoot } from "react-dom/client";
import { App } from "./App";

// React のマウント先。シェル (header/side/tabbar) 自体は
// `components/Shell.tsx` が宣言的に描画する。ポータル先 (#toasts / #dialog)
// だけが view.ts のサーバ HTML に残る。
const root = document.getElementById("root");
if (!root) throw new Error("#root が見つかりません");
createRoot(root).render(<App />);
