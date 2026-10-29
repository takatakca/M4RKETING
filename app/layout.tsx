import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { APP } from '@/lib/app';
import { langFrom } from '@/lib/core/i18n';
import './globals.css';

export const metadata: Metadata = { title: `${APP.name}`, description: APP.summaryEn || APP.name, robots: { index: true, follow: true } };
export const viewport: Viewport = { themeColor: '#060D1F', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = langFrom((await cookies()).get('lang')?.value, (await headers()).get('accept-language'));
  return (
    <html lang={lang === 'en' ? 'en-CA' : 'fr-CA'}>
      <body>{children}</body>
    </html>
  );
}
