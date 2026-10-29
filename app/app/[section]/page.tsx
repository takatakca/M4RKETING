import { SectionPage } from '@/components/SectionPage';

export const dynamic = 'force-dynamic';

type Query = Promise<Record<string, string | string[] | undefined>>;
const flat = (q: Record<string, string | string[] | undefined>) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? '']));

// Any other section of the app (lib/domain `sections`).
export default async function Section({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Query }) {
  return <SectionPage slug={(await params).section} query={flat(await searchParams)} />;
}
