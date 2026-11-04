// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveDisc, type LiveDisc } from '../../src/console/adapters/disc';
import { publishDiscImage } from '../../src/modern/discImage';
import { publishDisc, type DiscStoreState } from '../../src/modern/discStore';
import { launcherState } from '../../src/modern/launcherState';

/**
 * MU2-7 (MU.R4, CX.R5): the launch gate, against the console's. The console's START (`src/console/state.ts`
 * `startReady`: its disc adapter `ready` and a supported input, `src/console/adapters/controls.ts`) is the page's one
 * START; it launches into a room -- `Launch · <room>` (`startLabel`) -- only signed in (`selectedRoom` holds no target
 * signed out). The modern UI's Launch (`src/modern/launch/launch.ts` `createLaunch`; called by no served page today, the
 * inventory's S) is MU.R4's: live only signed in with the disc in, and START itself able to run. So over every
 * combination of the session, the disc store and the input, the modern Launch is live exactly when the console's START
 * is and the console could name a room target -- both reading the same store (`src/modern/discStore.ts`). `in-game` is
 * published only by a hand-over (`src/console/adapters/launch.ts` after `page.suspend()`, `src/pageEntry.ts` `offerDisc`'s
 * `go`), when the console's START is past `idle` and its page down; the modern Launch says "The game has the window".
 * Neither launches anything but through its page's own seam: the modern UI holds no mount of the front end (a scan).
 * CX-25: the modern Launch (`createLaunch`) is retired with the modern shell, so the gate's matrix against it went with
 * it; the disc half (the one store both read) and the scan stay.
 */
const DISCS: DiscStoreState[] = ['empty', 'reading', 'ready', 'error', 'in-game'];


let disc: LiveDisc | null = null;
beforeEach(() => {
  document.body.innerHTML = '';
  publishDiscImage(document, { list: async () => [], read: async (p) => { throw new Error(`no ${p}`); } });
});
afterEach(() => { disc?.dispose(); disc = null; publishDiscImage(document, null); publishDisc(document, { state: 'empty', filename: null }); });

describe('the launch gate against the console\'s START (MU2-7)', () => {

  it('the disc half alone is the console\'s: the disc counts as in for START exactly when the console\'s adapter says ready', () => {
    disc = liveDisc(document, () => {});
    for (const d of DISCS) {
      publishDisc(document, { state: d, filename: 'socom2.iso' });
      expect(launcherState(document).isoInserted(), d).toBe(disc.state() === 'ready');
    }
  });
});

describe('the modern UI launches nothing of its own (MU2-7)', () => {
  const src = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/modern');
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) ? [p] : [];
  });
  it('no module under src/modern mounts the front end, opens a disc or runs the console\'s hand-over', () => {
    const hits: string[] = [];
    for (const p of files(src)) {
      const code = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/mountFrontEnd|openFrontEnd(Disc|Image)|bootPage|liveLaunch|from '(\.\.\/)+frontEnd'|from '(\.\.\/)+pageEntry'|adapters\/launch'/.test(code)) hits.push(relative(src, p));
    }
    expect(hits).toEqual([]);
  });
});
