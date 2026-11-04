// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONSOLE_KEYS, liveOptions } from '../../src/console/adapters/options';
import type { LauncherState } from '../../src/modern/launcherState';

/**
 * LR-13, item D (LR.R16 (5), the owner, 2026-10-26T18:40Z: "Interface size and Scanline overlay move to Appearance:
 * approved"): the two launcher rows leave App for Appearance, after the launcher's sounds; their keys
 * (`s2u.console.v1.uiscale`, `.scan`) and defaults (100 %, Off) unchanged, as LR-5's moves kept theirs. A browser
 * adaptation: the launcher's look, nothing of the game.
 */
beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

const launcher = (): LauncherState => ({ disc: () => 'empty', isoInserted: () => false, filename: () => null, assets: () => null, onChange: () => () => {} });
const live = () => liveOptions(() => {}, { launcher: launcher(), signedIn: () => false, pads: () => [], touch: () => false });
const tab = (o: ReturnType<typeof live>, id: string) => o.categories().find((c) => c.id === id)!.rows;

describe('LR-13 D: Interface size and Scanline overlay in Appearance', () => {
  it('App no longer lists them; Appearance does, after the launcher\'s sound volume', () => {
    const o = live();
    expect(tab(o, 'app').map((r) => r.id)).not.toContain('uiscale');
    expect(tab(o, 'app').map((r) => r.id)).not.toContain('scan');
    const ids = tab(o, 'appearance').map((r) => r.id);
    expect(ids.slice(ids.indexOf('soundVolume'))).toEqual(['soundVolume', 'uiscale', 'scan']);
  });

  it('their words, values, keys and defaults are unchanged', () => {
    const o = live();
    const rows = tab(o, 'appearance');
    const ui = rows.find((r) => r.id === 'uiscale')!;
    const scan = rows.find((r) => r.id === 'scan')!;
    expect([ui.label, ui.values, ui.def]).toEqual(['Interface size', ['100%', '115%', '130%'], 0]);
    expect([scan.label, scan.values, scan.def]).toEqual(['Scanline overlay', ['Off', 'On'], 0]);
    o.set('uiscale', 2);
    o.set('scan', 1);
    expect(localStorage.getItem(CONSOLE_KEYS.uiscale)).toBe('2');
    expect(localStorage.getItem(CONSOLE_KEYS.scan)).toBe('1');
    expect([o.value('uiscale'), o.value('scan')]).toEqual([2, 1]);
  });
});
