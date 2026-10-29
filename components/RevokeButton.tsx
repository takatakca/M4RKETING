'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RevokeButton({ url, label, method = 'DELETE' }: { url: string; label: string; method?: 'DELETE' | 'POST' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="ghost" disabled={busy} onClick={async () => { setBusy(true); await fetch(url, { method }).catch(() => null); setBusy(false); router.refresh(); }}>{label}</button>;
}
