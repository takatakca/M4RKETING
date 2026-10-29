// Tiny Markdown → HTML for the legal pages (headings, lists, bold, italics, links, quotes, paragraphs). Input is
// escaped first: only our own repository files are rendered.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');

export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; }
  };
  for (const line of md.split(/\r?\n/)) {
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line) ?? /^\s*\d+\.\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (li) { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } list.push(li[1]); }
    else if (q) { flush(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); }
    else if (!line.trim()) flush();
    else if (/^-{3,}$/.test(line.trim())) { flush(); out.push('<hr/>'); }
    else { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; } para.push(line.trim()); }
  }
  flush();
  return out.join('\n');
}
