import { describe, expect, it } from 'vitest';
import { addAll, others, QuickHideKeys, quickHideNotice } from '../../src/forge/quickHide';
import { keysOf, SHORTCUT_COMMANDS } from '../../src/forge/shortcuts';

/** The quick hide (a browser adaptation: the editor's view alone; the owner, 2026-11-24). Unit tests, no disc. */
describe('the quick hide', () => {
  it('H hides the selection, Shift+H everything else, U shows all; the docks keep no key', () => {
    expect(keysOf('app.hide')).toEqual(['KeyH']);
    expect(keysOf('app.hideOthers')).toEqual(['Shift+KeyH', 'Ctrl+KeyH']);
    expect(keysOf('app.unhideAll')).toEqual(['KeyU']);
    expect(keysOf('app.docks')).toEqual([]);
    // No other command shares those keys where the hide applies.
    for (const chord of ['KeyH', 'Shift+KeyH', 'Ctrl+KeyH', 'KeyU']) {
      const on = SHORTCUT_COMMANDS.filter((c) => c.layer === 'mode' && c.defaults.includes(chord) && c.scopes.some((s) => s === 'forge' || s.startsWith('geo:')));
      expect(on.map((c) => c.id), chord).toHaveLength(1);
    }
  });

  it('counts what it hides newly, and isolates by what is kept', () => {
    const s = new Set(['a']);
    expect(addAll(s, ['a', 'b', 'c'])).toBe(2);
    expect([...s]).toEqual(['a', 'b', 'c']);
    expect(others(['a', 'b', 'c', 'd'], ['b', 'd'])).toEqual(['a', 'c']);
    const k = new QuickHideKeys();
    k.props.add('3:0'); k.data.add('slot:A1'); k.data.add('hostage:h1');
    expect(k.size).toBe(3);
    k.clear();
    expect(k.size).toBe(0);
  });

  it('the viewport notice: none with nothing hidden, one kind named alone, several summed, the unhide key said', () => {
    const none = { placements: 0, props: 0, data: 0, geometry: 0 };
    expect(quickHideNotice(none, 'U')).toBeNull();
    expect(quickHideNotice({ ...none, props: 1 }, 'U')).toBe('1 map prop hidden · U to unhide all');
    expect(quickHideNotice({ ...none, placements: 2, geometry: 1 }, 'U')).toBe('3 objects (2 placements, 1 geometry object) hidden · U to unhide all');
    expect(quickHideNotice({ ...none, data: 4 }, '')).toBe('4 map items hidden');
  });
});
