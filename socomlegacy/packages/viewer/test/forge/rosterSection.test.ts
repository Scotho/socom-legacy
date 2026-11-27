// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  it('its note says a lobby made from the layout uses the columns too, not that the lobby keeps the map\'s own (research 425 section 0)', () => {
    const s = buildRosterSection(document);
    s.draw(view());
    const note = s.body.querySelector('p.fx-setting-note')!.textContent ?? '';
    expect(note).not.toMatch(/lobby[^.]*keep[^.]*map.s own/i);
    expect(note).toMatch(/lobby made from (this|the|your) layout/i);
    expect(note).toMatch(/ARMORY/);
    expect(note).toMatch(/match/);
  });

  // jsdom computes no layout: this pins the stylesheet's TEXT, not a rendered layout (the picture is the seat's).
  it('pins the stylesheet\'s text, not a rendered layout: a roster row stacks its selects, each label on one line', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, '../../src/forge/forge.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.trim().split(/\s*,\s*/), body: m[2]! }));
    // Every rule that reaches a roster row, whatever stands before it in the selector or around it (a media query, a
    // stronger selector): a later rule putting the two selects side by side again must not pass (the review's finding 1).
    const reaching = (end: string): string[] => rules.filter((r) => r.selectors.some((s) => s === end || s.endsWith(` ${end}`))).map((r) => r.body);
    const columns = reaching('.fx-roster-row').flatMap((b) => [...b.matchAll(/grid-template-columns:\s*([^;]+)/g)].map((m) => m[1]!.trim()));
    expect(columns.length).toBeGreaterThan(0);
    for (const c of columns) expect(c).toMatch(/^minmax\(0,\s*1fr\)$/);
    const sel = reaching('.fx-roster-row .fx-select').join(';');
    for (const d of [/white-space:\s*nowrap/, /overflow:\s*hidden/, /text-overflow:\s*ellipsis/, /min-width:\s*0/]) expect(sel).toMatch(d);
    expect(sel).not.toMatch(/white-space:\s*(normal|pre-wrap|pre-line|break-spaces)/);
  });
});
