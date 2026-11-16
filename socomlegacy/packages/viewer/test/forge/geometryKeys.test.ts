import { describe, expect, it } from 'vitest';
import { forgeKeyAction, type ForgeKeyState } from '../../src/forge/keys';

/**
 * Geometry mode's keys (the owner, 2026-11-15: no shortcut may do two things): while it is on, the page keeps only the
 * keys every mode shares (`GEOMETRY_SHARED`); the number keys, Delete, Backspace, Escape and the object tools' keys are
 * the mode's own. Off, the page's map is as it was.
 */
const state: ForgeKeyState = { typing: false, match: false, menu: false, card: false, playing: false, pointerLocked: false, leased: false };
const key = (code: string, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) =>
  ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...mods });

describe('the keys in Geometry mode', () => {
  it('the number keys (with Shift too), delete, Escape, group, duplicate and copy are not the page\'s', () => {
    const on = { ...state, geometry: true };
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit0', 'Delete', 'Backspace', 'Escape', 'KeyG', 'BracketLeft', 'Comma']) {
      expect(forgeKeyAction(key(code), on), code).toBeNull();
    }
    expect(forgeKeyAction(key('Digit1', { shiftKey: true }), on)).toBeNull();
    for (const code of ['KeyD', 'KeyC', 'KeyV', 'KeyX']) expect(forgeKeyAction(key(code, { ctrlKey: true }), on), code).toBeNull();
  });

  it('the shared keys stay the page\'s: undo, redo, the gizmo, Walk, Play, the docks, the frame, the files', () => {
    const on = { ...state, geometry: true };
    expect(forgeKeyAction(key('KeyZ', { ctrlKey: true }), on)).toBe('undo');
    expect(forgeKeyAction(key('KeyY', { ctrlKey: true }), on)).toBe('redo');
    expect(forgeKeyAction(key('KeyS', { ctrlKey: true }), on)).toBe('saves');
    for (const [code, a] of [['KeyW', 'translate'], ['KeyE', 'rotate'], ['KeyR', 'scale'], ['KeyQ', 'space'], ['KeyV', 'walk'], ['KeyP', 'play'], ['KeyH', 'docks'], ['KeyF', 'frame']] as const) {
      expect(forgeKeyAction(key(code), on), code).toBe(a);
    }
  });

  it('off, the number keys are the page\'s tools again', () => {
    expect(forgeKeyAction(key('Digit1'), state)).toEqual({ tool: 'select' });
    expect(forgeKeyAction(key('Digit3'), { ...state, geometry: false })).not.toBeNull();
    expect(forgeKeyAction(key('Delete'), state)).toBe('delete');
  });
});
