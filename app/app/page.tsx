import { SectionPage } from '@/components/SectionPage';

export const dynamic = 'force-dynamic';

type Query = Promise<Record<string, string | string[] | undefined>>;
const flat = (q: Record<string, string | string[] | undefined>) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Array.isArray(v) ? v[0] ?? '' : v ?? '']));

// The merchant's dashboard for this app: the overview section (signed in by the Clover callback).
export default async function Dashboard({ searchParams }: { searchParams: Query }) {
  return <SectionPage slug="" query={flat(await searchParams)} />;
}
