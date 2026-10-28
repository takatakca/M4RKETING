import { NextResponse, type NextRequest } from 'next/server';
import { cloverConfig } from '@/lib/clover/config';

export const dynamic = 'force-dynamic';

// Webhook de l'app « M4RKETING by TAKATAK » (Clover Developer Dashboard → app → Webhooks).
// Modèle : TAKATAK Food Hub (dépôt foodhubca, app/api/foodhub/webhooks/clover/route.ts).
//  1. Clover POST d'abord { verificationCode } : le journaliser et le coller dans le
//     Developer Dashboard pour activer le webhook (le code lui-même n'est jamais commité).
//  2. Chaque événement porte l'en-tête X-Clover-Auth = le code d'auth du webhook
//     → variable d'environnement CLOVER_WEBHOOK_AUTH. Rejeter tout le reste.
//  3. Événements abonnés pour cette app : `C`, `O`, `I`, `A`.
//     Préfixes Clover : A=app (désinstallation → purger les jetons du marchand),
//     O=commandes, P=paiements, I=inventaire, C=clients, E=employés, M=marchand, CA=caisse.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  if (typeof body.verificationCode === 'string') {
    // TODO: journaliser le code (une fois) pour le coller dans le Developer Dashboard.
    console.log('[clover-webhook] verificationCode received (paste it in the Developer Dashboard)');
    return NextResponse.json({ ok: true });
  }

  if (!cloverConfig.webhookAuth || req.headers.get('x-clover-auth') !== cloverConfig.webhookAuth) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // TODO: dispatcher par préfixe de clé d'événement vers les handlers de l'app.
  // TODO: traiter en arrière-plan et répondre vite (Clover réessaie sur lenteur).
  return NextResponse.json({ ok: true });
}
