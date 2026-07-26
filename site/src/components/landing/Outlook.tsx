import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Outlook() {
  const { language } = useLanguage();
  const copy = getCopy(language).outlook;

  return (
    <section className="w-full border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <Kicker>{copy.eyebrow}</Kicker>
        <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]">{copy.title}</h2>
        <div className="mt-8 max-w-3xl space-y-6">
          <p className="text-[15px] leading-[1.9] text-foreground md:text-[17px]">{copy.p1}</p>
          <p className="text-[15px] leading-[1.9] text-muted-foreground md:text-[17px]">{copy.p2}</p>
          <p className="font-mono text-[13px] leading-relaxed text-muted-foreground">{copy.p3}</p>
        </div>
      </div>
    </section>
  );
}
