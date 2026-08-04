import React, { createContext, useContext, useId, useState } from 'react';
import { Plus } from 'lucide-react';

type RootCtx = { open: string | null; toggle: (v: string) => void };
const Ctx = createContext<RootCtx | null>(null);
const ItemCtx = createContext<{ value: string; open: boolean } | null>(null);

export function Accordion({ children, className }: { type?: 'single'; collapsible?: boolean; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (v: string) => setOpen((cur) => (cur === v ? null : v));
  return (
    <Ctx.Provider value={{ open, toggle }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function AccordionItem({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const root = useContext(Ctx)!;
  return (
    <ItemCtx.Provider value={{ value, open: root.open === value }}>
      <div className={`border-b-[0.5px] ${className ?? ''}`}>{children}</div>
    </ItemCtx.Provider>
  );
}

export function AccordionTrigger({ className, children }: { className?: string; children: React.ReactNode }) {
  const root = useContext(Ctx)!;
  const item = useContext(ItemCtx)!;
  const id = useId();
  return (
    <h3 className="m-0">
      <button
        type="button"
        aria-expanded={item.open}
        aria-controls={`${id}-panel`}
        id={`${id}-trigger`}
        onClick={() => root.toggle(item.value)}
        className={`flex w-full items-center justify-between gap-4 py-4 font-medium transition-colors ${className ?? ''}`}
      >
        {children}
        <Plus className={`h-4 w-4 shrink-0 text-primary transition-transform duration-200 ${item.open ? 'rotate-45' : ''}`} aria-hidden />
      </button>
    </h3>
  );
}

export function AccordionContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const item = useContext(ItemCtx)!;
  if (!item.open) return null;
  return (
    <div role="region" className={`pb-5 ${className ?? ''}`}>
      {children}
    </div>
  );
}
