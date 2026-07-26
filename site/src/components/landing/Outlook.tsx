import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Outlook() {
  const { language } = useLanguage();
  const copy = getCopy(language).outlook;

  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <Kicker>{copy.eyebrow}</Kicker>
        <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]">{copy.title}</h2>
        <div className="prose-col mt-8 space-y-6">
          <p className="t-lede text-[15px] text-foreground md:text-[17px]">{copy.p1}</p>
          <p className="t-lede text-[15px] text-muted-foreground md:text-[17px]">{copy.p2}</p>
          <p className="font-mono text-[13px] leading-relaxed text-muted-foreground">{copy.p3}</p>
          <p>
            <a href="/philosophy.html" className="inline-block font-mono text-[12px] text-primary hover:underline">
              {copy.philo} →
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
