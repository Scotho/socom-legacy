// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishDisc, readDisc } from '../../src/modern/discStore';
import { launcherState } from '../../src/modern/launcherState';
import { fakeLauncher, fakeSession, settle } from './lobbies/fixtures';

/**
 * OV-1 of the modern-UI plan (`docs/plans/briefs/modern-ui-live-site-scope.md` 4.1; rulings MU.R23 (4), MU.R24): the
 * launcher's sections mount into any host from a `LauncherContext`, with no read of the setup page's DOM, so they can
 * later mount as an in-game overlay without the start-only parts. A browser adaptation (MU.R1): nothing of the
 * original's screens, flow or wire is touched; the setup page's own behaviour is held by its own tests.
 * CX-9b (CX.R8): the setup page and its launcher frame are gone with the old layout, and with them the cases that drove
 * them (the setup mode's adoption of the page's panels, `Startup`'s publishing, the launcher's teardown at START).
 * CX-25: the sections themselves (`mountSections`: Home, Play online's news, Server, Settings, Replays) are retired with
 * the modern shell -- the overlay draws the console (OT.R60 (c)) -- so the cases that mounted them went too; the disc
 * store's read and the source scans stay.
 */
vi.mock('../../src/touch', () => ({ touchDevice: vi.fn(() => false) }));

const here = dirname(fileURLToPath(import.meta.url));
const MODERN = resolve(here, '../../src/modern');


describe('the stores: the disc, published by the setup page (brief 4.1; MU2-8: the device store went, Home reads the pad adapter of the console)', () => {
  beforeEach(() => {
    document.body.innerHTML = readFileSync(resolve(here, '../../setup/index.html'), 'utf8');
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
  });
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; publishDisc(document, { state: 'empty', filename: null }); });

  it('launcherState reads the store, with no setup DOM behind it', () => {
    document.body.innerHTML = '';
    const state = launcherState(document);
    const seen: string[] = [];
    const off = state.onChange((s) => seen.push(s.disc));
    publishDisc(document, { state: 'reading', filename: 'x.iso' });
    publishDisc(document, { state: 'ready', filename: 'x.iso' });
    expect(state.disc()).toBe('ready');
    expect(state.isoInserted()).toBe(true);
    expect(state.filename()).toBe('x.iso');
    publishDisc(document, { state: 'in-game', filename: 'x.iso' });
    expect(state.disc()).toBe('in-game');
    expect(state.isoInserted()).toBe(true);           // MU2-7 (CX.R5): the disc is still in, as the console reads it
    expect(seen).toEqual(['reading', 'ready', 'in-game']);
    off();
  });

});

describe('the source: src/modern names the setup page only in its two adapters', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|css)$/.test(f) ? [p] : [];
  });
  const SETUP = /#disc-page|['"#]disc-page['"]|#startup-|['"]startup-[a-z-]+['"]|\.startup-[a-z]/;
  const codeOf = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  /** `text` with the named top-level functions cut out (each from `export function NAME` to its closing `}` at column 0). */
  const without = (text: string, names: string[]): string => names.reduce((t, name) => {
    const at = t.indexOf(`export function ${name}(`);
    expect(at, name).toBeGreaterThanOrEqual(0);
    const end = t.indexOf('\n}\n', at);
    expect(end, name).toBeGreaterThan(at);
    return t.slice(0, at) + t.slice(end + 3);
  }, text);
  // LU-3: Settings > This browser adopts the setup page's own panels in the setup mode (`settings/browser.ts`).
  // CX-9b: `launcher.ts`'s `mountFrame` went with the old layout.
  // CX-13: the last setup adapters went -- `launch.ts`'s `mountLaunchBar` and `pageStart`, `settings/browser.ts`'s
  // `adoptSetupPanels` -- so no file under src/modern names the setup page's DOM at all.
  const ADAPTERS: Record<string, string[]> = {};
  it('#disc-page and #startup-* in no file under src/modern (CX-13: no setup adapter is left)', () => {
    const named = files(MODERN).filter((p) => {
      const rel = relative(MODERN, p).replace(/\\/g, '/');
      const code = codeOf(readFileSync(p, 'utf8'));
      return SETUP.test(ADAPTERS[rel] ? without(code, ADAPTERS[rel]!) : code);
    }).map((p) => relative(MODERN, p).replace(/\\/g, '/'));
    expect(named).toEqual([]);
    // The scan finds what it is meant to: the setup page's own START id, in a line of code.
    expect(SETUP.test(codeOf("doc.getElementById('startup-start')"))).toBe(true);
  });
  it('no file under src/modern clicks the shell\'s Sign in', () => {
    const named = files(MODERN).filter((p) => /data-action="sign-in"/.test(readFileSync(p, 'utf8'))).map((p) => relative(MODERN, p).replace(/\\/g, '/'));
    expect(named).toEqual([]);
  });
});
