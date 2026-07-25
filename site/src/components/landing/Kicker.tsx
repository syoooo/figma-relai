import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export function Kicker({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [docked, setDocked] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window) || !ref.current) return;
    setDocked(false);
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { setDocked(true); io.disconnect(); } },
      { threshold: 0.5, rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(ref.current);
    const failsafe = window.setTimeout(() => setDocked(true), 4000);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, []);

  return (
    <p ref={ref} className="kicker t-label">
      <span aria-hidden className={`kdock ${docked ? '' : 'undocked'}`}><i /><i /></span>
      <span className="t-label--amber">{children}</span>
      <span aria-hidden className="kicker-line" />
    </p>
  );
}
