// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { replaysHtml } from '../../src/console/render/replays';
import { drawerHtml, roomsHtml } from '../../src/console/render/rooms';
import { replayMapAddress } from '../../src/replay/mount';
import { replayMapOpening, replayMapRefusal } from '../../src/replay/refusalKind';
import { loadoutsHtml } from '../../src/console/render/loadouts';
import { missionRowsOf } from '../../src/console/loadoutModel';
import { mapLabel } from '@s2u/archive/mapNames';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState, type Adapters, type ReplayRow, type Room } from '../../src/console/state';
import type { CustomView, LoadoutListView, LoadoutsAdapter } from '../../src/console/state';

/**
 * MN-1 (OT.R113, the owner 2026-11-07: "Everywhere that we do public facing UI (replays etc), we should always use the
 * display name not the map code"): the console's string builders, fed a stem-only input (no disc, no mission list), draw
 * a map's display name and never its code. Attributes that carry an address or a key (`href`, `src`, `data-*`) may
 * keep the stem; everything else a player reads or hears (text, `aria-label`, `alt`) may not. Product track.
 */
const CODE = /\bMP\d{1,2}\b/;
/** The markup less the attributes that may carry a stem: an address, a picture's source, a data key. */
const shown = (html: string): string => html.replace(/\s(?:href|src|data-[\w-]+)="[^"]*"/g, '');

const ROW = (id: string, map: string): ReplayRow => ({ id, map, rules: 'classic', when: '2026-10-01 10:00', length: '12:34', players: 2, names: 'Alpha, Bravo' });

describe('MN-1: Replays names the map, never its code', () => {
  it('the list rows, their labels, the drawer\'s name, its Map fact and its label (render/replays.ts)', () => {
    const A: Adapters = sampleAdapters();
    A.replays = { ...A.replays, view: () => ({ kind: 'ok', entries: [ROW('a', 'MP72'), ROW('b', 'MP63'), ROW('c', 'MP99')] }) };
    const S = createState(A);
    S.screen = 'replays';
    const html = replaysHtml(S, A);
    expect(shown(html)).not.toMatch(CODE);
    expect(html).toContain('aria-label="Replay on Crossroads, classic');
    expect(html).toContain('aria-label="Replay Crossroads"');
    expect(html).toContain('<dt>Map</dt><dd>Crossroads</dd>');
    expect(html).toContain('>After Hours<');
    expect(html).toContain('>Unknown map<');
  });
});

describe('MN-1: Browse rooms names the map, never its code', () => {
  it('a classic room\'s row, its label and its drawer, fed stems (render/rooms.ts)', () => {
    const A: Adapters = sampleAdapters();
    const stems: Room[] = [
      { id: 'r1', name: 'Alpha', map: 'MP2', mode: 'Suppression', n: 3, cap: 16, pingMs: 40 },
      { id: 'r2', name: 'Bravo', map: 'MP54', n: 1, cap: null, pingMs: 40 },
    ];
    A.rooms = { ...A.rooms, list: () => stems };
    const S = createState(A);
    S.screen = 'rooms';
    const html = roomsHtml(S, A);
    expect(shown(html)).not.toMatch(CODE);
    expect(html).toContain('<span>Frostfire</span>');
    expect(html).toContain('<span>Last Bastion</span>');
    const drawer = drawerHtml({ ...stems[0]!, art: '/MP2.png', i: 0 }, S, A);   // the drawer, its picture's alt
    expect(shown(drawer)).not.toMatch(CODE);
    expect(drawer).toContain('<dt>Map</dt><dd>Frostfire</dd>');
    expect(drawer).toContain('alt="Frostfire"');
  });

  it('a custom match\'s row and drawer, fed stems (render/rooms.ts customRowHtml, customDrawerHtml)', () => {
    const A: Adapters = sampleAdapters();
    const view: CustomView = { kind: 'ok', empty: null, rows: [
      { id: 'L1', name: 'Crate maze', map: 'MP72', players: 3, max: 16, inMatch: false, locked: true, href: '/forge?l=MP72' },
    ] };
    A.custom = { sync: () => {}, view: () => view, refresh: async () => {}, join: () => '/forge' };
    A.rooms = { ...A.rooms, list: () => [] };
    const S = createState(A);
    S.screen = 'rooms';
    S.rooms.kind = 2;                                     // CUSTOM
    const html = roomsHtml(S, A);
    expect(shown(html)).not.toMatch(CODE);
    expect(html).toContain('<span>Crossroads</span>');
  });
});

