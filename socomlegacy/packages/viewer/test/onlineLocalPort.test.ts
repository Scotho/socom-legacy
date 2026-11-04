// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/**
 * The build's Local port reaches the page (2026-10-01, the e2e run): `online.ts` read `VITE_S2U_LOCAL_PORT` through a
 * cast of `import.meta`, a form Vite's transform does not see -- it injects import.meta's env only into a module whose
 * text names it as `import.meta.env.*` does -- so in the dev server the page's Local was 8787 whatever the run set, and a spec's
 * page joined the developer's own server there (`online.spec.ts`, `playersOnline.spec.ts` red). This asks Vite itself:
 * the module as the dev server serves it carries the port the environment named.
 */
const config = fileURLToPath(new URL('../vite.config.ts', import.meta.url));

describe('online.ts as the dev server serves it', () => {
  it('reads VITE_S2U_LOCAL_PORT through import.meta.env, so the build\'s port is the page\'s', async () => {
    const before = process.env['VITE_S2U_LOCAL_PORT'];
    process.env['VITE_S2U_LOCAL_PORT'] = '8899';
    const server = await createServer({ configFile: config, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'silent', appType: 'custom' });
    try {
      const out = await server.transformRequest('/src/online.ts');
      expect(out?.code ?? '').toMatch(/import\.meta\.en[v]\s*=\s*\{[^}]*"VITE_S2U_LOCAL_PORT":\s*"8899"/);
    } finally {
      await server.close();
      if (before === undefined) delete process.env['VITE_S2U_LOCAL_PORT']; else process.env['VITE_S2U_LOCAL_PORT'] = before;
    }
  }, 60_000);
});
