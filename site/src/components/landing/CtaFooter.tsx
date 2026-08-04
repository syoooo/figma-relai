
import { Figma, Github } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';
import { getCopy, VERSION } from '../../lib/translations';
import { btnClass } from './btn';


export function CtaFooter() {
  const { language } = useLanguage();
  const copy = getCopy(language).cta;
  const cjk = language !== 'en';

  return (
    <>
      <section className="dots-bg w-full border-y-[0.5px] border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 md:py-28">
          <h2
            className="max-w-3xl font-heading font-semibold leading-[1.08] tracking-tight"
            style={{ fontSize: cjk ? 'clamp(1.6rem, 3.6vw, 2.6rem)' : 'clamp(2rem, 5vw, 3.6rem)', lineHeight: cjk ? 1.35 : 1.08, whiteSpace: 'pre-line' }}
          >
            {copy.title}
          </h2>
          <p className="t-prose mt-5 max-w-md text-[15px] text-muted-foreground">{copy.body}</p>
          <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <a href="#get-started" className={btnClass({ size: 'lg' })}>
              <Figma className="h-4 w-4" />
              {copy.install}
            </a>
            <a
              href="https://github.com/syoooo/figma-relai"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[.08em] text-muted-foreground transition-colors hover:text-primary"
            >
              <Github className="h-4 w-4" />
              {copy.star}
            </a>
          </div>
        </div>
      </section>
      <footer className="w-full">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <img src="/logo-ink.svg" alt="Relai" className="h-4 w-auto" />
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">
            <span className="normal-case">{VERSION}</span>
            <span>MIT</span>
            <a href="/philosophy.html" className="transition-colors hover:text-primary">{copy.philosophy}</a>
            <a href="https://github.com/syoooo/figma-relai" target="_blank" rel="noreferrer" className="transition-colors hover:text-primary">GitHub</a>
          </div>
        </div>
      </footer>
    </>
  );
}
