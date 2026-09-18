import { createRoot } from "react-dom/client";
import { App } from "./App";

const NS = "http://www.w3.org/2000/svg";

const svgIcon = (paths: string[]): SVGSVGElement => {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
};

// シェルのタブバーにアイコンを挿入し、nav 判定用の data を付与する (旧 boot 処理と同等)
const bootShell = (): void => {
  const home = document.getElementById("tab-home");
  const admin = document.getElementById("tab-admin");
  const navHome = document.getElementById("nav-home");
  const navAdmin = document.getElementById("nav-admin");
  if (home) {
    home.dataset.nav = "home";
    const wrap = document.createElement("span");
    wrap.setAttribute("aria-hidden", "true");
    wrap.appendChild(svgIcon(["M3 11.5 12 4l9 7.5", "M5 10v10h5v-6h4v6h5V10"]));
    home.insertBefore(wrap, home.firstChild);
  }
  if (admin) {
    admin.dataset.nav = "admin";
    const wrap = document.createElement("span");
    wrap.setAttribute("aria-hidden", "true");
    wrap.appendChild(svgIcon(["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]));
    admin.insertBefore(wrap, admin.firstChild);
  }
  if (navHome) navHome.dataset.nav = "home";
  if (navAdmin) navAdmin.dataset.nav = "admin";
  for (const [id, nav] of [
    ["side-home", "home"],
    ["side-history", "history"],
    ["side-review", "review"],
    ["side-bookmarks", "bookmarks"],
    ["side-admin", "admin"],
  ] as const) {
    const el = document.getElementById(id);
    if (el) el.dataset.nav = nav;
  }
};

bootShell();

const main = document.getElementById("main");
if (!main) throw new Error("#main が見つかりません");
createRoot(main).render(<App />);
