import { NextResponse, type NextRequest } from 'next/server';
import { cloverConfig, cloverConfigured, cloverMissing } from '@/lib/clover/config';
import { authorizeUrl, finishConnect, readEmployee } from '@/lib/clover/oauth';
import { sessionCookie, signSession } from '@/lib/core/session';
import { hooks } from '@/lib/domain';
import { announceInstall } from '@/lib/suite';

export const dynamic = 'force-dynamic';

// Clover sends the merchant here when the app is installed or opened (Site URL / Alternate Launch Path), and back
// here after its approval page. With a code: exchange it, store the merchant's tokens (sealed), sign the merchant in,
// open the dashboard. Without a code: send the browser to Clover's approval page (it comes back with one).
// The person's name and Clover role (owner, admin, manager, employee) go into the signed session; the suite directory
// (Food Hub) hears that this merchant has this app.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const base = cloverConfig.appBaseUrl || req.nextUrl.origin;
  if (!cloverConfigured()) return NextResponse.json({ ok: false, error: `Missing: ${cloverMissing().join(', ')} (see DEPLOY.md)` }, { status: 503 });
  if (!q.get('code')) {
    if (q.get('error')) return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(q.get('error')!.slice(0, 60))}`, base));
    return NextResponse.redirect(authorizeUrl());
  }
  const r = await finishConnect({ code: q.get('code'), merchantId: q.get('merchant_id'), clientId: q.get('client_id'), state: q.get('state') });
  if (!r.ok) return NextResponse.redirect(new URL(`/?error=${r.code}`, base));
  await hooks.onConnect?.(r.merchantId).catch((e) => console.error('[connect] setup failed', e instanceof Error ? e.message : e));
  await announceInstall(r.merchantId).catch((e) => console.error('[connect] suite directory', e instanceof Error ? e.message : e));
  const employeeId = q.get('employee_id');
  const who = await readEmployee(r.merchantId, employeeId).catch(() => null);
  const token = signSession({ merchantId: r.merchantId, employeeId, role: who?.role ?? null, name: who?.name ?? null });
  if (!token) return NextResponse.redirect(new URL('/?error=session_secret', base));
  const res = NextResponse.redirect(new URL('/app', base));
  res.headers.append('Set-Cookie', sessionCookie(token));
  return res;
}
