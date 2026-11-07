import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

function returnPath(value: string): string {
  if (value.length > 2048 || !value.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  try {
    const parsed = new URL(value, 'https://suite.invalid');
    if (parsed.origin !== 'https://suite.invalid' || parsed.pathname.startsWith('//')
      || /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(parsed.pathname)) return '/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return '/'; }
}

// ?lang=fr|en → remembered in a cookie, back to the page.
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'fr';
  const back = returnPath(req.nextUrl.searchParams.get('back') ?? '/');
  // A relative Location stays on the visitor's host, even when Next sees an
  // internal container origin. Never trust Host or X-Forwarded-Host for this.
  const res = new NextResponse(null, { status: 307, headers: { Location: back, 'Cache-Control': 'no-store' } });
  res.headers.append('Set-Cookie', `lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`);
  return res;
}
