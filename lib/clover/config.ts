// Configuration Clover — M4RKETING by TAKATAK
// AUCUN secret dans ce fichier. Les valeurs réelles vivent dans les variables
// d'environnement du serveur (voir .env.example et DEPLOY.md).
export const cloverConfig = {
  appId: process.env.CLOVER_APP_ID ?? 'EQRZ028619JRW',
  clientId: process.env.CLOVER_CLIENT_ID ?? '',
  clientSecret: process.env.CLOVER_CLIENT_SECRET ?? '',
  webhookAuth: process.env.CLOVER_WEBHOOK_AUTH ?? '',
  apiBase: process.env.CLOVER_API_BASE ?? 'https://api.clover.com',
  appBaseUrl: process.env.APP_BASE_URL ?? '',
};

export function cloverConfigured(): boolean {
  return Boolean(cloverConfig.clientId && cloverConfig.clientSecret);
}
