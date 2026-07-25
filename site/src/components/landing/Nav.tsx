import { useState } from 'react';
import { Github, Menu, X } from 'lucide-react';
import { useLanguage, type Language } from '../../lib/i18n';
import { getCopy, VERSION } from '../../lib/translations';
import { btnClass } from './btn';

const LOGO_URL = '/logo.svg';
const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日' },
  { code: 'zh', label: '中' }
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const copy = getCopy(language);
  const links = [
    { label: copy.nav.ledger, href: '#session' },
    { label: copy.nav.changes, href: '#changes' },
    { label: copy.nav.craft, href: '#craft' },
    { label: copy.nav.why, href: '#why' },
    { label: copy.nav.start, href: '#get-started' },
    { label: copy.nav.faq, href: '#faq' }
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-xl">
      <nav aria-label="Primary" className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-3" aria-label={copy.nav.home}>
          <img src={LOGO_URL} alt="Relai" className="h-5 w-auto" />
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">{VERSION}</span>
        </a>
        <div className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-primary">
              {l.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <div className="flex border border-border" role="group" aria-label="Language">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLanguage(item.code)}
                className={`h-8 px-2.5 font-mono text-xs ${language === item.code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'}`}
                aria-pressed={language === item.code}
              >
                {item.label}
              </button>
            ))}
          </div>
          <a href="https://github.com/syoooo/figma-relai" target="_blank" rel="noreferrer" className={btnClass({ variant: 'ghost', size: 'sm' })}>
            <Github className="h-4 w-4" />
            {copy.nav.github}
          </a>
          <a href="#get-started" className={btnClass({ size: 'sm' })}>{copy.nav.install}</a>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 w-9 items-center justify-center border border-border text-primary md:hidden"
          aria-label={open ? copy.nav.close : copy.nav.menu}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-border bg-background px-5 py-4 md:hidden">
          <div className="mb-3 flex border border-border">
            {LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLanguage(item.code)}
                className={`h-9 flex-1 font-mono text-xs ${language === item.code ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground hover:bg-secondary hover:text-primary">
                {l.label}
              </a>
            ))}
            <a href="#get-started" onClick={() => setOpen(false)} className={btnClass({ size: 'sm' }) + ' mt-3'}>
              {copy.nav.install}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
