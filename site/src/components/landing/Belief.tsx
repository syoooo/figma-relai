import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Belief() {
  const { language } = useLanguage();
  const copy = getCopy(language).belief;

  return (
    <section className="w-full border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <Kicker>{copy.eyebrow}</Kicker>
        <div className="mt-8 max-w-3xl space-y-6">
          <p className="text-[17px] leading-[1.9] text-foreground md:text-[19px]">{copy.p1}</p>
          <p className="text-[17px] leading-[1.9] text-muted-foreground md:text-[19px]">{copy.p2}</p>
        </div>
      </div>
    </section>
  );
}
