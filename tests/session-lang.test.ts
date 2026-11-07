import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/session/lang/route';

const request = (back: string, lang = 'fr') => new NextRequest(
  `http://0.0.0.0:3000/api/session/lang?${new URLSearchParams({ back, lang })}`,
  { headers: { host: 'internal:3000', 'x-forwarded-host': 'untrusted.example', 'x-forwarded-proto': 'https' } },
);

describe('proxy-safe language navigation', () => {
  it.each(['/', '/app/account', '/app/campaigns?campaign=synthetic#review'])('keeps %s on the current public origin', async (back) => {
    const res = await GET(request(back));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(back);
    expect(new URL(res.headers.get('location')!, 'https://suite.example').origin).toBe('https://suite.example');
  });

  it.each([
    'https://outside.example', '//outside.example', '/\\outside.example', '/..//outside.example',
    '/%2foutside.example', '/%5coutside.example', '/app\n', '/app%0d%0aLocation:outside',
    'app', 'javascript:alert(1)', '/' + 'a'.repeat(2048),
  ])('refuses unsafe return destination %j', async (back) => {
    const res = await GET(request(back));
    expect(res.headers.get('location')).toBe('/');
  });

  it.each([['fr', 'fr'], ['en', 'en'], ['unexpected', 'fr']])('remembers %s as %s and prevents redirect caching', async (input, expected) => {
    const res = await GET(request('/', input));
    expect(res.headers.get('set-cookie')).toBe(`lang=${expected}; Path=/; SameSite=Lax; Max-Age=31536000`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
