import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EPH_PAD, PAD_PROFILE_PRONE, PAD_PROFILE_CROUCH, SETUP_KEY, STANCE_MODE_KEY, defaultPadProfile, ephPadInitScript,
  padProfileKey, pageSeed, XBOX_PAD, pageSeedFor,
} from '../eph/pageSeed';
import { CROUCH_BUTTON, PRONE_BUTTON } from '../eph/pageMap';

/**
 * The page's seeded settings (EPH-2 step 2; the design note's "Setting up the same bindings"): the stance mode SEPARATE
 * and the pad profile with Prone on Triangle's physical button and Crouch on L3. The keys and the default profile are
 * restated from the viewer's sources, and held to them here.
 */
const VIEWER = resolve(import.meta.dirname, '../../packages/viewer/src');
const startup = readFileSync(resolve(VIEWER, 'startupSettings.ts'), 'utf8');
const controllerInput = readFileSync(resolve(VIEWER, 'controllerInput.ts'), 'utf8');

describe('the restated viewer keys', () => {
  it('match startupSettings.ts', () => {
    expect(startup).toContain(`export const SETUP_KEY = '${SETUP_KEY}';`);
    expect(startup).toContain(`export const STANCE_MODE_KEY = '${STANCE_MODE_KEY}';`);
  });

  it('build the profile key as controllerInput.ts profileKey does', () => {
    expect(controllerInput).toContain('const profileKey = (pad: PadLike): string => `${SETUP_KEY}.pad.${JSON.stringify([pad.id, pad.mapping, pad.buttons.length, pad.axes.length])}`;');
    expect(padProfileKey({ id: 'P', mapping: 'standard', buttons: 17, axes: 4 })).toBe('s2u.startup.v1.pad.["P","standard",17,4]');
  });

  it('restate defaultController', () => {
    expect(startup).toContain("export const defaultController = (): ControllerConfig => ({ version: 1, bindings: Array.from({ length: 16 }, (_, i) => i), deadZone: 0.15, crouch: -1, prone: -1 });");
    expect(defaultPadProfile()).toEqual({ version: 1, bindings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], deadZone: 0.15, crouch: -1, prone: -1 });
  });
});

describe('pageSeed', () => {
  it('seeds the stance mode separate and the profile with Prone on Triangle (3) and Crouch on L3 (10)', () => {
    expect(PAD_PROFILE_PRONE).toBe(3);
    expect(PAD_PROFILE_CROUCH).toBe(10);
    expect(PAD_PROFILE_PRONE).toBe(PRONE_BUTTON);
    expect(PAD_PROFILE_CROUCH).toBe(CROUCH_BUTTON);
    const seed = pageSeed();
    expect(Object.keys(seed).sort()).toEqual([STANCE_MODE_KEY, padProfileKey(EPH_PAD)].sort());
    expect(seed[STANCE_MODE_KEY]).toBe('separate');
    expect(JSON.parse(seed[padProfileKey(EPH_PAD)]!)).toEqual({ ...defaultPadProfile(), prone: 3, crouch: 10 });
  });

  it('keys the profile to the stub pad: standard mapping, 17 buttons, 4 axes', () => {
    expect(EPH_PAD.mapping).toBe('standard');
    expect(EPH_PAD.buttons).toBe(17);
    expect(EPH_PAD.axes).toBe(4);
    expect(padProfileKey(EPH_PAD)).toBe(`s2u.startup.v1.pad.${JSON.stringify([EPH_PAD.id, 'standard', 17, 4])}`);
  });
});

