import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fmvPlugin, OWNER_MOVIE_EXCEPTION } from '../fmvShip';

/**
 * `s2u:fmv`'s output check over a fake build output. The owner's OT.R34 exception to MISSION R3 is exactly
 * `startup/menuloop.mp4`; any other movie fails the build. Since CX-13 no build emits that file (the backdrop media
 * pipeline that copied it is gone; no page has read it since CX-9b), but the exception stands as the owner's word, and
 * the check keeps it at exactly that path: the files are put into the output here, as the removed plugin emitted them.
 */
function build(extra: Record<string, string> = {}, captures = false): { outDir: string; run: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'startup-fmv-'));
  const outDir = join(root, 'dist');
  mkdirSync(outDir, { recursive: true });
  const put = (rel: string, body: string): void => { mkdirSync(dirname(join(outDir, rel)), { recursive: true }); writeFileSync(join(outDir, rel), body); };
  for (const n of ['menuloop.mp4', 'menu-poster.jpg', ...(captures ? ['modern.jpg', 'ps2.jpg'] : [])]) put(`startup/${n}`, 'x');
  for (const [rel, body] of Object.entries(extra)) put(rel, body);
  const fmv = fmvPlugin(join(root, 'no-wasm')) as unknown as { configResolved(c: { build: { outDir: string } }): void; closeBundle(): void };
  fmv.configResolved({ build: { outDir } });
  return { outDir, run: () => fmv.closeBundle() };
}

describe('the movie check over the startup media (OT.R34)', () => {
  it('names the exemption: exactly startup/menuloop.mp4', () => {
    expect(OWNER_MOVIE_EXCEPTION).toBe('startup/menuloop.mp4');
  });
  it('passes with menuloop.mp4 at its path (with and without the captures)', () => {
    expect(build().run).not.toThrow();
    expect(build({}, true).run).not.toThrow();
  });
  it('fails on another .mp4 beside it', () => {
    expect(build({ 'startup/other.mp4': 'x' }).run).toThrow(/startup\/other\.mp4/);
    expect(build({ 'assets/intro.mp4': 'x' }).run).toThrow(/assets\/intro\.mp4/);
  });
  it('fails on a menuloop.mp4 under any other path', () => {
    expect(build({ 'menuloop.mp4': 'x' }).run).toThrow(/menuloop\.mp4/);
    expect(build({ 'assets/startup/menuloop.mp4': 'x' }).run).toThrow(/assets\/startup\/menuloop\.mp4/);
  });
  it('fails on another movie type under startup/', () => {
    expect(build({ 'startup/menuloop.webm': 'x' }).run).toThrow(/menuloop\.webm/);
  });
});
