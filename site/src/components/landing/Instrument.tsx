import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

/* The compounding loop, back on the page as the vision section's figure: the life
   of one ruling, clockwise — you say it, the file keeps it, another AI arrives,
   your recorded words call the halt. Ink is you and the machines; vermilion is
   the file speaking (its keeping, its halt, the ruling in circulation) — the same
   voice the seal and the file› rows use. Solid = it happens now, dashed = time
   passes. The dot travels the ring; still under reduced motion. */
type Loop = {
  center: string;
  s1: string; t1: string; s2: string; t2: string;
  s3: string; t3: string; s4: string; t4: string;
};

/* width-aware line splitting: a CJK glyph is a full em, Latin averages ~0.55em */
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

function SideLabel({ x, anchor, main, sub, shuMain }: { x: number; anchor: 'start' | 'end'; main: string; sub: string; shuMain: boolean }) {
  const mono = 'var(--font-mono)';
  const mains = splitLines(main, 9);
  const subs = splitLines(sub, 10.5);
  const total = mains.length * 15 + subs.length * 14 + 6;
  const y0 = 255 - total / 2 + 11;
  return (
    <>
      {mains.map((l, i) => (
        <text key={l} x={x} y={y0 + i * 15} textAnchor={anchor} style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', fill: shuMain ? 'var(--shu-text)' : 'var(--muted-foreground)' }}>{l}</text>
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
  const shu = 'var(--shu-text)';
  const fg = 'var(--foreground)';
  const mono = 'var(--font-mono)';
  const label = { fontFamily: mono, fontSize: 11, letterSpacing: '0.1em', fill: ink } as const;
  const sub = { fontFamily: mono, fontSize: 10, letterSpacing: '0.04em', fill: ink, opacity: 0.75 } as const;

  return (
    <figure className="mx-auto w-full max-w-[560px]">
      <svg viewBox="0 0 560 492" role="img" aria-label={`${loop.s1} → ${loop.s2} → ${loop.s3} → ${loop.s4}`} className="block h-auto w-full">
        <path d="M 280 105 A 150 150 0 0 1 430 255" fill="none" style={{ stroke: line }} />
        <path d="M 430 255 A 150 150 0 0 1 280 405" fill="none" style={{ stroke: line, strokeDasharray: '4 6' }} />
        <path d="M 280 405 A 150 150 0 0 1 130 255" fill="none" style={{ stroke: line }} />
        <path d="M 130 255 A 150 150 0 0 1 280 105" fill="none" style={{ stroke: line, strokeDasharray: '4 6' }} />

        <line x1="383.2" y1="151.8" x2="388.9" y2="146.1" style={{ stroke: line }} />
        <line x1="383.2" y1="358.2" x2="388.9" y2="363.9" style={{ stroke: line }} />
        <line x1="176.8" y1="358.2" x2="171.1" y2="363.9" style={{ stroke: line }} />
        <line x1="176.8" y1="151.8" x2="171.1" y2="146.1" style={{ stroke: line }} />

        <path d="M -4 -6 L 4 0 L -4 6" fill="none" transform="translate(386,149) rotate(45)" style={{ stroke: ink }} />
        <path d="M -4 -6 L 4 0 L -4 6" fill="none" transform="translate(174,361) rotate(225)" style={{ stroke: ink }} />

        {/* the ruling in circulation — the file's voice, vermilion */}
        <circle cx="280" cy="255" r="150" fill="none" className="loop-dot" style={{ stroke: shu, strokeWidth: 5, strokeLinecap: 'round' }} />

        {/* stations: you (ink) → the file keeps (shu) → another AI (muted) → your recorded voice (hollow shu) */}
        <rect x="275" y="100" width="10" height="10" style={{ fill: fg }} />
        <rect x="425" y="250" width="10" height="10" style={{ fill: shu }} />
        <rect x="275" y="400" width="10" height="10" style={{ fill: ink }} />
        <rect x="125" y="250" width="10" height="10" style={{ fill: 'var(--background)', stroke: shu, strokeWidth: 1.5 }} />

        <text x="280" y="58" textAnchor="middle" style={{ ...label, fill: fg }}>{loop.s1}</text>
        <text x="280" y="76" textAnchor="middle" style={sub}>{loop.t1}</text>
        <SideLabel x={452} anchor="start" main={loop.s2} sub={loop.t2} shuMain />
        <text x="280" y="440" textAnchor="middle" style={label}>{loop.s3}</text>
        <text x="280" y="458" textAnchor="middle" style={sub}>{loop.t3}</text>
        <SideLabel x={108} anchor="end" main={loop.s4} sub={loop.t4} shuMain />

        <text x="280" y="259" textAnchor="middle" style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.22em', fill: ink }}>{loop.center}</text>
      </svg>
    </figure>
  );
}

export function Instrument() {
  const copy = getCopy();

  return (
    <section className="w-full border-y-[0.5px] border-border bg-card">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
          <LoopDiagram loop={copy.law.loop} />
          <div>
            <Kicker>{copy.grow.eyebrow}</Kicker>
            <h2 className="mt-3 font-heading text-[1.9rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]" style={{ whiteSpace: 'pre-line' }}>{copy.grow.title}</h2>
            <div className="prose-col mt-6 space-y-5">
              <p className="t-lede text-[15.5px] text-foreground md:text-[16.5px]">{copy.grow.p1}</p>
              <p className="t-lede text-[15.5px] text-muted-foreground md:text-[16.5px]">{copy.grow.p2}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
