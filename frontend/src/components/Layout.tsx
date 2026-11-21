import { Bell, Briefcase, Building2, LifeBuoy, LogOut, Monitor, Moon, Shield, Sun, UserRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import type { Language } from "@team1/shared";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useI18n } from "../lib/i18n.tsx";
import { initials } from "../lib/format.ts";
import { useTheme } from "../lib/theme.tsx";
import { container } from "./ui.tsx";

const LANGS: { code: Language; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "om", label: "OM" },
  { code: "am", label: "አማ" },
];

function useUnreadCount(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  useEffect(() => {
    if (!enabled) return setUnread(0);
    let cancelled = false;
    const load = () =>
      api<{ unread: number }>("/notifications")
        .then((r) => !cancelled && setUnread(r.unread))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, location.pathname]);
  return unread;
}

function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const { t } = useI18n();
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? t("themeDark") : theme === "light" ? t("themeLight") : t("themeSystem");
  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={t("themeToggleAria", { mode: label })}
      title={label}
      className="p-2 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-900"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function Header() {
  const { user, logout, setMode, setLanguage } = useAuth();
  const { lang, t } = useI18n();
  const navigate = useNavigate();
  const unread = useUnreadCount(Boolean(user));
  const [menuOpen, setMenuOpen] = useState(false);
  const isStaff = user?.role === "admin" || user?.role === "support";

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap transition-colors ${isActive ? "text-zinc-900 font-bold" : "hover:text-zinc-900"}`;

  const nav = (
    <>
      <NavLink to="/jobs" className={navClass}>
        {t("navFindJobs")}
      </NavLink>
      <Link to="/#how-it-works" className="whitespace-nowrap hover:text-zinc-900 transition-colors">
        {t("navHowItWorks")}
      </Link>
      <NavLink to="/contact" className={navClass}>
        {t("navContact")}
      </NavLink>
      {user && (
        <NavLink to="/dashboard" className={(s) => `${navClass(s)} flex items-center gap-1.5`}>
          {user.activeMode === "employer" ? t("employerDashTitle") : t("navMyActivity")}
          {user.rating != null && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-zinc-900 text-white rounded-full">
              {user.rating.toFixed(1)}★
            </span>
          )}
        </NavLink>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-stone-200/70">
      <div className={`${container} py-3 flex flex-wrap items-center justify-between gap-3`}>
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="HojiiGO"
            width={40}
            height={40}
            className="w-10 h-10 rounded-2xl object-cover shadow-sm"
          />
          <div>
            <span className="font-extrabold text-lg tracking-tight text-zinc-900">
              Hojii<span className="text-emerald-600">GO</span>
            </span>
            <p className="text-[11px] text-zinc-500 font-medium">{t("brandSub")}</p>
          </div>
        </Link>

        <nav className="hidden xl:flex items-center gap-6 text-sm font-medium text-zinc-600">{nav}</nav>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center bg-zinc-100 p-1 rounded-full border border-zinc-200">
            {LANGS.map((item) => (
              <button
                key={item.code}
                onClick={() => setLanguage(item.code)}
                aria-pressed={lang === item.code}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                  lang === item.code ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <ThemeToggle />

          {isStaff && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  isActive ? "bg-zinc-900 text-white border-zinc-900" : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:text-zinc-900"
                }`
              }
            >
              <Shield className="w-3 h-3 text-amber-500" />
              {t("navAdmin")}
            </NavLink>
          )}

          {user ? (
            <>
              <div className="inline-flex items-center bg-zinc-900 p-1 rounded-full">
                {(["worker", "employer"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setMode(mode).then(() => navigate("/dashboard"))}
                    aria-pressed={user.activeMode === mode}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                      user.activeMode === mode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-300 hover:text-white"
                    }`}
                  >
                    {mode === "worker" ? <Briefcase className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{mode === "worker" ? t("workerMode") : t("employerMode")}</span>
                  </button>
                ))}
              </div>

              <Link
                to="/notifications"
                aria-label={t("navNotificationsAria", { n: unread })}
                className="relative p-2 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-900"
              >
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-expanded={menuOpen}
                  className="w-9 h-9 rounded-xl bg-zinc-900 text-white text-xs font-extrabold flex items-center justify-center"
                >
                  {initials(user.username)}
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-52 bg-white border border-zinc-200 rounded-2xl shadow-xl p-1.5 text-sm z-50"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <p className="px-3 py-2 text-xs font-bold text-zinc-500">@{user.username}</p>
                    <Link
                      to="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-100 font-semibold"
                    >
                      <UserRound className="w-4 h-4" />
                      {t("navProfile")}
                    </Link>
                    <Link
                      to="/tickets"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-100 font-semibold"
                    >
                      <LifeBuoy className="w-4 h-4" />
                      {t("navSupport")}
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        logout().then(() => navigate("/"));
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-zinc-100 font-semibold text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("navSignOut")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link to="/login" className="px-4 py-2 rounded-full bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800">
              {t("navSignIn")}
            </Link>
          )}
        </div>

        <nav className="xl:hidden w-full flex items-center gap-5 overflow-x-auto text-sm font-medium text-zinc-600 pb-1">
          {nav}
        </nav>
      </div>
    </header>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="h-1.5 w-full tibeb-border" />
      <Header />
      <main className="flex-1">{children}</main>
      <footer className="bg-zinc-950 text-zinc-400 py-10 border-t border-zinc-900">
        <div className={`${container} flex flex-col sm:flex-row items-center justify-between gap-4`}>
          <div className="flex items-center gap-2.5 text-white font-extrabold text-sm">
            <img
              src="/logo.png"
              alt="HojiiGO"
              width={28}
              height={28}
              className="w-7 h-7 rounded-lg object-cover"
            />
            <span>
              Hojii<span className="text-emerald-400">GO</span>
            </span>
          </div>
          <div className="flex flex-col items-center sm:items-end gap-1">
            <Link to="/contact" className="text-xs font-semibold text-white hover:text-emerald-300">
              {t("navContact")}
            </Link>
            <p className="text-xs text-center sm:text-right">{t("footerNote")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
