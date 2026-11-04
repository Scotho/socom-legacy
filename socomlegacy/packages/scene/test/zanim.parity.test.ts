// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { isDestructibleAnim, parseAnimSets, type ZAnimMainParams } from '../src/index';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { readPin } from './characterPins';
import { buildZar, cat, f32, u32 } from './syntheticZar';

/**
 * Parity pins for Frostfire's zAnim command archives (socomlegacy/docs/research/77 §9; registry
 * docs/parity/registry/character.json): `golden/character-zanim.json` holds what `parseAnimSets` reads from MP2's
 * `CZANIM.ZAR`, `MZANIM.ZAR` and `LDZANIM.ZAR` -- the main params, the sets, the sequence and command counts, the
 * command-type histogram. The unit half checks 77 §9's claims on the pin and drives the reader with the pinned head;
 * the fixture half re-reads it.
 */
interface ArchivePin {
  main: ZAnimMainParams;
  /** name, names, rdrPaths, SoftImage scripts, animations */
  sets: [string, number, number, number, number][];
  sequences: number; commands: number; nodeRefs: number;
  commandTypes: Record<string, number>;
}
type ZAnimPin = { _source: string } & Record<'CZANIM.ZAR' | 'MZANIM.ZAR' | 'LDZANIM.ZAR', ArchivePin>;
const pin = readPin<ZAnimPin>('character-zanim.json');
const MEMBERS = ['CZANIM.ZAR', 'MZANIM.ZAR', 'LDZANIM.ZAR'] as const;
const sum = (a: ArchivePin, i: 1 | 2 | 3 | 4): number => a.sets.reduce((n, s) => n + s[i], 0);

describe("Frostfire's zAnim archives, pinned (research 77 §9; no game data)", () => {
  it('reads Anim_Main_Params as version 72, gravity -98 (zAnim in tenths of a metre), flags 0, user action 0 on all three', () => {
    for (const m of MEMBERS) expect(pin[m].main, m).toEqual({ version: 72, gravity: -98, flags: 0, userActionAnimIndex: 0 });
    // the reader on the pinned head: _zanim_main_params (zanim.h:357-364), 16 bytes
    const zar = Zar.parse(buildZar([
      { name: 'Anim_Main_Params', data: cat(u32(72), f32(-98), u32(0, 0)) },
      { name: 'Name_Table_Count', data: u32(0) }, { name: 'Name_Table', children: [] },
      { name: 'Anim_Set_Count', data: u32(0) }, { name: 'Anim_Sets', children: [] },
    ]));
    expect(parseAnimSets(zar).main).toEqual(pin['CZANIM.ZAR'].main);
  });

  it('holds 77 §9\'s counts: CZANIM one set common, 624 names, 288 animations; MZANIM mission 281 / 76; LDZANIM 95 sets, 63 animations', () => {
    expect(pin['CZANIM.ZAR'].sets).toEqual([['common', 624, 10, 0, 288]]);
    expect(pin['MZANIM.ZAR'].sets).toEqual([['mission', 281, 6, 0, 76]]);
    expect([pin['LDZANIM.ZAR'].sets.length, sum(pin['LDZANIM.ZAR'], 4)]).toEqual([95, 63]);
    expect(pin['LDZANIM.ZAR'].sets[0]).toEqual(['dlgLoad.rdr', 32, 1, 0, 6]);     // zanim.test.ts: 32 names, 6 animations
    // Frostfire carries no SoftImage script (77 §9: the 30 are on MP6, MP10, MP11, MP52, MP53, MP62, MP73, MP82)
    for (const m of MEMBERS) expect(sum(pin[m], 3), m).toBe(0);
  });

  it('balances IF 0x02 against END_IF 0x05 in each of MP2\'s three zAnim archives (77 §9: 4,280 against 4,279 over all 66)', () => {
    // Not every archive: 77 §9 counts 4,280 IF against 4,279 END_IF over all 66, so one somewhere does not balance.
    // This pin holds MP2's CZANIM / MZANIM / LDZANIM only (42/42, 79/79, 58/58); a red on another archive is the claim's limit, not a reader fault.
    for (const m of MEMBERS) {
      const t = pin[m].commandTypes;
      expect(t['0x2'], m).toBe(t['0x5']);
      expect(Object.values(t).reduce((a, b) => a + b, 0), m).toBe(pin[m].commands);
    }
  });
});

const MP2 = fixture('RUN/MP2.ZDB');

