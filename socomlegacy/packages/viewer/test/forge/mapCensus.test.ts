// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { censusOf, censusOfCopies, censusOptions, copiesOf } from '../../src/forge/mapCensus';
import { showInspectorData } from '../../src/forge/panels/inspectorPanel';

/**
 * Which disc maps hold doors, turrets and hostages (a browser adaptation, FG.R2): the Inspector's Map choice for a
 * copied door, turret or hostage lists only the maps that have one to copy.
 */
describe('the map census', () => {
  it("counts a map's doors, turrets and hostage characters", () => {
    const map = { doors: [{}, {}], turrets: [{}], types: { seal: [], terrorist: [], escortees: [{ character: 'a' }, { character: 'a' }, { character: 'b' }, null] } };
    expect(censusOf(map as never)).toEqual({ door: 2, turret: 1, hostage: 2, ladder: 0, gate: 0, barrier: 0, flare: 0, sound: 0, effect: 0 });
    expect(censusOf({} as never)).toEqual({ door: 0, turret: 0, hostage: 0, ladder: 0, gate: 0, barrier: 0, flare: 0, sound: 0, effect: 0 });
  });

  it("a map's copies: its hostage characters each once, by name; none of a kind, an empty list; their counts the census", () => {
    const map = { doors: [], turrets: [], types: { seal: [], terrorist: [], escortees: [{ character: 'a' }, { character: 'a' }, { character: 'b' }] } };
    const copies = copiesOf(map as never);
    expect(copies).toEqual({ door: [], turret: [], hostage: [['a', 'a'], ['b', 'b']], ladder: [], gate: [], barrier: [], flare: [], sound: [], effect: [] });
    expect(censusOfCopies(copies)).toEqual({ door: 0, turret: 0, hostage: 2, ladder: 0, gate: 0, barrier: 0, flare: 0, sound: 0, effect: 0 });
  });

  it('lists every map at all times, each with what it has: a count, "counting..." until read, greyed "none"; the current never greyed', () => {
    const maps = [['MP2', 'MP2 · FROSTFIRE'], ['MP6', 'MP6 · DESERT GLORY'], ['MP72', 'MP72 · CROSSROADS'], ['M51', 'M51 · TIGER BAY (campaign)']] as const;
    const count = (o: Partial<Record<string, number>>) => ({ door: 0, turret: 0, hostage: 0, ladder: 0, gate: 0, barrier: 0, flare: 0, sound: 0, effect: 0, ambient: 0, ...o });
    const known = new Map([['MP2', count({ door: 3 })], ['MP72', count({ turret: 3, barrier: 1 })]]);
    const at = (s: string) => known.get(s) ?? null;
    expect(censusOptions(maps, at, 'door', 'MP2')).toEqual([
      ['MP2', 'MP2 · FROSTFIRE · 3 doors', false], ['MP6', 'MP6 · DESERT GLORY · counting…', false],
      ['MP72', 'MP72 · CROSSROADS · none', true], ['M51', 'M51 · TIGER BAY (campaign) · counting…', false],
    ]);
    expect(censusOptions(maps, at, 'barrier', 'MP72')[2]).toEqual(['MP72', 'MP72 · CROSSROADS · 1 damage trigger', false]);
    expect(censusOptions(maps, at, 'hostage', 'MP2')[0]).toEqual(['MP2', 'MP2 · FROSTFIRE · none', false]);   // the current: never greyed
  });

  it('the Inspector draws a greyed option disabled', () => {
    const data = document.createElement('dl');
    showInspectorData({ data }, [], [{ label: 'Map', kind: 'select', value: 'a', options: [['a', 'A', false], ['b', 'B', true]], set: () => {} }]);
    const options = [...data.querySelectorAll('option')];
    expect(options.map((o) => o.disabled)).toEqual([false, true]);
  });
});

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))('the map census on the disc (SOCOM_ISO)', () => {
  it("Frostfire: three doors, no turret, no hostage; Desert Glory's three hostages", async () => {
    const { IsoAssetSource } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { loadMap } = await import('../../src/loadMap');
    const source = new IsoAssetSource(fsBlob(ISO!));
    expect(censusOf(await loadMap(source, 'RUN/MP2.ZDB'))).toMatchObject({ door: 3, turret: 0, hostage: 0, ladder: 0, gate: 0, barrier: 0 });   // its 5 ladders are its buildings'
    expect(censusOf(await loadMap(source, 'RUN/MP6.ZDB'))).toMatchObject({ hostage: 3 });
    // The copies the Map choice switches to at once: the first of each list, named as the door's own node.
    const doors = copiesOf(await loadMap(source, 'RUN/MP2.ZDB')).door;
    expect(doors.map(([name]) => name)).toEqual(['bdoor_4', 'wdoor_1', 'wdoor_2']);
    expect(doors[0]![1]).toMatch(/^bdoor_4 · .+ · /);
    // The ladder props (a prop whose own hull holds the ladder's `m_appflags` 2 polygons): Sandstorm's three, each once.
    const ladders = copiesOf(await loadMap(source, 'RUN/MP73.ZDB')).ladder;
    expect(ladders.map(([name]) => name)).toEqual(['ladder35', 'ladder42', 'ladder50']);
    expect(ladders[0]![1]).toBe('ladder35 · 35 tall');
  }, 120_000);
});
