// Data export (Account → Security and data): what this app keeps about a merchant, minus every secret.
// Never included: Clover tokens (collections starting with "_"), hashes of keys and gift-card codes, tokens of
// tracking links, sealed values.
import { getStore } from './store';

const SECRET_KEY = /(^hash$|Hash$|token|secret)/i;

export function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_KEY.test(k)).map(([k, x]) => [k, scrub(x)]));
  if (typeof v === 'string' && v.startsWith('enc:v1:')) return '[sealed]';
  return v;
}

export async function exportRecords(merchantId: string): Promise<Array<{ collection: string; id: string; at: string; data: unknown }>> {
  return (await getStore().merchantDocs(merchantId))
    .filter((d) => !d.collection.startsWith('_'))
    .map((d) => ({ collection: d.collection, id: d.id, at: d.at, data: scrub(d.data) }));
}
