import { Check, X } from '@phosphor-icons/react';

/* The page-wide "session strip" grammar — the ledger's row language, extracted.
   Three voices: solid amber square = you, solid cream square = a tool running,
   hollow amber square = the file's law speaking (precedents, guards).
   A row wrapped in (parens) alone is elapsed time / a scene change. */

type Parsed =
  | { kind: 'divider'; text: string }
  | { kind: 'you'; speaker: string; text: string; done: boolean }
  | { kind: 'law'; text: string; blocked: boolean; done: boolean }
  | { kind: 'machine'; cmd: string; meta: string; done: boolean };

function parseRow(row: string): Parsed {
  const done = row.endsWith('✓');
  const text = (done ? row.slice(0, -1) : row).trim();
  if (/^[（(].*[)）]$/.test(text)) {
    return { kind: 'divider', text: text.replace(/^[（(]/, '').replace(/[)）]$/, '') };
  }
  if (text.startsWith('file ›')) {
    const t = text.slice(6).trim();
    return { kind: 'law', text: t, blocked: t.startsWith('✗'), done };
  }
  const gi = text.indexOf('›');
  if (gi > 0 && gi <= 12) {
    return { kind: 'you', speaker: text.slice(0, gi).trim(), text: text.slice(gi + 1).trim(), done };
  }
  const dot = text.indexOf(' · ');
  if (dot > 0) return { kind: 'machine', cmd: text.slice(0, dot), meta: text.slice(dot + 3), done };
  const col = text.indexOf(': ');
  if (col > 0) return { kind: 'machine', cmd: text.slice(0, col), meta: text.slice(col + 2), done };
  return { kind: 'machine', cmd: text, meta: '', done };
}

function Mark({ voice }: { voice: 'you' | 'tool' | 'law' }) {
  const cls =
    voice === 'you' ? 'bg-primary' : voice === 'tool' ? 'bg-foreground' : 'border border-primary bg-transparent';
  return <span aria-hidden className={`relative top-[1px] block h-[6px] w-[6px] justify-self-start ${cls}`} />;
}

function Done() {
  return <Check aria-hidden weight="bold" className="ml-1.5 inline h-[1em] w-[1em] align-[-0.125em] text-primary" />;
}

export function StripRow({ row }: { row: string }) {
  const p = parseRow(row);

  if (p.kind === 'divider') {
    return (
      <div className="flex items-center gap-2 py-1.5" aria-label={p.text}>
        <span aria-hidden className="w-3 border-t border-dashed border-border" />
        <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground">{p.text}</span>
        <span aria-hidden className="flex-1 border-t border-dashed border-border" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[12px_1fr] items-baseline gap-2.5 py-1">
      <Mark voice={p.kind === 'you' ? 'you' : p.kind === 'law' ? 'law' : 'tool'} />
      {p.kind === 'you' && (
        <p className="min-w-0 font-mono text-[12px] leading-relaxed text-foreground" style={{ overflowWrap: 'anywhere' }}>
          <span className="text-primary">{p.speaker} › </span>
          {p.text}
          {p.done && <Done />}
        </p>
      )}
      {p.kind === 'law' && (
        <p
          className={`min-w-0 font-mono text-[12px] leading-relaxed ${p.blocked ? 'text-[color:var(--destructive)]' : 'text-accent-foreground'}`}
          style={{ overflowWrap: 'anywhere' }}
        >
          <span className={p.blocked ? '' : 'text-primary'}>file › </span>
          {p.blocked ? (
            <>
              <X aria-hidden weight="bold" className="mr-1 inline h-[1em] w-[1em] align-[-0.125em]" />
              {p.text.replace(/^✗\s*/, '')}
            </>
          ) : (
            p.text
          )}
          {p.done && <Done />}
        </p>
      )}
      {p.kind === 'machine' && (
        <p className="min-w-0 font-mono text-[12px] leading-relaxed text-muted-foreground" style={{ overflowWrap: 'anywhere' }}>
          <span className="text-foreground">{p.cmd}</span>
          {p.meta && <> · {p.meta}</>}
          {p.done && <Done />}
        </p>
      )}
    </div>
  );
}

export function Strip({ label, rows }: { label: string; rows: readonly string[] }) {
  return (
    <div className="record border border-border px-4 pb-3 pt-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="w-3 border-t border-border" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        <span aria-hidden className="flex-1 border-t border-dashed border-border" />
      </div>
      <div className="relative mt-2.5">
        <span aria-hidden className="wire absolute left-[2.5px] top-2 h-[calc(100%-16px)]" />
        {rows.map((row) => (
          <StripRow key={row} row={row} />
        ))}
      </div>
    </div>
  );
}

