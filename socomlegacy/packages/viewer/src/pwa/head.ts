/**
 * The document head every HTML entry carries (PWA-2). A browser adaptation. `theme-color` is already on each entry;
 * this adds the icon set, the manifest and the install meta. `base` is Vite's base (`/` or `/socomlegacy/`).
 */

export function pwaHeadTags(base: string): string {
  const b = !base || base === '/' ? '/' : base.endsWith('/') ? base : `${base}/`;
  return [
    `<link rel="icon" href="${b}favicon.svg" type="image/svg+xml" />`,
    `<link rel="icon" href="${b}favicon.ico" sizes="48x48" />`,
    `<link rel="apple-touch-icon" href="${b}apple-touch-icon.png" />`,
    `<link rel="manifest" href="${b}manifest.webmanifest" />`,
    `<meta name="mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-title" content="SOCOM II" />`,
  ].join('\n    ');
}

/** Replace the empty icon (there so a dev server is not asked for `/favicon.ico`) with the install set. */
export function withPwaHead(html: string, base = '/'): string {
  const tags = pwaHeadTags(base);
  if (html.includes('rel="manifest"')) return html;
  if (/<link rel="icon" href="data:,"\s*\/?>/.test(html)) return html.replace(/<link rel="icon" href="data:,"\s*\/?>/, tags);
  return html.replace(/<meta charset="utf-8"\s*\/?>/, (m) => `${m}\n    ${tags}`);
}

/** The Vite inputs (`packages/viewer/vite.config.ts` `rollupOptions.input`). */
export const HTML_ENTRIES = ['index.html', 'setup/index.html', 'news/index.html', 'roadmap/index.html', 'journey/index.html', 'archive/index.html', 'server/index.html', 'status/index.html'] as const;
