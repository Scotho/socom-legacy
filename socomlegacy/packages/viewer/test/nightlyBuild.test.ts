import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_SEEN_MARKER } from '../src/devSeen';
import { KEYBOARD_SITES } from '../src/keyboardTesting';
import { MOUSE_SITES } from '../src/mouseTesting';
import { builtTitle, readBuiltDist } from './builtDist';

/**
 * The nightly checks (OT.R47, the owner, 2026-10-12: "please ensure the testroom is functional on nightly"; the nightly
 * plan's NB-6). The nightly is NOT a release: `deploy/nightly.sh` builds it in development mode (`NODE_ENV=development`,
 * so `import.meta.env.DEV` is true and the test room keeps its instruments, the keyboard and the overlay) and minified,
 * into `dist/nightly/site` -- never `dist/viewer`, which the repository's release checks (`build_keyboard.test.ts` and
 * kin) read and hold to a production build that drops every one of them. These checks hold the nightly's build to the
 * opposite, and `nightly.sh` runs them, not the release checks, refusing a skip.
 *
 * Reads the nightly's build when one of this tree is present (`./builtDist.ts`: the setup page's markers and this tree's
 * clean HEAD), and skips, saying why, when it is not: the unit suite runs without one.
 */
const here = dirname(fileURLToPath(import.meta.url));
/** The nightly's build directory: the release's `site/`, staged by `deploy/nightly.sh`. */
export const NIGHTLY_SITE = resolve(here, '../../../dist/nightly/site');
const dist = readBuiltDist(NIGHTLY_SITE);
const js = dist.js;
const assets = join(NIGHTLY_SITE, 'assets');
const css = dist.built && existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(assets, f), 'utf-8')).join('\n') : '';
const matchHook = /DEV \? '([^']+)'/.exec(readFileSync(resolve(here, '../src/matchMount.ts'), 'utf-8').split(/\r?\n/)
  .find((l) => l.startsWith('export const MATCH_WINDOW_HOOK: string = import.meta')) ?? '')?.[1] ?? '';

describe.skipIf(!dist.built)(builtTitle('the nightly is a development build, minified, with the test room\'s instruments (OT.R47)', dist), () => {
  it('every keyboard site is in (OT.R29\'s keyboard, the nightly\'s exception)', () => {
    for (const site of KEYBOARD_SITES) expect(js, site).toContain(site);
  });
  it('every mouse site is in', () => {
    for (const site of MOUSE_SITES) expect(js, site).toContain(site);
  });
  it('the match hook, the dev hook\'s seen-read and the in-game overlay are in', () => {
    expect(matchHook).toBe('__frontEndMatch');
    expect(js).toContain(matchHook);
    expect(js).toContain(DEV_SEEN_MARKER);
    expect(`${js}\n${css}`).toContain('mu-overlay-frame');
  });
  it('the fonts with their OFL texts, and the movie decoder with its licence, source offer, source and upstream\'s tarball, are in the release\'s site/', () => {
    // The NB-6 review's B-1: a relative outDir sent the plugins' copies beside their cwd, outside the clone; a misplaced
    // output fails here, not at the decoder's check.
    const fonts = readdirSync(join(NIGHTLY_SITE, 'fonts'));
    for (const f of readdirSync(resolve(here, '../../../../shared/fonts')).filter((n) => /\.(txt|woff2)$/.test(n))) expect(fonts, f).toContain(f);
    expect(readdirSync(join(NIGHTLY_SITE, 'fmv')).sort()).toEqual(['COPYING', 'SOURCE-OFFER.txt', 'build.sh', 'config.h', 'glue.c', 'libmpeg2.wasm', 'mpeg2dec_0.5.1.orig.tar.gz']);
  });
  it('the account base is held to the page\'s own origin: VITE_S2U_ACCOUNT_ORIGIN_ONLY is "1" in the bundle (the NB-6 review\'s M-1)', () => {
    // `accountOriginOnly` reads `import.meta.env` whole, which Vite inlines as an object literal of the build's env: the
    // key as an identifier or a string, the value "1". A build that lost the flag would bring the weak point back.
    expect(js).toMatch(/["']?VITE_S2U_ACCOUNT_ORIGIN_ONLY["']?\s*:\s*["']1["']/);
  });
  it('the JavaScript is minified all the same (the owner\'s "with minimization"): its largest file is a few long lines', () => {
    const biggest = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => join(assets, f))
      .sort((a, b) => statSync(b).size - statSync(a).size)[0]!;
    const text = readFileSync(biggest, 'utf-8');
    expect(text.length).toBeGreaterThan(100_000);
    expect(text.split('\n').length).toBeLessThan(text.length / 2000);      // a pretty-printed bundle has a line per ~40 bytes
  });
});

describe('the nightly checks read their own directory, never the release checks\' (OT.R47)', () => {
  it('dist/nightly/site, beside dist/viewer', () => {
    expect(NIGHTLY_SITE.replace(/\\/g, '/')).toMatch(/\/socomlegacy\/dist\/nightly\/site$/);
  });
});
