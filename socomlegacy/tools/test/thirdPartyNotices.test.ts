/**
 * Every runtime dependency the web ships has a row in the repository's THIRD_PARTY_NOTICES.md: a `dependencies` entry
 * of a tracked package.json of the web tree that is not the workspace's own (`@s2u/*`) -- three in the redotcom viewer,
 * ws in its match server. Ported from the desktop tree's `tools_py/tests/test_third_party_notices.py`
 * (`test_every_web_runtime_dependency_has_a_row`, 69595bf5) when that tree left (the repo restructure, Phase B step 6).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const REDOTCOM = resolve(import.meta.dirname, '..', '..');
const WORKSPACE = resolve(REDOTCOM, '..');
const git = (args: string[], cwd: string): string => execFileSync('git', args, { cwd, encoding: 'utf8' });
const REPO = resolve(git(['rev-parse', '--show-toplevel'], REDOTCOM).trim());
const posix = (p: string): string => relative(REPO, p).split(sep).join('/');

/** A notices Component cell -> the names it credits: a parenthetical is a description, `a, b` is two names. */
const componentNames = (cell: string): string[] => cell.replace(/\s*\([^)]*\)/g, '').split(',')
  .map((part) => part.trim().replace(/^the |\s+fork$/, '').toLowerCase()).filter(Boolean);

const notices = readFileSync(resolve(REPO, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const names = new Set(notices.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
  .flatMap((l) => componentNames(l.split('|')[1] ?? '')));

const manifests = git(['ls-files', '--', `${posix(WORKSPACE) || '.'}/package.json`,
  ...['socomlegacy', 'shared'].map((d) => `${posix(resolve(WORKSPACE, d))}/**/package.json`)], REPO)
  .split('\n').filter(Boolean);
const deps = new Set(manifests.flatMap((m) => Object.keys(
  (JSON.parse(readFileSync(resolve(REPO, m), 'utf8')) as { dependencies?: Record<string, string> }).dependencies ?? {},
)).filter((d) => !d.startsWith('@s2u/')));

describe('THIRD_PARTY_NOTICES.md covers the web', () => {
  it('reads the web tree\'s manifests and finds three among their dependencies', () => {
    expect(manifests.length).toBeGreaterThan(3);
    expect(deps).toContain('three');
  });
  it.each([...deps].sort())('the web dependency %s has a row', (dep) => {
    expect(names, `web dependency ${dep}: no row in THIRD_PARTY_NOTICES.md`).toContain(dep.toLowerCase());
  });
});

/**
 * Artwork the viewer's bundle ships that is not a package has a row. LATER 380 (the owner's word, 2026-10-23: "the ps4
 * controller the socom2legacy-teaser had") brought the DUALSHOCK 4 line art back as the button mapping screen's drawing,
 * through one importer (`src/console/render/padArt.ts`, one swappable asset, H313), with its row and its notice (shipped
 * as `licenses/sony-controller.txt`, `sonyNotice.ts`). What follows is how it stood before. The one such artwork, the DUALSHOCK 4 line art of
 * the Controller settings (`packages/viewer/src/assets/sony/dualshock4.svg`), shipped through its one importer, the
 * setup page's Controller view (`startupSettingsView.ts`; `controllerSetup.ts` until CX-9b); CX-26 (the console plan)
 * retired both, so the build carries no Sony artwork and its row is gone; Sony's notice text went with it (the owner,
 * 2026-10-18: "yeah sure, remove if we're not using it"). Held both ways: no source imports an asset of
 * `src/assets/sony/`, and no row credits one; a drawing brought back takes its row back with it -- and no CSS, HTML or
 * source that ships names Sony controller art at all (the CX-26 review's F4).
 */
describe('THIRD_PARTY_NOTICES.md covers the shipped artwork', () => {
  it('CX-26 review F4, LATER 380: Sony controller art is named by one source only (padArt.ts) -- no CSS url(), HTML img or link', () => {
    const viewer = resolve(REDOTCOM, 'packages', 'viewer');
    const walkAll = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.') ? []
        : e.isDirectory() ? walkAll(resolve(d, e.name)) : /\.(?:ts|css|html)$/.test(e.name) ? [resolve(d, e.name)] : []);
    const files = [...walkAll(resolve(viewer, 'src')), ...walkAll(resolve(REDOTCOM, '..', 'shared'))];
    for (const e of readdirSync(viewer, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.html')) files.push(resolve(viewer, e.name));
      if (e.isDirectory() && existsSync(resolve(viewer, e.name, 'index.html'))) files.push(resolve(viewer, e.name, 'index.html'));
    }
    expect(files.length).toBeGreaterThan(100);
    const art = /assets\/sony\/|(?:dualshock|ds4)[^'"\s)]*\.(?:svg|png|jpe?g|webp|gif)/i;
    expect(files.filter((f) => art.test(readFileSync(f, 'utf8'))).map(posix)).toEqual(['socomlegacy/packages/viewer/src/console/render/padArt.ts']);
  });

  it('LATER 380: the one Sony drawing ships through padArt.ts alone, its row credits it, and its notice is beside it', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(d, e.name)) : /\.ts$/.test(e.name) ? [resolve(d, e.name)] : []));
    const sources = walk(resolve(REDOTCOM, 'packages', 'viewer', 'src'));
    expect(sources.length).toBeGreaterThan(100);
    const importers = sources.filter((f) => /(?:from|import)\s*\(?\s*['"][^'"]*assets\/sony\//.test(readFileSync(f, 'utf8'))).map(posix);
    expect(importers).toEqual(['socomlegacy/packages/viewer/src/console/render/padArt.ts']);
    const row = notices.split(/\r?\n/).find((l) => l.startsWith('| DUALSHOCK 4'));
    expect(row).toMatch(/padArt\.ts/);
    expect(row).toMatch(/not GPL/);
    expect(existsSync(resolve(REDOTCOM, 'packages', 'viewer', 'src', 'assets', 'sony', 'NOTICE.txt'))).toBe(true);
    expect(existsSync(resolve(REDOTCOM, 'packages', 'viewer', 'sonyNotice.ts'))).toBe(true);
  });
});

/**
 * CX-53 (CX.R19): the launcher's sounds were Kenney's *Interface Sounds* (CC0 1.0), credited here; the owner's second
 * word (2026-10-20, in the merge controller's seat: "the sound effect pack doesn't match. please select something else
 * more subtle and or socom-like") retired the pack -- the launcher plays the original's own menu sounds off the player's
 * disc -- so the build ships no sound of its own: no pack folder, no row, and no CC0-1.0 text (no row's licence names it).
 */
describe("the launcher ships no sound pack (CX.R19's second word)", () => {
  it('no shared/sounds/kenney-interface, no Kenney row, no LICENSES/CC0-1.0.txt', () => {
    expect(existsSync(resolve(WORKSPACE, 'shared', 'sounds', 'kenney-interface'))).toBe(false);
    expect(notices).not.toMatch(/^\| Interface Sounds \(Kenney\)/m);
    expect(existsSync(resolve(WORKSPACE, 'LICENSES', 'CC0-1.0.txt'))).toBe(false);
  });
});

