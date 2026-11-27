import { afterEach, describe, expect, it } from 'vitest';
import {
  chordLabel, chordOf, clashesFor, exportShortcuts, importShortcuts, isCustom, keyIssues, keysOf, resetAllKeys, resetKeys,
  setKeys, setKeysTogether, SHORTCUT_COMMANDS, undoKeyChange,
} from '../../src/forge/shortcuts';

// The shortcut list and its checks (a browser adaptation; the Forge's owner (crispy, OT.R112), 2026-11-20: every command's keys editable).
afterEach(() => resetAllKeys());

describe('the shortcut list', () => {
  it('every command has a unique id, and no two commands live at once share a default key', () => {
    expect(new Set(SHORTCUT_COMMANDS.map((c) => c.id)).size).toBe(SHORTCUT_COMMANDS.length);
    for (const c of SHORTCUT_COMMANDS) for (const k of c.defaults) expect(clashesFor(c.id, k).filter((x) => x.kind === 'clash').map((x) => `${c.id} ${k} ${x.command.id}`)).toEqual([]);
  });

  it('the defaults as decided: Walk, Play and the menu keyless; V, P, M, F and Ctrl+D Geometry mode\'s', () => {
    for (const id of ['app.walk', 'app.play', 'app.menu']) expect(keysOf(id), id).toEqual([]);
    expect(keysOf('geo.connect')).toEqual(['KeyV']);
    expect(keysOf('geo.fill')).toEqual(['KeyP']);
    expect(keysOf('geo.merge')).toEqual(['KeyM']);
    expect(keysOf('geo.flip')).toEqual(['KeyF']);
    expect(keysOf('geo.quadSlice')).toEqual(['Ctrl+KeyD']);
    expect(keysOf('forge.frame')).toEqual(['KeyF', 'Shift+KeyA']);
    expect(keysOf('knife.back')).toEqual(['Delete']);
    expect(keysOf('outliner.rename')).toEqual(['F2']);
    expect(SHORTCUT_COMMANDS.some((c) => /duplicate/i.test(c.id))).toBe(false);
  });

  it('reads a chord from a key event (Ctrl and Cmd alike; a modifier alone is none) and labels it', () => {
    expect(chordOf({ code: 'KeyZ', ctrlKey: false, metaKey: true, altKey: false, shiftKey: true })).toBe('Ctrl+Shift+KeyZ');
    expect(chordOf({ code: 'ShiftLeft', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })).toBeNull();
    expect(chordLabel('Ctrl+Shift+KeyZ', false)).toBe('Ctrl+Shift+Z');
    expect(chordLabel('Ctrl+KeyZ', true)).toBe('Cmd+Z');
    expect(chordLabel('NumpadAdd', false)).toBe('Numpad +');
  });

  it('a clash where both commands are live at once; a note where they never are', () => {
    expect(clashesFor('app.walk', 'Ctrl+KeyZ').map((c) => [c.command.id, c.kind])).toEqual([['app.undo', 'clash']]);
    expect(clashesFor('geo.merge', 'KeyF').map((c) => [c.command.id, c.kind])).toContainEqual(['forge.frame', 'shadow']);
    expect(clashesFor('knife.loop', 'KeyV').map((c) => [c.command.id, c.kind])).toContainEqual(['geo.connect', 'shadow']);
  });

  it('the browser\'s and the system\'s keys: refused, warned, or warned strongly where they reload the page', () => {
    expect(keyIssues('app.walk', 'Ctrl+KeyW')[0]!.level).toBe('refuse');
    expect(keyIssues('app.walk', 'Alt+Tab')[0]!.level).toBe('refuse');
    expect(keyIssues('app.walk', 'Ctrl+KeyP').some((i) => i.level === 'warn' && /print/.test(i.text))).toBe(true);
    expect(keyIssues('app.walk', 'F5').some((i) => i.level === 'strong')).toBe(true);
    expect(keyIssues('app.walk', 'KeyW').some((i) => i.level === 'note' && /flies the camera/.test(i.text))).toBe(true);
    expect(keyIssues('geo.grow', 'NumpadAdd').some((i) => /Num Lock/.test(i.text))).toBe(true);
  });

  it('set, moved, reset, undone', () => {
    setKeys('app.walk', ['KeyK']);
    expect(keysOf('app.walk')).toEqual(['KeyK']);
    expect(isCustom('app.walk')).toBe(true);
    setKeysTogether([{ id: 'app.play', keys: ['KeyK'] }, { id: 'app.walk', keys: [] }]);
    expect([keysOf('app.play'), keysOf('app.walk')]).toEqual([['KeyK'], []]);
    expect(undoKeyChange()).toBe(true);
    expect([keysOf('app.play'), keysOf('app.walk')]).toEqual([[], ['KeyK']]);
    resetKeys('app.walk');
    expect(isCustom('app.walk')).toBe(false);
  });

  it('exports the changes only, imports them back; a file that is not a set is refused', () => {
    setKeys('app.menu', ['Ctrl+KeyM']);
    const text = exportShortcuts();
    resetAllKeys();
    expect(keysOf('app.menu')).toEqual([]);
    expect(importShortcuts(text)).toEqual({ ok: true, count: 1 });
    expect(keysOf('app.menu')).toEqual(['Ctrl+KeyM']);
    expect(importShortcuts('{"hello":1}').ok).toBe(false);
    expect(importShortcuts('not json').ok).toBe(false);
    // PR #5 D6 (seat-forge): JSON that is no object (null, a number, a list) is refused in words, never thrown.
    for (const text of ['null', '5', '[]', '"keys"']) {
      expect(() => importShortcuts(text), text).not.toThrow();
      expect(importShortcuts(text), text).toEqual({ ok: false, error: 'That file is not a Forge shortcut set.' });
    }
    expect(keysOf('app.menu'), 'a refused file changes nothing').toEqual(['Ctrl+KeyM']);
  });
});
