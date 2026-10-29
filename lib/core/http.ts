import { NextResponse } from 'next/server';

export const ok = (data: Record<string, unknown> = {}, status = 200) => NextResponse.json({ ok: true, ...data }, { status });
export const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

/** JSON body of an API call. Only application/json is accepted: a cross-site form cannot send it without CORS. */
export async function readJson(req: Request): Promise<Record<string, any> | null> {
  if (!/application\/json/i.test(req.headers.get('content-type') ?? '')) return null;
  try {
    const v = await req.json();
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
