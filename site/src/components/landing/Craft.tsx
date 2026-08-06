import { X } from '@phosphor-icons/react';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';
import { StripRow } from './Strip';
import { codeText } from './inline';

export function Craft() {
  const copy = getCopy().craft;

  return (
    <section id="craft" className="w-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.9rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]">{copy.title}</h2>
          <p className="t-prose mt-4 max-w-2xl text-[15px] text-muted-foreground">{copy.body}</p>
        </div>
        <div className="mt-12 grid gap-[0.5px] overflow-hidden border-[0.5px] border-border bg-border lg:grid-cols-2">
          {copy.items.map((item, i) => (
            <article key={item.title} className="flex flex-col bg-background p-7 md:p-9">
              <p className="font-mono text-xs text-primary">0{i + 1} · {item.kicker}</p>
              <h3 className="mt-3 font-heading text-xl font-semibold tracking-tight md:text-[1.35rem]">{item.title}</h3>
              <p className="t-prose mt-3 text-sm text-muted-foreground">{codeText(item.body)}</p>
              <div className="well mt-6 border border-border px-4 pb-4 pt-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="w-3 border-t border-border" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{item.tag}</span>
                  <span aria-hidden className="flex-1 border-t border-dashed border-border" />
                </div>
                {'rows' in item ? (
                  <div className="relative mt-2.5">
                    <span aria-hidden className="wire absolute left-[2.5px] top-2 h-[calc(100%-16px)]" />
                    {item.rows.map((row) => (
                      <StripRow key={row} row={row} />
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <pre className="whitespace-pre font-mono text-[11.5px] leading-relaxed text-muted-foreground md:text-[12px]">
                      {item.artifact.startsWith('✗') ? (
                        <>
                          <X aria-hidden weight="bold" className="inline h-[1em] w-[1em] align-[-0.125em] text-[color:var(--destructive)]" />
                          {item.artifact.slice(1)}
                        </>
                      ) : (
                        item.artifact
                      )}
                    </pre>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
