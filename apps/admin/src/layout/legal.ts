/** The published legal pages (docs/legal, see CI.md); `VITE_*` overrides the GitHub Pages defaults. */
export const LEGAL_URLS = {
  privacy:
    import.meta.env.VITE_PRIVACY_URL ||
    'https://ayoubachour94.github.io/depanini-app/legal/privacy-en/',
  terms:
    import.meta.env.VITE_TERMS_URL ||
    'https://ayoubachour94.github.io/depanini-app/legal/terms-en/',
};
