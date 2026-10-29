// The shared TAKATAK Suite kit (identical in every suite app): Clover OAuth, tokens, webhooks, Food Hub link.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP, tierFromPlan } from '@/lib/app';
import { openSecret, sealSecret } from '@/lib/core/crypto';
import { getStore, resetStore } from '@/lib/core/store';
import { signSession, verifySession } from '@/lib/core/session';
import { cloverRequest } from '@/lib/clover/api';
import { accessToken, authorizeUrl, finishConnect, getMerchant, makeState, merchantTier, stateValid } from '@/lib/clover/oauth';
import { dispatchWebhook, VERIFICATION_KEY, webhookGate } from '@/lib/clover/webhook';
import { announceAll, announceInstall, announceUninstall, clearDirectoryCache, emitSuite, flushSuiteOutbox, receiveSuiteEvent, signSuite, suiteDirectory, verifySuite } from '@/lib/suite';
import type { AppHooks, CloverEvent, SuiteEvent } from '@/lib/hooks';
import { allActions, allowed, effectiveRole, getPolicy, setPolicy } from '@/lib/core/access';
import { AUDIT, purgeAudit, recentAudit } from '@/lib/core/audit';
import { createDeviceKey } from '@/lib/core/devices';
import { exportRecords, scrub } from '@/lib/core/export';
import { isCtx, requireMerchant, requireMerchantOrDevice } from '@/lib/core/guard';
import { roleFromClover, ROLES, type Role } from '@/lib/core/roles';
import { sessionCookieName } from '@/lib/core/session';
import { readEmployee } from '@/lib/clover/oauth';
import { actions, deviceKinds, sections, tierFeatures } from '@/lib/domain';
import { ACCOUNT_TABS } from '@/lib/nav';
import { SUITE_CATALOG } from '@/lib/suite-catalog';
import { PUT as putAccess } from '@/app/api/account/access/route';
import { fillResult } from '@/components/ApiForm';

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

// ---- premium shell: roles, authorized actions, activity log, suite directory, export ----

/** A request from a signed-in person of MID with this Clover role (null = Clover did not say). */
function asPerson(role: Role | null, init: RequestInit & { url?: string } = {}): Request {
  const token = signSession({ merchantId: MID, employeeId: 'EMPLOYEE0001', role, name: 'Ana Tremblay' })!;
  const headers = { ...(init.headers as Record<string, string> | undefined), cookie: `${sessionCookieName()}=${encodeURIComponent(token)}` };
  return new Request(init.url ?? 'https://app.example.ca/api/test', { ...init, headers });
}

describe('roles and session', () => {
  it('reads the Clover role: owner flag first, then ADMIN / MANAGER / EMPLOYEE', () => {
    expect(roleFromClover({ role: 'EMPLOYEE', isOwner: true })).toBe('owner');
    expect(roleFromClover({ role: 'ADMIN' })).toBe('admin');
    expect(roleFromClover({ role: 'manager' })).toBe('manager');
    expect(roleFromClover({ role: 'EMPLOYEE' })).toBe('employee');
    expect(roleFromClover({ role: 'GUEST' })).toBeNull();
    expect(roleFromClover(null)).toBeNull();
  });

  it('the signed session carries the role and the name; an unknown role is dropped', () => {
    const s = verifySession(signSession({ merchantId: MID, employeeId: 'EMP1', role: 'manager', name: 'Ana' })!);
    expect(s).toMatchObject({ merchantId: MID, employeeId: 'EMP1', role: 'manager', name: 'Ana' });
    expect(verifySession(signSession({ merchantId: MID, role: 'boss' as Role })!)?.role).toBeNull();
  });

  it('readEmployee asks Clover for the person who opened the app; null without the permission', async () => {
    await finishConnect({ code: 'c', merchantId: MID });
    responder = ((orig) => (url: string, init?: RequestInit) => url.includes('/employees/EMPLOYEE0001') ? json({ id: 'EMPLOYEE0001', name: 'Ana Tremblay', role: 'MANAGER' })
      : url.includes('/employees/') ? json({ message: 'Forbidden' }, 403) : orig(url, init))(responder);
    expect(await readEmployee(MID, 'EMPLOYEE0001')).toEqual({ name: 'Ana Tremblay', role: 'manager' });
    expect(await readEmployee(MID, 'EMPLOYEE0002')).toBeNull();
    expect(await readEmployee(MID, 'not an id')).toBeNull();
    expect(await readEmployee(MID, null)).toBeNull();
  });
});

