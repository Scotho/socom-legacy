import { describe, expect, it } from 'vitest';
import { assetId, BOMB_SITES_MAX, DEFAULT_SETTINGS, emptyLayout, layoutDownloadName, parseAssetId, parseLayout, placementKey, serializeLayout, SETTINGS_BOUNDS, settingsOf, type Layout, type LayoutSettings } from '../../src/forge/layout';
import { checkRecord, RECORD_LIMITS } from '../../src/forge/record';

/**
 * FORGE (the owner, 2026-10-12): a forge layout is a recipe -- references into the disc's archives and transforms --
 * never the disc's own bytes, so a layout can be kept anywhere. A browser adaptation with no original.
 */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('FORGE: asset ids', () => {
  it('name the archive and the prototype, and read back', () => {
    expect(assetId('RUN/MP2.ZDB', 'a_dumpster')).toBe('MP2:a_dumpster');
    expect(assetId('MP2', 'a_dumpster')).toBe('MP2:a_dumpster');
    expect(parseAssetId('M51:crate01')).toEqual({ archive: 'M51', model: 'crate01' });
    expect(parseAssetId('nocolon')).toBeNull();
    expect(parseAssetId(':x')).toBeNull();
  });
});

describe('FORGE: the layout file', () => {
  it('round-trips a map base, its pieces and its spawns', () => {
    const l: Layout = {
      forge: 1,
      base: { kind: 'map', archive: 'MP2' },
      pieces: [{ asset: 'MP2:a_dumpster', m: IDENTITY }],
      spawns: [{ team: 'A', p: [1, 2, 3], yaw: 0.5 }],
    };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
  });

  it('round-trips a blank base with its library', () => {
    const l = emptyLayout({ kind: 'blank', library: 'M51' });
    expect(l).toEqual({ forge: 1, base: { kind: 'blank', library: 'M51' }, pieces: [], spawns: [] });
    expect(parseLayout(serializeLayout(l))).toEqual(l);
  });

  it('keeps the base map\'s own props hidden (FG-17) as keys of name and place, absent when none is hidden', () => {
    const l: Layout = { ...emptyLayout({ kind: 'map', archive: 'MP2' }), hidden: ['crate@100,0,-20', 'barrel_single@7,8,9'] };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    expect(parseLayout(serializeLayout(emptyLayout({ kind: 'map', archive: 'MP2' })))).not.toHaveProperty('hidden');
    expect(() => parseLayout(JSON.stringify({ ...l, hidden: ['crate'] }))).toThrow(/hidden 0/);
    expect(placementKey('crate', 99.6, -0.4, -20.2)).toBe('crate@100,0,-20');
  });

  it('keeps its NPCs (FG-21): a side, the map’s character type on it, a place and a facing; absent when none', () => {
    const l: Layout = { ...emptyLayout({ kind: 'map', archive: 'MP2' }), npcs: [{ side: 'terrorist', type: 2, p: [1, 2, 3], yaw: 0.5 }, { side: 'seal', type: 0, p: [4, 5, 6], yaw: 0 }] };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    expect(parseLayout(serializeLayout(emptyLayout({ kind: 'map', archive: 'MP2' })))).not.toHaveProperty('npcs');
    expect(() => parseLayout(JSON.stringify({ ...l, npcs: [{ side: 'zombie', type: 0, p: [0, 0, 0], yaw: 0 }] }))).toThrow(/npc 0/);
    expect(() => parseLayout(JSON.stringify({ ...l, npcs: [{ side: 'seal', type: -1, p: [0, 0, 0], yaw: 0 }] }))).toThrow(/npc 0/);
  });

  it('keeps its settings (FG-24, FG.R18): the day/night light, the fog distance, the lobby cap and the round options, bounded; absent when none', () => {
    const settings: LayoutSettings = { timeOfDay: null, light: 0.4, fogFar: 2500, players: 32, rounds: 7, roundSeconds: 300, friendlyFire: false, npcBehaviour: 'patrol', eqLimit: 0, respawn: false };
    const l: Layout = { ...emptyLayout({ kind: 'map', archive: 'MP2' }), settings };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    // A partial record keeps only what it names; the rest reads as the disc's (`DEFAULT_SETTINGS`, `settingsOf`).
    const part = { ...emptyLayout({ kind: 'map', archive: 'MP2' }), settings: { fogFar: 800 } };
    expect(parseLayout(JSON.stringify(part))).toEqual(part);
    expect(settingsOf(parseLayout(JSON.stringify(part)))).toEqual({ ...DEFAULT_SETTINGS, fogFar: 800 });
    expect(parseLayout(serializeLayout(emptyLayout({ kind: 'map', archive: 'MP2' })))).not.toHaveProperty('settings');
    expect(DEFAULT_SETTINGS).toEqual({ timeOfDay: null, light: 1, fogFar: null, players: 16, rounds: 11, roundSeconds: 360, friendlyFire: false, npcBehaviour: 'patrol', eqLimit: 0, respawn: false });
    // Out of bounds, or not a number: refused with the field's name.
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { light: 1.5 } }))).toThrow(/light/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { fogFar: 10 } }))).toThrow(/fogFar/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { players: 33 } }))).toThrow(/players/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { players: 7 } }))).toThrow(/players/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { rounds: 0 } }))).toThrow(/rounds/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { roundSeconds: 10 } }))).toThrow(/roundSeconds/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { friendlyFire: 'yes' } }))).toThrow(/friendlyFire/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: { gravity: 2 } }))).toThrow(/settings/);
    expect(() => parseLayout(JSON.stringify({ ...l, settings: [] }))).toThrow(/settings/);
    expect(SETTINGS_BOUNDS.players).toEqual({ min: 2, max: 32, step: 2 });
  });

  it('keeps the NPCs\' behaviour (NPB-6, NPB.R10): `sentry` round-trips, a layout that names none reads as `patrol`, an unknown value is refused', () => {
    const base = emptyLayout({ kind: 'map', archive: 'MP2' });
    const sentry: Layout = { ...base, settings: { npcBehaviour: 'sentry' } };
    expect(parseLayout(serializeLayout(sentry))).toEqual(sentry);
    expect(settingsOf(parseLayout(serializeLayout(sentry))).npcBehaviour).toBe('sentry');
    // NPB.R10 (the owner, 2026-10-25): the forge's NPCs are the lobby's bots by default, so a layout that names none patrols.
    expect(settingsOf(parseLayout(JSON.stringify({ ...base, settings: { fogFar: 800 } }))).npcBehaviour).toBe('patrol');
    expect(settingsOf(parseLayout(serializeLayout(base))).npcBehaviour).toBe('patrol');
    for (const bad of ['hunt', 'Patrol', '', 1, null, true]) {
      expect(() => parseLayout(JSON.stringify({ ...base, settings: { npcBehaviour: bad } })), String(bad)).toThrow(/npcBehaviour/);
    }
  });

  it("keeps the match's arsenal and CREATE GAME rows: valves over the map's, kit picks per side, EQlimit 0..4, respawn", () => {
    const base = emptyLayout({ kind: 'map', archive: 'MP2' });
    const arsenal = { valves: { Enable_c4: 9, Enable_RPG: 9, Enablesig_commando: 0 }, kits: { seal: [{ slot: 4, id: 151 }], terrorist: [] } };
    const l: Layout = { ...base, settings: { arsenal, eqLimit: 4, respawn: true } };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    expect(settingsOf(parseLayout(serializeLayout(base)))).toMatchObject({ eqLimit: 0, respawn: false });
    expect(settingsOf(parseLayout(serializeLayout(base)))).not.toHaveProperty('arsenal');
    expect(parseLayout(JSON.stringify({ ...base, settings: { arsenal: null } })).settings).toEqual({ arsenal: null });
    const bad = (a: unknown): (() => unknown) => () => parseLayout(JSON.stringify({ ...base, settings: { arsenal: a } }));
    expect(bad({ valves: { gravity: 1 }, kits: { seal: [], terrorist: [] } })).toThrow(/arsenal/);       // not an Enable_ valve
    expect(bad({ valves: { Enable_c4: 64 }, kits: { seal: [], terrorist: [] } })).toThrow(/arsenal/);    // past the side and lock bits
    expect(bad({ valves: { Enable_c4: 1.5 }, kits: { seal: [], terrorist: [] } })).toThrow(/arsenal/);
    expect(bad({ valves: {}, kits: { seal: [{ slot: 5, id: 151 }], terrorist: [] } })).toThrow(/arsenal/);
    expect(bad({ valves: {}, kits: { seal: [{ slot: 4, id: 254 }], terrorist: [] } })).toThrow(/arsenal/); // FULL_SLOT is no item
    expect(bad({ valves: {}, kits: { seal: [] } })).toThrow(/arsenal/);
    expect(bad({ valves: {}, kits: { seal: [], terrorist: [] }, extra: 1 })).toThrow(/arsenal/);
    for (const v of [-1, 5, 1.5, '1']) expect(() => parseLayout(JSON.stringify({ ...base, settings: { eqLimit: v } })), String(v)).toThrow(/eqLimit/);
    expect(() => parseLayout(JSON.stringify({ ...base, settings: { respawn: 1 } }))).toThrow(/respawn/);
  });

  it('keeps an optional objectives block (FG-51): the game type and a bomb, defaults filled, later keys kept', () => {
    const full: Layout = {
      ...emptyLayout({ kind: 'blank', library: 'MP2' }),
      objectives: {
        gameType: 2,
        bomb: {
          start: [1, 2, 3],
          sites: [
            { team: 0, at: [10, 0, 0], yaw: 0.5, range: 15, elevation: 15 },
            { team: 1, at: [-10, 0, 4], yaw: 0, range: 12, elevation: -1 },
          ],
        },
      },
    };
    expect(parseLayout(serializeLayout(full))).toEqual(full);
    const bare = { ...emptyLayout({ kind: 'map', archive: 'MP72' }), objectives: { gameType: 2, bomb: { sites: [{ team: 0, at: [4, 5, 6] }] } } };
    expect(parseLayout(JSON.stringify(bare)).objectives).toEqual({
      gameType: 2,
      bomb: { sites: [{ team: 0, at: [4, 5, 6], yaw: 0, range: 15, elevation: 15 }] },
    });
    const typeOnly = { ...emptyLayout({ kind: 'blank', library: 'MP2' }), objectives: { gameType: 5 } };
    expect(parseLayout(JSON.stringify(typeOnly))).toEqual(typeOnly);
    expect(parseLayout(serializeLayout(emptyLayout({ kind: 'blank', library: 'MP2' })))).not.toHaveProperty('objectives');
    // A later mode's key is not this slice's, and a save of the parsed file still carries it.
    const later = { ...emptyLayout({ kind: 'map', archive: 'MP6' }), objectives: { gameType: 4, escortees: [{ name: 'Hostage' }], bomb: { bases: [{ team: 0 }], sites: [{ team: 1, at: [0, 0, 0] }] } } };
    const read = parseLayout(JSON.stringify(later));
    expect(read.objectives).toMatchObject({ gameType: 4, escortees: [{ name: 'Hostage' }], bomb: { bases: [{ team: 0 }], sites: [{ team: 1, at: [0, 0, 0], yaw: 0, range: 15, elevation: 15 }] } });
    expect(parseLayout(serializeLayout(read)).objectives).toEqual(read.objectives);
    expect(() => parseLayout(JSON.stringify({ ...typeOnly, objectives: { gameType: 0 } }))).toThrow(/gameType/);
    expect(() => parseLayout(JSON.stringify({ ...typeOnly, objectives: { gameType: 6 } }))).toThrow(/gameType/);
    expect(() => parseLayout(JSON.stringify({ ...typeOnly, objectives: { gameType: 2, bomb: { sites: [{ team: 2, at: [0, 0, 0] }] } } }))).toThrow(/bomb site 0/);
    expect(() => parseLayout(JSON.stringify({ ...typeOnly, objectives: { gameType: 2, bomb: { sites: [{ team: 0, at: [0, 0] }] } } }))).toThrow(/point/);
    expect(() => parseLayout(JSON.stringify({ ...typeOnly, objectives: { gameType: 2, bomb: { sites: [{ team: 0, at: [0, 0, 0], range: 0 }] } } }))).toThrow(/range/);
    expect(() => parseLayout(JSON.stringify({ ...typeOnly, objectives: [] }))).toThrow(/objectives/);
  });

  it('FG-51: a bomb names at most BOMB_SITES_MAX sites, the record\'s marker bound (the review\'s low 6)', () => {
    expect(BOMB_SITES_MAX).toBe(RECORD_LIMITS.spawns);
    const site = { team: 0, at: [0, 0, 0] };
    const at = (n: number) => ({ ...emptyLayout({ kind: 'blank', library: 'MP2' }), objectives: { gameType: 2, bomb: { sites: Array.from({ length: n }, () => site) } } });
    expect(parseLayout(JSON.stringify(at(BOMB_SITES_MAX))).objectives!.bomb!.sites).toHaveLength(BOMB_SITES_MAX);
    expect(() => parseLayout(JSON.stringify(at(BOMB_SITES_MAX + 1)))).toThrow(/sites/);
    const record = { v: 2, name: 'x', base: 'MP2', assets: [], pieces: [], spawns: [], objectives: at(BOMB_SITES_MAX + 1).objectives };
    expect(checkRecord(record)).toMatch(/sites/);
  });

  it('FG-51: a block may name no game type (Map\'s own, L1), and a bomb marker keeps its lock', () => {
    const untyped = {
      ...emptyLayout({ kind: 'map', archive: 'MP72' }),
      objectives: { bomb: { start: [1, 2, 3], startLocked: true, sites: [{ team: 0, at: [4, 5, 6], yaw: 0, range: 15, elevation: 15, locked: true }] } },
    } as Layout;
    const read = parseLayout(JSON.stringify(untyped));
    expect(read.objectives).not.toHaveProperty('gameType');
    expect(read.objectives).toEqual(untyped.objectives);
    expect(parseLayout(serializeLayout(read))).toEqual(read);
    // An unlocked marker has no field, as an unlocked piece.
    const open = parseLayout(JSON.stringify({ ...untyped, objectives: { gameType: 2, bomb: { start: [1, 2, 3], sites: [{ team: 1, at: [0, 0, 0] }] } } }));
    expect(open.objectives!.bomb).not.toHaveProperty('startLocked');
    expect(open.objectives!.bomb!.sites[0]).not.toHaveProperty('locked');
    expect(() => parseLayout(JSON.stringify({ ...untyped, objectives: { bomb: { sites: [{ team: 0, at: [0, 0, 0], locked: 'yes' }] } } }))).toThrow(/lock/);
    expect(() => parseLayout(JSON.stringify({ ...untyped, objectives: { bomb: { start: [0, 0, 0], startLocked: false, sites: [] } } }))).toThrow(/startLocked/);
  });

  it('refuses what is not a layout, saying why', () => {
    expect(() => parseLayout('not json')).toThrow(/JSON/);
    expect(() => parseLayout('{"forge":2,"base":{"kind":"blank","library":"M51"},"pieces":[],"spawns":[]}')).toThrow(/version/);
    expect(() => parseLayout('{"forge":1,"base":{"kind":"lake"},"pieces":[],"spawns":[]}')).toThrow(/base/);
    expect(() => parseLayout('{"forge":1,"base":{"kind":"map","archive":"MP2"},"pieces":[{"asset":"MP2:x","m":[1,2]}],"spawns":[]}')).toThrow(/piece 0/);
    expect(() => parseLayout('{"forge":1,"base":{"kind":"map","archive":"MP2"},"pieces":[{"asset":"bad","m":' + JSON.stringify(IDENTITY) + '}],"spawns":[]}')).toThrow(/piece 0/);
    expect(() => parseLayout('{"forge":1,"base":{"kind":"map","archive":"MP2"},"pieces":[],"spawns":[{"team":"C","p":[0,0,0],"yaw":0}]}')).toThrow(/spawn 0/);
  });

  it('names a bad matrix, even when the spawns list is missing, and a missing list when the pieces are valid', () => {
    const broken = JSON.stringify({ forge: 1, base: { kind: 'map', archive: 'MP99' }, pieces: [{ asset: 'MP2:crate', m: [1, 2, 3] }] });
    expect(() => parseLayout(broken)).toThrow(/piece 0 matrix is not a column-major 4x4/);
    expect(() => parseLayout(broken)).not.toThrow(/no pieces or spawns/);
    const noSpawns = JSON.stringify({ forge: 1, base: { kind: 'map', archive: 'MP2' }, pieces: [{ asset: 'MP2:crate', m: IDENTITY }] });
    expect(() => parseLayout(noSpawns)).toThrow(/spawns is not a list/);
    const unseen = { forge: 1 as const, base: { kind: 'map' as const, archive: 'MP99' }, pieces: [{ asset: 'MP2:crate', m: IDENTITY }], spawns: [] };
    expect(parseLayout(JSON.stringify(unseen))).toEqual(unseen);
  });

  it('keeps a name and a camera, and the downloaded file takes the name', () => {
    const l: Layout = { ...emptyLayout({ kind: 'blank', library: 'floor' }), name: 'Night op', camera: { x: 1, y: 2, z: 3, yaw: 4, pitch: 5 } };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    expect(() => parseLayout(JSON.stringify({ ...l, camera: { x: 'no', y: 0, z: 0, yaw: 0, pitch: 0 } }))).toThrow(/camera\.x/);
    expect(layoutDownloadName('Night op', { kind: 'map', archive: 'MP2' })).toBe('Night op.json');
    expect(layoutDownloadName('Night op.json', { kind: 'map', archive: 'MP2' })).toBe('Night op.json');
    expect(layoutDownloadName(undefined, { kind: 'map', archive: 'MP2' })).toBe('forge-MP2.json');
    expect(layoutDownloadName('  ', { kind: 'blank', library: 'floor' })).toBe('forge-blank.json');
    expect(layoutDownloadName('a/b:c', { kind: 'map', archive: 'MP2' })).toBe('abc.json');
  });

  it('keeps a lock on a piece, a spawn or an NPC (FG-49); absent when unlocked', () => {
    const l: Layout = {
      ...emptyLayout({ kind: 'map', archive: 'MP2' }),
      pieces: [{ asset: 'MP2:a_dumpster', m: IDENTITY, locked: true }],
      spawns: [{ team: 'A', p: [1, 2, 3], yaw: 0.5, locked: true }],
      npcs: [{ side: 'seal', type: 0, p: [4, 5, 6], yaw: 0, locked: true }],
    };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    const open = parseLayout(JSON.stringify({ ...emptyLayout({ kind: 'map', archive: 'MP2' }), pieces: [{ asset: 'MP2:a_dumpster', m: IDENTITY, locked: false }] }));
    expect(open.pieces[0]).not.toHaveProperty('locked');
    expect(() => parseLayout(JSON.stringify({ ...l, pieces: [{ asset: 'MP2:a_dumpster', m: IDENTITY, locked: 'yes' }] }))).toThrow(/piece 0 lock/);
  });
});

