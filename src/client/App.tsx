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
import { Review } from "./pages/Review";
import { Admin } from "./pages/Admin";

/** シェル (view.ts の header/tabbar) と body[data-mode] の同期 + スクロール復帰。 */
const ShellSync = () => {
  const location = useLocation();
  useEffect(() => {
    const isAdmin = location.pathname.startsWith("/admin");
    for (const id of ["nav-home", "nav-admin", "tab-home", "tab-admin"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const nav = el.dataset.nav;
      if ((isAdmin && nav === "admin") || (!isAdmin && nav === "home")) {
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
              <Route path="/review" element={<Review />} />
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
