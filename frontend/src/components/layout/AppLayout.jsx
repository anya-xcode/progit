import { Menu } from "lucide-react";
import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import Sidebar, { Logo } from "./Sidebar.jsx";

// The coding workspace (/problems/:slug) gets a compact icon sidebar
// so the editor has more room.
function isWorkspacePath(pathname) {
  const match = /^\/problems\/([^/]+)$/.exec(pathname);
  return Boolean(match && match[1] !== "new");
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const compact = isWorkspacePath(pathname);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar compact={compact} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="text-muted hover:text-fg" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Logo />
        </header>
        <main className={`min-h-0 flex-1 ${compact ? "overflow-y-auto lg:overflow-hidden" : "overflow-y-auto"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
