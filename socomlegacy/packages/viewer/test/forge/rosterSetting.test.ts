import { describe, expect, it } from 'vitest';
import type { CharacterKit, Loadout } from '@s2u/scene';
import { parseLayout, serializeLayout, emptyLayout, type CharacterRoster, type Layout } from '../../src/forge/layout';
import {
  EMPTY_ROSTER, rosterColumns, rosterIsEmpty, rosterStems, setRosterColumn, withRoster, type RosterMap,
} from '../../src/forge/rosterSetting';

/**
 * The layout's character roster (`./rosterSetting`; the owner, 2026-11-10: "allow which characters the map can pick. Some
 * maps use different player models"): each side's ARMORY columns as types of any disc MP map's `chartype.rdr` on the
 * same side (research 95 §6), each with that map's body (lent as `./hostages` lends a hostage's) and its `character.rdr`
 * kit (`mapKits`). A browser adaptation (FG.R2): the original fixes the roster per map; every type, body and kit is the disc's.
 */
const body = (character: string, tex: string) => ({ character, subMeshes: [{ textureName: tex }], fittings: [{ meshes: [{ textureName: `${tex}_fit` }] }] });
const kit = (type: string, character: string, primary: number): CharacterKit => ({ type, character, loadout: [primary, 15, 121, 126, 194] as Loadout });
const lib = (archive: string, seals: string[], terrs: string[]): RosterMap => ({
  archive,
  textures: Object.fromEntries([...seals, ...terrs].flatMap((c) => [[`${c}_tex`, { w: c }], [`${c}_tex_fit`, { w: `${c}f` }]])) as never,
  textureFlags: {},
  types: { seal: seals.map((c) => body(c, `${c}_tex`)) as never, terrorist: terrs.map((c) => body(c, `${c}_tex`)) as never },
  arsenal: { table: {} as never, map: { valves: new Map(), selectable: { seal: [], terrorist: [] },
    kits: { seal: seals.map((c, i) => kit(`${archive.toLowerCase()}_seal${i + 1}`, c, 54 + i)), terrorist: terrs.map((c, i) => kit(`${archive.toLowerCase()}_terror${i + 1}`, c, 58 + i)) } } },
});
const MP2 = lib('MP2', ['seal_a', 'seal_b', 'seal_c', 'seal_d'], ['terr_a', 'terr_b', 'terr_c']);
const MP81 = lib('MP81', ['arctic_a', 'arctic_b'], ['russ_a']);
const libs = new Map([['MP81', MP81]]);
const libOf = (s: string): RosterMap | null => libs.get(s) ?? null;

describe('the layout file keeps the roster', () => {
  it('round-trips each side\'s columns, at most four, each a disc MP map and a type 0..3; refuses the rest', () => {
    const characters: CharacterRoster = { seal: [{ map: 'MP81', index: 1 }, { map: 'MP2', index: 0 }], terrorist: [] };
    const base = emptyLayout({ kind: 'map', archive: 'MP2' });
    const l: Layout = { ...base, settings: { characters } };
    expect(parseLayout(serializeLayout(l))).toEqual(l);
    const bad = (c: unknown): (() => unknown) => () => parseLayout(JSON.stringify({ ...base, settings: { characters: c } }));
    expect(bad({ seal: [{ map: 'MP2', index: 4 }], terrorist: [] })).toThrow(/characters/);
    expect(bad({ seal: [{ map: 'mp2', index: 0 }], terrorist: [] })).toThrow(/characters/);
    expect(bad({ seal: [{ map: 'M02', index: 0 }], terrorist: [] })).toThrow(/characters/);
    expect(bad({ seal: Array(5).fill({ map: 'MP2', index: 0 }), terrorist: [] })).toThrow(/characters/);
    expect(bad({ seal: [] })).toThrow(/characters/);
    expect(parseLayout(JSON.stringify({ ...base, settings: { characters: null } })).settings).toEqual({ characters: null });
  });
});

