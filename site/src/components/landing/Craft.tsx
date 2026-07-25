import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';

export function Craft() {
  const { language } = useLanguage();
  const copy = getCopy(language).craft;

  return (
    <section id="craft" className="w-full border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.7rem] font-semibold leading-tight tracking-tight md:text-[2.2rem]">{copy.title}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{copy.body}</p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden border border-border bg-border lg:grid-cols-2">
          {copy.items.map((item, i) => (
            <article key={item.title} className="flex flex-col bg-background p-7 md:p-9">
              <p className="font-mono text-xs text-primary">0{i + 1} · {item.kicker}</p>
              <h3 className="mt-3 font-heading text-xl font-semibold tracking-tight md:text-[1.35rem]">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              <div className="ticks mt-6 overflow-x-auto border border-border bg-[#0d0c09] p-4">
                <pre className="whitespace-pre font-mono text-[11.5px] leading-relaxed text-muted-foreground md:text-[12px]">{item.artifact}</pre>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
