import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';
import { Strip } from './Strip';

export function Workflows() {
  const { language } = useLanguage();
  const copy = getCopy(language).flows;

  return (
    <section id="flows" className="w-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.9rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]">{copy.title}</h2>
        </div>
        <div className="mt-12 grid gap-[0.5px] overflow-hidden border-[0.5px] border-border bg-border md:grid-cols-2">
          {copy.items.map((item) => (
            <article key={item.title} className="flex flex-col bg-background p-6 md:p-8">
              <h3 className="font-heading text-lg font-semibold tracking-tight">{item.title}</h3>
              <p className="t-prose mt-2.5 text-sm text-muted-foreground">{item.body}</p>
              <div className="mt-auto pt-5">
                <Strip label={item.tag} rows={item.rows} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
