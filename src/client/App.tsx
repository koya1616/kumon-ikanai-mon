import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router";
import { DialogProvider } from "./dialog";
import { ToastProvider } from "./toast";
import { TreeProvider } from "./tree";
import { Home } from "./pages/Home";
import { Category } from "./pages/Category";
import { Play } from "./pages/Play";
import { Result } from "./pages/Result";
import { History } from "./pages/History";
import { HistoryAll } from "./pages/HistoryAll";
import { Review } from "./pages/Review";
import { Bookmarks } from "./pages/Bookmarks";
import { Admin } from "./pages/Admin";

/** シェル (view.ts の header/side/tabbar) と body[data-mode] の同期 + スクロール復帰。 */
const ShellSync = () => {
  const location = useLocation();
  useEffect(() => {
    const p = location.pathname;
    const section = p.startsWith("/admin")
      ? "admin"
      : p.startsWith("/review")
        ? "review"
        : p.startsWith("/bookmarks")
          ? "bookmarks"
          : p.startsWith("/history") || p.startsWith("/h/")
            ? "history"
            : "home";
    for (const id of [
      "nav-home",
      "nav-admin",
      "tab-home",
      "tab-admin",
      "side-home",
      "side-history",
      "side-review",
      "side-bookmarks",
      "side-admin",
    ]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const nav = el.dataset.nav;
      if (nav === section) {
        el.setAttribute("aria-current", "page");
      } else {
        el.removeAttribute("aria-current");
      }
    }
    if (location.pathname.startsWith("/play/")) {
      document.body.dataset.mode = "focus";
    } else {
      document.body.removeAttribute("data-mode");
    }
    // ページ別のシェル調整用 (例: bookmarks は .main の幅制限を外す)
    if (location.pathname.startsWith("/bookmarks")) {
      document.body.dataset.page = "bookmarks";
    } else {
      document.body.removeAttribute("data-page");
    }
    window.scrollTo(0, 0);
  }, [location]);
  return null;
};

export const App = () => {
  return (
    <HashRouter>
      <ToastProvider>
        <DialogProvider>
          <TreeProvider>
            <ShellSync />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/c/:id" element={<Category />} />
              <Route path="/play/:id" element={<Play />} />
              <Route path="/result" element={<Result />} />
              <Route path="/h/:id" element={<History />} />
              <Route path="/history" element={<HistoryAll />} />
              <Route path="/review" element={<Review />} />
              <Route path="/bookmarks" element={<Bookmarks />} />
              <Route path="/admin" element={<Admin key="admin" />} />
              <Route path="/admin/c/:id" element={<Admin key="admin-c" />} />
              <Route path="/admin/t/:id" element={<Admin key="admin-t" />} />
              <Route path="/admin/q/:id" element={<Admin key="admin-q" />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </TreeProvider>
        </DialogProvider>
      </ToastProvider>
    </HashRouter>
  );
};
