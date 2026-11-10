// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readContentMapDefinition, type ContentMapDefinition } from '@s2u/creator-contracts';
import { MAP_PACK, MAP_REF, minimalMapJson } from '../../creator-contracts/test/contentMapFixtures';
import { CUSTOM_MAPS_OFFLINE_WORDS, CustomOffline } from '../src/customOffline';
import type { LoadedMap } from '../src/loadMap';
import { loadContentMap } from '../src/packs/content/map';
import { mountCustomMapsSelect } from '../src/testroomContent';
import { customMapRows } from '../src/forge/customMaps';

/**
 * FP-6 item 5, the batch review's F2 (H273; product track, a test instrument): a custom map walks OFFLINE only. A custom
 * hull -- an authored map, or a disc map carrying a save's pieces -- never reaches `connectNet`'s server branches
 * (`../src/main.ts`: a server room is named after `map.path`, so a save on MP2 would join the real MP2 standing room with
 * custom collision, and an authored map's stem would go to `/rooms` or `/ws`). The guard is at the root, beside the
 * campaign's: `connectNet` reads `customOffline.has(map)` and takes the offline branch. And while the Online setting names
 * a server the Custom Maps select is disabled, saying so (`CUSTOM_MAPS_OFFLINE_WORDS`).
 */

const MAIN = readFileSync(resolvePath(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');
const body = (from: string, to: string): string => { const a = MAIN.indexOf(from); const b = MAIN.indexOf(to, a + from.length); return a < 0 || b < 0 ? '' : MAIN.slice(a, b); };
const DISC = { path: 'RUN/MP2.ZDB', archive: 'MP2', name: 'Frostfire' } as unknown as LoadedMap;

describe('FP-6 F2: which maps walk offline only', () => {
  it('an authored map always; a disc map only when the custom path marked it (a save\'s pieces on it)', async () => {
    const offline = new CustomOffline();
    const authored = await loadContentMap(readContentMapDefinition(minimalMapJson(), MAP_REF) as ContentMapDefinition);
    expect(offline.has(authored)).toBe(true);
    expect(offline.has(DISC)).toBe(false);
    const pieced = { ...DISC };
    expect(offline.mark(pieced)).toBe(pieced);
    expect(offline.has(pieced)).toBe(true);
    expect(offline.has(DISC)).toBe(false);                  // the unpieced map the worker gave stays the room's
    expect(CUSTOM_MAPS_OFFLINE_WORDS).toBe('custom maps walk offline only');
  });
});

describe('FP-6 F2: connectNet never joins a server for a custom map', () => {
  const connect = body('function connectNet(map: LoadedMap): void {', '\n}\n');
  const cond = connect.match(/\} else if \((NET\.url && [^)]*)\) \{/)?.[1];
  it('the server branch is guarded by the custom map beside the campaign', () => {
    expect(connect).toContain('const customLoad = customOffline.has(map);');
    expect(cond).toBe('NET.url && !campaignLoad && !customLoad');
  });
  it('a show of an authored map with a server set: the line main.ts holds never takes the server branch', async () => {
    const offline = new CustomOffline();
    const authored = await loadContentMap(readContentMapDefinition(minimalMapJson(), MAP_REF) as ContentMapDefinition);
    const takes = (map: object): boolean => Boolean(new Function('NET', 'campaignLoad', 'customLoad', `return ${cond!};`)(
      { url: 'wss://central.example/ws' }, false, offline.has(map)));
    expect(takes(authored)).toBe(false);
    expect(takes(offline.mark({ ...DISC }))).toBe(false);
    expect(takes(DISC)).toBe(true);                          // the control: a disc map of the room's own joins as before
  });
  it('both custom shows mark the map they show; the worker\'s plain map is not marked', () => {
    expect(body('const loadContent = ', '\n  }, layout);\n};\n')).toContain('show: (map) => { shownFrom = wantedMapFrom; customProps.clear(); show(customOffline.mark(map)); },');
    expect(MAIN).toContain('show(pieced ? customOffline.mark(pieced.map) : message.map);');
  });
  it('a row opened while Online names a server is refused in the words, before anything loads', () => {
    expect(body('const openCustom = ', '\n};\n')).toMatch(/^const openCustom = async \(value: string\): Promise<void> => \{\n  if \(NET\.url\) \{ ui\.setStatus\(CUSTOM_MAPS_OFFLINE_WORDS, 'error'\); return; \}/);
  });
  it('the select follows the Online setting: at its mount and at each change', () => {
    expect(MAIN).toContain('refreshCustomOffline = () => { customSelect.setOnline(!!NET.url); };');
    expect(body('ui.onOnline((choice: OnlineChoice) => {', '\n  });\n')).toContain('refreshCustomOffline();');
  });
});

describe('FP-6 F2: the Custom Maps select while Online names a server', () => {
  it('is disabled, saying custom maps walk offline only; enabled again when Online is off', () => {
    document.body.innerHTML = '<div class="s2u-field" id="maps-field"><select id="maps"></select></div>';
    const chosen: string[] = [];
    const s = mountCustomMapsSelect(document, document.getElementById('maps-field'), (v) => { chosen.push(v); });
    s.set(customMapRows({ records: [], mapIndex: [{ ref: MAP_REF, name: 'Yard' }], saves: [], available: [MAP_PACK] }));
    s.setOnline(true);
    const select = document.getElementById('custom-maps') as HTMLSelectElement;
    const note = document.getElementById('custom-maps-note')!;
    expect(select.disabled).toBe(true);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('custom maps walk offline only');
    select.value = 'content:fcw10.maps@1.0.0/yard';
    select.dispatchEvent(new Event('change'));
    expect(chosen).toEqual([]);                               // a disabled select opens nothing, even if a change slips by
    s.setOnline(false);
    expect(select.disabled).toBe(false);
    expect(note.hidden).toBe(true);
  });
});
