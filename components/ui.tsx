import type { ReactNode } from 'react';

export function Card({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      {(title || right) && <div className="card-head"><h2>{title}</h2>{right}</div>}
      {children}
    </section>
  );
}

export function Stat({ label, value, note }: { label: ReactNode; value: ReactNode; note?: ReactNode }) {
  return <div className="stat"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{note && <div className="stat-note">{note}</div>}</div>;
}

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'stop' | 'brand' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'stop' }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}
