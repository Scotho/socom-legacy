import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtTitle, distRevision, readBuiltDist, SETUP_PAGE_MARKERS, treeRevision, VIEWER_DIST } from './builtDist';

/**
 * `./builtDist.ts`, the release checks' one reader of `dist/viewer` (web sprint 37's close review pass 2): a bundle
 * counts as built only when it carries the setup page's two markers AND this tree's short HEAD, clean, as
 * `vite.config.ts` `gitRevision` writes it into `__VIEWER_REV__`. No build here: a fake `dist/viewer/assets/x.js` in a
 * temp dir, carrying the call shape the minified bundle has (`revisionLabel(rev, stamp)` inlined).
 */
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: webRoot, encoding: 'utf8' }).trim();
const MARKERS = 'const d=`failed while reading ${a}: ${b}`;e.body.classList.add("test-room");';
const bundle = (rev: string): string => `${MARKERS}function qi(){return Gi(${JSON.stringify(rev)},"2026-10-09 10:09:48")}`;

let root = '';
const dist = (): string => join(root, 'dist', 'viewer');
function fake(js: string): void {
  mkdirSync(join(dist(), 'assets'), { recursive: true });
  writeFileSync(join(dist(), 'assets', 'x.js'), js);
}
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 's2u-builtdist-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('readBuiltDist: a build of THIS tree, or a skip that says why', () => {
  it('a stale build (another revision) is "skip, not built from this tree", naming both revisions', () => {
    const stale = head === '46294a0bb' ? '0123456789' : '46294a0bb';
    fake(bundle(stale));
    const d = readBuiltDist(dist());
    expect(d.built).toBe(false);
    expect(d.buildRev).toBe(stale);
    expect(d.treeRev).toBe(head);
    expect(d.why).toBe(`not built from this tree: the build's revision ${stale}, the tree's ${head}`);
    expect(builtTitle('the built viewer carries none of it', d)).toBe(`the built viewer carries none of it -- skipped: ${d.why}`);
  });

  it('the current HEAD, clean, is "built"', () => {
    fake(bundle(head));
    const d = readBuiltDist(dist());
    expect(d).toMatchObject({ built: true, buildRev: head, treeRev: head, why: '' });
    expect(d.js).toContain('failed while reading ');
    expect(builtTitle('the built viewer carries none of it', d)).toBe('the built viewer carries none of it');
  });

  it('the current HEAD built dirty (`-dirty`) is a skip, not a build of this tree', () => {
    fake(bundle(`${head}-dirty`));
    const d = readBuiltDist(dist());
    expect(d.built).toBe(false);
    expect(d.buildRev).toBe(`${head}-dirty`);
    expect(d.why).toContain('not built from this tree');
  });

  it('no dist, or a bundle without the setup page, is a skip as before', () => {
    expect(readBuiltDist(dist())).toMatchObject({ built: false, js: '', why: 'no build of the setup page in dist/viewer' });
    fake(`function qi(){return Gi(${JSON.stringify(head)},"2026-10-09 10:09:48")}`);
    expect(readBuiltDist(dist())).toMatchObject({ built: false, why: 'no build of the setup page in dist/viewer' });
  });

  it('since #353 the bundle returns the revision from a function; the PWA\'s version.json names it, and that is read', () => {
    fake(`${MARKERS}function l(){return${JSON.stringify(head)}}function y(){return c(l(),"2026-10-19 23:05:05")}`);
    writeFileSync(join(dist(), 'version.json'), JSON.stringify({ release: head }));
    expect(readBuiltDist(dist())).toMatchObject({ built: true, buildRev: head, why: '' });
    const stale = head === '46294a0bb' ? '0123456789' : '46294a0bb';
    writeFileSync(join(dist(), 'version.json'), JSON.stringify({ release: stale }));
    expect(readBuiltDist(dist())).toMatchObject({ built: false, buildRev: stale });
  });

  it('a bundle whose revision cannot be read is a skip, never a pass', () => {
    fake(MARKERS);
    const d = readBuiltDist(dist());
    expect(d.built).toBe(false);
    expect(d.buildRev).toBeNull();
    expect(d.why).toBe(`not built from this tree: the build's revision unread, the tree's ${head}`);
  });
});

/**
 * CX-9b review, note 4: the markers are what make a bundle count as a build at all, so a rewording of the source that
 * drops one turns every release check (`build_keyboard`, `launchSettingsEntry`) into a skip forever, silently -- the
 * "Disc loaded" badge's removal nearly did. Each marker must stay on a code line (not a comment's) of `src/**`.
 */
describe('SETUP_PAGE_MARKERS: each one is still written by the source', () => {
  const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
  const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
  const codeLines = files.flatMap((f) => readFileSync(join(src, f), 'utf-8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)));

  it.each(SETUP_PAGE_MARKERS)('"%s" is on a code line of src/**', (marker) => {
    expect(codeLines.some((l) => l.includes(marker))).toBe(true);
  });
});

/**
 * NB-4's fix round (2026-10-12, the nightly's first real run): the source check above passed while the build no longer
 * carried "must stay bound" (CX-9b left the refusal out of every page), so every release check skipped on a fresh
 * build of the very commit. On a build of this tree -- read by its revision alone, whatever its markers -- every marker
 * must be in the bundle: a marker the build drops is a failure here, not a skip of every release check.
 */
const realJs = existsSync(join(VIEWER_DIST, 'assets'))
  ? readdirSync(join(VIEWER_DIST, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(VIEWER_DIST, 'assets', f), 'utf-8')).join('\n')
  : '';
const realRev = distRevision(VIEWER_DIST, realJs);
const thisTree = realRev !== null && realRev === treeRevision();
describe.skipIf(!thisTree)(`SETUP_PAGE_MARKERS: a build of this tree carries each one${thisTree ? '' : ` -- skipped: no build of this tree in dist/viewer (its revision ${realRev ?? 'unread'})`}`, () => {
  it.each(SETUP_PAGE_MARKERS)('"%s" is in dist/viewer/assets/*.js', (marker) => {
    expect(realJs.includes(marker)).toBe(true);
  });
});
