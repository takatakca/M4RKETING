// Real built app + disposable loopback PostgreSQL + isolated Clover HTTP transport.
// Run after npm run build. No customer messages, discount writes or production service requests.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium, expect } from 'playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const database = process.env.M4_PROOF_DATABASE_URL;
assert(database, 'Provide M4_PROOF_DATABASE_URL for a disposable local PostgreSQL database.');
assert(['postgres:', 'postgresql:'].includes(new URL(database).protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname), 'Only a disposable loopback PostgreSQL database is accepted.');
assert(fs.existsSync(path.join(root, '.next/BUILD_ID')), 'Build M4RKETING first.');
const output = process.env.M4_PROOF_OUTPUT;
if (output) fs.mkdirSync(output, { recursive: true });
const suffix = crypto.randomBytes(5).toString('hex').toUpperCase();
const MID = `M4P${suffix}`; const FOREIGN = `M4Q${suffix}`; const DISCOUNT = 'DISCOUNT0001';
const results = []; const errors = []; const providerCalls = []; const unexpected = [];
let consent = true; let customerHold; let browser; let applicationLog = ''; const processes = [];
const passed = (name) => { results.push(name); console.log(`PASS ${name}`); };
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const clover = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'); let body = ''; for await (const chunk of req) body += chunk;
  providerCalls.push({ method: req.method, path: url.pathname });
  let data;
  if (req.method === 'POST' && url.pathname === '/oauth/v2/token') data = { access_token: 'LOCAL-ONLY', access_token_expiration: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'LOCAL-REFRESH' };
  else if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  else if (url.pathname.endsWith('/billing_info')) data = { status: 'ACTIVE', appSubscription: { name: 'Premium' } };
  else if (/\/employees\//.test(url.pathname)) data = { name: url.pathname.endsWith('MANAGER0001') ? 'Synthetic manager' : 'Synthetic owner', role: url.pathname.endsWith('MANAGER0001') ? 'MANAGER' : 'ADMIN', isOwner: !url.pathname.endsWith('MANAGER0001') };
  else if (url.pathname.endsWith('/discounts')) data = { elements: [{ id: DISCOUNT, name: 'M4 · Retour local', amount: -500 }] };
  else if (url.pathname.endsWith('/orders')) data = { elements: ['C1', 'C2'].map((id) => ({ id: `ORDER-${id}`, createdTime: Date.now() - 60 * 86400_000, total: 2000, customers: { elements: [{ id }] } })) };
  else if (url.pathname.endsWith('/customers')) {
    const hold = customerHold; customerHold = undefined; if (hold) { hold.arrived(); await hold.ready; }
    data = { elements: [
      { id: 'C1', firstName: 'Campaign', lastName: 'Test', marketingAllowed: consent, phoneNumbers: { elements: [{ phoneNumber: '5145550199' }] }, emailAddresses: { elements: [{ emailAddress: 'campaign@example.test' }] } },
      { id: 'C2', firstName: 'No consent', marketingAllowed: false, phoneNumbers: { elements: [{ phoneNumber: '5145550198' }] } },
    ] };
  } else if (url.pathname === `/v3/merchants/${MID}` || url.pathname === `/v3/merchants/${FOREIGN}`) data = { id: url.pathname.split('/').at(-1), name: 'Synthetic restaurant' };
  else data = { elements: [] };
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data));
});
await new Promise((resolve) => clover.listen(0, '127.0.0.1', resolve));
const port = await freePort(); const peerPort = await freePort(); const base = `http://127.0.0.1:${port}`; const peer = `http://127.0.0.1:${peerPort}`;
const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: database, SESSION_SECRET: crypto.randomBytes(32).toString('hex'), TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), APP_BASE_URL: base, CLOVER_CLIENT_SECRET: 'local-fixture-only', CLOVER_WEBHOOK_AUTH: 'local-fixture-only', CLOVER_API_BASE: `http://127.0.0.1:${clover.address().port}` });
const pool = new pg.Pool({ connectionString: database, max: 3 });
function start(onPort) {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(onPort), '-H', '127.0.0.1'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { applicationLog = (applicationLog + d).slice(-10000); }); child.stderr.on('data', (d) => { applicationLog = (applicationLog + d).slice(-10000); }); processes.push(child); return child;
}
async function stop(child) { if (child.exitCode !== null) return; const done = new Promise((resolve) => child.once('exit', resolve)); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 10000); try { await done; } finally { clearTimeout(timer); } }
async function ready(url) { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${url}/api/health`)).ok) return; } catch { /* starting */ } await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error('Local campaign app failed to start.'); }
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'fr-CA', acceptDownloads: true });
  await ctx.route('**/*', (route) => { const origin = new URL(route.request().url()).origin; if ([base, peer].includes(origin)) return route.continue(); unexpected.push(origin); return route.abort(); });
  return ctx;
}
const login = async (ctx, mid = MID, employee = 'OWNER000001') => { const response = await ctx.request.get(`${base}/api/clover/connect/callback?code=local-only&merchant_id=${mid}&employee_id=${employee}`); assert(response.ok()); };
const payload = (name) => ({ name, segment: 'lapsing', discountId: DISCOUNT, messageFr: 'Découvrez notre offre locale.', messageEn: 'Discover our local offer.' });
const json = async (response) => { const body = await response.json(); assert(response.ok() && body.ok, `Local route refused: ${body.code || response.status()}`); return body; };
try {
  let app = start(port); await ready(base);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
  const owner = await context(); await login(owner); const page = await owner.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/app/campaigns`, { waitUntil: 'networkidle' });
  await page.locator('input[name="name"]').fill('Retour du quartier'); await page.getByLabel('Segment', { exact: true }).selectOption('lapsing');
  await page.getByLabel('Rabais Clover', { exact: true }).selectOption(DISCOUNT); await page.getByLabel('Message (français)', { exact: true }).fill('Découvrez notre offre locale.'); await page.getByLabel('Message (anglais)', { exact: true }).fill('Discover our local offer.');
  const creating = page.waitForResponse((r) => r.url().endsWith('/api/marketing/campaigns') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click(); const created = await json(await creating); const id = created.campaign.id;
  await page.getByRole('link', { name: 'Retour du quartier', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vérifier : Retour du quartier', exact: true })).toBeVisible();
  const preview = (await json(await owner.request.get(`${base}/api/marketing/campaigns?preview=${id}`))).preview;
  assert.equal(preview.audience.consentedCount, 1); assert.equal(preview.audience.segmentCount, 2); assert(!JSON.stringify(preview).includes('campaign@example.test'));
  assert.equal((await owner.request.get(`${base}/api/marketing/export?campaign=${id}`)).status(), 409);
  assert.equal((await owner.request.get(`${base}/api/marketing/export?segment=lapsing`)).status(), 400);
  passed('actual merchant browser creates a draft and previews the current Clover offer and counts without contact details; unapproved and legacy segment exports are denied');
  const manager = await context(); await login(manager, MID, 'MANAGER0001');
  assert.equal((await manager.request.post(`${base}/api/marketing/campaigns`, { data: { approve: id, previewHash: preview.configurationHash } })).status(), 403);
  assert.equal((await manager.request.get(`${base}/api/marketing/export?campaign=${id}`)).status(), 403);
  const foreign = await context(); await login(foreign, FOREIGN); assert.equal((await foreign.request.get(`${base}/api/marketing/campaigns?preview=${id}`)).status(), 404);
  passed('actual sessions enforce manager/admin approval/export boundaries and deny another merchant’s campaign');
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Approuver cette version', exact: true }).click();
  const downloadLink = page.getByRole('link', { name: 'Exporter l’audience approuvée (CSV)', exact: true }); await expect(downloadLink).toBeVisible();
  const downloading = page.waitForEvent('download'); await downloadLink.click(); const file = await downloading; const csv = fs.readFileSync(await file.path(), 'utf8');
  assert(csv.includes('campaign@example.test')); assert(!csv.includes('No consent')); assert.equal(csv.trim().split('\n').length, 2);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (output) await page.screenshot({ path: path.join(output, 'approved-campaign-desktop.png'), fullPage: true });
  passed('human approval of the reviewed version enables a real CSV download containing only the current consenting contact');
  consent = false; const withdrawn = await owner.request.get(`${base}/api/marketing/export?campaign=${id}`); assert(withdrawn.ok()); assert.equal((await withdrawn.text()).trim(), 'first_name,last_name,phone,email');
  passed('consent withdrawal after approval is honored on the next export without a cached contact leak');
  await page.getByLabel('Message (français)', { exact: true }).fill('Une nouvelle offre à vérifier.'); await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect(downloadLink).toHaveCount(0); assert.equal((await owner.request.get(`${base}/api/marketing/export?campaign=${id}`)).status(), 409);
  assert.equal((await owner.request.post(`${base}/api/marketing/campaigns`, { data: { approve: id, previewHash: preview.configurationHash } })).status(), 409);
  passed('editing the campaign clears its approval; the old preview and old export are both refused');
  page.once('dialog', (d) => d.accept()); await page.getByRole('button', { name: 'Approuver cette version', exact: true }).click(); await expect(downloadLink).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload({ waitUntil: 'networkidle' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => window.scrollTo(0, 0));
  if (output) await page.screenshot({ path: path.join(output, 'approved-campaign-mobile.png'), fullPage: true });
  await stop(app); app = start(port); await ready(base); await page.reload({ waitUntil: 'networkidle' }); await expect(downloadLink).toBeVisible();
  const durable = (await json(await owner.request.get(`${base}/api/marketing/campaigns?preview=${id}`))).preview; assert(durable.approved); assert(durable.campaign.approvedSnapshot.discount.amountCents === 500);
  passed('approval snapshot survives PostgreSQL JSONB reordering and a real app restart; the mobile review remains usable');
  start(peerPort); await ready(peer);
  const concurrent = (await json(await owner.request.post(`${base}/api/marketing/campaigns`, { data: payload('Concurrent draft') }))).campaign;
  const lock = await pool.connect(); await lock.query('BEGIN'); await lock.query('SELECT id FROM app_docs WHERE collection=$1 AND id=$2 FOR UPDATE', ['campaigns', concurrent.id]);
  const updates = Promise.all([base, peer].map((origin, i) => owner.request.patch(`${origin}/api/marketing/campaigns`, { data: { ...payload(`Concurrent ${i}`), id: concurrent.id, revision: 1 } })));
  let bothBlocked = false;
  for (let i = 0; i < 120; i++) { const r = await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE app_docs SET data =%'"); if (r.rows[0].n === 2) { bothBlocked = true; break; } await new Promise((resolve) => setTimeout(resolve, 50)); }
  await lock.query('COMMIT'); lock.release(); assert(bothBlocked, 'Both actual app workers must wait at the same real PostgreSQL campaign row.');
  const responses = await updates; assert.deepEqual(responses.map((r) => r.status()).sort(), [200, 409]);
  const persisted = await pool.query('SELECT data FROM app_docs WHERE collection=$1 AND id=$2', ['campaigns', concurrent.id]); assert.equal(persisted.rows[0].data.revision, 2);
  passed('two real app processes competing on one locked PostgreSQL row preserve exactly one edit and return a conflict for the stale edit');
  consent = true; const race = (await json(await owner.request.post(`${base}/api/marketing/campaigns`, { data: payload('Export race') }))).campaign;
  const reviewed = (await json(await owner.request.get(`${base}/api/marketing/campaigns?preview=${race.id}`))).preview;
  await json(await owner.request.post(`${base}/api/marketing/campaigns`, { data: { approve: race.id, previewHash: reviewed.configurationHash } }));
  let arrived; let resume; const waiting = new Promise((resolve) => { arrived = resolve; }); const hold = new Promise((resolve) => { resume = resolve; }); customerHold = { arrived, ready: hold };
  const exporting = owner.request.get(`${base}/api/marketing/export?campaign=${race.id}`); await waiting;
  await json(await owner.request.patch(`${peer}/api/marketing/campaigns`, { data: { ...payload('Changed during export'), id: race.id, revision: 1 } })); resume();
  const refused = await exporting; assert.equal(refused.status(), 409); assert(!(await refused.text()).includes('campaign@example.test'));
  passed('an actual concurrent campaign edit during the Clover audience read prevents contacts from leaving the export route');
  assert.equal(providerCalls.filter((r) => r.method !== 'GET' && r.path !== '/oauth/v2/token').length, 0); assert.equal(unexpected.length, 0); assert.equal(errors.length, 0);
  passed('all provider traffic stays on the local fixture; no messages, discounts or production services are written');
  if (output) fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ok: true, checksPassed: results.length, checks: results, database: 'disposable real PostgreSQL', applicationProcesses: 3, simultaneousApplicationProcesses: 2, clover: 'isolated local HTTP fixture', providerWrites: 0, externalMessages: 0, pageErrors: errors, buildId: fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim(), productionVerified: false }, null, 2) + '\n');
} catch (error) {
  console.error(error);
  if (browser) for (const ctx of browser.contexts()) for (const page of ctx.pages()) { console.error('Local fixture page:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0, 1800)); if (output) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => undefined); }
  console.error(applicationLog.slice(-5000)); process.exitCode = 1;
}
finally { if (browser) await browser.close(); await Promise.all(processes.map(stop)); await pool.end(); await new Promise((resolve) => clover.close(resolve)); }
