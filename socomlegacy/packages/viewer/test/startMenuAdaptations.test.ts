import { describe, expect, it, vi } from 'vitest';
import type { PadButton } from '../src/gamepad';
import {
  drawStartMenu, localStartMenuOptions, StartMenu, START_FULLSCREEN_TYPE, START_MENU_ADAPTATION_TEXT, START_MENU_LAYOUT, START_MENU_LOCKOUT_SECONDS,
  START_MENU_FULLSCREEN_NOTICE_ADAPTATION, START_MENU_REPEAT_SECONDS, START_MENU_SOUNDS, START_SHOW_FPS_TYPE, type StartMenuAdaptations,
} from '../src/startMenu';

/**
 * cq41E0VR (product track; the controller 5d's call, option (a), logged for the owner): two browser-adaptation rows in the
 * match's START menu -- FULLSCREEN (the document into and out of fullscreen) and SHOW FPS (a read-only frame-rate readout).
 * The original has neither; with no `adaptations` the menu is the original's, row for row.
 */
function rig(adaptations?: StartMenuAdaptations, settings = true) {
  let active = false;
  const sounds: string[] = [];
  const menu = new StartMenu({
    options: localStartMenuOptions(), seat: () => ({ multiplayer: true, spectator: false, comeFromLan: false }),
    caption: (id) => (id === 60512 ? 'RESUME' : id === 60513 ? 'ABORT' : id === 60519 ? 'INVERT PITCH: ON' : id === 60520 ? 'INVERT PITCH: OFF' : null),
    title: () => 'MATCH', sound: (n) => sounds.push(n), allowed: () => true,
    ...(settings ? { settings: { open: () => { active = true; }, isOpen: () => active } } : {}),
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

function fakes(o: { refuse?: boolean; shown?: boolean } = {}) {
  let fs = false, shown = o.shown ?? false;
  /** A granted request (or any exit) flips the state; a refused request calls `refused` and leaves it. */
  const fullscreen = { active: () => fs, toggle: vi.fn((refused: () => void) => { if (!fs && o.refuse) refused(); else fs = !fs; }) };
  const fps = { shown: () => shown, toggle: vi.fn(() => { shown = !shown; }) };
  return { fullscreen, fps };
}

describe('cq41E0VR: the START menu\'s FULLSCREEN and SHOW FPS rows (browser adaptations)', () => {
  it('the two rows sit after the original rows (and SETTINGS) in a match, labelled in the menu\'s style', () => {
    const r = rig(fakes());
    expect(r.menu.labels().slice(-2)).toEqual([START_MENU_ADAPTATION_TEXT.fullscreenOff, START_MENU_ADAPTATION_TEXT.showFpsOff]);
    expect(START_MENU_ADAPTATION_TEXT).toMatchObject({ fullscreenOn: 'FULLSCREEN: ON', fullscreenOff: 'FULLSCREEN: OFF', showFpsOn: 'SHOW FPS: ON', showFpsOff: 'SHOW FPS: OFF' });
    expect(r.menu.state().placed.slice(-2)).toEqual([START_FULLSCREEN_TYPE, START_SHOW_FPS_TYPE]);
    expect(r.menu.state().placed.slice(0, -2)).toEqual([0, 12, 2, 3, 4, 5, 8, 9, 11]);
  });

  it('without adaptations the menu is the original\'s (and SETTINGS\') rows alone', () => {
    expect(rig().menu.state().placed).toEqual([0, 12, 2, 3, 4, 5, 8, 9, 11]);
    expect(rig(undefined, false).menu.state().placed).toEqual([0, 2, 3, 4, 5, 8, 9, 11]);
  });

  it('FULLSCREEN: CROSS on the row calls the toggle (the request, then the exit), the select sound, the label following the state', () => {
    const f = fakes(), r = rig(f);
    r.walkTo(START_FULLSCREEN_TYPE);
    expect(r.menu.state().cursor).toBe(START_FULLSCREEN_TYPE);
    r.sounds.length = 0;
    r.press();
    expect(f.fullscreen.toggle).toHaveBeenCalledTimes(1);
    expect(r.sounds).toEqual([START_MENU_SOUNDS.select]);
    expect(r.menu.labels()).toContain(START_MENU_ADAPTATION_TEXT.fullscreenOn);
    expect(r.menu.isOpen()).toBe(true);
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.press();
    expect(f.fullscreen.toggle).toHaveBeenCalledTimes(2);
    expect(r.menu.labels()).toContain(START_MENU_ADAPTATION_TEXT.fullscreenOff);
  });

  it('FULLSCREEN is never hidden; a refused request (a pad, no user activation) shows the one-line notice, the label staying OFF', () => {
    const f = fakes({ refuse: true }), r = rig(f);
    expect(r.menu.state().placed).toContain(START_FULLSCREEN_TYPE);
    expect(r.menu.drawnState().notice).toBeNull();
    r.walkTo(START_FULLSCREEN_TYPE); r.press();
    expect(f.fullscreen.toggle).toHaveBeenCalledTimes(1);
    expect(START_MENU_FULLSCREEN_NOTICE_ADAPTATION).toBe('FULLSCREEN needs a key or a tap: press F11 or tap the screen');
    expect(r.menu.drawnState().notice).toBe(START_MENU_FULLSCREEN_NOTICE_ADAPTATION);
    expect(r.menu.labels()).toContain(START_MENU_ADAPTATION_TEXT.fullscreenOff);
    expect(r.menu.isOpen()).toBe(true);
    // Drawn in the menu's style (its font), inside the frame.
    const sizes = { white: { width: 1, height: 1 }, 'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 } };
    const text = (d: ReturnType<StartMenu['drawnState']>) => drawStartMenu({ width: 640, height: 448 }, sizes, d).filter((q) => q.texture === 'font_text_01.tif');
    const withNotice = r.menu.drawnState();
    expect(text(withNotice).length).toBeGreaterThan(text({ ...withNotice, notice: null }).length);
    for (const q of text(withNotice)) expect(q.y + q.h / 2).toBeLessThanOrEqual(448);
    // The next press clears it.
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Up'); r.press();
    expect(r.menu.drawnState().notice).toBeNull();
  });

  it('a granted request shows no notice, and the exit (ON to OFF) never does', () => {
    const f = fakes(), r = rig(f);
    r.walkTo(START_FULLSCREEN_TYPE); r.press();
    expect(r.menu.labels()).toContain(START_MENU_ADAPTATION_TEXT.fullscreenOn);
    expect(r.menu.drawnState().notice).toBeNull();
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.press();
    expect(r.menu.labels()).toContain(START_MENU_ADAPTATION_TEXT.fullscreenOff);
    expect(r.menu.drawnState().notice).toBeNull();
  });

  it('SHOW FPS: off by default; CROSS toggles it on and off, the menu staying open', () => {
    const f = fakes(), r = rig(f);
    expect(r.menu.labels().at(-1)).toBe(START_MENU_ADAPTATION_TEXT.showFpsOff);
    r.walkTo(START_SHOW_FPS_TYPE);
    r.press();
    expect(f.fps.toggle).toHaveBeenCalledTimes(1);
    expect(r.menu.labels().at(-1)).toBe(START_MENU_ADAPTATION_TEXT.showFpsOn);
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.press();
    expect(r.menu.labels().at(-1)).toBe(START_MENU_ADAPTATION_TEXT.showFpsOff);
    expect(r.menu.isOpen()).toBe(true);
  });

  it('the cursor wraps through the adaptation rows back to RESUME', () => {
    const r = rig(fakes());
    r.walkTo(START_SHOW_FPS_TYPE);
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Down');
    expect(r.menu.state().cursor).toBe(0);
  });

  it('the rows\' box and the prompts grow a pitch per row past the box\'s room; the original geometry otherwise', () => {
    const sizes = { white: { width: 1, height: 1 } };
    const frame = { width: 640, height: 448 };
    const box = (quads: ReturnType<typeof drawStartMenu>) => quads.filter((q) => q.texture === 'white' && q.turn === 0 && q.w === 312);
    const plain = rig().menu, grown = rig(fakes()).menu;
    const y1 = (q: { y: number; h: number }): number => q.y + q.h / 2;
    expect(y1(box(drawStartMenu(frame, sizes, plain.drawnState()))[0]!)).toBe(START_MENU_LAYOUT.boxes[0].y1);
    expect(y1(box(drawStartMenu(frame, sizes, grown.drawnState()))[0]!)).toBe(START_MENU_LAYOUT.boxes[0].y1 + 2 * START_MENU_LAYOUT.rows.pitch);
    // The ACCEPT / BACK prompts move down with it: their pad glyphs (font_special_01, drawn only in the prompts).
    const fonts = { ...sizes, 'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 } };
    const glyphs = (d: ReturnType<StartMenu['drawnState']>) => drawStartMenu(frame, fonts, d).filter((q) => q.texture === 'font_special_01.tif').map((q) => q.y);
    const before = glyphs(plain.drawnState()), after = glyphs(grown.drawnState());
    expect(before.length).toBe(2);
    expect(after.map((y, i) => y - before[i]!)).toEqual([2 * START_MENU_LAYOUT.rows.pitch, 2 * START_MENU_LAYOUT.rows.pitch]);
  });
});
