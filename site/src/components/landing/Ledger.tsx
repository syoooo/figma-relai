import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

type Row =
  | { kind: 'you'; text: string }
  | { kind: 'gate'; text: string }
  | { kind: 'tool'; cmd: string; meta: string };

const ROW_MS = 360;
const CHAR_MS = 26;

export function Ledger() {
  const { language } = useLanguage();
  const copy = getCopy(language).ledger;

  const rows: Row[] = [
    { kind: 'you', text: copy.youLine1 },
    { kind: 'tool', ...copy.rows[0] },
    { kind: 'tool', ...copy.rows[1] },
    { kind: 'you', text: copy.youLine2 },
    { kind: 'gate', text: copy.gateLine },
    { kind: 'tool', ...copy.rows[2] },
    { kind: 'tool', ...copy.rows[3] }
  ];

  // replay state — the fallback (reduced motion / no IO / no JS timeline) shows everything
  const [played, setPlayed] = useState(false);
  const [shown, setShown] = useState(rows.length);
  const [typing, setTyping] = useState<{ row: number; chars: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window) || !hostRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        setPlayed(true);
        setShown(0);
        let t = 160;
        rows.forEach((row, i) => {
          if (row.kind === 'you') {
            timers.current.push(window.setTimeout(() => { setShown(i + 1); setTyping({ row: i, chars: 0 }); }, t));
            for (let c = 1; c <= row.text.length; c++) {
              timers.current.push(window.setTimeout(() => setTyping({ row: i, chars: c }), t + c * CHAR_MS));
            }
            t += row.text.length * CHAR_MS + 240;
            timers.current.push(window.setTimeout(() => setTyping(null), t - 60));
          } else {
            timers.current.push(window.setTimeout(() => setShown(i + 1), t));
            t += ROW_MS;
          }
        });
      },
      { threshold: 0.25 }
    );
    io.observe(hostRef.current);
    return () => { io.disconnect(); timers.current.forEach(clearTimeout); timers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const rowText = (row: Extract<Row, { kind: 'you' }>, i: number) => {
    if (typing && typing.row === i) {
      return (
        <>
          {row.text.slice(0, typing.chars)}
          <span aria-hidden className="ml-0.5 inline-block h-[0.9em] w-[0.5em] translate-y-[0.12em] bg-primary" />
        </>
      );
    }
    return row.text;
  };

  return (
    <section id="session" className="dots-bg w-full border-b border-border bg-[#0d0c09]">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]">{copy.title}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>
        </div>

        <div ref={hostRef} className="mt-12">
          <div className="relative">
            <span aria-hidden className={`wire absolute left-[7px] top-2 h-[calc(100%-16px)] md:left-[9px] ${played ? 'wire-live' : ''}`} />
            <ol aria-label="session replay">
              {rows.map((row, i) => (
                <li
                  key={i}
                  className={`relative grid grid-cols-[16px_1fr] items-baseline gap-3 py-2.5 md:grid-cols-[20px_150px_1fr] md:gap-5 ${i < shown ? (played ? 'row-in' : '') : 'invisible'}`}
                >
                  {row.kind === 'gate' ? (
                    <span aria-hidden className="relative top-[1px] block h-[9px] w-[9px] justify-self-start md:justify-self-center">
                      <i className="absolute left-0 top-0 block h-[4px] w-[4px] bg-primary" />
                      <i className="absolute bottom-0 right-0 block h-[4px] w-[4px] bg-foreground" />
                    </span>
                  ) : (
                    <span aria-hidden className="wire-dot relative top-[1px] justify-self-start md:justify-self-center" />
                  )}
                  {row.kind === 'you' && (
                    <>
                      <span className="hidden font-mono text-xs text-primary md:block">you ›</span>
                      <p className="font-mono text-[13px] leading-relaxed text-foreground md:text-sm">
                        <span className="mr-2 text-primary md:hidden">›</span>
                        {rowText(row, i)}
                      </p>
                    </>
                  )}
                  {row.kind === 'gate' && (
                    <>
                      <span className="hidden font-mono text-xs text-muted-foreground md:block">gate</span>
                      <p className="font-mono text-[12px] leading-relaxed text-accent-foreground md:text-[13px]">⏸ {row.text}</p>
                    </>
                  )}
                  {row.kind === 'tool' && (
                    <>
                      <span className="hidden truncate font-mono text-xs text-muted-foreground md:block">{row.cmd}</span>
                      <p className="min-w-0 font-mono text-[12px] leading-relaxed text-muted-foreground md:text-[13px]">
                        <span className="text-foreground md:hidden">{row.cmd} · </span>
                        {row.meta}
                        <span className="ml-2 text-primary">✓</span>
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-8 border-t border-border pt-4 font-mono text-[11px] leading-relaxed text-muted-foreground">{copy.footnote}</p>
        </div>
      </div>
    </section>
  );
}
