import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Workflows() {
  const { language } = useLanguage();
  const copy = getCopy(language).flows;

  return (
    <section id="flows" className="w-full border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]">{copy.title}</h2>
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {copy.items.map((item) => (
            <article key={item.title} className="flex flex-col">
              <h3 className="font-heading text-lg font-semibold tracking-tight">{item.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              <div className="mt-5 border-l border-dashed border-border pl-4">
                {item.rows.map((row) => {
                  const machine = !row.includes('›');
                  return (
                    <p
                      key={row}
                      className={`py-1 font-mono text-[12px] leading-relaxed ${machine ? 'text-muted-foreground' : 'text-foreground'}`}
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {machine ? row : (
                        <>
                          <span className="text-primary">{row.slice(0, row.indexOf('›') + 1)}</span>
                          {row.slice(row.indexOf('›') + 1)}
                        </>
                      )}
                    </p>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
