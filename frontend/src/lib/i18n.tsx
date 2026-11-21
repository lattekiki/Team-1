import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Language } from "@team1/shared";
import { makeFormatters, type Formatters } from "./format.ts";
import { am } from "./locales/am.ts";
import { en, type MessageKey, type Messages } from "./locales/en.ts";
import { om } from "./locales/om.ts";

const dictionaries: Record<Language, Messages> = { en, om, am };
const STORAGE_KEY = "hj.lang";

type Vars = Record<string, string | number>;
type PluralBase = { [K in MessageKey]: K extends `${infer B}_one` ? B : never }[MessageKey];

export type Translate = (key: MessageKey, vars?: Vars) => string;
export type TranslatePlural = (base: PluralBase, n: number, vars?: Vars) => string;
// For keys built at runtime (e.g. `cat_${slug}`); returns `fallback` when the key doesn't exist.
export type TranslateDynamic = (key: string, fallback: string, vars?: Vars) => string;

const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;

function makeTranslators(lang: Language) {
  const dict = dictionaries[lang];
  const t: Translate = (key, vars) => fill(dict[key], vars);
  const tp: TranslatePlural = (base, n, vars) =>
    t(`${base}_${n === 1 ? "one" : "other"}` as MessageKey, { n, ...vars });
  const tx: TranslateDynamic = (key, fallback, vars) =>
    key in dict ? fill(dict[key as MessageKey], vars) : fill(fallback, vars);
  return { t, tp, tx };
}

// Read by code outside React (the API client) to localize error messages.
let current = makeTranslators(initialLanguage());
export const translateDynamic: TranslateDynamic = (key, fallback, vars) => current.tx(key, fallback, vars);

function initialLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "om" || saved === "am" ? saved : "en";
}

type I18n = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translate;
  tp: TranslatePlural;
  tx: TranslateDynamic;
  fmt: Formatters;
};
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const value = useMemo<I18n>(() => {
    const translators = makeTranslators(lang);
    current = translators;
    return { lang, setLang, ...translators, fmt: makeFormatters(lang, translators) };
  }, [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
