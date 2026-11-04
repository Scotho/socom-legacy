/**
 * Cache headers for the app shell (PWA-5). A browser adaptation. The worker, the manifest, the release id and the
 * offline page are revalidated. Icons are public for about 7 days (604800 s), the same window as the fonts.
 * Screenshots stay on the host's extension rule (`no-cache`), so a release's launcher picture is not held for a week.
 */

export interface ShellHeader {
  path: string;
  cache: string;
  /** Set when the extension is not in a stock `mime.types` (`.webmanifest`). */
  type?: string;
}

export const SHELL_HEADERS: readonly ShellHeader[] = [
  { path: '/sw.js', cache: 'no-cache' },
  { path: '/version.json', cache: 'no-cache' },
  { path: '/offline.html', cache: 'no-cache' },
  { path: '/manifest.webmanifest', cache: 'no-cache', type: 'application/manifest+json' },
  { path: '/favicon.ico', cache: 'public, max-age=604800' },
  { path: '/favicon.svg', cache: 'public, max-age=604800' },
  { path: '/apple-touch-icon.png', cache: 'public, max-age=604800' },
  { path: '/icon-192.png', cache: 'public, max-age=604800' },
  { path: '/icon-512.png', cache: 'public, max-age=604800' },
  { path: '/icon-maskable-512.png', cache: 'public, max-age=604800' },
  { path: '/icon-monochrome.svg', cache: 'public, max-age=604800' },
];

/** One nginx `location` line. The body is what the nightly mirror compares, so both tables use this text. */
export function nginxLocation(h: ShellHeader): string {
  const type = h.type ? `default_type ${h.type}; ` : '';
  return `location = ${h.path} { ${type}add_header Cache-Control "${h.cache}"; }`;
}

/** Cloudflare Pages `_headers` (SA-10 will publish the page; the file is ready for that root). */
export function pagesHeaders(): string {
  const blocks = SHELL_HEADERS.map((h) => {
    const lines = [`/${h.path.replace(/^\//, '')}`, `  Cache-Control: ${h.cache}`];
    if (h.type) lines.push(`  Content-Type: ${h.type}`);
    return lines.join('\n');
  });
  return `# PWA shell (PWA-5). The worker, the manifest and the release id are revalidated. Icons are public for 7 days.\n${blocks.join('\n')}\n`;
}
