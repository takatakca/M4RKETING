import { listDeviceKeys } from '@/lib/core/devices';
import { pick, type Lang } from '@/lib/core/i18n';
import { deviceKinds } from '@/lib/domain';
import { ApiForm } from './ApiForm';
import { Card, Empty } from './ui';
import { RevokeButton } from './RevokeButton';

// Device keys of this merchant (Clover devices, kiosks): list, create one (shown once), revoke. One kind (an app
// screen) or every kind (Account → Devices). Creating and revoking needs account.devices (manager by default).
export async function DeviceKeys({ merchantId, lang, kind, title, hint, canManage }: { merchantId: string; lang: Lang; kind?: string; title: string; hint: string; canManage: boolean }) {
  if (!deviceKinds.length) return <Card title={title} icon="device"><Empty icon="device">{pick(lang, 'Cette app ne branche aucun appareil : tout se fait ici, dans le tableau de bord.', 'This app plugs in no device: everything happens here, in the dashboard.')}</Empty></Card>;
  const devices = await listDeviceKeys(merchantId, kind);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA') : '—');
  const kindLabel = (k: string) => { const d = deviceKinds.find((x) => x.kind === k); return d ? pick(lang, d.fr, d.en) : k; };
  return (
    <Card title={title} sub={hint} icon="device">
      {devices.length === 0 ? <Empty icon="device">{pick(lang, 'Aucun appareil branché pour l’instant.', 'No device plugged in yet.')}</Empty> : (
        <div className="table-wrap"><table><thead><tr><th>{pick(lang, 'Nom', 'Name')}</th>{!kind && <th>{pick(lang, 'Type', 'Kind')}</th>}<th>{pick(lang, 'Créée', 'Created')}</th><th>{pick(lang, 'Dernière utilisation', 'Last used')}</th><th /></tr></thead>
          <tbody>{devices.map((d) => <tr key={d.id}><td>{d.name}</td>{!kind && <td>{kindLabel(d.kind)}</td>}<td>{when(d.createdAt)}</td><td>{when(d.lastUsedAt)}</td><td className="right">{canManage && <RevokeButton url={`/api/devices?id=${d.id}`} label={pick(lang, 'Retirer', 'Revoke')} confirm={pick(lang, `Retirer la clé « ${d.name} » ? L’appareil cessera de fonctionner.`, `Revoke the key “${d.name}”? The device will stop working.`)} />}</td></tr>)}</tbody>
        </table></div>
      )}
      {canManage ? (
        <ApiForm action="/api/devices" extra={{ kind: kind ?? deviceKinds[0]?.kind }} fields={[
          { name: 'name', label: pick(lang, 'Nom de l’appareil', 'Device name'), required: true, placeholder: pick(lang, 'Comptoir 1', 'Counter 1') },
          ...(!kind && deviceKinds.length > 1 ? [{ name: 'kind', label: pick(lang, 'Type', 'Kind'), type: 'select' as const, options: deviceKinds.map((k) => ({ value: k.kind, label: pick(lang, k.fr, k.en) })) }] : []),
        ]}
          submit={pick(lang, 'Créer une clé', 'Create a key')} result={`${pick(lang, 'Clé (copiez-la maintenant, elle ne sera plus affichée) :', 'Key (copy it now, it will not be shown again):')}\n{key}`} />
      ) : <p className="muted small">{pick(lang, 'Votre rôle ne permet pas de créer ou retirer des clés.', 'Your role cannot create or revoke keys.')}</p>}
    </Card>
  );
}
