import { describe, expect, it } from 'vitest';
import { forgeKeyAction, type ForgeKeyState } from '../../src/forge/keys';
import type { ShortcutScope } from '../../src/forge/shortcuts';

/**
 * Geometry mode's keys: while it is on, the page answers only the General commands (`../../src/forge/shortcuts`), and
 * never a key Geometry mode has a command on in its mode or tool now (the owner, 2026-11-20: V, P and M given to the
 * geometry modes). Off, the page's map is as it was.
 */
const state: ForgeKeyState = { typing: false, match: false, menu: false, card: false, playing: false, pointerLocked: false, leased: false };
const key = (code: string, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) =>
  ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...mods });
const geo = (...scopes: ShortcutScope[]): ForgeKeyState => ({ ...state, geometry: true, geometryScopes: scopes });

describe('the keys in Geometry mode', () => {
  it('the number keys, delete, Escape, group and copy are not the page\'s', () => {
    const on = geo('geo:edge');
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit0', 'Delete', 'Backspace', 'Escape', 'KeyG', 'BracketLeft', 'Comma']) {
      expect(forgeKeyAction(key(code), on), code).toBeNull();
    }
    for (const code of ['KeyD', 'KeyC', 'KeyV', 'KeyX']) expect(forgeKeyAction(key(code, { ctrlKey: true }), on), code).toBeNull();
  });

  it('the General commands stay the page\'s: undo, redo, saves, the gizmo, the docks; Shift+A frames', () => {
    const on = geo('geo:object');
    expect(forgeKeyAction(key('KeyZ', { ctrlKey: true }), on)).toBe('undo');
    expect(forgeKeyAction(key('KeyY', { ctrlKey: true }), on)).toBe('redo');
    expect(forgeKeyAction(key('KeyS', { ctrlKey: true }), on)).toBe('saves');
    for (const [code, a] of [['KeyW', 'translate'], ['KeyE', 'rotate'], ['KeyR', 'scale'], ['KeyQ', 'space'], ['KeyH', 'docks']] as const) {
      expect(forgeKeyAction(key(code), on), code).toBe(a);
    }
    expect(forgeKeyAction(key('KeyA', { shiftKey: true }), on)).toBe('frame');
  });

  it('V, P, M and F are Geometry mode\'s where it has them (Connect, Fill Hole, Merge, Quick Bevel / Flip)', () => {
    for (const code of ['KeyV', 'KeyP', 'KeyM', 'KeyF']) expect(forgeKeyAction(key(code), geo('geo:edge')), code).toBeNull();
    expect(forgeKeyAction(key('KeyF'), geo('geo:face')), 'F is Flip in Face mode').toBeNull();
    expect(forgeKeyAction(key('KeyM'), geo('geo:object')), 'M is Merge Meshes in Object mode').toBeNull();
  });

  it('off, the number keys are the page\'s tools again, and F frames', () => {
    expect(forgeKeyAction(key('Digit1'), state)).toEqual({ tool: 'select' });
    expect(forgeKeyAction(key('Delete'), state)).toBe('delete');
    expect(forgeKeyAction(key('KeyF'), state)).toBe('frame');
  });
});
