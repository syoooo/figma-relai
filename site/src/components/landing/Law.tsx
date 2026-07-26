import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

/* The page's single diagram: the life of one ruling as a dial — the loop made
   literal. Clockwise from the top: you say it → the file keeps it → someone
   touches it → your words come back; the amber dashed quadrant closing the
   circle is the promote path, taken only with the designer's yes. Marks match
   the strips: solid amber = you, cream = the machine, hollow amber = your
   recorded voice. A slow amber dot travels the ring (static under
   prefers-reduced-motion). */
type Loop = {
  center: string;
  s1: string; t1: string; s2: string; t2: string;
  s3: string; t3: string; s4: string; t4: string;
};

/* width-aware line splitting: a CJK glyph is a full em, Latin averages ~0.55em —
   character counts alone let 10 kanji overflow a slot that fits 12 Latin letters */
function approxUnits(text: string): number {
  let units = 0;
  for (const ch of text) units += /[　-鿿぀-ヿ＀-￯]/.test(ch) ? 1 : 0.55;
  return units;
}

function splitLines(text: string, maxUnits: number): string[] {
  if (text.includes('\n')) return text.split('\n');
  if (approxUnits(text) <= maxUnits) return [text];
  const mid = Math.floor(text.length / 2);
  let cut = -1;
  for (let d = 0; d <= mid; d++) {
    if (text[mid - d] === ' ') { cut = mid - d; break; }
    if (text[mid + d] === ' ') { cut = mid + d; break; }
  }
  if (cut === -1) return [text.slice(0, mid), text.slice(mid)];
  return [text.slice(0, cut), text.slice(cut + 1)];
}

function SideLabel({ x, anchor, main, sub, amberMain }: { x: number; anchor: 'start' | 'end'; main: string; sub: string; amberMain: boolean }) {
  const mono = 'var(--font-mono)';
  const mains = splitLines(main, 9);
  const subs = splitLines(sub, 10.5);
  const total = mains.length * 15 + subs.length * 14 + 6;
  const y0 = 255 - total / 2 + 11;
  return (
    <>
      {mains.map((l, i) => (
        <text key={l} x={x} y={y0 + i * 15} textAnchor={anchor} style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', fill: amberMain ? 'var(--primary)' : 'var(--muted-foreground)' }}>{l}</text>
      ))}
      {subs.map((l, i) => (
        <text key={l} x={x} y={y0 + mains.length * 15 + 6 + i * 14} textAnchor={anchor} style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.04em', fill: 'var(--muted-foreground)', opacity: 0.75 }}>{l}</text>
      ))}
    </>
  );
}

function LoopDiagram({ loop }: { loop: Loop }) {
  const ink = 'var(--muted-foreground)';
  const line = 'var(--border)';
  const amber = 'var(--primary)';
  const cream = 'var(--foreground)';
  const mono = 'var(--font-mono)';
  const label = { fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', fill: ink } as const;
  const sub = { fontFamily: mono, fontSize: 10, letterSpacing: '0.04em', fill: ink, opacity: 0.75 } as const;

  return (
    <figure className="mx-auto w-full max-w-[560px]">
      <svg viewBox="0 0 560 492" role="img" aria-label={`${loop.s1} → ${loop.s2} → ${loop.s3} → ${loop.s4}`} className="block h-auto w-full">
        {/* the ring, arc by arc: solid = it happens now, dashed = time passes,
            amber dashed = the promote quadrant */}
        <path d="M 280 105 A 150 150 0 0 1 430 255" fill="none" style={{ stroke: line }} />
        <path d="M 430 255 A 150 150 0 0 1 280 405" fill="none" style={{ stroke: line, strokeDasharray: '4 6' }} />
        <path d="M 280 405 A 150 150 0 0 1 130 255" fill="none" style={{ stroke: line }} />
        <path d="M 130 255 A 150 150 0 0 1 280 105" fill="none" style={{ stroke: line, strokeDasharray: '4 6' }} />

        {/* dial ticks on the diagonals */}
        <line x1="383.2" y1="151.8" x2="388.9" y2="146.1" style={{ stroke: line }} />
        <line x1="383.2" y1="358.2" x2="388.9" y2="363.9" style={{ stroke: line }} />
        <line x1="176.8" y1="358.2" x2="171.1" y2="363.9" style={{ stroke: line }} />
        <line x1="176.8" y1="151.8" x2="171.1" y2="146.1" style={{ stroke: line }} />

        {/* clockwise direction */}
        <path d="M -4 -6 L 4 0 L -4 6" fill="none" transform="translate(386,149) rotate(45)" style={{ stroke: ink }} />
        <path d="M -4 -6 L 4 0 L -4 6" fill="none" transform="translate(174,361) rotate(225)" style={{ stroke: ink }} />

        {/* the traveling ruling */}
        <circle cx="280" cy="255" r="150" fill="none" className="loop-dot" style={{ stroke: amber, strokeWidth: 5, strokeLinecap: 'round' }} />

        {/* stations */}
        <rect x="275" y="100" width="10" height="10" style={{ fill: amber }} />
        <rect x="425" y="250" width="10" height="10" style={{ fill: cream }} />
        <rect x="275" y="400" width="10" height="10" style={{ fill: cream }} />
        <rect x="125" y="250" width="10" height="10" style={{ fill: 'var(--background)', stroke: amber, strokeWidth: 1.5 }} />

        {/* labels: top and bottom centered, left and right in the margins */}
        <text x="280" y="58" textAnchor="middle" style={{ ...label, fill: amber }}>{loop.s1}</text>
        <text x="280" y="76" textAnchor="middle" style={sub}>{loop.t1}</text>
        <SideLabel x={452} anchor="start" main={loop.s2} sub={loop.t2} amberMain={false} />
        <text x="280" y="440" textAnchor="middle" style={label}>{loop.s3}</text>
        <text x="280" y="458" textAnchor="middle" style={sub}>{loop.t3}</text>
        <SideLabel x={108} anchor="end" main={loop.s4} sub={loop.t4} amberMain />

        {/* the dial's name */}
        <text x="280" y="259" textAnchor="middle" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.22em', fill: ink }}>{loop.center}</text>
      </svg>
    </figure>
  );
}

export function Law() {
  const { language } = useLanguage();
  const copy = getCopy(language).law;

  return (
    <section className="dots-bg w-full border-b border-border bg-[#0d0c09]">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div>
            <Kicker>{copy.eyebrow}</Kicker>
            <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]" style={{ whiteSpace: 'pre-line' }}>{copy.title}</h2>
            <p className="t-prose mt-4 max-w-xl text-[15px] text-muted-foreground">{copy.body}</p>
            <div className="mt-8 space-y-4 border-t border-dashed border-border pt-6">
              {copy.list.map((item) => (
                <div key={item.label} className="grid grid-cols-[76px_1fr] items-baseline gap-3">
                  <p className="t-label t-label--amber">{item.label}</p>
                  <p className="t-prose text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
            <p className="t-prose mt-6 max-w-xl text-[15px] text-foreground">{copy.inherit}</p>
          </div>
          <LoopDiagram loop={copy.loop} />
        </div>
      </div>
    </section>
  );
}
