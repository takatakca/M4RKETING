import fs from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { Top } from '@/components/Top';
import { markdownToHtml } from '@/lib/core/markdown';
import { pageContext } from '@/lib/core/page';
import { LEGAL_DOCS } from '@/lib/legal';

export const dynamic = 'force-dynamic';

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const d = LEGAL_DOCS.find((x) => x.slug === doc);
  const file = d ? path.join(process.cwd(), 'docs', 'legal', d.file) : null;
  if (!d || !file || !fs.existsSync(file)) notFound();
  const { lang } = await pageContext();
  return (
    <>
      <Top lang={lang} back={`/legal/${doc}`} />
      <main className="legal" dangerouslySetInnerHTML={{ __html: markdownToHtml(fs.readFileSync(file, 'utf8')) }} />
    </>
  );
}
