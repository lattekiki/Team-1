import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Language, Me, Mode } from "@team1/shared";
import { api, ApiRequestError } from "./api.ts";
import { useI18n } from "./i18n.tsx";

type Auth = {
  user: Me | null;
  loading: boolean;
  setUser: (user: Me | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setMode: (mode: Mode) => Promise<void>;
  setLanguage: (lang: Language) => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();

  const setUser = useCallback(
    (next: Me | null) => {
      setUserState(next);
      if (next) setLang(next.language);
    },
    [setLang],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: Me }>("/auth/me");
      setUserState(res.user);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) setUserState(null);
      else throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setUserState(null);
  }, []);

  const setMode = useCallback(async (mode: Mode) => {
    setUserState((u) => (u ? { ...u, activeMode: mode } : u));
    const res = await api<{ user: Me }>("/me", { method: "PATCH", body: { activeMode: mode } });
    setUserState(res.user);
  }, []);

  const setLanguage = useCallback(
    async (lang: Language) => {
      setLang(lang);
      if (user) {
        const res = await api<{ user: Me }>("/me", { method: "PATCH", body: { language: lang } });
        setUserState(res.user);
      }
    },
    [setLang, user],
  );

  const value = useMemo(
    () => ({ user, loading, setUser, refresh, logout, setMode, setLanguage }),
    [user, loading, setUser, refresh, logout, setMode, setLanguage],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
