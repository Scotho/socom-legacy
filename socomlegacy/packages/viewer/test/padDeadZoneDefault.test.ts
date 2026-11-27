// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControllerInput, calibrateStick } from '../src/controllerInput';
import { PAD_DEAD_ZONE, PAD_DEAD_ZONE_DEFAULT_ADAPTATION, padInput, padRaw, padStick } from '../src/gamepad';
import { SETUP_KEY, defaultController, parseController } from '../src/startupSettings';

/**
 * WM-PAD-DEADZONE (WM-52; product track, a browser adaptation's default; MISSION OT.R133). The owner, 2026-11-15, in
 * seat 8f's window, verbatim: "one little one to throw in the pile - set the stick drift default down to 5% after the
 * convo with sharky". The DEFAULT "Pad dead zone (this browser)" of a pad with nothing saved is 0.05
 * (`PAD_DEAD_ZONE_DEFAULT_ADAPTATION`); `PAD_DEAD_ZONE` stays 0.15 -- it is the adapter's and the touch stick's shaping
 * constant and the pivot of PZG's code (`calibrateStick`, `padMapInput`), which this task does not touch. WM.R20: a
 * saved profile carries its own dead zone and keeps it. jsdom; synthetic pads.
 */
type Device = { index: number; id: string; connected: boolean; mapping: string; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const device = (): Device => ({
  index: 0, id: 'Pad 0', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});
/** The profile key `ControllerInput` saves a pad's config under. */
const profile = (p: Device): string => `${SETUP_KEY}.pad.${JSON.stringify([p.id, p.mapping, p.buttons.length, p.axes.length])}`;
/** A profile as v0.4.22 saved it (its dead zone written out). */
const saved = (deadZone: number): string => JSON.stringify({ version: 1, bindings: Array.from({ length: 16 }, (_, i) => i), deadZone, crouch: -1, prone: -1 });

/** The raw left stick (x right, y down) through the reader of a pad whose stored profile is `stored` (null: nothing saved). */
function stages(rawX: number, rawY: number, stored: string | null) {
  localStorage.clear();
  const a = device();
  if (stored !== null) localStorage.setItem(profile(a), stored);
  const input = new ControllerInput();
  input.poll({ getGamepads: () => [a] });                   // the first poll loads the pad's profile
  a.axes = [rawX, rawY, 0, 0];
  const polled = input.poll({ getGamepads: () => [a] })!;
  const s2 = padInput(polled);
  return { zone: input.config.deadZone, s1: [polled.axes[0]!, polled.axes[1]!], s2: [s2.moveX, s2.moveY], moveZone: s2.moveZone, game: padRaw(s2.moveX, s2.moveY, s2.moveZone) };
}

const SWEEP = [0, 0.02, 0.04, 0.05, 0.06, 0.1, 0.149, 0.15, 0.151, 0.2, 0.3, 0.5, 0.75, 1];

beforeEach(() => { localStorage.clear(); });

describe("WM-PAD-DEADZONE: the default pad dead zone is 5 percent; the shaping constant stays 0.15", () => {
  it("the default is PAD_DEAD_ZONE_DEFAULT_ADAPTATION (0.05), the owner's ruling; PAD_DEAD_ZONE is still 0.15", () => {
    expect(PAD_DEAD_ZONE_DEFAULT_ADAPTATION).toBe(0.05);
    expect(defaultController().deadZone).toBe(PAD_DEAD_ZONE_DEFAULT_ADAPTATION);
    expect(PAD_DEAD_ZONE).toBe(0.15);
  });

  it("startupSettings loaded first leaves no import loop: controllerModern's stored key is built from SETUP_KEY", async () => {
    vi.resetModules();
    const startup = await import('../src/startupSettings');                               // first, as src/entry.ts reaches it
    const modern = await import('../src/controllerModern');
    expect(modern.COD_MODERN_CHOSEN_KEY.startsWith(`${startup.SETUP_KEY}.`)).toBe(true);
    expect(modern.COD_MODERN_CHOSEN_KEY).not.toContain('undefined');
    expect(readFileSync(resolve(import.meta.dirname, '../src/startupSettings.ts'), 'utf8')).not.toMatch(/from '\.\/gamepad'/);
  });

  it("WM.R20: a saved profile keeps its own dead zone -- a v0.4.22 profile at 0.15 reads back 0.15, any saved value its own", () => {
    for (const z of [0, 0.05, 0.1, 0.15, 0.22, 0.4]) expect([z, parseController(saved(z)).deadZone]).toEqual([z, z]);
    expect(stages(0, 0, saved(0.15)).zone).toBe(0.15);
  });

  it("a pad with nothing saved, and a profile that does not parse, get 0.05", () => {
    expect(parseController(null).deadZone).toBe(0.05);
    expect(parseController('{').deadZone).toBe(0.05);
    expect(parseController(saved(0.9)).deadZone).toBe(0.05);                              // out of range: the default profile
    expect(stages(0, 0, null).zone).toBe(0.05);
  });

  it("a saved 0.15 profile behaves bit for bit as before: the same path (untouched at the poll, shaped at 0.15) and the same output, over a sweep", () => {
    for (const d of SWEEP) for (const [x, y] of [[d, 0], [0, -d], [d * 0.6, d * 0.8], [-d * 0.8, d * 0.6]] as const) {
      const got = stages(x, y, saved(0.15));
      const shaped = padStick(x, y, 0.15);                                                // as before this task: PAD_DEAD_ZONE's own shaping
      expect([x, y, got.s1]).toEqual([x, y, calibrateStick(x, y, PAD_DEAD_ZONE)]);
      expect(got.s1).toEqual([x, y]);                                                     // the at-the-default path: the pair untouched
      expect([x, y, got.s2, got.moveZone]).toEqual([x, y, [shaped.x, shaped.y], 0.15]);
      expect([x, y, got.game]).toEqual([x, y, padRaw(shaped.x, shaped.y, 0.15)]);
    }
  });

  it("what the game reads off a pad with nothing saved: zero inside 5 percent, the pad's own push past it (0.10 now arrives; 0.20, 0.50, 1.00 as before)", () => {
    const read = (stored: string | null): number[] => [0.04, 0.05, 0.1, 0.2, 0.5, 1].map((raw) => Number(stages(raw, 0, stored).game[0]!.toFixed(12)));
    expect(read(null)).toEqual([0, 0, 0.1, 0.2, 0.5, 1]);                                 // 0.05, the new default: a pure guard, no rescale
    expect(read(saved(0.15))).toEqual([0, 0, 0, 0.2, 0.5, 1]);                            // 0.15, the default before (and a saved 0.15 now)
  });
});
