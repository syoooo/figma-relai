
import { Figma, Github } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';
import { getCopy } from '../../lib/translations';
import { btnClass } from './btn';

const PANEL: Record<string, string> = {
  en: '/panel/plugin-ui.png',
  ja: '/panel/plugin-ui.ja.png',
  zh: '/panel/plugin-ui.zh.png'
};

export function Hero() {
  const { language } = useLanguage();
  const copy = getCopy(language).hero;
  const cjk = language !== 'en';

  return (
    <section id="top" className="glow-open relative w-full border-b border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-5 pb-16 pt-14 md:pt-20 lg:grid-cols-[1.15fr_.85fr] lg:gap-12 lg:pb-20">
        <div className="flex flex-col lg:pt-6">
          <p className="reveal reveal-1 t-label t-label--amber">{copy.eyebrow}</p>
          <h1
            className="reveal reveal-2 mt-5 font-heading font-semibold leading-[1.04] tracking-[-0.01em]"
            style={{ fontSize: cjk ? 'clamp(1.9rem, 4.6vw, 3.4rem)' : 'clamp(2.4rem, 6.5vw, 4.9rem)', lineHeight: cjk ? 1.32 : 1.04, whiteSpace: 'pre-line', minWidth: 0 }}
          >
            {copy.title}
          </h1>
          <p className="t-prose reveal reveal-3 mt-6 max-w-xl text-[15px] text-muted-foreground md:text-base">
            {copy.body}
          </p>
          <div className="reveal reveal-4 mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#get-started" className={btnClass({ size: 'lg' })}>
              <Figma className="h-4 w-4" />
              {copy.install}
            </a>
            <a href="https://github.com/syoooo/figma-relai" target="_blank" rel="noreferrer" className={btnClass({ variant: 'outline', size: 'lg' })}>
              <Github className="h-4 w-4" />
              {copy.github}
            </a>
          </div>
        </div>

        <figure className="reveal reveal-6 mx-auto w-full max-w-[340px] lg:max-w-[360px]">
          <div className="ticks border border-border bg-card p-1.5">
            <img
              src={PANEL[language]}
              width={760}
              height={872}
              alt="Relai plugin panel showing relay status, the file's rules, memory and no-go counts, and a live activity feed."
              className="block h-auto w-full"
              loading="eager"
            />
          </div>
        </figure>
      </div>
    </section>
  );
}
