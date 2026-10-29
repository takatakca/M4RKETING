'use client';

// A small form that sends JSON to one of the app's API routes, shows the answer, and refreshes the page.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export type Field = { name: string; label: string; type?: 'text' | 'number' | 'money' | 'tel' | 'date' | 'url' | 'select' | 'textarea'; options?: Array<{ value: string; label: string }>; required?: boolean; placeholder?: string; defaultValue?: string };

export function ApiForm({ action, method = 'POST', fields, submit, done, extra, onResult }: {
  action: string; method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; fields: Field[]; submit: string; done?: string; extra?: Record<string, unknown>;
  onResult?: (json: Record<string, any>) => string | null | void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { ...extra };
    for (const f of fields) {
      const v = String(fd.get(f.name) ?? '').trim();
      if (v === '') continue;
      body[f.name] = f.type === 'money' ? Math.round(Number(v.replace(',', '.')) * 100) : f.type === 'number' ? Number(v) : v;
    }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(action, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) setMsg({ ok: false, text: json.error ?? `HTTP ${res.status}` });
      else { setMsg({ ok: true, text: onResult?.(json) || done || 'OK' }); e.currentTarget?.reset?.(); router.refresh(); }
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={go}>
      <div className="row">
        {fields.map((f) => (
          <div key={f.name} style={{ flex: f.type === 'textarea' ? '1 1 100%' : '1 1 180px' }}>
            <label htmlFor={`${action}-${f.name}`}>{f.label}</label>
            {f.type === 'select'
              ? <select id={`${action}-${f.name}`} name={f.name} defaultValue={f.defaultValue}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : f.type === 'textarea'
                ? <textarea id={`${action}-${f.name}`} name={f.name} rows={3} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} />
                : <input id={`${action}-${f.name}`} name={f.name} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue}
                    type={f.type === 'money' || f.type === 'number' ? 'text' : f.type ?? 'text'} inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : f.type === 'tel' ? 'tel' : undefined} />}
          </div>
        ))}
        <button type="submit" disabled={busy}>{busy ? '…' : submit}</button>
      </div>
      {msg && <p className={msg.ok ? 'muted' : ''} style={{ color: msg.ok ? undefined : 'var(--stop)', whiteSpace: 'pre-wrap' }}>{msg.text}</p>}
    </form>
  );
}
