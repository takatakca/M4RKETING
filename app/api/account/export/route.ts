import { NextResponse } from 'next/server';
import { APP } from '@/lib/app';
import { exportRecords } from '@/lib/core/export';
import { isCtx, requireMerchant } from '@/lib/core/guard';

export const dynamic = 'force-dynamic';

// Account → Security and data: everything this app keeps about the merchant, as one JSON file (account.export, admin
// by default). Secrets are left out (lib/core/export.ts).
export async function GET(req: Request) {
  const c = await requireMerchant(req, 'base', { action: 'account.export', audit: 'always' });
  if (!isCtx(c)) return c;
  const { merchantId, name, installedAt, billing, status } = c.merchant;
  const body = { app: APP.name, exportedAt: new Date().toISOString(), merchant: { merchantId, name, installedAt, billing, status }, records: await exportRecords(merchantId) };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${APP.key}-${merchantId}-${new Date().toISOString().slice(0, 10)}.json"`, 'cache-control': 'no-store' },
  });
}
