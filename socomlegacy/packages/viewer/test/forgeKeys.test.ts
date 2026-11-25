import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORGE_TOOL_ORDER, forgeKeyAction, forgeToolKeyHelp, forgeToolKeyLabel, type ForgeKeyState } from '../src/forge/keys';

/**
 * OT.R68 (the owner, 2026-10-21: keyboard and mouse for everything in the forge's creation UI, not once its matches have
 * started): the editor's key map, pure, read from the shortcut list's defaults (`../src/forge/shortcuts`; the owner,
 * 2026-11-20: Walk, Play and the menu keyless, Duplicate gone). A browser adaptation (no original).
 */
const at: ForgeKeyState = { typing: false, match: false, menu: false, card: false, playing: false, pointerLocked: false };
const press = (code: string, mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; repeat: boolean }> = {}, s: Partial<ForgeKeyState> = {}) =>
  forgeKeyAction({ code, ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, altKey: !!mods.alt, shiftKey: !!mods.shift, repeat: !!mods.repeat }, { ...at, ...s });

describe('OT.R68: the forge editor\'s keys (the shortcut list\'s defaults)', () => {
  it('1 the Select tool, then the placing tools in the row\'s order on 2-0 and Shift+1-Shift+0', () => {
    expect(press('Digit1')).toEqual({ tool: 'select' });
    expect(['Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].map((c) => press(c)))
      .toEqual(FORGE_TOOL_ORDER.slice(0, 9).map((tool) => ({ tool })));
    expect(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].map((c) => press(c, { shift: true })))
      .toEqual(FORGE_TOOL_ORDER.slice(9).map((tool) => ({ tool })));
  });

  it('group, delete, frame (F and Shift+A), the quick hide (H, Shift+H, U), deselect; no Duplicate', () => {
    expect(['KeyG', 'Delete', 'Backspace', 'KeyF', 'KeyH', 'KeyU', 'Escape'].map((c) => press(c)))
      .toEqual(['group', 'delete', 'delete', 'frame', 'hide', 'unhideAll', 'deselect']);
    expect(press('KeyH', { shift: true }), 'Shift+H isolates').toBe('hideOthers');
    expect(press('KeyG', { shift: true })).toBe('ungroup');
    expect(press('KeyA', { shift: true })).toBe('frame');
    expect(press('KeyD', { ctrl: true }), 'Duplicate is gone (the owner, 2026-11-20)').toBeNull();
  });

  it('the gizmo\'s modes on W, E, R and its World / Local on Q', () => {
    expect(['KeyW', 'KeyE', 'KeyR', 'KeyQ'].map((c) => press(c))).toEqual(['translate', 'rotate', 'scale', 'space']);
    for (const c of ['KeyW', 'KeyE', 'KeyR']) expect(press(c, {}, { playing: true }), c).toBeNull();
  });

  it('while the camera navigates its fly keys are not the editor\'s; the rest still are', () => {
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyZ', 'KeyC']) expect(press(c, {}, { navigating: true }), c).toBeNull();
    expect(press('KeyG', {}, { navigating: true })).toBe('group');
    expect(press('Delete', {}, { navigating: true })).toBe('delete');
    expect(press('KeyZ', { ctrl: true }, { navigating: true })).toBe('undo');
  });

  it('[ ] the prop, , . the turn by the step; M no longer the menu (keyless by default)', () => {
    expect(['BracketLeft', 'BracketRight', 'Comma', 'Period'].map((c) => press(c))).toEqual(['prevAsset', 'nextAsset', 'turnLeft', 'turnRight']);
    expect(press('KeyM')).toBeNull();
  });

  it('Ctrl or Cmd: undo, redo (Y or Shift+Z), cut, copy, paste, open, saves', () => {
    expect(press('KeyZ', { ctrl: true })).toBe('undo');
    expect(press('KeyZ', { meta: true, shift: true })).toBe('redo');
    expect(press('KeyY', { ctrl: true })).toBe('redo');
    expect(press('KeyX', { ctrl: true })).toBe('cut');
    expect(press('KeyC', { ctrl: true })).toBe('copy');
    expect(press('KeyV', { meta: true })).toBe('paste');
    expect([press('KeyO', { ctrl: true }), press('KeyS', { ctrl: true })]).toEqual(['openLayout', 'saves']);
    expect(press('KeyC', { ctrl: true, shift: true })).toBeNull();
    expect(press('KeyW', { ctrl: true })).toBeNull();
  });

  it('Walk and Play have no key by default; walking, Escape builds again and X is the door', () => {
    expect([press('KeyV'), press('KeyP')]).toEqual([null, null]);
    const walking = { playing: true };
    expect(press('Escape', {}, walking)).toBe('stopWalk');
    expect(press('Escape', {}, { playing: true, pointerLocked: true }), 'the first Escape lets the mouse go').toBeNull();
    expect(press('KeyX', {}, walking)).toBe('door');
    expect(press('KeyX', { repeat: true }, walking)).toBeNull();
    for (const c of ['KeyC', 'KeyW', 'Space', 'Digit1', 'Delete']) expect(press(c, {}, walking), c).toBeNull();
  });

  it('Escape: deselect, the camera\'s with the mouse captured, the card\'s, the walk\'s, the menu\'s', () => {
    expect(press('Escape')).toBe('deselect');
    expect(press('Escape', {}, { pointerLocked: true })).toBeNull();
    expect(press('Escape', {}, { card: true })).toBe('closeCard');
    expect(press('Escape', {}, { playing: true })).toBe('stopWalk');
    expect(press('Escape', {}, { menu: true })).toEqual({ menu: 'back' });
    expect(press('Escape', {}, { leased: true })).toBeNull();
  });

  it('the forge menu open: the arrows move it, Enter or Space runs, Escape goes back; nothing else', () => {
    const open = { menu: true };
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape'].map((c) => press(c, {}, open)))
      .toEqual([{ menu: 'up' }, { menu: 'down' }, { menu: 'left' }, { menu: 'right' }, { menu: 'select' }, { menu: 'select' }, { menu: 'back' }]);
    for (const c of ['Digit1', 'KeyC', 'Delete', 'BracketLeft', 'KeyM']) expect(press(c, {}, open), c).toBeNull();
    expect(press('KeyZ', { ctrl: true }, open)).toBeNull();
  });

  it('no key while a match runs, a field types or a card is open (but its Escape)', () => {
    for (const s of [{ match: true }, { typing: true }]) {
      for (const c of ['Escape', 'Digit1', 'KeyW', 'BracketLeft']) expect(press(c, {}, s), `${c} ${JSON.stringify(s)}`).toBeNull();
      expect(press('KeyZ', { ctrl: true }, s)).toBeNull();
    }
    for (const c of ['Digit1', 'KeyC', 'Delete']) expect(press(c, {}, { card: true }), c).toBeNull();
  });

  it('a focused Outliner keeps its own key (F2)', () => {
    expect(press('F2', {}, { outliner: true })).toBeNull();
    expect(press('Delete', {}, { outliner: true }), 'Delete is still the editor\'s').toBe('delete');
  });
});

describe("FP-1b: the help card's tool keys read from the shortcut list, never a literal list", () => {
  const NAMES = Object.fromEntries(['select', ...FORGE_TOOL_ORDER].map((t) => [t, `<${t}>`]));
  it('one Tools row, every keyed tool once beside its key', () => {
    const rows = forgeToolKeyHelp((t) => NAMES[t]!);
    expect(rows).toHaveLength(1);
    const told = rows[0]![1];
    expect(told.startsWith(`${forgeToolKeyLabel('select')} <select>`)).toBe(true);
    for (const t of FORGE_TOOL_ORDER) expect(told.split(`<${t}>`), t).toHaveLength(2);
  });
  it("the page's help card builds its tool rows from forgeToolKeyHelp", () => {
    const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/forge/page.ts'), 'utf-8');
    expect(page).toMatch(/\.\.\.forgeToolKeyHelp\(\(t\) => TOOL_NAMES\[t\]\),/);
  });
});
