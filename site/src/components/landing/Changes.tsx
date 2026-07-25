
import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Changes() {
  const { language } = useLanguage();
  const copy = getCopy(language).changes;

  return (
    <section id="changes" className="w-full border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]">{copy.title}</h2>
        </div>
        <ol className="mt-12">
          {copy.items.map((item, i) => (
            <li key={item.title} className="grid gap-3 border-t border-border py-8 last:pb-0 md:grid-cols-[64px_1fr_1fr] md:gap-8">
              <span className="font-mono text-sm text-primary">0{i + 1}</span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
              <div className="min-w-0 self-center border-l border-dashed border-border pl-4 md:pl-6">
                <p className="font-mono text-[12px] leading-relaxed text-foreground md:text-[13px]">
                  <span className="text-primary">you › </span>
                  {item.ask}
                </p>
                <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-muted-foreground md:text-[13px]" style={{ overflowWrap: 'anywhere' }}>
                  {item.result} <span className="text-primary">✓</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
