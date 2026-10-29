'use client';

// A one-click action on an API route (revoke a key, cancel, sign out), with an optional confirmation.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RevokeButton({ url, label, method = 'DELETE', confirm }: { url: string; label: string; method?: 'DELETE' | 'POST'; confirm?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setError(null);
    const res = await fetch(url, { method }).catch(() => null);
    if (!res) setError('Network error');
    else if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    setBusy(false);
    router.refresh();
  }
  return (
    <>
      <button type="button" className="ghost" disabled={busy} onClick={go}>{busy ? '…' : label}</button>
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
