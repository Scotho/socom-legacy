// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CharacterRoster } from '../../src/forge/layout';
import { buildRosterSection, type RosterView } from '../../src/forge/panels/rosterSection';

/** The Map Settings panel's Characters section (`../../src/forge/panels/rosterSection`, over `./rosterSetting`'s edits). */
const view = (o: Partial<RosterView> = {}): RosterView => ({
  setting: null, home: 'MP2', homeCounts: { seal: 4, terrorist: 4 }, maps: [['MP2', 'MP2 · Frostfire'], ['MP81', 'MP81 · Blizzard']],
  choicesOf: (stem, side) => (stem === 'MP81' ? [{ index: 0, label: `${side} 1 · arctic_a` }, { index: 1, label: `${side} 2 · arctic_b` }]
    : [0, 1, 2, 3].map((index) => ({ index, label: `${side} ${index + 1}` }))),
  locked: false, rev: 0, ...o,
});

describe('Map Settings: Characters', () => {
  it('shows the map\'s own columns until one is set, and writes a column through the roster\'s edit', () => {
    const s = buildRosterSection(document);
    const changes: (CharacterRoster | null)[] = [];
    s.onChange((n) => changes.push(n));
    s.draw(view());
    const mapSel = (side: string, col: number) => s.body.querySelector<HTMLSelectElement>(`select[data-roster-side="${side}"][data-roster-column="${col}"][data-roster-part="map"]`)!;
    const typeSel = (side: string, col: number) => s.body.querySelector<HTMLSelectElement>(`select[data-roster-side="${side}"][data-roster-column="${col}"][data-roster-part="type"]`)!;
    expect([0, 1, 2, 3].map((c) => mapSel('seal', c).value)).toEqual(['MP2', 'MP2', 'MP2', 'MP2']);
    expect(typeSel('seal', 2).value).toBe('2');
    mapSel('seal', 1).value = 'MP81';
    mapSel('seal', 1).dispatchEvent(new Event('change'));
    expect(changes.pop()!.seal[1]).toEqual({ map: 'MP81', index: 0 });
    // A map still being read: its type list says so, and is not a choice yet.
    s.draw(view({ setting: { seal: [{ map: 'MP81', index: 1 }], terrorist: [] }, choicesOf: () => null, rev: 1 }));
    expect(typeSel('seal', 0).disabled).toBe(true);
    expect(typeSel('seal', 0).textContent).toMatch(/reading/i);
    s.draw(view({ setting: { seal: [{ map: 'MP81', index: 1 }], terrorist: [] }, rev: 2 }));
    expect([mapSel('seal', 0).value, typeSel('seal', 0).value]).toEqual(['MP81', '1']);
    s.body.querySelector<HTMLButtonElement>('[data-roster-reset]')!.click();
    expect(changes.pop()).toBeNull();
    s.draw(view({ locked: true, rev: 3 }));
    expect([...s.body.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select, button')].every((e) => e.disabled)).toBe(true);
  });
});
