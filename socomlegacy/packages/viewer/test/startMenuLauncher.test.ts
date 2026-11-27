// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { PadButton } from '../src/gamepad';
import {
  localStartMenuOptions, offerStartMenuLauncher, StartMenu, START_FULLSCREEN_TYPE, START_LAUNCHER_TYPE, START_MENU_ADAPTATION_TEXT,
  START_MENU_LAUNCHER_NOTICE_ADAPTATION, START_MENU_LOCKOUT_SECONDS, START_MENU_REPEAT_SECONDS, START_MENU_SOUNDS, START_SETTINGS_TYPE,
  startMenuLauncher, type StartMenuAdaptations, type StartMenuLauncher,
} from '../src/startMenu';
import type { StartMenuLauncherTarget } from '../src/startMenuLauncher';

/**
 * WM-LAUNCHER (WM.R7; product track, a **browser adaptation** -- the original's START menu has no such row): SHOW
 * LAUNCHER on the round's START menu, the LAST row (WM-R20-FOLDS item 1, the controller's final ruling: the v0.4.22
 * rows in their v0.4.22 order, SHOW FPS alone removed, SHOW LAUNCHER after them all). Choosing it closes the START menu and opens the launcher
 * overlay over the round (`../src/modern/overlay` `Overlay.open`), whose handle the page keeps (`../src/pageEntry`,
 * `../src/console/adapters/launch`) and offers per document (`offerStartMenuLauncher`); with no overlay offered the row is
 * absent. The overlay's open can be refused (the in-game Options' shared settings lock, a lobby link's cover, a disposed
 * mount): the row then leaves the START menu open with a neutral notice (`START_MENU_LAUNCHER_NOTICE_ADAPTATION`).
 */
function rig(adaptations?: StartMenuAdaptations, settings = true) {
  const sounds: string[] = [];
  const menu = new StartMenu({
    options: localStartMenuOptions(), seat: () => ({ multiplayer: true, spectator: false, comeFromLan: false }),
    caption: (id) => (id === 60512 ? 'RESUME' : id === 60513 ? 'ABORT' : null),
    title: () => 'MATCH', sound: (n) => sounds.push(n), allowed: () => true,
    ...(settings ? { settings: { open: () => {}, isOpen: () => false } } : {}),
    ...(adaptations ? { adaptations } : {}),
  });
  const step = (held: PadButton[] = [], dt = 1 / 60): void => { menu.frame(dt, new Set(held)); };
  const tap = (b: PadButton): void => { step([b]); step(); };
  const walkTo = (type: number): void => {
    for (let i = 0; i < 16 && menu.state().cursor !== type; i++) { step([], START_MENU_REPEAT_SECONDS + 0.01); tap('Down'); }
  };
  const press = (): void => { step(['Cross']); step(); };
  step([], START_MENU_LOCKOUT_SECONDS + 0.1); tap('Start');
  return { menu, step, tap, walkTo, press, sounds };
}

/** The overlay's handle as the page keeps it: `open()` refused (left closed) while the settings lock is held. */
function overlay(o: { locked?: boolean; throws?: boolean } = {}) {
  let open = false;
  return { isOpen: () => open, open: vi.fn(() => { if (o.throws) throw new Error('mount failed'); if (!o.locked) open = true; }) };
}

const fullscreen = { active: () => false, toggle: () => {} };

