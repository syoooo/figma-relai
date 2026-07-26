import { Fragment } from 'react';
import type { ReactNode } from 'react';

/* `backtick` spans in copy render as inline code chips */
export function codeText(text: string): ReactNode {
  const parts = text.split('`');
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="code-chip">{part}</code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
