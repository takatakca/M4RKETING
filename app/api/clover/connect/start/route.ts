import { NextResponse } from 'next/server';
import { cloverConfig, cloverConfigured } from '@/lib/clover/config';

export const dynamic = 'force-dynamic';

// « Connecter un marchand Clover » → page d'approbation Clover de l'app
// « M4RKETING by TAKATAK » → retour au callback. Modèle : Food Hub
// (app/api/foodhub/clover-connect/start/route.ts). OAuth Clover v2.
// TODO: ajouter PKCE (code_verifier/code_challenge) comme les packages le prescrivent,
// et restreindre ce point d'entrée aux rôles autorisés de l'app.
export async function GET() {
  if (!cloverConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'CLOVER_CLIENT_ID / CLOVER_CLIENT_SECRET manquants (voir DEPLOY.md)' },
      { status: 500 },
    );
  }
  const redirectUri = `${cloverConfig.appBaseUrl}/api/clover/connect/callback`;
  const state = crypto.randomUUID(); // TODO: lier l'état à la session de l'utilisateur
  const url = new URL('https://www.clover.com/oauth/v2/authorize');
  url.searchParams.set('client_id', cloverConfig.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return NextResponse.redirect(url);
}
