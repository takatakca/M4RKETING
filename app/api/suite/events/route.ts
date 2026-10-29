import { NextResponse, type NextRequest } from 'next/server';
import { hooks } from '@/lib/domain';
import { receiveSuiteEvent } from '@/lib/suite';

export const dynamic = 'force-dynamic';

// Food Hub → this app (TAKATAK Suite, foodhubca docs/TAKATAK_SUITE.md). Signed with FOODHUB_SUITE_SECRET.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ ok: false, error: 'Too large' }, { status: 413 });
  const r = await receiveSuiteEvent(raw, req.headers.get('x-takatak-signature'), hooks);
  return NextResponse.json(r.json, { status: r.status });
}
