'use client';

// A small form that sends JSON to one of the app's API routes, shows the answer, and refreshes the page.
// The answer is shown with `result`, a text template filled from the JSON reply (server pages cannot hand a function
// to this browser component): {path.to.value}, {cents|money}, {flag?text if true|text if false} (the two texts may
// hold {values} of their own).
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const at = (json: unknown, path: string) => path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), json);

export function fillResult(tpl: string, json: unknown, lang: 'fr' | 'en' = 'fr'): string {
  return tpl
    .replace(/\{([\w.]+)\?((?:[^{}|]|\{[^{}]*\})*)\|((?:[^{}]|\{[^{}]*\})*)\}/g, (_, path: string, yes: string, no: string) => (at(json, path) ? yes : no))
    .replace(/\{([\w.]+)(\|money)?\}/g, (_, path: string, money?: string) => {
      const v = at(json, path);
      if (v === undefined || v === null || v === '') return '—';
      return money ? new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).format((Number(v) || 0) / 100) : String(v);
    });
}

export type Field = { name: string; label: string; type?: 'text' | 'number' | 'money' | 'tel' | 'date' | 'url' | 'select' | 'textarea'; options?: Array<{ value: string; label: string }>; required?: boolean; placeholder?: string; defaultValue?: string };

export function ApiForm({ action, method = 'POST', fields, submit, done, extra, result, lang = 'fr', confirm, tone }: {
  action: string; method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; fields: Field[]; submit: string; done?: string; extra?: Record<string, unknown>;
  /** Text shown after success, filled from the reply (see fillResult). */
  result?: string;
  lang?: 'fr' | 'en';
  /** Ask before sending (money moves, things that cannot be undone). */
  confirm?: string;
  tone?: 'primary' | 'ghost';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body: Record<string, unknown> = { ...extra };
    for (const f of fields) {
      const v = String(fd.get(f.name) ?? '').trim();
      if (v === '') continue;
      body[f.name] = f.type === 'money' ? Math.round(Number(v.replace(',', '.')) * 100) : f.type === 'number' ? Number(v.replace(',', '.')) : v;
    }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(action, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) setMsg({ ok: false, text: json.error ?? `HTTP ${res.status}` });
      else { setMsg({ ok: true, text: result ? fillResult(result, json, lang) : done || 'OK' }); if (fields.some((f) => !f.defaultValue)) form.reset(); router.refresh(); }
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="api-form">
      <div className="row">
        {fields.map((f) => (
          <div key={f.name} className={f.type === 'textarea' ? 'field field-wide' : 'field'}>
            <label htmlFor={`${action}-${f.name}`}>{f.label}{f.required && <span aria-hidden="true"> *</span>}</label>
            {f.type === 'select'
              ? <select id={`${action}-${f.name}`} name={f.name} defaultValue={f.defaultValue}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : f.type === 'textarea'
                ? <textarea id={`${action}-${f.name}`} name={f.name} rows={3} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} />
                : <input id={`${action}-${f.name}`} name={f.name} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue}
                    type={f.type === 'money' || f.type === 'number' ? 'text' : f.type ?? 'text'} inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : f.type === 'tel' ? 'tel' : undefined} />}
          </div>
        ))}
        <button type="submit" className={tone === 'ghost' ? 'ghost' : undefined} disabled={busy}>{busy ? '…' : submit}</button>
      </div>
      {msg && <p className={msg.ok ? 'form-ok' : 'form-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </form>
  );
}
