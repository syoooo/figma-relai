import { Check } from '@phosphor-icons/react';
import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Law() {
  const { language } = useLanguage();
  const copy = getCopy(language).law;

  return (
    <section className="w-full border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <Kicker>{copy.eyebrow}</Kicker>
            <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]" style={{ whiteSpace: 'pre-line' }}>{copy.title}</h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>
          </div>
          <div className="self-center border-l border-dashed border-border pl-4 lg:pl-6">
            {copy.rows.map((row) => {
              const human = row.includes('›');
              const done = row.endsWith('✓');
              const text = done ? row.slice(0, -1).trimEnd() : row;
              return (
                <p
                  key={row}
                  className={`py-1.5 font-mono text-[12px] leading-relaxed md:text-[13px] ${human ? 'text-foreground' : 'text-muted-foreground'}`}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {human ? (
                    <>
                      <span className="text-primary">{text.slice(0, text.indexOf('›') + 1)}</span>
                      {text.slice(text.indexOf('›') + 1)}
                    </>
                  ) : text}
                  {done && <Check aria-hidden weight="bold" className="ml-1.5 inline h-[1em] w-[1em] align-[-0.125em] text-primary" />}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
