import { useId } from 'react';
import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';
import { StripRow } from './Strip';

/* The page's single loud element: the tally seal (割印). One impression straddling
   the boundary between the agent's dark well and the file's paper card — half on
   each, whole only when they align. Drawn from registered-seal grammar: round,
   double ring, fine linework, frame intact; the ink take-up is uneven on purpose
   (the .seal-impression mask), the frame never breaks. Vermilion appears here
   and nowhere else on the page. */
const RING_TEXT = 'CARRIED BY THE FILE · RELAI ·';

function Seal() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 132 132" fill="none" className="seal-impression block h-full w-full" aria-hidden>
      <circle cx="66" cy="66" r="62" stroke="var(--shu)" strokeWidth="2.8" />
      <circle cx="66" cy="66" r="48" stroke="var(--shu)" strokeWidth="1.3" />
      <defs><path id={id} d="M 66 11 a 55 55 0 1 1 -0.01 0" /></defs>
      <text fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="3.1" fill="var(--shu)" dominantBaseline="central">
        <textPath href={`#${id}`}>{RING_TEXT}</textPath>
      </text>
      <rect x="46" y="46" width="18" height="18" stroke="var(--shu)" strokeWidth="2.2" />
      <rect x="68" y="68" width="18" height="18" stroke="var(--shu)" strokeWidth="2.2" />
      <path d="M 64 86 L 46 86 L 46 68" stroke="var(--shu)" strokeWidth="1.1" />
    </svg>
  );
}

function Contract() {
  const { language } = useLanguage();
  const copy = getCopy(language).law.contract;

  return (
    <figure className="w-full">
      <div
        className="relative grid sm:grid-cols-2"
        style={{ boxShadow: '0 0 0 1px var(--border), 0 2px 6px rgba(26,22,19,0.07), 0 10px 22px -8px rgba(26,22,19,0.13)' }}
      >
        <div className="well p-5 md:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.agentTag}</p>
          <div className="relative mt-2.5">
            <span aria-hidden className="wire absolute left-[2.5px] top-2 h-[calc(100%-16px)]" />
            {copy.rows.map((row) => (
              <StripRow key={row} row={row} />
            ))}
          </div>
        </div>
        <div className="border-t border-border bg-card p-5 sm:border-l sm:border-t-0 md:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{copy.fileTag}</p>
          <div className="mt-2.5 space-y-1.5">
            {copy.file.map((line) => (
              <p key={line.b} className="text-[13.5px] leading-relaxed">
                <span className="font-semibold">{line.b}</span> <span className="text-muted-foreground">{line.t}</span>
              </p>
            ))}
          </div>
          <p className="mt-3 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">{copy.cite}</p>
        </div>
        <div aria-hidden className="absolute left-1/2 top-0 h-[128px] w-[128px] -translate-x-1/2 -translate-y-[54%] rotate-[-6deg] md:h-[148px] md:w-[148px]">
          <Seal />
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-[10.5px] leading-relaxed tracking-[0.04em] text-muted-foreground">{copy.cap}</figcaption>
    </figure>
  );
}

export function Law() {
  const { language } = useLanguage();
  const copy = getCopy(language).law;

  return (
    <section className="dots-bg w-full border-y-[0.5px] border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
          <div>
            <Kicker>{copy.eyebrow}</Kicker>
            <h2 className="mt-3 font-heading text-[1.9rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]" style={{ whiteSpace: 'pre-line' }}>{copy.title}</h2>
            <p className="t-prose mt-4 max-w-xl text-[15px] text-muted-foreground">{copy.body}</p>
            <div className="mt-8 space-y-4 border-t border-dashed border-border pt-6">
              {copy.list.map((item, i) => (
                <div key={item.label} className="grid grid-cols-[96px_1fr] items-baseline gap-3">
                  <p className="t-label"><span className="mr-1.5">§{i + 1}</span><span className="t-label--amber">{item.label}</span></p>
                  <p className="t-prose text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
            <p className="t-prose mt-6 max-w-xl text-[15px] text-foreground">{copy.inherit}</p>
          </div>
          <Contract />
        </div>
      </div>
    </section>
  );
}
