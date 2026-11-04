// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, type ZAnimAnimation } from '@s2u/scene';
import { bombPulses } from '../src/roundCues';
import { simMapFromBytes } from '../src/simMap';
import { WorldState } from '../src/worldState';

/**
 * PB-9b (PARITY-2; research 284 s5, s8 RED 4): the nine maps that hold `BombPlace`, off the dev disc (`SOCOM_DISC`, else
 * `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so -- without it). Each Demolition map holds two outlines, one a base;
 * each Breach map (MP61, MP62, MP73) the Terrorists' only. Every outline's zAnim reference is word 0x90080300 (bit 31 the
 * node off at load, bit 28 its state saved for the round's reset: `FUN_0026b5e0` D:L115744-115751); every map's
 * `objectives` calls `pulse_terrorist` for `bomb_owner` 1 and `pulse_seal` for 2 and stops both on a drop. On the page's
 * world a SEAL pickup lights the Terrorists' outline on all nine, and a Terrorist pickup the SEALs' on the six
 * Demolition maps -- on a Breach map the set holds no `pulse_seal`, and nothing is drawn (research 284 s5, s7).
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
/** Research 284 s5's table: each map's outlines under `worldmodel/`. */
const OUTLINES: Record<string, { terrorist: string; seal: string | null }> = {
  MP1: { terrorist: 'terrorist_base/tnt_dredge_group=tnt_dredge_group/terrorist_pulse', seal: 'seal_base/tnt_comshack_group=tnt_comshack_group/seal_pulse' },
  MP7: { terrorist: 'terrorist_base/tent_terrorists=tent_terrorists/terrorist_pulse', seal: 'seal_base/tent_seals=tent_seals/seal_pulse' },
  MP9: { terrorist: 'terrorist_base/tnt_depot_group=tnt_depot_group/terrorist_pulse', seal: 'seal_base/tnt_shack_group=tnt_shack_group/seal_pulse' },
  MP12: { terrorist: 'terrorist_base/mpbase_terr=mpbase_terr/terrorist_pulse', seal: 'seal_base/mpbase_seal=mpbase_seal/seal_pulse' },
  MP72: { terrorist: 'terrorist_base/crates_weapons=crates_weapons/terrorist_pulse', seal: 'seal_base/crates_hospital=crates_hospital/seal_pulse' },
  MP83: { terrorist: 'terrorist_base/terrorbase=terrorbase/terrorist_pulse', seal: 'seal_base/sealbase=sealbase/seal_pulse' },
  MP61: { terrorist: 'terrorist_base/terr_mpbase=terr_mpbase/terrorist_pulse', seal: null },
  MP62: { terrorist: 'terrorist_base/crates_weapons=crates_weapons/terrorist_pulse', seal: null },
  MP73: { terrorist: 'terrorist_base/terrorist_pulse', seal: null },
};
const MAPS = Object.keys(OUTLINES);
const HAVE_DISC = DISC !== '' && MAPS.every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

describe.skipIf(!HAVE_DISC)(`the bases' pulse outlines on the nine BombPlace maps${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  for (const stem of MAPS) {
    it(`${stem}: the outlines, their init word 0x90080300, objectives' calls, and the page's world lighting them`, () => {
      const bytes = new Uint8Array(readFileSync(join(DISC, 'RUN', `${stem}.ZDB`)));
      const anims = parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))).sets.flatMap((s) => s.anims);
      const anim = (name: string): ZAnimAnimation | undefined => anims.find((a) => a.name === name);
      const want = OUTLINES[stem]!;
      const sides = want.seal === null ? (['terrorist'] as const) : (['terrorist', 'seal'] as const);
      // The programs: one a base, the same bytes as MP72's, the outline's reference word 0x90080300.
      for (const side of sides) {
        const a = anim(`pulse_${side}`)!;
        expect(a, `${stem} pulse_${side}`).toBeDefined();
        expect(a.params.seqOffsets).toEqual([0, 0, 0, 100]);
        expect(a.nodeRefs.map((r) => [r.name, r.word >>> 0])).toEqual([['NA', 0], [`${side}_base`, 0x100], [`${side}_pulse`, 0x90080300]]);
        const p = decodeEffectProgram(a);
        expect(p.cleanup).toBe(1);
        expect(p.sequences[0]!.ops.filter((o) => o.op === 'opacity')).toEqual([
          { op: 'opacity', node: 2, from: 0.2, to: 0.05, rate: -0.15, seconds: 1 },
          { op: 'opacity', node: 2, from: 0.05, to: 0.2, rate: 0.75, seconds: 0.2 },
        ]);
      }
      if (want.seal === null) expect(anim('pulse_seal'), `${stem} holds no pulse_seal`).toBeUndefined();
      // objectives' trigger, the same on every map.
      expect(bombPulses(decodeEffectProgram(anim('objectives')!))).toEqual({
        pickup: { seal: ['pulse_terrorist'], terrorist: ['pulse_seal'] }, drop: ['pulse_terrorist', 'pulse_seal'],
      });
      // The page's world: the outlines placed, hidden at the opening, lit by the pickup's program for the carrier's target.
      const sim = simMapFromBytes(bytes, `RUN/${stem}.ZDB`);
      const placed = sim.meta!.instances.filter((i) => /_pulse$/.test(i.node)).map((i) => i.path).sort();
      expect(placed).toEqual([want.seal, want.terrorist].filter((p): p is string => p !== null).map((p) => `worldmodel/${p}`).sort());
      for (const path of placed) expect(sim.meta!.initial.find((e) => e.path === path), path).toMatchObject({ deactivate: true, saveActive: true });
      const drawn = new Map<string, boolean>();
      const world = new WorldState(sim.meta!, sim.ground, sim.grid, { visible: (p, on) => { drawn.set(p, on); } });
      world.applyInitial();
      expect(world.runDisplay('pulse_terrorist')).toBe(true);
      expect(drawn.get(`worldmodel/${want.terrorist}`)).toBe(true);
      world.stopProgram('pulse_terrorist');
      expect(drawn.get(`worldmodel/${want.terrorist}`)).toBe(false);
      expect(world.runDisplay('pulse_seal')).toBe(want.seal !== null);
      if (want.seal !== null) expect(drawn.get(`worldmodel/${want.seal}`)).toBe(true);
      expect([...drawn].filter(([, on]) => on).map(([p]) => p)).toEqual(want.seal === null ? [] : [`worldmodel/${want.seal}`]);
    }, 120_000);
  }
});