describe('authorized actions', () => {
  it('every action has a default; unknown actions and roles are refused; the policy page stays with admins', async () => {
    const p = await getPolicy(MID);
    for (const a of allActions()) expect(ROLES).toContain(p.min[a.key]);
    expect(p.unverified).toBe('owner');
    expect(allowed(p, 'owner', 'nope.unknown')).toBe(false);
    expect(await setPolicy(MID, { min: { 'nope.unknown': 'owner' } })).toHaveProperty('error');
    expect(await setPolicy(MID, { min: { 'account.devices': 'boss' } })).toHaveProperty('error');
    expect(await setPolicy(MID, { min: { 'account.access': 'manager' } })).toHaveProperty('error');
    expect(await setPolicy(MID, { min: { 'account.devices': 'admin' }, unverified: 'employee' })).toMatchObject({ min: { 'account.devices': 'admin' }, unverified: 'employee' });
    expect(effectiveRole(null, await getPolicy(MID))).toEqual({ role: 'employee', verified: false });
    expect(effectiveRole('manager', await getPolicy(MID))).toEqual({ role: 'manager', verified: true });
  });

  it('the server refuses a role below the action, logs both outcomes, and a device acts as an employee', async () => {
    await finishConnect({ code: 'c', merchantId: MID });
    const refused = await requireMerchant(asPerson('employee', { method: 'POST' }), 'base', { action: 'account.devices' });
    expect(isCtx(refused)).toBe(false);
    expect((refused as Response).status).toBe(403);
    expect(await (refused as Response).json()).toMatchObject({ action: 'account.devices', need: 'manager' });
    const okCtx = await requireMerchant(asPerson('manager', { method: 'POST' }), 'base', { action: 'account.devices' });
    expect(isCtx(okCtx) && okCtx).toMatchObject({ role: 'manager', verified: true, actor: 'Ana Tremblay', device: false });
    const log = await recentAudit(MID);
    expect(log.map((e) => `${e.role}:${e.outcome}`).sort()).toEqual(['employee:refused', 'manager:allowed']);
    const { key } = await createDeviceKey(MID, 'Comptoir 1', deviceKinds[0]?.kind ?? 'device');
    const dev = await requireMerchantOrDevice(new Request('https://app.example.ca/api/x', { method: 'POST', headers: { authorization: `Bearer ${key}` } }), 'base', { action: 'account.devices' });
    expect((dev as Response).status).toBe(403);
    expect((await recentAudit(MID)).find((e) => e.actor.startsWith('Device'))).toMatchObject({ actor: 'Device: Comptoir 1', role: 'employee', outcome: 'refused' });
    // No action named: no role check, nothing logged. An allowed read is logged only when the route asks.
    expect(isCtx(await requireMerchant(asPerson('employee')))).toBe(true);
    expect(isCtx(await requireMerchant(asPerson('admin'), 'base', { action: 'account.export' }))).toBe(true);
    expect(await recentAudit(MID)).toHaveLength(3);
    expect(isCtx(await requireMerchant(asPerson('admin'), 'base', { action: 'account.export', audit: 'always' }))).toBe(true);
    expect(await recentAudit(MID)).toHaveLength(4);
  });

  it('a person Clover did not confirm counts as owner until the owner says otherwise; nobody locks themselves out', async () => {
    await finishConnect({ code: 'c', merchantId: MID });
    expect(isCtx(await requireMerchant(asPerson(null), 'base', { action: 'account.export' }))).toBe(true);
    const lockout = await putAccess(asPerson(null, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unverified: 'employee' }) }));
    expect(lockout.status).toBe(409);
    const byOwner = await putAccess(asPerson('owner', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unverified: 'employee', 'min.account.export': 'owner' }) }));
    expect(byOwner.status).toBe(200);
    expect((await getPolicy(MID))).toMatchObject({ unverified: 'employee', min: { 'account.export': 'owner' } });
    expect((await requireMerchant(asPerson(null), 'base', { action: 'account.export' }) as Response).status).toBe(403);
    const byManager = await putAccess(asPerson('manager', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unverified: 'owner' }) }));
    expect(byManager.status).toBe(403);
  });

  it('the activity log drops entries older than 180 days', async () => {
    await getStore().put(AUDIT, 'old', MID, { action: 'x', outcome: 'allowed', actor: 'a', role: 'owner', verified: true, method: 'GET', path: '/' }, new Date(Date.now() - 200 * 86400_000).toISOString());
    await getStore().put(AUDIT, 'new', MID, { action: 'x', outcome: 'allowed', actor: 'a', role: 'owner', verified: true, method: 'GET', path: '/' });
    expect(await purgeAudit()).toBe(1);
    expect((await recentAudit(MID)).length).toBe(1);
  });
});