describe('MN-1: the replay refusal\'s sentence names the map', () => {
  it('replayMapRefusal and replayMapAddress (replay/mount.ts; modern/replays/worldStage.ts says the same sentence)', () => {
    expect(replayMapRefusal('MP72')).toBe('This recording is of map Crossroads, which the page could not open.');
    expect(replayMapRefusal('mp99')).toBe('This recording is of an unknown map, which the page could not open.');
    const r = replayMapAddress('?map=MP72&replay=u', 'MP72', 'MP2');
    expect(r).toEqual({ refuse: 'This recording is of map Crossroads, which the page could not open.' });
  });
});

describe('MN-1 review F1: the Armory loadout editor names its missions, never by stem', () => {
  // No disc: the release eight (`FIRST_RELEASE_MAPS`, Blizzard, The Ruins, Desert Glory and Fish Hook with them) in number
  // order; the disc's table order (51, 71, 72, 1, 2, 6, 7, 12) is `./loadout/loadoutDisc.test.ts`'s pin.
  it('missionRowsOf, no disc (the release eight) and with the disc\'s table: named, in the launcher\'s Title case (F5)', () => {
    expect(missionRowsOf(null, null).map((r) => [r.mission, r.name])).toEqual([
      ['MP1', 'Blizzard'], ['MP2', 'Frostfire'], ['MP6', 'Desert Glory'], ['MP7', 'Night Stalker'], ['MP12', 'The Ruins'],
      ['MP51', 'Vigilance'], ['MP71', 'Fish Hook'], ['MP72', 'Crossroads'],
    ]);
    expect(missionRowsOf(null, [63, 99]).map((r) => r.name)).toEqual(['After Hours', 'Unknown map']);
  });

  it('the side\'s mission rows (render/loadouts.ts): labels named, the hint carries no stem', () => {
    const A: Adapters = sampleAdapters();
    const list: LoadoutListView = { kind: 'ok', empty: null, rows: [
      { mission: 'MP2', name: 'MP2', state: 'saved' }, { mission: 'MP72', name: 'CROSSROADS', state: 'default' }, { mission: 'MP53', name: 'FOXHUNT', state: 'unoffered' },
    ] };
    A.loadouts = { list: () => list, editor: () => ({ kind: 'locked' }) } as unknown as LoadoutsAdapter;
    const S = createState(A);
    S.screen = 'loadouts';
    S.lo.side = 'seal';
    const html = loadoutsHtml(S, A);
    expect(shown(html)).not.toMatch(CODE);
    for (const n of ['Frostfire', 'Crossroads', 'Foxhunt']) expect(html).toContain(n);
  });
});

describe('MN-1 review F2: the replay page\'s reopening line names the map', () => {
  it('replayMapOpening (replay/mount.ts\'s check)', () => {
    expect(replayMapOpening('MP72')).toBe('Opening the recording\'s map, Crossroads.');
    expect(replayMapOpening('MP99')).toBe('Opening the recording\'s map.');
  });
});

describe('MN-1 review F5: the launcher\'s own surfaces say a map in Title case before and after the disc', () => {
  it('mapLabel title-cases a known map\'s disc name; an unknown text passes', () => {
    expect(mapLabel('FROSTFIRE')).toBe('Frostfire');
    expect(mapLabel("RAT'S NEST")).toBe("Rat's Nest");
    expect(mapLabel('MP2')).toBe('Frostfire');
    expect(mapLabel('A MODDED MAP')).toBe('A MODDED MAP');
  });
});
