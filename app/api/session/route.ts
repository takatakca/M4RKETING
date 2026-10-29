import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/core/session';

export const dynamic = 'force-dynamic';

// Sign out (the merchant opens the app from Clover again to come back).
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', clearSessionCookie());
  return res;
}
