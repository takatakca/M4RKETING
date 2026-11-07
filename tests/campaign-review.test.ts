import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ApiForm } from '@/components/ApiForm';
import type { PageCtx } from '@/lib/core/page';
import type { Campaign, CampaignPreview } from '@/lib/domain/marketing';
import { CampaignReview } from '@/components/Panel';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), forms: vi.fn() }));
vi.mock('@/lib/domain/marketing', async (original) => ({
  ...await original<typeof import('@/lib/domain/marketing')>(), previewCampaign: mocks.preview,
}));
vi.mock('@/components/ApiForm', () => ({ ApiForm: (props: ComponentProps<typeof ApiForm>) => {
  mocks.forms(props);
  return createElement('form', null, createElement('button', null, props.submit));
} }));

const listed: Campaign = {
  id: 'synthetic-campaign', name: 'Outdated campaign', segment: 'lost', discountName: 'Old offer',
  messageFr: 'Ancien message', messageEn: 'Outdated copy', status: 'draft', createdAt: '2026-11-01T00:00:00Z', approvedBy: null, revision: 1,
};
const current: Campaign = {
  ...listed, name: 'Current campaign', segment: 'regular', discountId: null, discountName: null,
  messageFr: 'Message actuel', messageEn: 'Current copy', revision: 2,
};
const preview: CampaignPreview = {
  campaign: current, discount: null, configurationHash: 'a'.repeat(64),
  audience: { segmentCount: 2, consentedCount: 1 }, approved: false, canApprove: true, problems: [],
};
const context = (lang: 'fr' | 'en'): PageCtx => ({
  lang, merchantId: 'SYNTHETIC001', merchant: null, tier: 'premium', session: null,
  role: 'owner', roleVerified: true, person: 'Synthetic owner', policy: null, can: () => true,
});

beforeEach(() => { vi.clearAllMocks(); mocks.preview.mockResolvedValue({ ok: true, preview }); });

describe('campaign review displays the version bound to approval', () => {
  it.each(['fr', 'en'] as const)('uses the fresh preview when the campaign changes after the list read (%s)', async (lang) => {
    const html = renderToStaticMarkup(await CampaignReview({ ctx: context(lang), campaign: listed, discounts: [] }));
    expect(mocks.preview).toHaveBeenCalledWith('SYNTHETIC001', listed.id);
    expect(html).toContain('Current campaign');
    expect(html).toContain('Message actuel');
    expect(html).toContain('Current copy');
    expect(html).not.toMatch(/Outdated campaign|Ancien message|Outdated copy|Old offer/);
    const forms = mocks.forms.mock.calls.map(([props]) => props as ComponentProps<typeof ApiForm>);
    expect(forms.find((f) => f.extra?.approve)?.extra).toEqual({ approve: current.id, previewHash: preview.configurationHash });
    const edit = forms.find((f) => f.method === 'PATCH');
    expect(edit?.extra).toEqual({ id: current.id, revision: 2 });
    expect(edit?.fields.find((f) => f.name === 'messageFr')?.defaultValue).toBe('Message actuel');
  });

  it('offers no approval or audience export when the preview cannot be verified', async () => {
    mocks.preview.mockResolvedValue({ ok: false, error: 'Unavailable', code: 'clover_unavailable', status: 502 });
    const html = renderToStaticMarkup(await CampaignReview({ ctx: context('fr'), campaign: listed, discounts: [] }));
    expect(html).not.toContain('/api/marketing/export');
    expect(mocks.forms.mock.calls.some(([props]) => props.extra?.approve)).toBe(false);
  });
});
