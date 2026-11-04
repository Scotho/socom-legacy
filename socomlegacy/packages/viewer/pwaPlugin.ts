import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { assetManifestUrls, buildPwaShell, readEmblemFile, type ShellFile } from './pwaFiles';
import { withPwaHead } from './src/pwa/head';

/**
 * Emit the app shell and rewrite each HTML entry's head (PWA-1, PWA-2). `publicDir` is the extracted disc, so these
 * files are not copied from there. Dev and preview serve the same bytes the build emits. A browser adaptation.
 */

const EMBLEM = fileURLToPath(new URL('../../../shared/ds/emblem.svg', import.meta.url));

export function pwaPlugin(opts: { release: string }): Plugin {
  let base = '/';
  let files: ShellFile[] | null = null;
  const load = async (): Promise<ShellFile[]> => {
    files ??= await buildPwaShell({ release: opts.release, base, emblemSvg: readEmblemFile(EMBLEM) });
    return files;
  };
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const name = path.replace(/^\//, '');
    void load().then((list) => {
      const file = list.find((f) => f.path === name);
      if (!file) { next(); return; }
      res.setHeader('Content-Type', file.type);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(file.body);
    }, next);
  };
  return {
    name: 's2u-pwa',
    configResolved(config) { base = config.base; },
    transformIndexHtml: {
      order: 'pre',
      handler(html) { return withPwaHead(html, base); },
    },
    async generateBundle(_options, bundle) {
      const manifest = `${JSON.stringify(assetManifestUrls(Object.keys(bundle), base))}\n`;
      for (const file of await load()) this.emitFile({ type: 'asset', fileName: file.path, source: file.body });
      this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: manifest });
    },
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
  };
}
