import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEAD, padFrame, REPEAT_DELAY, REPEAT_EVERY } from '../src/console/input';
import { ForgePad, MenuStick, PAD_MENU_STICK_PUSH_ADAPTATION, PAD_MENU_STICK_REST_ADAPTATION } from '../src/forge/pad';
import { StartupNavigation } from '../src/startupNavigation';

/**
 * AM-1 (FI.R2, FI.R5; the owner, 2026-10-16: "make menu movement work with analog sticks across the board"): the
 * audit of the adaptations' menus -- every browser-adaptation menu a controller reaches, the module that reads its
 * left stick for the focus, and (by import) the function or constant that does it. A surface added without the stick
 * is added here with its reader, or this table says why not.
 *
 * Product track (OT.R53): each surface keeps its own d-pad's timing (FI.R5: none is changed by AM-1).
 *
 * Not here -- **the original's own screens, left to AM-2** (the simulation track, FI.R5; whether and how each takes the
 * stick is the original's behaviour, read from the decompilation):
 * - the `@s2u/ui` front end's dialogs (`ui/src/input/**`, through `../src/menuInput`; the stick is already the
 *   original's flick there, research 116 §7, `MENU_STICK_READING`);
 * - the lobby's ARMORY (`../src/lobbyArmory`, and the shared `Armory` screen, `../src/armory`, it hands the pad to) --
 *   the same shared screen inside the forge lobby's window (`../src/forge/lobby/lobbyArmory`), whose presses are
 *   handed to `Armory.pad` unchanged;
 * - the round's START menu (`../src/startMenu`).
 *
 * Read and found to need no stick (no focus the d-pad moves): the forge's help card and yes / no card (Cross and
 * Circle only, `../src/forge/page` `padAction`); the playtest room's instruments (`../src/playtestSession`: a pad read
 * only as a sign of a human's input and the mark's chord); the controller binding's listen (`../src/padBinding`, which
 * the console's button mapping drives: a capture, not a focus; its first view, the setup's, retired with CX-26); the
 * overlay's Home button (the console's Options roller since OVERLAY-CONSOLE; the retired shell's capture view, `../src/modern/settings/overlayButton`, went with CX-25); the headset's watch
 * (`../src/voice/headset`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const source = (path: string): string => readFileSync(resolve(HERE, '../src', path), 'utf8');

interface Surface {
  /** The menu, as a player meets it. */
  surface: string;
  /** The module that mounts the surface and hands it the pad. */
  module: string;
  /** The module that reads the left stick into the focus. */
  reader: string;
  /** The reading function or constant, by import (each resolves, or this test does not load). */
  reads: readonly unknown[];
  /** What the surface's module names to use it (its source holds each). */
  names: readonly string[];
}

const SURFACES: readonly Surface[] = [
  {
    surface: 'the console launcher', module: 'console/input.ts', reader: 'console/input.ts',
    reads: [padFrame, DEAD, REPEAT_DELAY, REPEAT_EVERY], names: ['padFrame', 'p.axes[0]', 'DEAD'],
  },
  {
    surface: 'the launch sheet', module: 'launchSettings/sheet.ts', reader: 'startupNavigation.ts',
    reads: [StartupNavigation], names: ['new StartupNavigation', 'nav.frame('],
  },
  {
    // OVERLAY-CONSOLE (OT.R60 (c)): the overlay is the console launcher in its frame; the console's own pad reading
    // (`console/input.ts` `padFrame`, its stick at `DEAD`) walks it, run on the toggle's frame once the open completes.
    surface: 'the in-game overlay (the console launcher in its frame, OT.R60)', module: 'modern/overlay/index.ts',
    reader: 'console/input.ts', reads: [padFrame, DEAD, REPEAT_DELAY, REPEAT_EVERY], names: ['bootConsole(', 'padFrame(now)'],
  },
  {
    surface: 'the forge START menu (PadMenu)', module: 'forge/page.ts', reader: 'forge/pad.ts',
    reads: [ForgePad, MenuStick, PAD_MENU_STICK_PUSH_ADAPTATION, PAD_MENU_STICK_REST_ADAPTATION], names: ['forgePad.menuOpen', 'PAD_MENU_INPUT'],
  },
  {
    surface: 'the forge lobby popup, its controls (FG.R22)', module: 'forge/lobby/lobby.ts', reader: 'forge/pad.ts',
    reads: [MenuStick], names: ['new MenuStick', 'stick.step('],
  },
];

describe('AM-1: every adaptation menu a controller reaches reads the left stick', () => {
  it.each(SURFACES.map((s) => [s.surface, s] as const))('%s', (_, s) => {
    for (const r of s.reads) expect(r).toBeDefined();
    const mod = source(s.module);
    for (const n of s.names) expect(mod, `${s.module} names ${n}`).toContain(n);
    expect(source(s.reader), `${s.reader} reads the stick`).toMatch(/axes\[0\]|axes\[i\]|step\(/);
  });

  it('StartupNavigation reads the stick for the walk (its own 0.55 push, then 400 / 110 ms)', () => {
    expect(source('startupNavigation.ts')).toMatch(/Math\.max\(Math\.abs\(x\), Math\.abs\(y\)\) < 0\.55/);
  });

  it('the forge\'s menu stick: past 0.5 on the stronger axis, re-armed under 0.3 (browser adaptations)', () => {
    expect([PAD_MENU_STICK_PUSH_ADAPTATION, PAD_MENU_STICK_REST_ADAPTATION]).toEqual([0.5, 0.3]);
    expect(new MenuStick().step([0, 0.9], 0)).toBe('down');
  });
});
