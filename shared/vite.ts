/**
 * The Legacy launcher's and project pages' shared font bundling.
 *
 * `ds/fonts.css` names its faces as `/fonts/<file>.woff2` and stays byte-for-byte as the generator wrote it. Each
 * site aliases `/fonts/` to `shared/fonts/`, so the dev server serves the files from here and the build bundles
 * them as assets under the site's own base (`/`, or `/socomlegacy/` for the viewer). `shipFontLicences` copies the three
 * woff2 files and their OFL texts into `<outDir>/fonts/` as well, so the licences ride along and a stale absolute
 * `/fonts/` link still answers.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Structural types keep this helper independent of the app's Vite version. */
interface Alias { find: RegExp; replacement: string }
interface Plugin {
  name: string;
  apply: 'build';
  configResolved(config: { root?: string; build: { outDir: string } }): void;
  closeBundle(): void;
}

/** shared/fonts, absolute */
export const sharedFonts = fileURLToPath(new URL('./fonts', import.meta.url));
/** shared/ds, absolute */
export const sharedDs = fileURLToPath(new URL('./ds', import.meta.url));

const slash = (p: string): string => p.replace(/\\/g, '/');

/** `/src/ds/index.css` (the URL both sites' pages link) -> shared/ds/index.css */
export const dsAlias: Alias = { find: /^\/src\/ds\//, replacement: `${slash(sharedDs)}/` };

/** `/fonts/x.woff2` -> shared/fonts/x.woff2 */
export const fontsAlias: Alias = { find: /^\/fonts\//, replacement: `${slash(sharedFonts)}/` };

export function shipFontLicences(): Plugin {
  let outDir = '';
  return {
    name: 's2u-shared:ship-fonts',
    apply: 'build',
    // Vite keeps `build.outDir` as given and resolves a relative one against `config.root` when it writes the bundle; read
    // bare, a relative outDir (a CLI `--outDir ../x`) would put the fonts beside this process's cwd instead (the nightly
    // plan's NB-6 review, B-1). Resolved as Vite does; an absolute one is unchanged.
    configResolved(config) { outDir = resolve(config.root ?? '', config.build.outDir); },
    closeBundle() {
      const dst = join(outDir, 'fonts');
      mkdirSync(dst, { recursive: true });
      for (const f of readdirSync(sharedFonts)) if (/\.(woff2|txt)$/.test(f)) copyFileSync(join(sharedFonts, f), join(dst, f));
    },
  };
}
