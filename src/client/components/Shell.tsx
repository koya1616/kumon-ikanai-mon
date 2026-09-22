// アプリのシェル (ヘッダ / サイド / タブバー) を宣言的 TSX で描画する。
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Icon } from "../ui";

type Section = "home" | "admin" | "history" | "review" | "random" | "bookmarks";

/** パス+クエリから所属セクションを決める。?random=1 は review と分離する。 */
export const sectionFor = (pathname: string, search = ""): Section => {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/review")) {
    return new URLSearchParams(search).get("random") === "1" ? "random" : "review";
  }
  if (pathname.startsWith("/bookmarks")) return "bookmarks";
  if (pathname.startsWith("/history") || pathname.startsWith("/h/")) return "history";
  return "home";
};

/** ルート遷移ごとに先頭へスクロールする */
const useScrollTopOnNavigate = (pathname: string): void => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
};

const Brand = () => (
  <NavLink className="brand" to="/">
    <span className="brand-mark" aria-hidden="true">
      問
    </span>
    <span className="brand-text">
      <span className="brand-name">kumon-ikanai-mon</span>
      <span className="brand-sub">ドリル帳 · 10問4択</span>
    </span>
  </NavLink>
);

const SIDE_LINKS: { to: string; section: Section; label: string }[] = [
  { to: "/", section: "home", label: "ホーム" },
  { to: "/history", section: "history", label: "履歴" },
  { to: "/review", section: "review", label: "苦手復習" },
  { to: "/review?random=1", section: "random", label: "ランダム一問" },
  { to: "/bookmarks", section: "bookmarks", label: "ブックマーク" },
  { to: "/admin", section: "admin", label: "管理" },
];

export const Shell = ({ children }: { children: ReactNode }) => {
  const { pathname, search } = useLocation();
  const section = sectionFor(pathname, search);
  useScrollTopOnNavigate(pathname);

  return (
    // CSS は data-mode="focus" で没入モード、data-page="bookmarks" で中央寄せ幅に切り替える
    // /play と /review は没入モード: 解説シートとタブバーの重なりを避ける
    <div
      className="app"
      data-mode={
        pathname.startsWith("/play") || pathname.startsWith("/review") ? "focus" : undefined
      }
      data-page={pathname.startsWith("/bookmarks") ? "bookmarks" : undefined}
    >
      <header className="nav">
        <Brand />
        <span className="nav-spacer" />
        <nav className="nav-links" aria-label="メイン">
          <NavLink className="nav-link" to="/">
            ホーム
          </NavLink>
          <NavLink className="nav-link" to="/admin">
            管理
          </NavLink>
        </nav>
      </header>
      <div className="shell">
        <aside className="side" aria-label="サイド">
          <nav className="side-nav" aria-label="サイド">
            {SIDE_LINKS.map((l) => (
              <Link
                key={l.to + l.label}
                className="side-link"
                to={l.to}
                aria-current={section === l.section ? "page" : undefined}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main id="main" className="main" aria-live="polite">
          {children}
        </main>
      </div>
      <nav className="tabbar" aria-label="メイン (モバイル)">
        <NavLink className="tab-link" to="/">
          <Icon name="home" />
          ホーム
        </NavLink>
        <NavLink className="tab-link" to="/admin">
          <Icon name="admin" />
          管理
        </NavLink>
      </nav>
    </div>
  );
};
