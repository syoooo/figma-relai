
type Variant = 'default' | 'outline' | 'ghost';
type Size = 'sm' | 'lg' | 'default';

const base =
'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  default: 'border-primary bg-primary text-primary-foreground hover:bg-[#ffce45] hover:border-[#ffce45]',
  outline: 'border-border bg-background text-[#ffce45] hover:border-primary hover:bg-secondary hover:text-primary',
  ghost: 'border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-primary'
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3',
  lg: 'h-11 px-5 text-sm',
  default: 'h-10 px-4 py-2'
};

export function btnClass(opts: {variant?: Variant;size?: Size;} = {}) {
  const { variant = 'default', size = 'default' } = opts;
  return [base, variants[variant], sizes[size]].join(' ');
}