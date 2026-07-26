import { useEffect } from 'react';
import { LanguageProvider, useLanguage, type Language } from '../lib/i18n';
import { getCopy, VERSION } from '../lib/translations';
import { Kicker } from './landing/Kicker';

const LOGO_URL = '/logo.svg';
const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日' },
  { code: 'zh', label: '中' }
];

function Essay() {
  const { language, setLanguage } = useLanguage();
  const copy = getCopy(language).philosophy;

  return (
    <div className="dark min-h-full w-full bg-background text-foreground antialiased">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-xl">
        <nav aria-label="Primary" className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Relai" className="h-4 w-auto" />
          </a>
          <div className="flex items-center" role="group" aria-label="Language">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLanguage(item.code)}
                className={`h-8 px-2 font-mono text-xs ${language === item.code ? 'text-primary underline decoration-2 underline-offset-[6px]' : 'text-muted-foreground hover:text-primary'}`}
                aria-pressed={language === item.code}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 pb-20 pt-14 md:pt-20">
        <Kicker>{copy.label}</Kicker>
        <h1 className="mt-4 font-heading text-[2rem] font-semibold leading-tight tracking-tight md:text-[2.6rem]">{copy.title}</h1>
        <p className="mt-3 font-mono text-[11px] tracking-[0.14em] text-muted-foreground">{copy.updated}</p>

        <div className="prose-col mt-12 space-y-12">
          {copy.sections.map((s, i) => (
            <section key={s.h}>
              <h2 className="flex items-baseline gap-3 font-heading text-xl font-semibold tracking-tight md:text-[1.35rem]">
                <span className="font-mono text-[13px] font-normal text-primary">0{i + 1}</span>
                {s.h}
              </h2>
              <div className="mt-4 space-y-4">
                {s.ps.map((p) => (
                  <p key={p.slice(0, 24)} className="t-lede text-[15.5px] text-foreground md:text-[16px]">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-14 border-t border-dashed border-border pt-6 font-mono text-[12px] leading-relaxed text-muted-foreground">{copy.colophon}</p>
        <p className="mt-10">
          <a href="/" className="inline-block font-mono text-[12px] text-primary hover:underline">← {copy.back}</a>
        </p>
      </main>

      <footer className="w-full border-t border-border">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <a href="/" className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Relai" className="h-4 w-auto" />
          </a>
          <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">
            <span>{VERSION}</span>
            <span>MIT</span>
            <a href="https://github.com/syoooo/figma-relai" target="_blank" rel="noreferrer" className="transition-colors hover:text-primary">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PhilosophyPage() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  return (
    <LanguageProvider>
      <Essay />
    </LanguageProvider>
  );
}
