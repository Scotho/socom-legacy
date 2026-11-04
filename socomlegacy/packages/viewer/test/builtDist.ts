import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The release checks' one reader of a built viewer (`dist/viewer`): `build_keyboard.test.ts` (OT.R29, the keyboard,
 * the mouse, the match hook) and `launchSettingsEntry.test.ts` (PTT-9, the launch settings sheet) read the built
 * bundle through it, and run their "the built viewer carries none of it" checks only on a build of THIS tree.
 *
 * Web sprint 37's close review pass 2 (2026-10-09) found both checks ran on any `dist/viewer` with the setup page's
 * markers, so a stale build from another tree (the lane's carried sprint 36's `46294a0bb`) passed them vacuously; a
 * bundle now counts as built only when it also carries this tree's short HEAD, clean.
 *
 * The bundle's revision is what `../vite.config.ts` `gitRevision` writes into `__VIEWER_REV__` (`git rev-parse --short
 * HEAD` from `socomlegacy/`, with `-dirty` when anything under `socomlegacy/` differs from it, `unknown` without git); the
 * minified bundle inlines `src/revision.ts` `viewerRevision`'s `revisionLabel(rev, stamp)` as a call with the two
 * strings side by side (`"46294a0bb","2026-10-09 10:09:48"`), which is how it is read here. HEAD is read with the
 * same command from the same directory, so the two hashes have the same length. A bundle whose revision is another,
 * dirty, `unknown` or unread is a skip that says so in its name -- a skip, never a pass.
 */

/** `socomlegacy/`, the directory `vite.config.ts` asks git from. */
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');   // not `new URL`: jsdom's is not node's

/** The viewer's build directory in this tree. */
export const VIEWER_DIST = join(webRoot, 'dist', 'viewer');

/**
 * The setup page's entry's refusal line (`src/pageEntry.ts` `offerDisc`: "failed while reading ...") and the test
 * room's body class (`test-room`, which the same entry sets for `/testroom` and the test room's modules read): in every
 * build of it. CX-9b: the setup page's "Disc loaded" badge, the first marker until then, went with `src/startup.ts`'s
 * `Startup`; and with it the bindings dialog's "must stay bound" refusal left every build (its source line stays in
 * `src/controllerInput.ts`, but nothing a page loads imports the refusal since), so from CX-9b to NB-4's fix round
 * (2026-10-12, the nightly's first real run) every release check skipped on every build. Exported for
 * `./builtDist.test.ts`, which holds each marker to a code line of `src/**` (CX-9b review, note 4) and, on a build of
 * this tree, to the built bundle itself: a marker the build no longer carries is a failure there, never a silent skip.
 */
export const SETUP_PAGE_MARKERS = ['failed while reading ', 'test-room'] as const;

/** `revisionLabel("<rev>","YYYY-MM-DD HH:MM:SS")` as the minifier leaves it: the revision, then the build stamp. */
const REVISION_BESIDE_STAMP = /"([0-9a-f]{4,40}(?:-dirty)?|unknown)","\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"/;

export interface BuiltDist {
  /** Every `assets/*.js`, joined ('' with no build). */
  js: string;
  /** The setup page's markers present AND the bundle's revision this tree's HEAD, clean. */
  built: boolean;
  /** The revision the bundle carries, or null when none could be read. */
  buildRev: string | null;
  /** This tree's short HEAD, or null when git cannot say. */
  treeRev: string | null;
  /** Why it is not a build of this tree ('' when it is). */
  why: string;
}

/** The revision a bundle carries (`revisionLabel(rev, stamp)` as the minifier leaves it), or null when none reads. */
export function bundleRevision(js: string): string | null {
  return REVISION_BESIDE_STAMP.exec(js)?.[1] ?? null;
}

/**
 * The revision a build carries: the PWA shell's `version.json` (`{"release":"<rev>"}`, written from the same
 * `gitRevision()` as `__VIEWER_REV__`, PWA-1), else the bundle's literal beside the stamp. Since #353 the minifier makes the
 * revision a function's return, no longer beside the stamp, so the bundle alone read as "unread" and every check skipped.
 */
export function distRevision(dist: string, js: string): string | null {
  try {
    const release = (JSON.parse(readFileSync(join(dist, 'version.json'), 'utf-8')) as { release?: unknown }).release;
    if (typeof release === 'string' && release !== '') return release;
  } catch { /* no version.json: an older build */ }
  return bundleRevision(js);
}

/** This tree's short HEAD, as `vite.config.ts` reads it; null without git. */
export function treeRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: webRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

/** The built viewer at `dist` (a `dist/viewer` directory), and whether it is a build of this tree. */
export function readBuiltDist(dist: string): BuiltDist {
  const assets = join(dist, 'assets');
  const js = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf-8')).join('\n') : '';
  const treeRev = treeRevision();
  if (!SETUP_PAGE_MARKERS.every((m) => js.includes(m))) {
    return { js, built: false, buildRev: null, treeRev, why: 'no build of the setup page in dist/viewer' };
  }
  const buildRev = distRevision(dist, js);
  const built = treeRev !== null && buildRev === treeRev;
  return { js, built, buildRev, treeRev, why: built ? '' : `not built from this tree: the build's revision ${buildRev ?? 'unread'}, the tree's ${treeRev ?? 'unknown'}` };
}

/** A release check's `describe` name: as written on a build of this tree, else the skip's reason after it. */
export function builtTitle(title: string, d: BuiltDist): string {
  return d.built ? title : `${title} -- skipped: ${d.why}`;
}
