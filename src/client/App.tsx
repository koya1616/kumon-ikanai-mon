import { HashRouter, Route, Routes } from "react-router";
import { DialogProvider } from "./dialog";
import { ToastProvider } from "./toast";
import { TreeProvider } from "./tree";
import { SessionProvider } from "./session";
import { Shell } from "./components/Shell";
import { Home } from "./pages/Home";
import { Category } from "./pages/Category";
import { Play } from "./pages/Play";
import { Result } from "./pages/Result";
import { History } from "./pages/History";
import { HistoryAll } from "./pages/HistoryAll";
import { Review } from "./pages/Review";
import { Bookmarks } from "./pages/Bookmarks";
import { Admin } from "./pages/Admin";

export const App = () => {
  return (
    <HashRouter>
      <ToastProvider>
        <DialogProvider>
          <TreeProvider>
            <SessionProvider>
              <Shell>
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
                  <Route path="/admin/new" element={<Admin key="admin-new" />} />
                  <Route path="/admin/import" element={<Admin key="admin-import" />} />
                  <Route path="/admin/c/:id" element={<Admin key="admin-c" />} />
                  <Route path="/admin/t/:id" element={<Admin key="admin-t" />} />
                  <Route path="/admin/q/:id" element={<Admin key="admin-q" />} />
                  <Route path="*" element={<Home />} />
                </Routes>
              </Shell>
            </SessionProvider>
          </TreeProvider>
        </DialogProvider>
      </ToastProvider>
    </HashRouter>
  );
};