describe('data export', () => {
  it('never carries tokens, hashes, secrets or sealed values', async () => {
    expect(scrub({ a: 1, hash: 'h', codeHash: 'c', token: 't', accessToken: 'x', secretKey: 's', nested: [{ v: 'enc:v1:abc', ok: 'yes' }] })).toEqual({ a: 1, nested: [{ v: '[sealed]', ok: 'yes' }] });
    await finishConnect({ code: 'c', merchantId: MID });
    await createDeviceKey(MID, 'Borne', deviceKinds[0]?.kind ?? 'device');
    const out = await exportRecords(MID);
    expect(out.some((r) => r.collection.startsWith('_'))).toBe(false);
    expect(JSON.stringify(out)).not.toMatch(/"hash"|AT-1|RT-1/);
    expect(out.find((r) => r.collection === 'devices')).toBeTruthy();
  });
});

describe('suite directory', () => {
  const SECRET = 's'.repeat(40);
  beforeEach(() => { process.env.FOODHUB_URL = 'https://foodhub.example.ca'; process.env.FOODHUB_SUITE_SECRET = SECRET; clearDirectoryCache(); });

  it('tells Food Hub once per installation, and when the app is removed', async () => {
    await finishConnect({ code: 'c', merchantId: MID });
    responder = ((orig) => (url: string, init?: RequestInit) => url.includes('foodhub.example.ca') ? json({ ok: true }) : orig(url, init))(responder);
    expect(await announceInstall(MID)).toEqual({ sent: true });
    const sent = JSON.parse(String(calls.at(-1)!.init?.body));
    expect(sent).toMatchObject({ type: `${APP.key}.installed`, data: { cloverMerchantId: MID, appUrl: 'https://app.example.ca' } });
    expect(sent.id).toMatch(new RegExp(`^installed:${MID}:`));
    expect(await announceInstall(MID)).toMatchObject({ sent: true, reason: 'already told' });
    expect(await announceAll()).toEqual({ sent: 0 });
    expect(await announceUninstall(MID)).toEqual({ sent: true });
    expect(JSON.parse(String(calls.at(-1)!.init?.body))).toMatchObject({ type: `${APP.key}.uninstalled`, data: { cloverMerchantId: MID } });
  });

  it('reads which apps the restaurant has (signed GET), keeps it 5 minutes, null when not linked', async () => {
    responder = (url, init) => {
      if (url.includes('/api/suite/v1/directory')) {
        const path = new URL(url).pathname + new URL(url).search;
        const ok = verifySuite(SECRET, (init?.headers as Record<string, string>)['x-takatak-signature'], path);
        return ok ? json({ ok: true, apps: [{ key: 'loy4lty', installed: true, url: 'https://loyalty.example.ca', at: '2026-10-29T00:00:00Z' }, { key: 'ch4t', installed: false, url: 'javascript:alert(1)' }] }) : json({}, 401);
      }
      return json({ elements: [] });
    };
    const apps = await suiteDirectory(MID);
    expect(apps).toEqual([{ key: 'loy4lty', installed: true, url: 'https://loyalty.example.ca', at: '2026-10-29T00:00:00Z' }, { key: 'ch4t', installed: false, url: null, at: null }]);
    const n = calls.length;
    await suiteDirectory(MID);
    expect(calls.length).toBe(n);
    delete process.env.FOODHUB_URL;
    clearDirectoryCache();
    expect(await suiteDirectory(MID)).toBeNull();
  });

  it('Food Hub down: the last good answer is kept, and Food Hub is asked again only after a minute', async () => {
    let up = true;
    responder = (url) => (url.includes('/api/suite/v1/directory') ? (up ? json({ ok: true, apps: [{ key: 'loy4lty', installed: true, url: 'https://l.example.ca' }] }) : json({}, 503)) : json({ elements: [] }));
    const t0 = Date.parse('2026-10-29T12:00:00Z');
    expect(await suiteDirectory(MID, t0)).toHaveLength(1);
    up = false;
    const asked = () => calls.filter((c) => c.url.includes('/api/suite/v1/directory')).length;
    expect(await suiteDirectory(MID, t0 + 6 * 60_000)).toHaveLength(1); // expired, Food Hub fails: last answer kept
    const n = asked();
    expect(await suiteDirectory(MID, t0 + 6 * 60_000 + 30_000)).toHaveLength(1);
    expect(asked()).toBe(n); // not asked again within the minute
    await suiteDirectory(MID, t0 + 6 * 60_000 + 61_000);
    expect(asked()).toBe(n + 1);
  });
});

