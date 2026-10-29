import { adminAuthorized } from '@/lib/core/admin';
import { purgeAudit } from '@/lib/core/audit';
import { fail, ok } from '@/lib/core/http';
import { hooks } from '@/lib/domain';
import { announceAll, flushSuiteOutbox } from '@/lib/suite';

export const dynamic = 'force-dynamic';

// Every few minutes from Coolify's scheduled task: curl -H "Authorization: Bearer $ADMIN_TOKEN" APP_BASE_URL/api/cron
export async function GET(req: Request) {
  if (!adminAuthorized(req)) return fail('Unauthorized', 401);
  const suite = await flushSuiteOutbox().catch((e) => ({ error: String(e) }));
  const directory = await announceAll().catch((e) => ({ error: String(e) }));
  const audit = await purgeAudit().catch((e) => ({ error: String(e) }));
  const app = await hooks.tick?.().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return ok({ suite, directory, auditPurged: audit, app: app ?? null });
}
