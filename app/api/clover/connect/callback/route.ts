import { NextResponse, type NextRequest } from 'next/server';
import { cloverConfig } from '@/lib/clover/config';

export const dynamic = 'force-dynamic';

// Retour OAuth après approbation du marchand (app « M4RKETING by TAKATAK »).
// Échange le code contre les jetons d'accès du marchand.
// Les jetons vivent dans le coffre/base du serveur — JAMAIS dans le code ni les commits.
// Modèle : Food Hub (app/api/foodhub/clover-connect/callback/route.ts).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!code) return NextResponse.json({ ok: false, error: 'code manquant' }, { status: 400 });

  // TODO: échanger le code (POST https://api.clover.com/oauth/v2/token ou flux v2 PKCE),
  // TODO: stocker access_token / refresh_token du marchand (rotation des refresh tokens),
  // TODO: enregistrer le merchant_id et rediriger vers l'écran « connecté » de l'app.
  void merchantId;
  return NextResponse.json({ ok: true, todo: 'token exchange + stockage à implémenter' });
}
