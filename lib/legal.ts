// The app's legal texts in docs/legal/ (privacy policy, terms; FR and EN), served at /legal/<slug> for the Clover listing.
export const LEGAL_DOCS = [
  { slug: 'privacy', file: 'privacy-policy.md', lang: 'en', title: 'Privacy policy' },
  { slug: 'terms', file: 'terms.md', lang: 'en', title: 'Terms of use' },
  { slug: 'confidentialite', file: 'politique-confidentialite.md', lang: 'fr', title: 'Politique de confidentialité' },
  { slug: 'conditions', file: 'conditions-utilisation.md', lang: 'fr', title: 'Conditions d’utilisation' },
] as const;