describe('the roster over the map\'s', () => {
  it('is the map itself with none, or an empty one', () => {
    expect(withRoster(MP2, null, libOf)).toEqual({ map: MP2, refused: [] });
    expect(withRoster(MP2, EMPTY_ROSTER, libOf).map).toBe(MP2);
    expect(rosterIsEmpty(EMPTY_ROSTER)).toBe(true);
    expect(rosterStems({ seal: [{ map: 'MP81', index: 0 }, { map: 'MP2', index: 1 }, { map: 'MP81', index: 1 }], terrorist: [{ map: 'MP6', index: 0 }] }))
      .toEqual(['MP81', 'MP2', 'MP6']);
  });

  it('puts each column\'s body and kit in the side\'s order; a lent body\'s textures under its archive; the other side kept', () => {
    const out = withRoster(MP2, { seal: [{ map: 'MP81', index: 1 }, { map: 'MP2', index: 2 }], terrorist: [] }, libOf);
    expect(out.refused).toEqual([]);
    const m = out.map;
    expect(m.types!.seal.map((b) => b!.character)).toEqual(['arctic_b', 'seal_c']);
    expect((m.types!.seal[0] as unknown as ReturnType<typeof body>).subMeshes[0]!.textureName).toBe('MP81/arctic_b_tex');
    expect((m.types!.seal[0] as unknown as ReturnType<typeof body>).fittings[0]!.meshes[0]!.textureName).toBe('MP81/arctic_b_tex_fit');
    expect((m.types!.seal[1] as unknown as ReturnType<typeof body>).subMeshes[0]!.textureName).toBe('seal_c_tex');   // the map's own: as it is
    expect(m.textures['MP81/arctic_b_tex']).toEqual({ w: 'arctic_b' });
    expect(m.arsenal!.map!.kits.seal.map((k) => [k.type, k.loadout[0]])).toEqual([['mp81_seal2', 55], ['mp2_seal3', 56]]);
    expect(m.types!.terrorist).toBe(MP2.types!.terrorist);
    expect(m.arsenal!.map!.kits.terrorist).toBe(MP2.arsenal!.map!.kits.terrorist);
    expect(MP2.types!.seal.length).toBe(4);                                    // the map not touched
    expect(MP2.textures['MP81/arctic_b_tex']).toBeUndefined();
  });

  it('names a column whose map will not load or has no such type, and leaves it out; a side left with none keeps the map\'s', () => {
    const out = withRoster(MP2, { seal: [{ map: 'MP99', index: 0 }, { map: 'MP81', index: 3 }, { map: 'MP81', index: 0 }], terrorist: [{ map: 'MP99', index: 0 }] }, libOf);
    expect(out.refused).toEqual(['SEAL 1: MP99 would not load', 'SEAL 2: MP81 has no SEAL type 4', 'Terrorist 1: MP99 would not load']);
    expect(out.map.types!.seal.map((b) => b!.character)).toEqual(['arctic_a']);
    expect(out.map.types!.terrorist).toBe(MP2.types!.terrorist);
  });
});

describe('editing the roster', () => {
  it('columns read as the map\'s own until one is set; one set writes the side whole; back to the map\'s own, none', () => {
    expect(rosterColumns(null, 'seal', 'MP2', 4)).toEqual([0, 1, 2, 3].map((index) => ({ map: 'MP2', index })));
    const r1 = setRosterColumn(null, 'seal', 1, { map: 'MP81', index: 0 }, 'MP2', 4)!;
    expect(r1.seal).toEqual([{ map: 'MP2', index: 0 }, { map: 'MP81', index: 0 }, { map: 'MP2', index: 2 }, { map: 'MP2', index: 3 }]);
    expect(r1.terrorist).toEqual([]);
    const r2 = setRosterColumn(r1, 'seal', 3, null, 'MP2', 4)!;                 // a column dropped: three columns
    expect(r2.seal.length).toBe(3);
    expect(setRosterColumn(r2, 'seal', 0, null, 'MP2', 4)).toEqual(r2);          // the first column cannot be dropped
    const back = setRosterColumn(setRosterColumn(r2, 'seal', 1, { map: 'MP2', index: 1 }, 'MP2', 4), 'seal', 3, { map: 'MP2', index: 3 }, 'MP2', 4);
    expect(back).toBeNull();                                                     // the map's own again: no setting
  });
});
