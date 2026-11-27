import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as menu from '../src/startMenu';
import * as reg from '../src/startMenuLauncher';

/**
 * WM-LAUNCHER (F-WML-5; product track, a **browser adaptation**): the per-document launcher registry the page offers the
 * round's START menu lives in its own dependency-free module (`../src/startMenuLauncher`); the page and the launch
 * adapter reach it without naming the START menu. It saves no load today (F-WML-5b): `./pageEntry` already loads
 * `./frontEnd`, which imports `./startMenu`, at boot. The START menu re-exports it: one registry, one identity.
 */
const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('WM-LAUNCHER: the launcher registry loads without the START menu', () => {
  it('the registry module imports nothing', () => {
    expect(src('startMenuLauncher.ts')).not.toMatch(/^\s*import\b|\bimport\(/m);
  });

  it('the page and the launch adapter load the registry, never the START menu', () => {
    expect(src('pageEntry.ts')).not.toMatch(/import\(['"]\.\/startMenu['"]\)|from ['"]\.\/startMenu['"]/);
    expect(src('pageEntry.ts')).toMatch(/import\('\.\/startMenuLauncher'\)/);
    expect(src('console/adapters/launch.ts')).not.toMatch(/import\(['"]\.\.\/\.\.\/startMenu['"]\)|from ['"]\.\.\/\.\.\/startMenu['"]/);
    expect(src('console/adapters/launch.ts')).toMatch(/import\('\.\.\/\.\.\/startMenuLauncher'\)/);
  });

  // F-WML-6: both modules imported at the file's head (collection time), not inside the test under its 5 s timeout.
  it('the START menu re-exports the one registry', () => {
    expect(menu.offerStartMenuLauncher).toBe(reg.offerStartMenuLauncher);
    expect(menu.startMenuLauncher).toBe(reg.startMenuLauncher);
  });
});
