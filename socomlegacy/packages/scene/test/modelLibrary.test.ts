import { describe, it, expect } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadModelLibrary, resolveChunk, type ModelEntry } from '../src/index';

/**
 * The `_L` suffix (`zVisual/vis_main.cpp:93-102`): `hookupVisuals` fetches `<key>_L` first and, when it
 * is there, marks the node dynamically lit; only then does it fetch `<key>`. Five maps carry such keys
 * (MP1, MP7, MP11, MP62, MP83; 278 in all) and none of the three fixtures does, so the entry is built.
 */
const entry = (nodes: { name: string; offset: number }[]): ModelEntry => ({ name: 'tent_seals', buffer: new Uint8Array(0), nodes });

describe('resolveChunk: the chunk key the scene graph predicts, against the names the buffer holds', () => {
  const tent = entry([
    { name: 'N000_I000_V00', offset: 0 },
    { name: 'N001_I000_V00_L', offset: 64 },
    { name: 'N001_I000_V01_L', offset: 128 },
  ]);

  it('a plain key resolves to its offset, unlit', () => {
    expect(resolveChunk(tent, 'N000_I000_V00')).toEqual({ offset: 0, lit: false });
  });

  it('a key stored only under its _L name resolves to that offset and reports lit', () => {
    expect(resolveChunk(tent, 'N001_I000_V00')).toEqual({ offset: 64, lit: true });
    expect(resolveChunk(tent, 'N001_I000_V01')).toEqual({ offset: 128, lit: true });
  });

  it('a key with neither name present still misses', () => {
    expect(resolveChunk(tent, 'N002_I000_V00')).toBeNull();
    expect(resolveChunk(entry([]), 'N001_I000_V00')).toBeNull();
  });

  it('with both names present the _L one wins, the order the engine fetches in', () => {
    const both = entry([{ name: 'N003_I000_V00', offset: 8 }, { name: 'N003_I000_V00_L', offset: 16 }]);
    expect(resolveChunk(both, 'N003_I000_V00')).toEqual({ offset: 16, lit: true });
  });
});

/**
 * The position form rides on each entry (socomlegacy/docs/research/79 §2): the archive a model came from says how its
 * chains are drawn, `loadModelLibrary`'s `forms` one per archive, so a decoder fed the merged library cannot read a
 * turret's `TURR_MDL` chains in the world's form. Absent, an entry is `'bias'`. Crossroads' own and turret libraries.
 */
const MP72 = fixture('RUN/MP72.ZDB');
describe.skipIf(!MP72)(`loadModelLibrary: each entry keeps its archive's position form${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("TURR_MDL's turrets are 'scale', WORL_MDL's world and MP72_MDL's props 'bias'; a second copy keeps the first's form", () => {
    const toc = parseZdb(MP72!);
    const zar = (m: string): Zar => Zar.parse(zdbMember(MP72!, toc, m));
    const lib = loadModelLibrary([zar('WORL_MDL.ZED'), zar('TURR_MDL.ZED'), zar('MP72_MDL.ZED'), zar('TURR_MDL.ZED')],
      ['bias', 'scale', 'bias', 'bias']);
    for (const name of ['RMG_turret', 'LMG_turret', '30mm_MGL_turret']) expect(lib.get(name)?.form, name).toBe('scale');
    expect(lib.get('worldmodel')?.form).toBe('bias');
    const own = zar('MP72_MDL.ZED').root.children.map((k) => k.name).filter((n) => !n.startsWith('MESH_'));
    expect(own.length).toBeGreaterThan(0);
    for (const name of own) expect(lib.get(name)?.form, name).toBe('bias');
    expect(loadModelLibrary([zar('TURR_MDL.ZED')]).get('RMG_turret')?.form).toBe('bias');   // no forms given
  });
});
