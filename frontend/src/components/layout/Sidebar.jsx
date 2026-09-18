import { BarChart3, Code2, FolderGit2, LayoutDashboard, Library, Moon, Settings, Sun, X } from "lucide-react";
import { NavLink } from "react-router";
import { useSettings } from "../../context/SettingsContext.jsx";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/problems", label: "Problem Library", icon: Library },
  { to: "/solutions", label: "My Solutions", icon: Code2 },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/github", label: "GitHub", icon: FolderGit2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-8" />
      {!compact && (
        <div className="leading-tight">
          <p className="font-semibold tracking-tight">DSAForge</p>
          <p className="text-[11px] text-muted">Practice DSA. Build Your GitHub.</p>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ compact, mobileOpen, onClose }) {
  const { settings, toggleTheme } = useSettings();
  const ThemeIcon = settings.theme === "dark" ? Sun : Moon;

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${compact ? "w-60 lg:w-16" : "w-60"}`}
      >
        <div className={`flex h-16 items-center justify-between px-4 ${compact ? "lg:justify-center lg:px-0" : ""}`}>
          <NavLink to="/" onClick={onClose} className={compact ? "lg:hidden" : ""}>
            <Logo />
          </NavLink>
          {compact && (
            <NavLink to="/" className="hidden lg:block" title="DSAForge">
              <Logo compact />
            </NavLink>
          )}
          <button onClick={onClose} className="text-muted hover:text-fg lg:hidden" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              title={compact ? label : undefined}
              className={({ isActive }) =>
                `flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                  compact ? "lg:justify-center lg:px-0" : ""
                } ${isActive ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`
              }
            >
              <Icon className="size-[18px] shrink-0" />
              <span className={compact ? "lg:hidden" : ""}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-2">
          <button
            onClick={toggleTheme}
            title={compact ? "Toggle theme" : undefined}
            aria-label={settings.theme === "dark" ? "Light mode" : "Dark mode"}
            className={`flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg ${
              compact ? "lg:justify-center lg:px-0" : ""
            }`}
          >
            <ThemeIcon className="size-[18px]" />
            <span className={compact ? "lg:hidden" : ""}>{settings.theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
