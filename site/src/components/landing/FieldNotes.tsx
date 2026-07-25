import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

function CountUp({ value, play }: { value: string; play: boolean }) {
  const target = parseInt(value.replace(/[^0-9]/g, ''), 10);
  const [n, setN] = useState<number>(Number.isNaN(target) ? 0 : target);

  useEffect(() => {
    if (!play || Number.isNaN(target)) return;
    const t0 = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setN(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, target]);

  if (Number.isNaN(target)) return <>{value}</>;
  return <>{n.toLocaleString('en-US')}</>;
}

export function FieldNotes() {
  const { language } = useLanguage();
  const copy = getCopy(language).notes;
  const [play, setPlay] = useState(false);
  const ref = useRef<HTMLDListElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window) || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { setPlay(true); io.disconnect(); } },
      { threshold: 0.4 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <section className="dots-bg w-full border-b border-border bg-[#0d0c09]">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 md:py-20">
        <Kicker>{copy.eyebrow}</Kicker>
        <dl ref={ref} className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {copy.stats.map((s) => (
            <div key={s.label} className="bg-[#0d0c09] p-6 md:p-7">
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-mono text-[2.4rem] font-semibold leading-none tracking-tight text-foreground md:text-[2.8rem]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <CountUp value={s.n} play={play} />
              </dd>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </dl>
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">{copy.caption}</p>
      </div>
    </section>
  );
}
