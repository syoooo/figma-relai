
import { Figma, Github } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';
import { getCopy, VERSION } from '../../lib/translations';
import { Kicker } from './Kicker';
import { btnClass } from './btn';

const LOGO_URL = '/logo.svg';

export function CtaFooter() {
  const { language } = useLanguage();
  const copy = getCopy(language).cta;
  const cjk = language !== 'en';

  return (
    <>
      <section className="w-full border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 md:py-28">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2
            className="mt-4 max-w-3xl font-heading font-semibold leading-[1.08] tracking-tight"
            style={{ fontSize: cjk ? 'clamp(1.6rem, 3.6vw, 2.6rem)' : 'clamp(2rem, 5vw, 3.6rem)', lineHeight: cjk ? 1.35 : 1.08 }}
          >
            {copy.title}
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#get-started" className={btnClass({ size: 'lg' })}>
              <Figma className="h-4 w-4" />
              {copy.install}
            </a>
            <a href="https://github.com/syoooo/figma-relai" target="_blank" rel="noreferrer" className={btnClass({ variant: 'outline', size: 'lg' })}>
              <Github className="h-4 w-4" />
              {copy.star}
            </a>
          </div>
        </div>
      </section>
      <footer className="w-full">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <img src={LOGO_URL} alt="Relai" className="h-4 w-auto" />
          </div>
          <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">
            <span>{VERSION}</span>
            <span>MIT</span>
            <a href="https://github.com/syoooo/figma-relai" target="_blank" rel="noreferrer" className="transition-colors hover:text-primary">GitHub</a>
          </div>
        </div>
      </footer>
    </>
  );
}
