// The shared TAKATAK Suite kit (identical in every suite app): Clover OAuth, tokens, webhooks, Food Hub link.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP, tierFromPlan } from '@/lib/app';
import { openSecret, sealSecret } from '@/lib/core/crypto';
import { getStore, resetStore } from '@/lib/core/store';
import { signSession, verifySession } from '@/lib/core/session';
import { cloverRequest } from '@/lib/clover/api';
import { accessToken, authorizeUrl, finishConnect, getMerchant, makeState, merchantTier, stateValid } from '@/lib/clover/oauth';
import { dispatchWebhook, VERIFICATION_KEY, webhookGate } from '@/lib/clover/webhook';
import { emitSuite, flushSuiteOutbox, receiveSuiteEvent, signSuite, verifySuite } from '@/lib/suite';
import type { AppHooks, CloverEvent, SuiteEvent } from '@/lib/hooks';

const MID = 'MERCHANT0001';
type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let responder: (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  resetStore();
  delete process.env.DATABASE_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  process.env.CLOVER_CLIENT_SECRET = 'app-secret-for-tests';
  process.env.APP_BASE_URL = 'https://app.example.ca';
  process.env.CLOVER_WEBHOOK_AUTH = 'webhook-auth-code';
  process.env.CLOVER_API_BASE = 'https://api.clover.test';
  delete process.env.FOODHUB_URL; delete process.env.FOODHUB_SUITE_SECRET; delete process.env.OWN_MERCHANTS;
  calls = [];
  responder = (url) => {
    if (url.endsWith('/oauth/v2/token')) return json({ access_token: 'AT-1', access_token_expiration: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'RT-1', refresh_token_expiration: Math.floor(Date.now() / 1000) + 86400 * 30 });
    if (url.endsWith('/oauth/v2/refresh')) return json({ access_token: 'AT-2', access_token_expiration: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'RT-2' });
    if (url.includes('/billing_info')) return json({ status: 'ACTIVE', appSubscription: { name: 'Premium' } });
    if (url.endsWith(`/v3/merchants/${MID}`)) return json({ id: MID, name: 'Po Poulet Saint-Léonard' });
    return json({ elements: [] });
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), init }); return responder(String(url), init); }));
});
afterEach(() => vi.unstubAllGlobals());

describe('tokens at rest', () => {
  it('seals with TOKEN_ENCRYPTION_KEY and opens back; refuses to store plain tokens with a database', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const sealed = sealSecret('secret-token');
    expect(sealed.startsWith('enc:v1:')).toBe(true);
    expect(sealed).not.toContain('secret-token');
    expect(openSecret(sealed)).toBe('secret-token');
    delete process.env.TOKEN_ENCRYPTION_KEY;
    process.env.DATABASE_URL = 'postgres://x';
    expect(() => sealSecret('t')).toThrow(/TOKEN_ENCRYPTION_KEY/);
    delete process.env.DATABASE_URL;
  });
});