describe('S3b item 1: the viewer\'s layout helpers with a content base (a LayoutBase member)', () => {
  const content = { kind: 'content' as const, ref: { id: 'fcw10.maps', version: '1.0.0', hash: 'c'.repeat(64) }, mapId: 'yard', library: 'MP72' };
  it('emptyLayout and serializeLayout write a retail base\'s bytes as before (pinned)', () => {
    expect(serializeLayout(emptyLayout({ kind: 'map', archive: 'MP2' }))).toBe('{\n "forge": 1,\n "base": {\n  "kind": "map",\n  "archive": "MP2"\n },\n "pieces": [],\n "spawns": []\n}');
    expect(serializeLayout(emptyLayout({ kind: 'blank', library: 'MP72' }))).toBe('{\n "forge": 1,\n "base": {\n  "kind": "blank",\n  "library": "MP72"\n },\n "pieces": [],\n "spawns": []\n}');
    expect([layoutDownloadName(undefined, { kind: 'map', archive: 'MP2' }), layoutDownloadName(undefined, { kind: 'blank', library: 'MP72' })])
      .toEqual(['forge-MP2.json', 'forge-blank.json']);
  });
  it('a content base round-trips the file; its download is named for its map', () => {
    const l = emptyLayout(content);
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    expect(layoutDownloadName(undefined, content)).toBe('forge-yard.json');
  });
});
