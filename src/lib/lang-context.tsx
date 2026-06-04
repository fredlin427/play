"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";

type LangContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (en: string, zh: string) => string;
};

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(
    typeof window !== "undefined" && navigator.language.startsWith("zh") ? "zh" : "en"
  );

  const toggleLang = () => setLang(lang === "zh" ? "en" : "zh");
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);

  return (
    <LangContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within <LangProvider>");
  return ctx;
}