describe('ephPadInitScript', () => {
  type Pad = { id: string; index: number; connected: boolean; mapping: string; axes: number[]; buttons: { pressed: boolean; value: number }[] };
  type Listener = { type: string; fn: (e: unknown) => void; capture: unknown };
  /** A fake page global: storage, a navigator, and window listeners kept in the order they were added. */
  const fakeGlobal = (navigator: Record<string, unknown> = {}) => {
    const store = new Map<string, string>();
    const listeners: Listener[] = [];
    const g: Record<string, unknown> = {
      localStorage: { setItem: (k: string, v: string) => { store.set(k, v); } },
      navigator,
      addEventListener: (type: string, fn: (e: unknown) => void, capture: unknown) => { listeners.push({ type, fn, capture }); },
    };
    return { store, listeners, g };
  };
  const run = (seed: Record<string, string>) => {
    const f = fakeGlobal();
    // The script is the init script's text; it runs against the page's globals, here a fake one.
    new Function('globalThis', ephPadInitScript(seed))(f.g);
    return f;
  };

  it('writes the seed into localStorage before the page reads it', () => {
    const { store } = run(pageSeed());
    expect(Object.fromEntries(store)).toEqual(pageSeed());
  });

  it('stubs getGamepads with one standard pad the runner sets by index', () => {
    const { g } = run({});
    const nav = g.navigator as { getGamepads(): Pad[] };
    const pads = nav.getGamepads();
    expect(pads).toHaveLength(1);
    expect(pads[0]).toMatchObject({ id: EPH_PAD.id, index: 0, connected: true, mapping: 'standard' });
    expect(pads[0]!.buttons).toHaveLength(17);
    expect(pads[0]!.axes).toEqual([0, 0, 0, 0]);
    const set = g.__ephPadSet as (kind: 'button' | 'axis', index: number, pressed: boolean, value: number) => void;
    set('button', 3, true, 1);
    set('axis', 1, false, -0.5);
    const after = nav.getGamepads()[0]!;
    expect(after.buttons[3]).toEqual({ pressed: true, value: 1 });
    expect(after.axes[1]).toBe(-0.5);
    expect(pads[0]!.buttons[3]).toEqual({ pressed: false, value: 0 });
  });

  it('__ephPadWrite applies a whole write at once and answers the walk tick it was applied after (hunt D4, M5)', () => {
    const { g } = fakeGlobal({ getGamepads: () => [] });
    let tick = 1028;
    (g as Record<string, unknown>).__viewer = { ephFrame: () => ({ tick }) };
    new Function('globalThis', ephPadInitScript({}))(g);
    const nav = g.navigator as { getGamepads(): Pad[] };
    const write = g.__ephPadWrite as (list: [string, number, boolean, number][]) => number | null;
    expect(write([['axis', 0, false, 1], ['button', 2, true, 1]])).toBe(1028);
    const pad = nav.getGamepads()[0]!;
    expect(pad.axes[0]).toBe(1);
    expect(pad.buttons[2]).toEqual({ pressed: true, value: 1 });
    tick = 1030;
    expect(write([['axis', 0, false, 0]])).toBe(1030);
    (g as Record<string, unknown>).__viewer = undefined;
    expect(write([['axis', 0, false, -1]])).toBeNull();
  });

  it('hides a physical pad from the page and keeps it for the harness as __ephRealPads', () => {
    const physical = { id: 'Xbox pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: [{ pressed: true, value: 1 }] };
    const { g } = fakeGlobal({ getGamepads: () => [physical, null] });
    new Function('globalThis', ephPadInitScript({}))(g);
    const pads = (g.navigator as { getGamepads(): Pad[] }).getGamepads();
    expect(pads.map((p) => p.id)).toEqual([EPH_PAD.id]);
    expect((g.__ephRealPads as () => unknown[])()).toEqual([physical]);
  });

  it('stops the physical pad connect and disconnect events in the capture phase, before the page PadWatch sees them', () => {
    // packages/viewer/src/gamepad.ts PadWatch listens for both on the window and drops the stub on a disconnect.
    const { listeners } = run({});
    const types = ['gamepadconnected', 'gamepaddisconnected'];
    expect(listeners.map((l) => l.type)).toEqual(types);
    for (const l of listeners) {
      expect(l.capture, l.type).toBe(true);
      let stopped = 0;
      l.fn({ type: l.type, stopImmediatePropagation: () => { stopped++; } });
      expect(stopped, l.type).toBe(1);
    }
  });
});

/**
 * The owner's own setup (2026-11-01, via 5d, corrected): an Xbox pad, SEPARATE, Crouch on L3, Prone on Triangle. `--pad xbox`
 * makes the stub report the id Chrome gives a wired Xbox 360 pad and seeds his profile (Crouch L3 = 10, Prone
 * Triangle = 3; corrected from R3 by the owner) and his stored SEPARATE.
 */
describe('the xbox pad option (the owner setup)', () => {
  it('identifies as Chrome reports an Xbox 360 pad, profile Crouch R3 / Prone Triangle, his stored SEPARATE', () => {
    // The page's own detection default (controllerInput.ts applyPressureDefault) runs only for a pressure pad at the
    // front end's console frame; the test room alone reads an unset mode as COMBINED (startupSettings.ts:65). The
    // owner's SEPARATE is a stored setting, so it is seeded as stored (the first xbox run without it played COMBINED).
    expect(XBOX_PAD).toEqual({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping: 'standard', buttons: 17, axes: 4 });
    const seed = pageSeedFor('xbox');
    expect(Object.keys(seed).sort()).toEqual([padProfileKey(XBOX_PAD), STANCE_MODE_KEY].sort());
    expect(seed[STANCE_MODE_KEY]).toBe('separate');
    expect(JSON.parse(seed[padProfileKey(XBOX_PAD)]!)).toMatchObject({ crouch: 10, prone: 3 });
    expect(pageSeedFor('stub')).toEqual(pageSeed());
  });
});
