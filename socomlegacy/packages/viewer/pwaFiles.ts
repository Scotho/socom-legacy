import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readEmblem, renderIconSet } from '../../tools/icons';
import { pagesHeaders } from './src/pwa/headers';
import { offlineHtml, webManifest } from './src/pwa/manifest';

/**
 * The files the build emits beside the HTML (PWA-1..5). The public dir is the extracted disc and is not copied
 * (`vite.config.ts` `copyPublicDir: false`), so the icon set, the manifest, the worker and the release id are emitted
 * here. A browser adaptation.
 */

export interface ShellFile { path: string; type: string; body: Buffer }

const swEntry = fileURLToPath(new URL('./src/pwa/sw.ts', import.meta.url));

/** Hashed build files the worker precaches. Maps and the shell are not in the list. `base` is `/` or `/socomlegacy/`. */
export function assetManifestUrls(fileNames: readonly string[], base: string): string[] {
  const root = !base || base === '/' ? '/' : base.endsWith('/') ? base : `${base}/`;
  return fileNames
    .filter((name) => name.startsWith('assets/') && !name.endsWith('.map'))
    .map((name) => `${root}${name}`);
}

export async function bundleServiceWorker(release: string, base: string): Promise<string> {
  const result = await build({
    entryPoints: [swEntry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    define: {
      __PWA_RELEASE__: JSON.stringify(release),
      __PWA_BASE__: JSON.stringify(base),
    },
  });
  return result.outputFiles[0]?.text ?? '';
}

export async function buildPwaShell(opts: { release: string; base: string; emblemSvg: string }): Promise<ShellFile[]> {
  const icons = await renderIconSet(opts.emblemSvg);
  const sw = await bundleServiceWorker(opts.release, opts.base);
  const files: ShellFile[] = [
    { path: 'favicon.svg', type: 'image/svg+xml', body: Buffer.from(icons.faviconSvg) },
    { path: 'icon-monochrome.svg', type: 'image/svg+xml', body: Buffer.from(icons.monochromeSvg) },
    { path: 'favicon.ico', type: 'image/x-icon', body: icons.faviconIco },
    { path: 'manifest.webmanifest', type: 'application/manifest+json', body: Buffer.from(`${JSON.stringify(webManifest(opts.base), null, 2)}\n`) },
    { path: 'version.json', type: 'application/json', body: Buffer.from(`${JSON.stringify({ release: opts.release })}\n`) },
    { path: 'sw.js', type: 'text/javascript; charset=utf-8', body: Buffer.from(sw) },
    { path: 'offline.html', type: 'text/html; charset=utf-8', body: Buffer.from(offlineHtml(opts.emblemSvg)) },
    { path: '_headers', type: 'text/plain; charset=utf-8', body: Buffer.from(pagesHeaders()) },
  ];
  for (const png of icons.png) files.push({ path: png.name, type: 'image/png', body: png.png });
  for (const shot of icons.screenshots) files.push({ path: shot.name, type: 'image/png', body: shot.png });
  return files;
}

export function readEmblemFile(path: string): string {
  return readEmblem(path);
}
