import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';
import { Strip } from './Strip';

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
        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-x-10 lg:gap-x-14">
          {copy.items.map((item) => (
            <article key={item.title} className="flex flex-col">
              <h3 className="font-heading text-lg font-semibold tracking-tight">{item.title}</h3>
              <p className="t-prose mt-2.5 text-sm text-muted-foreground">{item.body}</p>
              <div className="mt-5">
                <Strip label={item.tag} rows={item.rows} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
