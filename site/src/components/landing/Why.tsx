
import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Why() {
  const { language } = useLanguage();
  const copy = getCopy(language).why;

  return (
    <section id="why" className="w-full border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Kicker>{copy.eyebrow}</Kicker>
            <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]">{copy.title}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>
            <p className="mt-6 border-l-2 border-primary pl-4 text-[13px] leading-relaxed text-muted-foreground">{copy.note}</p>
          </div>
          <dl>
            {copy.items.map((item, i) => (
              <div key={item.title} className="grid gap-2 border-t border-border py-6 first:border-t-0 first:pt-0 sm:grid-cols-[220px_1fr] sm:gap-6">
                <dt className="flex items-baseline gap-3 text-[15px] font-semibold tracking-tight">
                  <span aria-hidden className="font-mono text-xs text-primary">{String(i + 1).padStart(2, '0')}</span>
                  {item.title}
                </dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
