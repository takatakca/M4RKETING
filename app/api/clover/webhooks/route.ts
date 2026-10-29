import { after, type NextRequest } from 'next/server';
import { adminAuthorized } from '@/lib/core/admin';
import { fail, ok } from '@/lib/core/http';
import { getStore } from '@/lib/core/store';
import { dispatchWebhook, VERIFICATION_KEY, webhookGate } from '@/lib/clover/webhook';
import { hooks } from '@/lib/domain';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Clover → this app (see lib/clover/webhook.ts). Answers at once; the events are handled right after the answer.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 512 * 1024) return fail('Too large', 413);
  const gate = await webhookGate(raw, req.headers.get('x-clover-auth'));
  if (gate.done) return NextResponse.json(gate.json, { status: gate.status });
  after(() => dispatchWebhook(gate.body, hooks).catch((e) => console.error('[webhook] dispatch failed', e instanceof Error ? e.message : e)));
  return ok();
}

// Operator: the last verification code Clover sent (Authorization: Bearer ADMIN_TOKEN).
export async function GET(req: NextRequest) {
  if (!adminAuthorized(req)) return fail('Unauthorized', 401);
  return ok({ verification: await getStore().getKv(VERIFICATION_KEY) });
}
