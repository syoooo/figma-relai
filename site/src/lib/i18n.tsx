import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'en' | 'ja' | 'zh';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'relai-language';

export function LanguageProvider({ children }: {children: React.ReactNode;}) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'ja' || stored === 'zh' || stored === 'en' ? stored : 'en';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
}