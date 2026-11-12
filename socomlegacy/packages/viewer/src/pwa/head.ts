/**
 * The document head every HTML entry carries (PWA-2). A browser adaptation. `theme-color` is already on each entry;
 * this adds the icon set, the manifest and the install meta. `base` is Vite's base (`/` or `/socomlegacy/`). The icons
 * are the SL mark since RB-29 (the owner's "S2 Launcher v2" export, `D:8-9`; `tools/icons.ts`): `favicon.svg` wraps
 * the mark at the design's 64 px, `favicon.ico` and `apple-touch-icon.png` are rendered from it; the file names and the
 * links are unchanged, so the deploy tables (`headers.ts`, the nginx files) still name every one.
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
export const HTML_ENTRIES = ['index.html', 'setup/index.html', 'news/index.html', 'roadmap/index.html', 'journey/index.html', 'archive/index.html', 'server/index.html', 'status/index.html', 'leaderboard/index.html', 'leaderboard/match/index.html', 'leaderboard/player/index.html'] as const;
