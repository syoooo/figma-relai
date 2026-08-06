
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';
import { StripRow } from './Strip';

export function Changes() {
  const copy = getCopy().changes;

  return (
    <section id="changes" className="w-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.9rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]">{copy.title}</h2>
        </div>
        <ol className="mt-12">
          {copy.items.map((item, i) => (
            <li key={item.title} className="grid gap-3 border-t-[0.5px] border-border py-6 last:pb-0 md:grid-cols-[64px_minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-8">
              <span className="font-mono text-sm text-primary">0{i + 1}</span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight">{item.title}</h3>
                <p className="t-prose mt-1.5 max-w-md text-sm text-muted-foreground">{item.line}</p>
              </div>
              <div className="record min-w-0 self-center border border-border px-3.5 py-2">
                <StripRow row={`you › ${item.ask}`} />
                <StripRow row={`${item.result} ✓`} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