describe('WM-LAUNCHER: the START menu\'s SHOW LAUNCHER row (a browser adaptation, WM.R7)', () => {
  it('placed LAST when a launcher is handed in, after FULLSCREEN, labelled in the menu\'s style (item 1)', () => {
    const r = rig({ fullscreen, launcher: () => overlay() });
    expect(START_MENU_ADAPTATION_TEXT.launcher).toBe('SHOW LAUNCHER');
    expect(r.menu.state().placed).toEqual([0, START_SETTINGS_TYPE, 2, 3, 4, 5, 8, 9, 11, START_FULLSCREEN_TYPE, START_LAUNCHER_TYPE]);
    expect(r.menu.labels().at(-1)).toBe('SHOW LAUNCHER');
    expect(r.menu.labels().at(-2)).toBe(START_MENU_ADAPTATION_TEXT.fullscreenOff);
  });

  it('with no FULLSCREEN offered, last after the original rows; without SETTINGS, last as well (item 1)', () => {
    expect(rig({ launcher: () => overlay() }).menu.state().placed).toEqual([0, START_SETTINGS_TYPE, 2, 3, 4, 5, 8, 9, 11, START_LAUNCHER_TYPE]);
    expect(rig({ launcher: () => overlay() }, false).menu.state().placed).toEqual([0, 2, 3, 4, 5, 8, 9, 11, START_LAUNCHER_TYPE]);
  });

  it('every v0.4.22 row keeps its index: the v0.4.22 layout less SHOW FPS (its last row), then SHOW LAUNCHER (item 1)', () => {
    // v0.4.22 `layout()` (`git show v0.4.22:socomlegacy/packages/viewer/src/startMenu.ts` :788-795): startMenuLayout(seat),
    // SETTINGS spliced at 1, FULLSCREEN pushed, SHOW FPS (14) pushed last -- so removing it moves no row above it.
    const V0422 = [0, START_SETTINGS_TYPE, 2, 3, 4, 5, 8, 9, 11, START_FULLSCREEN_TYPE, 14];
    const placed = rig({ fullscreen, launcher: () => overlay() }).menu.state().placed;
    expect(placed.slice(0, -1)).toEqual(V0422.slice(0, -1));
    expect(placed.slice(0, -1).every((t, i) => V0422.indexOf(t) === i)).toBe(true);
  });

  it('ABORT is again two DOWNs from RESUME with SETTINGS (v0.4.22\'s walk), the launcher offered (item 1)', () => {
    const r = rig({ fullscreen, launcher: () => overlay() });
    expect(r.menu.state().cursor).toBe(0);
    for (let i = 0; i < 2; i++) { r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Down'); }
    expect(r.menu.state().cursor).toBe(2);
    expect(r.menu.labels()[2]).toBe('ABORT');
  });

  it('absent, not inert, with no launcher handed in -- or one handed in that answers none (no overlay mounted)', () => {
    expect(rig({ fullscreen }).menu.state().placed).not.toContain(START_LAUNCHER_TYPE);
    expect(rig({ fullscreen, launcher: () => null }).menu.state().placed).not.toContain(START_LAUNCHER_TYPE);
    expect(rig({ fullscreen, launcher: () => null }).menu.labels()).not.toContain('SHOW LAUNCHER');
  });

  it('read at each open: an overlay mounted after the round began is offered at the next START', () => {
    let o: StartMenuLauncher | null = null;
    const r = rig({ launcher: () => o });
    expect(r.menu.state().placed).not.toContain(START_LAUNCHER_TYPE);
    o = overlay();
    r.tap('Start'); r.step([], 1); r.tap('Start');
    expect(r.menu.isOpen()).toBe(true);
    expect(r.menu.state().placed).toContain(START_LAUNCHER_TYPE);
  });

  it('CROSS on it opens the launcher once and closes the START menu (the round returned to as Home closes it)', () => {
    const o = overlay(), r = rig({ fullscreen, launcher: () => o });
    r.walkTo(START_LAUNCHER_TYPE);
    expect(r.menu.state().cursor).toBe(START_LAUNCHER_TYPE);
    r.sounds.length = 0;
    r.press();
    expect(o.open).toHaveBeenCalledTimes(1);
    expect(o.open.mock.calls[0]).toEqual([]);                  // WM-6A: SHOW LAUNCHER opens with no target, as before
    expect(o.isOpen()).toBe(true);
    expect(r.menu.isOpen()).toBe(false);
    expect(r.sounds).toEqual([START_MENU_SOUNDS.select]);
  });

  it('the settings lock held (the overlay refuses its open): the START menu stays open with the notice; the next press clears it', () => {
    const o = overlay({ locked: true }), r = rig({ fullscreen, launcher: () => o });
    r.walkTo(START_LAUNCHER_TYPE); r.press();
    expect(o.open).toHaveBeenCalledTimes(1);
    expect(r.menu.isOpen()).toBe(true);
    expect(r.menu.drawnState().notice).toBe(START_MENU_LAUNCHER_NOTICE_ADAPTATION);
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Up'); r.press();
    expect(r.menu.drawnState().notice).toBeNull();
  });

  it('the notice names no one cause: the overlay refuses for the settings lock, the cover of a lobby link or a disposed mount', () => {
    expect(START_MENU_LAUNCHER_NOTICE_ADAPTATION).toBe('LAUNCHER unavailable right now: try again');
  });

  it('the cursor walks the rows fixed at the open: a launcher offered while the menu is open makes no undrawn row reachable', () => {
    let o: StartMenuLauncher | null = null;
    const r = rig({ fullscreen, launcher: () => o });
    const drawn = r.menu.state().placed;
    expect(drawn).not.toContain(START_LAUNCHER_TYPE);
    o = overlay();                                             // the overlay mounted (offered) mid-open
    const seen: number[] = [];
    for (let i = 0; i < drawn.length * 2; i++) { r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Down'); seen.push(r.menu.state().cursor); }
    expect(seen).not.toContain(START_LAUNCHER_TYPE);
    expect(new Set(seen)).toEqual(new Set(drawn));
    expect(r.menu.state().placed).toEqual(drawn);
  });

  it('and the reverse: a launcher taken back while the menu is open skips no drawn row', () => {
    let o: StartMenuLauncher | null = overlay();
    const r = rig({ fullscreen, launcher: () => o });
    const drawn = r.menu.state().placed;
    expect(drawn).toContain(START_LAUNCHER_TYPE);
    o = null;
    const seen: number[] = [];
    for (let i = 0; i < drawn.length; i++) { r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Down'); seen.push(r.menu.state().cursor); }
    expect(seen).toEqual([...drawn.slice(1), drawn[0]]);
  });

  it('an open that throws (a failed mount) is the same refusal: the menu open, the notice, nothing thrown into the round', () => {
    const o = overlay({ throws: true }), r = rig({ launcher: () => o });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    r.walkTo(START_LAUNCHER_TYPE);
    expect(() => r.press()).not.toThrow();
    expect(r.menu.isOpen()).toBe(true);
    expect(r.menu.drawnState().notice).toBe(START_MENU_LAUNCHER_NOTICE_ADAPTATION);
    err.mockRestore();
  });

  it('SHOW FPS is no longer a START menu row (it stays on the native VIDEO OPTIONS)', () => {
    const r = rig({ fullscreen, launcher: () => overlay() });
    expect(r.menu.labels().some((l) => l.startsWith('SHOW FPS'))).toBe(false);
    expect(r.menu.state().placed).not.toContain(14);
    expect(Object.keys(START_MENU_ADAPTATION_TEXT).some((k) => /fps/i.test(k))).toBe(false);
  });
});

describe('WM-LAUNCHER: the per-document launcher the page offers', () => {
  it('offered for one document, read back for it alone; the undo takes it back (only its own)', () => {
    const doc = document.implementation.createHTMLDocument('a'), other = document.implementation.createHTMLDocument('b');
    expect(startMenuLauncher(doc)).toBeNull();
    const a = overlay(), b = overlay();
    const undoA = offerStartMenuLauncher(doc, a);
    expect(startMenuLauncher(doc)).toBe(a);
    expect(startMenuLauncher(other)).toBeNull();
    const undoB = offerStartMenuLauncher(doc, b);
    expect(startMenuLauncher(doc)).toBe(b);
    undoA();
    expect(startMenuLauncher(doc)).toBe(b);
    undoB();
    expect(startMenuLauncher(doc)).toBeNull();
  });
});

describe('WM-6A: the launcher opened at a Settings tab (a browser adaptation)', () => {
  it('open(target) hands the tab to the overlay; open() with none is the launcher as before', () => {
    const doc = document.implementation.createHTMLDocument('c');
    const seen: (StartMenuLauncherTarget | undefined)[] = [];
    const undo = offerStartMenuLauncher(doc, { isOpen: () => false, open: (target?: StartMenuLauncherTarget) => { seen.push(target); } });
    startMenuLauncher(doc)!.open({ settings: 'audio' });
    startMenuLauncher(doc)!.open();
    expect(seen).toEqual([{ settings: 'audio' }, undefined]);
    undo();
  });
});
