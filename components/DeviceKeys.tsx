import { listDeviceKeys } from '@/lib/core/devices';
import { pick, type Lang } from '@/lib/core/i18n';
import { ApiForm } from './ApiForm';
import { Card } from './ui';
import { RevokeButton } from './RevokeButton';

// Device keys of this merchant (Clover devices, kiosks): create one (shown once), revoke.
export async function DeviceKeys({ merchantId, lang, kind = 'device', title, hint }: { merchantId: string; lang: Lang; kind?: string; title: string; hint: string }) {
  const devices = await listDeviceKeys(merchantId, kind);
  return (
    <Card title={title}>
      <p className="muted">{hint}</p>
      {devices.length > 0 && (
        <table><thead><tr><th>{pick(lang, 'Nom', 'Name')}</th><th>{pick(lang, 'Dernière utilisation', 'Last used')}</th><th /></tr></thead>
          <tbody>{devices.map((d) => <tr key={d.id}><td>{d.name}</td><td>{d.lastUsedAt ? new Date(d.lastUsedAt).toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA') : '—'}</td><td><RevokeButton url={`/api/devices?id=${d.id}`} label={pick(lang, 'Retirer', 'Revoke')} /></td></tr>)}</tbody>
        </table>
      )}
      <ApiForm action="/api/devices" extra={{ kind }} fields={[{ name: 'name', label: pick(lang, 'Nom de l’appareil', 'Device name'), required: true }]}
        submit={pick(lang, 'Créer une clé', 'Create a key')} onResult={(j) => `${pick(lang, 'Clé (copiez-la maintenant, elle ne sera plus affichée) :', 'Key (copy it now, it will not be shown again):')}\n${j.key}`} />
    </Card>
  );
}
