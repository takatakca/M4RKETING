import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

// ?lang=fr|en → remembered in a cookie, back to the page.
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'fr';
  const back = req.nextUrl.searchParams.get('back') ?? '/';
  const res = NextResponse.redirect(new URL(back.startsWith('/') && !back.startsWith('//') ? back : '/', req.nextUrl.origin));
  res.headers.append('Set-Cookie', `lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`);
  return res;
}
