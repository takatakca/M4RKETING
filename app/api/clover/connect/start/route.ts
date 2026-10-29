import { NextResponse } from 'next/server';
import { cloverConfigured, cloverMissing } from '@/lib/clover/config';
import { authorizeUrl } from '@/lib/clover/oauth';

export const dynamic = 'force-dynamic';

// "Connect with Clover": sends the merchant to Clover's approval page for this app, then back to the callback with a
// signed, single-purpose state (15 minutes). Same flow as TAKATAK Food Hub (clover-connect/start).
export async function GET() {
  if (!cloverConfigured()) return NextResponse.json({ ok: false, error: `Missing: ${cloverMissing().join(', ')} (see DEPLOY.md)` }, { status: 503 });
  return NextResponse.redirect(authorizeUrl());
}