describe('Clover OAuth', () => {
  it('signs a state that expires and is bound to the app secret', () => {
    const s = makeState();
    expect(stateValid(s)).toBe(true);
    expect(stateValid(s, Date.now() + 16 * 60_000)).toBe(false);
    expect(stateValid(s.slice(0, -1) + (s.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(authorizeUrl(s)).toContain('/oauth/v2/authorize?client_id=');
    expect(authorizeUrl(s)).toContain(encodeURIComponent('https://app.example.ca/api/clover/connect/callback'));
  });

  it('exchanges the code, stores the merchant with its plan, and refuses bad input', async () => {
    expect(await finishConnect({ code: '', merchantId: MID })).toMatchObject({ ok: false, code: 'no_code' });
    expect(await finishConnect({ code: 'c', merchantId: 'bad id' })).toMatchObject({ ok: false, code: 'bad_merchant' });
    expect(await finishConnect({ code: 'c', merchantId: MID, clientId: 'OTHERAPP' })).toMatchObject({ ok: false, code: 'wrong_app' });
    expect(await finishConnect({ code: 'c', merchantId: MID, state: 'f'.repeat(40) })).toMatchObject({ ok: false, code: 'bad_state' });
    const r = await finishConnect({ code: 'the-code', merchantId: MID, clientId: APP.cloverAppId });
    expect(r).toEqual({ ok: true, merchantId: MID, name: 'Po Poulet Saint-Léonard' });
    const tokenCall = calls.find((c) => c.url.endsWith('/oauth/v2/token'))!;
    expect(JSON.parse(String(tokenCall.init?.body))).toEqual({ client_id: APP.cloverAppId, client_secret: 'app-secret-for-tests', code: 'the-code' });
    const m = (await getMerchant(MID))!;
    expect(m.billing?.plan).toBe('Premium');
    expect(merchantTier(m)).toBe('premium');
    expect(await accessToken(MID)).toBe('AT-1');
  });

  it('refreshes an access token about to expire, once even when asked twice at the same time', async () => {
    responder = ((orig) => (url: string, init?: RequestInit) => url.endsWith('/oauth/v2/token')
      ? json({ access_token: 'AT-1', access_token_expiration: Math.floor(Date.now() / 1000) + 60, refresh_token: 'RT-1' })
      : orig(url, init))(responder);
    await finishConnect({ code: 'c', merchantId: MID });
    const [a, b] = await Promise.all([accessToken(MID), accessToken(MID)]);
    expect([a, b]).toEqual(['AT-2', 'AT-2']);
    expect(calls.filter((c) => c.url.endsWith('/oauth/v2/refresh'))).toHaveLength(1);
  });

  it('plan names map to tiers; OWN_MERCHANTS are VIP', () => {
    expect(tierFromPlan('VIP 150 $')).toBe('vip');
    expect(tierFromPlan('Premium')).toBe('premium');
    expect(tierFromPlan(null)).toBe('base');
    process.env.OWN_MERCHANTS = MID;
    expect(merchantTier({ merchantId: MID, billing: null })).toBe('vip');
  });

  it('never writes to a read-only merchant (dormant On2GO.ca by default)', async () => {
    const r = await cloverRequest('RNVTBYMCKXEJ1', 'POST', '/v3/merchants/RNVTBYMCKXEJ1/orders', { body: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/read-only/);
    expect(calls).toHaveLength(0);
  });
});

describe('Clover webhook', () => {
  it('keeps the verification code, refuses a wrong auth code, handles each event once, uninstall deletes tokens', async () => {
    expect((await webhookGate('{"verificationCode":"V-123"}', null))).toMatchObject({ done: true, status: 200 });
    expect(await getStore().getKv(VERIFICATION_KEY)).toMatchObject({ code: 'V-123' });
    expect(await webhookGate('{"merchants":{}}', 'wrong')).toMatchObject({ done: true, status: 401 });
    expect(await webhookGate('not json', 'webhook-auth-code')).toMatchObject({ done: true, status: 400 });
    await finishConnect({ code: 'c', merchantId: MID });
    const seen: CloverEvent[] = [];
    const hooks: AppHooks = { onCloverEvent: async (e) => { seen.push(e); } };
    const body = { appId: APP.cloverAppId, merchants: { [MID]: [{ objectId: 'O:ORDER1', type: 'CREATE', ts: 1 }, { objectId: 'P:PAY1', type: 'CREATE', ts: 2 }] } };
    const gate = await webhookGate(JSON.stringify(body), 'webhook-auth-code');
    expect(gate.done).toBe(false);
    expect(await dispatchWebhook(body, hooks)).toMatchObject({ handled: 2, skipped: 0 });
    expect(await dispatchWebhook(body, hooks)).toMatchObject({ handled: 0, skipped: 2 });
    expect(seen.map((e) => `${e.prefix}:${e.objectId}`)).toEqual(['O:ORDER1', 'P:PAY1']);
    expect(await dispatchWebhook({ appId: 'SOMEOTHERAPP', merchants: { [MID]: [{ objectId: 'O:X', type: 'CREATE', ts: 3 }] } }, hooks)).toMatchObject({ handled: 0 });
    const out = await dispatchWebhook({ merchants: { [MID]: [{ objectId: `A:${APP.cloverAppId}`, type: 'DELETE', ts: 4 }] } }, hooks);
    expect(out.uninstalled).toEqual([MID]);
    expect(await accessToken(MID)).toBeNull();
    expect(await dispatchWebhook({ merchants: { [MID]: [{ objectId: 'O:ORDER2', type: 'CREATE', ts: 5 }] } }, hooks)).toMatchObject({ handled: 0, skipped: 1 });
  });
});

describe('session', () => {
  it('signs and verifies; expired or changed tokens are refused', () => {
    const t = signSession({ merchantId: MID })!;
    expect(verifySession(t)?.merchantId).toBe(MID);
    expect(verifySession(t, Date.now() + 8 * 86400_000)).toBeNull();
    expect(verifySession(t.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBeNull();
  });
});

describe('TAKATAK Suite link', () => {
  const SECRET = 's'.repeat(40);
  beforeEach(() => { process.env.FOODHUB_URL = 'https://foodhub.example.ca'; process.env.FOODHUB_SUITE_SECRET = SECRET; });

  it('accepts a signed Food Hub event once; refuses a bad signature', async () => {
    const got: SuiteEvent[] = [];
    const hooks: AppHooks = { onSuiteEvent: async (e) => { got.push(e); } };
    const raw = JSON.stringify({ id: 'ord_1_completed', type: 'order.status_changed', createdAt: new Date().toISOString(), source: 'foodhub', data: { order: { total: 25 } } });
    expect((await receiveSuiteEvent(raw, 't=1,v1=00', hooks)).status).toBe(401);
    expect((await receiveSuiteEvent(raw, signSuite(SECRET, raw), hooks)).status).toBe(200);
    expect((await receiveSuiteEvent(raw, signSuite(SECRET, raw), hooks)).json).toMatchObject({ duplicate: true });
    expect(got).toHaveLength(1);
  });

  it('signs events for Food Hub with its own key; keeps a failed one and sends it later', async () => {
    responder = () => json({ ok: true });
    expect(await emitSuite('test_event', { a: 1 }, 'e1')).toEqual({ sent: true });
    const c = calls.at(-1)!;
    const h = c.init?.headers as Record<string, string>;
    expect(c.url).toBe('https://foodhub.example.ca/api/suite/v1/events');
    expect(h['x-takatak-app']).toBe(APP.key);
    expect(verifySuite(SECRET, h['x-takatak-signature'], String(c.init?.body))).toBe(true);
    expect(JSON.parse(String(c.init?.body))).toMatchObject({ id: 'e1', type: `${APP.key}.test_event` });
    responder = () => json({}, 503);
    expect(await emitSuite('test_event', {}, 'e2')).toEqual({ sent: false, reason: 'kept for retry' });
    responder = () => json({ ok: true });
    expect(await flushSuiteOutbox()).toEqual({ sent: 1, left: 0 });
  });
});
