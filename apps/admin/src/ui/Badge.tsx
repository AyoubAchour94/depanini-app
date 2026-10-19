import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'warning' | 'success' | 'danger';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