describe(`the zAnim pin against the disc${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2)("re-reads the pin from MP2's three zAnim archives through parseAnimSets", () => {
    const toc = parseZdb(MP2!);
    for (const m of MEMBERS) {
      const a = parseAnimSets(Zar.parse(zdbMember(MP2!, toc, m)));
      const types: Record<string, number> = {};
      let sequences = 0, commands = 0, nodeRefs = 0;
      for (const s of a.sets) {
        for (const anim of s.anims) {
          nodeRefs += anim.nodeRefs.length;
          for (const q of anim.sequences) {
            sequences++;
            for (const c of q.commands) { commands++; types[`0x${c.type.toString(16)}`] = (types[`0x${c.type.toString(16)}`] ?? 0) + 1; }
          }
        }
      }
      expect({
        main: a.main, sets: a.sets.map((s) => [s.name, s.names.length, s.rdrPaths.length, s.siScripts.length, s.anims.length]),
        sequences, commands, nodeRefs, commandTypes: types,
      }, m).toEqual(pin[m]);
    }
  });
});

const MP72 = fixture('RUN/MP72.ZDB');

describe(`Crossroads' bridge node references (research 171 s4; research 209 s4)${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP72)("Crossroads' seal_demo_site1: destroyed 0x90080900 and parts 0x90080a00 deactivate and save, healthy 0x10080b00 saves only, part_1..15 0xbc08xx00", () => {
    const anims = parseAnimSets(Zar.parse(zdbMember(MP72!, parseZdb(MP72!), 'MZANIM.ZAR'))).sets.flatMap((s) => s.anims);
    const site = anims.find((a) => a.name === 'seal_demo_site1')!;
    const ref = (name: string) => site.nodeRefs.find((r) => r.name === name)!;
    expect(ref('destroyed').word >>> 0).toBe(0x90080900);
    expect(ref('parts').word >>> 0).toBe(0x90080a00);
    expect(ref('healthy').word >>> 0).toBe(0x10080b00);
    const off = { deactivate: true, saveActive: true, saveTranslation: false, saveRotation: false, saveParent: false };
    expect(ref('destroyed').init).toEqual(off);
    expect(ref('parts').init).toEqual(off);
    expect(ref('healthy').init).toEqual({ ...off, deactivate: false });
    const parts = site.nodeRefs.filter((r) => /^part_\d+$/.test(r.name));
    expect(parts.map((r) => r.name)).toEqual(Array.from({ length: 15 }, (_, i) => `part_${i + 1}`));
    for (const p of parts) {
      expect(((p.word & 0xffff00ff) >>> 0), p.name).toBe(0xbc080000);
      expect(p.init, p.name).toEqual({ deactivate: true, saveActive: true, saveTranslation: true, saveRotation: true, saveParent: true });
    }
    // The switch's own reference only saves its active state (research 171 s4: 0x10000100).
    const strike = anims.find((a) => a.name === 'seal_callstrike1')!;
    expect(strike.nodeRefs[1]!.word >>> 0).toBe(0x10000100);
    expect(strike.nodeRefs[1]!.init).toEqual({ ...off, deactivate: false });
  });
});

describe(`the kind-3 damage blocks (MAP-06; research 174 s3, 203 s7)${MP2 && MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it.skipIf(!MP2 || !MP72)("Frostfire's door_slab: ref 2 pane1, health 1, armour 0, shield 0; Crossroads' destroy_seal_base and destroy_terrorist_base: health 2, shield 21 (research 203 s7)", () => {
    const anims = (bytes: Uint8Array) => parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))).sets.flatMap((s) => s.anims);
    const slab = anims(MP2!).find((a) => a.name === 'door_slab')!;
    expect(slab.health).toEqual({ nodeRef: 2, health: 1, healthReset: 1, armor: 0, armorReset: 0, shield: 0 });
    expect(slab.nodeRefs[slab.health!.nodeRef]!.name).toBe('pane1');
    expect(isDestructibleAnim(slab)).toBe(true);                       // state 1, flags 0x823
    // Every other animation of Frostfire's mission set is no destructible (research 203 s7: MP2 1/0 door_slab only).
    expect(anims(MP2!).filter(isDestructibleAnim).map((a) => a.name)).toEqual(['door_slab']);
    const cr = anims(MP72!);
    for (const name of ['destroy_seal_base', 'destroy_terrorist_base']) {
      const a = cr.find((x) => x.name === name)!;
      expect(a.health, name).toEqual({ nodeRef: 2, health: 2, healthReset: 2, armor: 0, armorReset: 0, shield: 21 });
      expect(a.nodeRefs[a.health!.nodeRef]!.name, name).toBe('basedi');
      expect(isDestructibleAnim(a), name).toBe(true);                  // state 1, flags 0x23
    }
    expect(cr.filter(isDestructibleAnim).map((a) => a.name).sort()).toEqual(['destroy_seal_base', 'destroy_terrorist_base']);
  });
});
