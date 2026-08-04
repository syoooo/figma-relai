
import { ArrowUpRight, Download } from 'lucide-react';
import { useLanguage } from '../../lib/i18n';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';
import { CopyBlock } from './CopyBlock';
import { btnClass } from './btn';

const CLAUDE = 'claude mcp add Relai -- npx -y figma-relai';
const CODEX = 'codex mcp add Relai -- npx -y figma-relai';
const CURSOR = `{ "mcpServers": { "Relai": { "command": "npx", "args": ["-y", "figma-relai"] } } }`;
const DOWNLOAD_URL = 'https://github.com/syoooo/figma-relai/releases/latest';

export function GetStarted() {
  const { language } = useLanguage();
  const copy = getCopy(language).start;

  return (
    <section id="get-started" className="dots-bg w-full border-y-[0.5px] border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="max-w-2xl">
          <Kicker>{copy.eyebrow}</Kicker>
          <h2 className="mt-3 font-heading text-[1.9rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]">{copy.title}</h2>
          <p className="t-prose mt-4 text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <ol className="mt-12 max-w-3xl space-y-10">
          {copy.steps.map((step, index) => (
            <li key={step.title} className="grid gap-4 md:grid-cols-[auto_1fr] md:gap-6">
              <div className="flex h-9 w-9 items-center justify-center border border-primary font-mono text-sm font-semibold text-primary">{index + 1}</div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="t-prose mt-1.5 text-sm text-muted-foreground">{step.body}</p>
                {index === 0 && (
                  <a href={DOWNLOAD_URL} target="_blank" rel="noreferrer" className={btnClass({ variant: 'outline', size: 'sm' }) + ' mt-4'}>
                    <Download className="h-3.5 w-3.5" />
                    {copy.download}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
                {index === 1 && (
                  <>
                    <div className="mt-4 space-y-3">
                      <CopyBlock label="claude code" code={CLAUDE} />
                      <CopyBlock label="codex cli" code={CODEX} />
                    </div>
                    <div className="mt-3">
                      <p className="mb-2 text-xs text-muted-foreground">
                        {copy.cursor} <span className="font-mono text-foreground">.cursor/mcp.json</span>
                      </p>
                      <CopyBlock label="json" code={CURSOR} />
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