describe('form answers', () => {
  it('fills the result template from the reply: values, money, yes/no', () => {
    const out = fillResult('Code {key} · {a.b|money} · {created?Inscrit|Déjà membre} · {missing}', { key: 'K-1', a: { b: 1234 }, created: false }, 'fr');
    expect(out).toMatch(/^Code K-1 · 12,34\s\$ · Déjà membre · —$/);
    expect(fillResult('{n|money}', { n: 500 }, 'en')).toBe('$5.00');
    const tpl = '{found?Client : {customer.name}, {last.total|money}|Aucun client.}';
    expect(fillResult(tpl, { found: true, customer: { name: 'Ana' }, last: { total: 2500 } }, 'en')).toBe('Client : Ana, $25.00');
    expect(fillResult(tpl, { found: false }, 'en')).toBe('Aucun client.');
  });
});

describe('this app plugs into the shell correctly', () => {
  it('sections: overview first, unique slugs, one level of nesting, known actions', () => {
    expect(sections[0].slug).toBe('');
    const slugs = sections.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const known = new Set(allActions().map((a) => a.key));
    const reserved = new Set(['account', 'suite', 'help']);
    for (const s of sections) {
      expect(s.slug).toMatch(/^[a-z0-9-]*$/);
      expect(reserved.has(s.slug)).toBe(false);
      if (s.parent) {
        const p = sections.find((x) => x.slug === s.parent);
        expect(p, `${s.slug} → ${s.parent}`).toBeTruthy();
        expect(p!.parent).toBeUndefined();
      }
      if (s.hub) expect(sections.some((c) => c.parent === s.slug)).toBe(true);
      if (s.view) expect(known.has(s.view), s.view).toBe(true);
    }
  });

  it('actions, device kinds and plan features are declared', () => {
    const keys = allActions().map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of actions) { expect(a.key).toMatch(/^[a-z0-9]+\.[a-z0-9_]+$/); expect(a.key.startsWith('account.')).toBe(false); }
    expect(new Set(deviceKinds.map((k) => k.kind)).size).toBe(deviceKinds.length);
    for (const t of ['base', 'premium', 'vip'] as const) expect(tierFeatures[t].length).toBeGreaterThan(0);
    expect(ACCOUNT_TABS.map((t) => t.slug)).toEqual(['profile', 'plan', 'access', 'devices', 'payouts', 'security', 'activity']);
    expect(SUITE_CATALOG.some((a) => a.key === APP.key)).toBe(true);
  });
});
