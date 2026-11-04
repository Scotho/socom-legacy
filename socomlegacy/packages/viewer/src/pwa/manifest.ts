/**
 * The web app manifest (PWA-2, PWA.R3). A browser adaptation. `display` is fullscreen, falling back to standalone.
 * Screenshots are the launcher chrome from `tools/icons.ts`, never disc media.
 * The icons are PNGs with fixed sizes only: Chrome on Android falls back from installing to a home-screen bookmark when
 * the manifest names an SVG with `sizes: "any"` (Chromium issue 40925759), so the SVG favicon stays in the page's
 * `<link rel="icon">` (`head.ts`) and out of the manifest.
 */

export interface WebManifest {
  id: string;
  start_url: string;
  scope: string;
  name: string;
  short_name: string;
  display: 'fullscreen';
  display_override: ['fullscreen', 'standalone'];
  orientation: 'landscape';
  background_color: '#000e11';
  theme_color: '#000e11';
  categories: ['games'];
  icons: { src: string; sizes: string; type: string; purpose: string }[];
  screenshots: { src: string; sizes: string; type: string; form_factor: 'wide' | 'narrow'; label: string }[];
}

function root(base: string): string {
  if (!base || base === '/') return '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function webManifest(base = '/'): WebManifest {
  const b = root(base);
  return {
    id: b,
    start_url: b,
    scope: b,
    name: 'SOCOM II Legacy',
    short_name: 'SOCOM II',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#000e11',
    theme_color: '#000e11',
    categories: ['games'],
    icons: [
      { src: `${b}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${b}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${b}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [
      { src: `${b}screenshot-wide.png`, sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'SOCOM II Legacy launcher' },
      { src: `${b}screenshot-narrow.png`, sizes: '750x1334', type: 'image/png', form_factor: 'narrow', label: 'SOCOM II Legacy launcher' },
    ],
  };
}

/** The offline fallback the worker precaches. The emblem is inlined, so the page needs no further fetch. */
export function offlineHtml(emblemSvg: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#000e11" />
  <title>SOCOM II Legacy</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000e11; color: #dcb85c; font: 18px sans-serif; }
    main { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
    svg { width: 96px; height: 96px; }
  </style>
</head>
<body>
  <main>
    ${emblemSvg.replace('<svg ', '<svg aria-hidden="true" ')}
    <p>SOCOM II Legacy is offline. Reconnect, then reload.</p>
  </main>
</body>
</html>
`;
}
