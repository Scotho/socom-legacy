import { describe, expect, it } from 'vitest';
import { forgeKeyAction, type ForgeKeyState } from '../src/forge/keys';

/**
 * OT.R68 (the owner, 2026-10-21: keyboard and mouse for everything in the forge's creation UI, not once its matches have
 * started): the editor's key map, pure. A browser adaptation (no original); the page wires it in every build.
 */
const at: ForgeKeyState = { typing: false, match: false, menu: false, card: false, playing: false, pointerLocked: false };
const press = (code: string, mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; repeat: boolean }> = {}, s: Partial<ForgeKeyState> = {}) =>
  forgeKeyAction({ code, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, altKey: !!mods.alt, shiftKey: !!mods.shift, repeat: !!mods.repeat }, { ...at, ...s });

describe('OT.R68: the forge editor\'s keys', () => {
  it('the tools, the gizmo, snap, duplicate, delete, frame, docks, deselect -- the development keys, unchanged', () => {
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].map((c) => press(c))).toEqual(['select', 'place', 'spawnA', 'spawnB', 'npc']);
    expect(['KeyG', 'KeyC', 'Delete', 'Backspace', 'KeyF', 'KeyH', 'Escape'].map((c) => press(c)))
      .toEqual(['snap', 'duplicate', 'delete', 'delete', 'frame', 'docks', 'deselect']);
  });

  it('the gizmo\'s modes on W, E and R, as an engine editor\'s (move, turn, scale); T and Y no longer', () => {
    expect(['KeyW', 'KeyE', 'KeyR'].map((c) => press(c))).toEqual(['translate', 'rotate', 'scale']);
    expect([press('KeyT'), press('KeyY')]).toEqual([null, null]);
    for (const c of ['KeyW', 'KeyE', 'KeyR']) expect(press(c, {}, { playing: true }), c).toBeNull();
  });

  it('while the camera navigates (RMB fly, a pan, an orbit, a dolly) its fly letters are not the editor\'s; the rest still are', () => {
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyZ', 'KeyC']) expect(press(c, {}, { navigating: true }), c).toBeNull();
    expect(press('KeyG', {}, { navigating: true })).toBe('snap');
    expect(press('Delete', {}, { navigating: true })).toBe('delete');
    expect(press('KeyZ', { ctrl: true }, { navigating: true })).toBe('undo');
    expect(press('KeyW', {}, { navigating: false })).toBe('translate');
  });

  it('FG-51: 6, 7 and 8 the bomb tools -- the start, the SEALs\' site, the Terrorists\' site (moved from page.ts at the merge)', () => {
    expect(['Digit6', 'Digit7', 'Digit8'].map((c) => press(c))).toEqual(['bomb', 'siteSeal', 'siteTerrorist']);
    expect(press('Digit9')).toBeNull();
    for (const c of ['Digit6', 'Digit7', 'Digit8']) expect(press(c, {}, { playing: true }), c).toBeNull();
  });

  it('the pad-only actions get keys (the merge controller\'s call (c)): [ ] the prop, , . the turn by the step, M the forge menu', () => {
    expect(['BracketLeft', 'BracketRight', 'Comma', 'Period', 'KeyM'].map((c) => press(c)))
      .toEqual(['prevAsset', 'nextAsset', 'turnLeft', 'turnRight', 'menu']);
  });

  it('Ctrl or Cmd: undo, redo (Y or Shift+Z), copy and paste; any other chord is the browser\'s', () => {
    expect(press('KeyZ', { ctrl: true })).toBe('undo');
    expect(press('KeyZ', { meta: true, shift: true })).toBe('redo');
    expect(press('KeyY', { ctrl: true })).toBe('redo');
    expect(press('KeyC', { ctrl: true })).toBe('copy');
    expect(press('KeyV', { meta: true })).toBe('paste');
    expect(press('KeyC', { ctrl: true, shift: true })).toBeNull();
    expect(press('KeyZ', { ctrl: true, alt: true })).toBeNull();
    expect(press('KeyW', { alt: true })).toBeNull();
    expect(press('KeyW', { ctrl: true })).toBeNull();
  });

  it('V the walk, P the match; walking (the merge controller\'s call (a)): P, V or Escape builds again, X the door', () => {
    expect(press('KeyV')).toBe('walk');
    expect(press('KeyP')).toBe('play');
    const walking = { playing: true };
    expect(press('KeyP', {}, walking)).toBe('stopWalk');
    expect(press('KeyV', {}, walking)).toBe('stopWalk');
    expect(press('Escape', {}, walking)).toBe('stopWalk');
    expect(press('Escape', {}, { playing: true, pointerLocked: true }), 'the first Escape lets the mouse go (the camera\'s)').toBeNull();
    expect(press('KeyX', {}, walking)).toBe('door');
    expect(press('KeyX', { repeat: true }, walking)).toBeNull();
    // The walk's own keys (WASD, Space, C) are the walk's and the camera's: the editor's C does not duplicate.
    for (const c of ['KeyC', 'KeyW', 'Space', 'Digit1', 'Delete', 'KeyM']) expect(press(c, {}, walking), c).toBeNull();
    expect(press('KeyZ', { ctrl: true }, walking), 'undo is the editor\'s while walking, as before').toBe('undo');
  });

  it('Escape with the mouse captured is the camera\'s (it lets the mouse go), not a deselect', () => {
    expect(press('Escape', {}, { pointerLocked: true })).toBeNull();
  });

  it('FUI-22 (D4, the owner 2026-10-27: "Esc to cancel selection" ... "when you have an item queued to place"): Escape cancels the queued placement first, then deselects', () => {
    expect(press('Escape', {}, { queued: true })).toBe('cancelPlace');
    expect(press('Escape', {}, { queued: false })).toBe('deselect');
    // The pointer lock and the card keep their Escape; walking and the menu keep theirs.
    expect(press('Escape', {}, { queued: true, pointerLocked: true })).toBeNull();
    expect(press('Escape', {}, { queued: true, card: true })).toBe('closeCard');
    expect(press('Escape', {}, { queued: true, playing: true })).toBe('stopWalk');
    expect(press('Escape', {}, { queued: true, menu: true })).toEqual({ menu: 'back' });
    expect(press('Escape', {}, { queued: true, leased: true })).toBeNull();
  });

  it('the forge menu open: the arrows move it, Enter or Space runs, Escape or M closes; nothing else', () => {
    const open = { menu: true };
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape', 'KeyM'].map((c) => press(c, {}, open)))
      .toEqual([{ menu: 'up' }, { menu: 'down' }, { menu: 'left' }, { menu: 'right' }, { menu: 'select' }, { menu: 'select' }, { menu: 'back' }, { menu: 'back' }]);
    for (const c of ['Digit1', 'KeyC', 'Delete', 'BracketLeft']) expect(press(c, {}, open), c).toBeNull();
    expect(press('KeyZ', { ctrl: true }, open)).toBeNull();
  });

  it('a card open (a question, the controls): Escape closes it, nothing else reaches the editor', () => {
    expect(press('Escape', {}, { card: true })).toBe('closeCard');
    for (const c of ['Digit1', 'KeyC', 'Delete', 'KeyP', 'KeyV']) expect(press(c, {}, { card: true }), c).toBeNull();
    expect(press('KeyZ', { ctrl: true }, { card: true })).toBeNull();
  });

  it('no key while a match runs (the Play match and a lobby\'s: keyless), nor while a field types', () => {
    for (const s of [{ match: true }, { typing: true }]) {
      for (const c of ['KeyP', 'Escape', 'Digit1', 'KeyV', 'KeyM', 'BracketLeft']) expect(press(c, {}, s), `${c} ${JSON.stringify(s)}`).toBeNull();
      expect(press('KeyZ', { ctrl: true }, s)).toBeNull();
    }
  });

  it('an unbound key is none', () => {
    for (const c of ['KeyQ', 'Space', 'ShiftLeft', 'ArrowUp', 'KeyK', 'Tab']) expect(press(c), c).toBeNull();
    // W, E and R are the gizmo's modes, as an engine editor's (the camera's W flies only while the right button is held).
    expect([press('KeyW'), press('KeyE'), press('KeyR')]).toEqual(['translate', 'rotate', 'scale']);
  });
});
