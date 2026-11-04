import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { COMMON_ARCHIVES } from '@s2u/archive';
import { buildIso } from '../../packages/archive/test/isoImage';
import { discDirRefusal, materializeIso, materializeMain, REPO_ROOT } from '../materialize-iso';

/**
 * The ISO is laid out with the repository's reader (a synthetic image: no game data). A real disc's
 * `index.json` is extract-maps' job and is not claimed here.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 's2u-iso-'));
  dirs.push(dir);
  return dir;
};

describe('materializeIso', () => {
  it('refuses a missing common archive before it writes', async () => {
    const dir = temp();
    const iso = join(dir, 'disc.iso');
    const disc = join(dir, 'tree');
    writeFileSync(iso, buildIso([{ path: 'RUN/MP2.ZDB', bytes: new Uint8Array([1, 2, 3, 4]) }]));
    const result = await materializeIso(iso, disc, { streams: false, campaign: false });
    expect(result.missingCommon.length).toBeGreaterThan(0);
    expect(result.written).toBe(0);
    expect(result.kept).toBe(0);
  });

  it('writes the plan\'s files from the image, and keeps them on a second run', async () => {
    const dir = temp();
    const iso = join(dir, 'disc.iso');
    const disc = join(dir, 'tree');
    const mp2 = new Uint8Array([9, 8, 7, 6, 5]);
    const members = [
      { path: 'RUN/MP2.ZDB', bytes: mp2 },
      ...COMMON_ARCHIVES.map((path, i) => ({ path, bytes: new Uint8Array([i + 1]) })),
    ];
    writeFileSync(iso, buildIso(members));
    const first = await materializeIso(iso, disc, { streams: false, campaign: false });
    expect(first.missingCommon).toEqual([]);
    expect(first.written).toBeGreaterThan(0);
    expect(readFileSync(join(disc, 'RUN', 'MP2.ZDB'))).toEqual(Buffer.from(mp2));
    const second = await materializeIso(iso, disc, { streams: false, campaign: false });
    expect(second.written).toBe(0);
    expect(second.kept).toBe(first.written);
  });

  it('rewrites a file of the same length whose bytes differ', async () => {
    const dir = temp();
    const iso = join(dir, 'disc.iso');
    const disc = join(dir, 'tree');
    const mp2 = new Uint8Array([9, 8, 7, 6, 5]);
    const members = [
      { path: 'RUN/MP2.ZDB', bytes: mp2 },
      ...COMMON_ARCHIVES.map((path, i) => ({ path, bytes: new Uint8Array([i + 1]) })),
    ];
    writeFileSync(iso, buildIso(members));
    const first = await materializeIso(iso, disc, { streams: false, campaign: false });
    const dest = join(disc, 'RUN', 'MP2.ZDB');
    writeFileSync(dest, Buffer.from([1, 1, 1, 1, 1]));
    const again = await materializeIso(iso, disc, { streams: false, campaign: false });
    expect(again.written).toBe(1);
    expect(again.kept).toBe(first.written - 1);
    expect(readFileSync(dest)).toEqual(Buffer.from(mp2));
  });
});

// RS.R8: nothing of the disc enters git. Inside the clone the layout goes only under the ignored socomlegacy/.disc;
// outside the clone it is the player's own directory. A typo that names public/, test-fixtures/ or the tree's root
// is refused before the image is opened.
describe('where materialize-iso may write', () => {
  it('allows socomlegacy/.disc and any directory outside the clone', () => {
    expect(discDirRefusal(join(REPO_ROOT, 'socomlegacy', '.disc'))).toBeNull();
    expect(discDirRefusal(join(REPO_ROOT, 'socomlegacy', '.disc', 'nested'))).toBeNull();
    expect(discDirRefusal(temp())).toBeNull();
  });

  it('refuses any other directory inside the clone', () => {
    for (const rel of [[], ['socomlegacy'], ['socomlegacy', 'public', 'maps'], ['socomlegacy', 'test-fixtures'], ['socomlegacy', '.disc-other']]) {
      expect(discDirRefusal(join(REPO_ROOT, ...rel)), rel.join('/')).toMatch(/socomlegacy\/\.disc/);
    }
  });

  it('the command refuses before it opens the image', async () => {
    const errors: string[] = [];
    const spy = (msg: unknown): void => { errors.push(String(msg)); };
    const original = console.error;
    console.error = spy;
    try {
      const code = await materializeMain(['--iso', join(temp(), 'absent.iso'), '--disc', join(REPO_ROOT, 'socomlegacy', 'test-fixtures')]);
      expect(code).toBe(2);
    } finally {
      console.error = original;
    }
    expect(errors.join(' ')).toMatch(/socomlegacy\/\.disc/);
  });

  // Review of the #326 port, F4: run on its own, the command fell back to SOCOM_DISC for its destination, and that
  // variable may name a tree outside the clone that is not this command's to write (the desktop's read-only disc
  // tree). The destination is now only ever --disc; SOCOM_DISC is never written to.
  it('requires --disc and never writes to SOCOM_DISC', async () => {
    const errors: string[] = [];
    const original = console.error;
    const before = process.env.SOCOM_DISC;
    console.error = (msg: unknown): void => { errors.push(String(msg)); };
    process.env.SOCOM_DISC = temp();
    try {
      const code = await materializeMain(['--iso', join(temp(), 'absent.iso')]);
      expect(code).toBe(2);
    } finally {
      console.error = original;
      if (before === undefined) delete process.env.SOCOM_DISC;
      else process.env.SOCOM_DISC = before;
    }
    expect(errors.join(' ')).toMatch(/--disc/);
    expect(errors.join(' ')).not.toMatch(/or SOCOM_ISO and SOCOM_DISC/);
  });
});
