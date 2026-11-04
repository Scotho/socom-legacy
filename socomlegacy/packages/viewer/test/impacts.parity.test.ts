// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { materialTable, type DecalEntry, type SurfaceMaterial } from '@s2u/scene';
import { soundFor } from '@s2u/sound';
import { impactAnimation, markTable } from '../src/effects';

/**
 * TA-COMBATFX: which impact and which mark a round leaves on each surface (socomlegacy/docs/research/89-effects.md section 5),
 * registered in docs/parity/registry/combatfx.json. Driven with no game data from the scene package's pins of the disc:
 * `effectsFrostfire.json` (the `bullet_hit_<material>` animations Frostfire's archives hold, their sounds and calls),
 * `decals.json` (`decals.rdr`'s `BULLET_MARK_SMALL`) and `soils.json` (`materials.rdr`'s SOILS); the scene package's
 * `grenade.parity.test.ts` and `effects.parity.test.ts` re-derive those pins from the files.
 */

const pin = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../../scene/test/golden/${name}`, import.meta.url), 'utf8')) as T;
interface Impact { anim: string; sounds: string[]; calls: string[] }
const IMPACTS = pin<{ bulletImpacts: Record<string, Impact | null> }>('effectsFrostfire.json').bulletImpacts;
const ROWS = pin<{ BULLET_MARK_SMALL: DecalEntry[] }>('decals.json').BULLET_MARK_SMALL;
const TABLE = materialTable(pin<{ soils: SurfaceMaterial[] }>('soils.json').soils);
const NAMES = TABLE.map((m) => m.name);
const byte = (name: string): number => NAMES.indexOf(name);

/** The archive's animation for a name, as the engine finds it: without regard to case (`FUN_0026a250`). */
const anims = new Map(Object.values(IMPACTS).filter((v): v is Impact => v !== null).map((v) => [v.anim.toLowerCase(), v]));
/** The sounds an impact plays: its own, then those of the animations it calls, in order. */
const soundsOf = (name: string): string[] => {
  const a = anims.get(name);
  return a ? [...a.sounds, ...a.calls.flatMap((c) => soundsOf(c.toLowerCase()))] : [];
};

describe('a round\'s impact (FUN_003c8920 -> FUN_003c4700)', () => {
  it('is bullet_hit_<material> of the map\'s archives, with research 89 section 5\'s sound; nothing where the archive has none', () => {
    const note: Record<string, string[]> = {
      GRASS: ['.BUL_GRASS'], SAND: ['.BUL_SAND'], MUD: ['.BUL_MUD'], STONE: ['.BUL_STONE'], DIRT: ['.BUL_DIRT'], GLASS: ['.BUL_GLASS'],
      GLASS_THICK: ['.BUL_GLASS'], GLASS_OPAQUE: ['.BUL_GLASS'], GLASS_MEDIUM: ['.BUL_GLASS'], WATER: ['.BUL_WATER'],
      PERSON: ['.BUL_INTO_BODY'], LEAVES: ['.BUL_LEAVES'], ICE: ['.BUL_ICE'], SNOW: ['.BUL_SNOW'], GRAVEL: ['.BUL_GRAVEL'],
      WOOD_THICK: ['.BUL_WOOD_L_SPL'], WOOD_THIN: ['.BUL_WOOD_SMALL'], RUBBER: ['.BUL_RUBBER'], ASPHALT: ['.BUL_STONE'],
      LEAFY_TREE: ['.BUL_LEAVES', '.BUL_LEAVES'], METAL_THICK: ['.BUL_METAL'], METAL_THIN: ['.BUL_TIN'], FABRIC_HEAVY: ['.BUL_FABRIC'],
      PIPE_STEAM: ['.BUL_BARREL', '!SMK_CANISTER'], GASTANK: ['.BUL_BARREL'], THATCH: ['.BUL_WOOD_L_SPL'], LEATHER: ['.BUL_WOOD_SMALL'],
      BARREL: ['.BUL_BARREL'], PLASTER: ['.BUL_PLASTER', '.BUL_STONE'], CARPET: ['.BUL_PLASTER', '.BUL_STONE'],
    };
    for (const m of NAMES) {
      const name = impactAnimation('bullet_hit', m)!;
      expect(anims.has(name) ? soundsOf(name) : null, m).toEqual(note[m] ?? null);
    }
    expect(impactAnimation('bullet_hit', undefined)).toBeNull();
  });

  it('the blood: a round into a body (PERSON) plays bullet_hit_person, .BUL_INTO_BODY, and leaves bullet_mark_blood.tif 2-3 across', () => {
    expect(impactAnimation('bullet_hit', 'PERSON')).toBe('bullet_hit_person');
    expect(anims.get('bullet_hit_person')!.sounds).toEqual(['.BUL_INTO_BODY']);
    const marks = markTable(NAMES, ROWS, new Map());
    expect(marks.row(byte('PERSON'))).toEqual({ set: 'BULLET_MARK_SMALL', material: 'PERSON', texture: 'bullet_mark_blood.tif', minSize: 2, maxSize: 3 });
  });
});

describe('a round\'s mark (FUN_003d0ba0: the DecalSet\'s row for the material, no default)', () => {
  it('takes BULLET_MARK_SMALL\'s row for the hit polygon\'s material, research 89 section 5\'s sizes; none without a row', () => {
    const marks = markTable(NAMES, ROWS, new Map());
    const note: Record<string, [string, number, number] | null> = {
      GRASS: ['sand', 1, 1.5], SAND: ['sand', 1, 1.5], MUD: null, STONE: ['stone', 1, 1.8], DIRT: ['sand', 1, 1.5], GLASS: ['glass', 1.1, 1.3],
      WATER: null, PERSON: ['blood', 2, 3], LEAVES: null, ICE: ['glass', 1.8, 3.3], SNOW: ['sand', 1, 1.8], GRAVEL: null,
      WOOD_THICK: ['wood', 2, 3.4], WOOD_THIN: ['wood', 2, 3.4], RUBBER: null, ASPHALT: ['stone', 0.75, 1.5], LEAFY_TREE: null,
      METAL_THICK: ['metal', 0.75, 1.8], METAL_THIN: ['metal', 0.75, 1.8], FABRIC_HEAVY: ['metal', 0.75, 1.2], PIPE_STEAM: ['metal', 1.2, 1.7],
      GASTANK: ['metal', 1.2, 1.7], THATCH: null, LEATHER: ['metal', 0.75, 1.2], BARREL: ['metal', 0.75, 1.8], PLASTER: ['wood', 1.2, 2.2],
      CARPET: ['sand', 1, 1.8], METAL_GRATE: null, METAL_RAILING: null, CHAINLINK_FENCE: null, UNDERWATER: null,
    };
    for (const [m, want] of Object.entries(note)) {
      const r = marks.row(byte(m));
      expect(r ? [r.texture, r.minSize, r.maxSize] : null, m).toEqual(want ? [`bullet_mark_${want[0]}.tif`, want[1], want[2]] : null);
    }
  });

  it('a polygon whose material byte is 0 takes the map\'s DefaultMaterial: Frostfire\'s METAL_THICK marks metal', () => {
    const frostfire = markTable(NAMES, ROWS, new Map(), byte('METAL_THICK'));
    expect(frostfire.row(0)?.texture).toBe('bullet_mark_metal.tif');
    // With no default named, byte 0 is UNKNOWN, which has no row.
    expect(markTable(NAMES, ROWS, new Map()).row(0)).toBeNull();
  });
});

/**
 * DRIFT (TA.R6), registered as such: the console resolves an effect's sound by its name's CRC among the loaded banks
 * (`FUN_00344f30` -> `FUN_00344bf0`), with no other name and no fallback bank, so a name no bank holds plays nothing.
 * The port mends three such names (`@s2u/sound` `SOUND_NAME_FIXES`, `SOUND_FALLBACKS`, `soundFor`), which the notes
 * themselves name as departures from the retail game: research 89 section 11 (lines 492-500: "So two effect sounds are
 * silent on the console. The viewer departs from it deliberately"), research 85 section 9.9 (lines 580-581: `.GREN_ASPHALT`,
 * "Silent in the game") and research 81 section 7. Each test below states what the original does and fails on the port's
 * code (`it.fails`); it turns red, and is to be made a plain `it`, when the port follows the original.
 *
 * This is a KNOWN, ALREADY-RULED departure, not a new bug: `packages/sound/src/catalog.ts` records `SOUND_NAME_FIXES` as
 * "a deliberate departure from the retail game (the owner's playtest, 2026-09-29)" and `SOUND_FALLBACKS` as a departure
 * from the feel-QA playtest (research 90 item 12). The owner's question is only whether to keep it; these tests make it
 * visible in the parity file and turn red if the port ever follows the original.
 *
 * Scope: the tests drive `soundFor` -- the name mapping -- not the runtime path. On the console `grenade_hit_asphalt`
 * names `.GREN_ASPHALT` with zAnim command 45 (start-animation), not the play-sound command 30 (research 85 lines
 * 578-579; catalog.ts's ZANIM_START_ANIM), so the original never asks a bank for it at all; the asphalt test holds the
 * port's name mend, which is what would make it sound.
 */
describe('the effect sounds the console cannot find (FUN_00344f30)', () => {
  it.fails('the casing\'s metal bounce asks for .BUL_CASE_METAL, which no bank holds: silent on the console (research 89 section 11)', () => {
    const frostfire = (n: string): boolean => n === '.BUL_CAS_METAL';      // MP2's banks spell it CAS
    expect(frostfire(soundFor('.BUL_CASE_METAL', frostfire))).toBe(false);
  });

  it.fails('a grenade bouncing on asphalt names .GREN_ASPHALT by command 45, not a sound command, and no bank holds it: silent in the game (research 85 section 9.9)', () => {
    const any = (n: string): boolean => n === '.GREN_STONE';
    expect(any(soundFor('.GREN_ASPHALT', any))).toBe(false);
  });

  it.fails('a casing on dirt asks for .BUL_CAS_DIRT; a map whose banks lack it plays nothing, with no stand-in (research 89 section 11)', () => {
    const bloodLake = (n: string): boolean => n === '.BUL_CAS_GRASS';      // its own grass casing, no .BUL_CAS_DIRT
    expect(bloodLake(soundFor('.BUL_CAS_DIRT', bloodLake))).toBe(false);
  });
});
