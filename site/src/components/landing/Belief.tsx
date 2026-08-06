import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Belief() {
  const copy = getCopy().belief;

  return (
    <section className="w-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <Kicker>{copy.eyebrow}</Kicker>
        <div className="prose-col mt-8 space-y-6">
          <p className="t-lede text-[17px] text-foreground md:text-[19px]">{copy.p1}</p>
          <p className="t-lede text-[17px] text-muted-foreground md:text-[19px]">{copy.p2}</p>
          <p className="t-lede text-[17px] text-muted-foreground md:text-[19px]">{copy.p3}</p>
          <p className="t-lede border-l-2 border-primary pl-5 text-[17px] text-foreground md:text-[19px]">{copy.p4}</p>
        </div>
      </div>
    </section>
  );
}
