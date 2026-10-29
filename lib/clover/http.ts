// Every Clover call goes through cloverFetch: Clover answers 429 beyond its rate limits (50 requests/s per app, 16 per
// token; 10 concurrent, 5 per token). A 429 was NOT processed, so it is safe to send again: wait Retry-After (max 5 s)
// or 1 s then 2 s, at most twice. Every call has a time limit (default 15 s).
const MAX_WAIT_MS = 5_000;

export function retryDelayMs(retryAfter: string | null, attempt: number, base = 1000): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_WAIT_MS);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(Math.max(0, at - Date.now()), MAX_WAIT_MS);
  }
  return Math.min(base * 2 ** attempt, MAX_WAIT_MS);
}

export async function cloverFetch(url: string, init: RequestInit = {}, opts: { retries?: number; timeoutMs?: number; baseWaitMs?: number } = {}): Promise<Response> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
    if (res.status !== 429 || attempt >= retries) return res;
    const wait = retryDelayMs(res.headers.get('retry-after'), attempt, opts.baseWaitMs ?? 1000);
    await res.body?.cancel().catch(() => undefined);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}
