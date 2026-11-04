import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, readZarMembers, readZdbMember, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { arsenalOf, missionValves, type Arsenal } from '@s2u/scene';
import { armoryFromDisc, type ArmoryData } from '../src/armoryData';
import { Armory } from '../src/armory';

/**
 * OT.R91 (the owner, 2026-10-31): every campaign character is unlocked in the MP ARMORY. On each MP map whose own
 * `InWhichAOP` is not 0 the dialog's `UnlockMPChar` (eq/UnlockMPChar@28-1564, research 95 §3.1) captions the fourth
 * column with the AOP's unlockable and locks it unless that one's `Set<Name>` PERSIST valve is 1; the ruling feeds the
 * eight valves as 1 (`campaignUnlockValves`), so the original's own script takes its unlocked branch: the LOCKED stamp
 * and its shade hidden, `DisableFourthChar` 0, the caption still the unlockable's. With the ruling off
 * (`campaignUnlocks: false`), the original's fresh card: the stamp shown, `DisableFourthChar` 1.
 *
 * Dev-disc test: every map's own dialog, scripts and valves off `SOCOM_DISC`; skips without it (a skip, never a pass).
 */

const DISC = process.env.SOCOM_DISC;
/** The campaign-AOP MP maps (each one's `InWhichAOP`, read below off its `mission.rdr`, is checked against this). */
const MAPS = { MP51: 50, MP52: 50, MP53: 50, MP61: 60, MP62: 60, MP64: 60, MP71: 70, MP72: 70, MP73: 70, MP81: 80, MP82: 80, MP83: 80 } as const;
/** UnlockMPChar's captions per row (research 95 §3.1's table, transcribed from eq/UnlockMPChar@28-1564). */
const CAPTION: Record<number, { seal: string; terrorist: string }> = {
  50: { seal: 'SAS (SABRE)', terrorist: 'PIUS' }, 60: { seal: 'FERAL', terrorist: 'QUIXADA' },
  70: { seal: 'SAS (REAVER)', terrorist: 'ALG OFFICER' }, 80: { seal: 'SPECIALIST', terrorist: 'VALESKA' },
};
const HAVE = !!DISC && ['RUN/ZWEAPON.ZAR', 'RUN/UIZANIM.ZAR', ...Object.keys(MAPS).map((m) => `RUN/${m}.ZDB`)].every((p) => existsSync(resolve(DISC, p)));

describe.skipIf(!HAVE)(`OT.R91: the fourth column unlocked on every campaign-AOP map's own ARMORY${HAVE ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  let arsenal: Arsenal | null = null;
  const loaded = new Map<string, { data: ArmoryData; valves: ReadonlyMap<string, number> }>();
  async function map(stem: string): Promise<{ data: ArmoryData; valves: ReadonlyMap<string, number>; arsenal: Arsenal }> {
    const src = new FsAssetSource(DISC as string);
    if (!arsenal) arsenal = arsenalOf(parseRdr((await readZarMembers(src, 'RUN/ZWEAPON.ZAR', ['zweapon.rdr'])).get('zweapon.rdr')!));
    let got = loaded.get(stem);
    if (!got) {
      const data = await armoryFromDisc(src, `RUN/${stem}.ZDB`, stem, { models: false });
      const rm = Zar.parse((await readZdbMember(src, `RUN/${stem}.ZDB`, 'READERM.ZAR'))!);
      const valves = missionValves(parseRdr(rm.data(rm.root.children.find((c) => c.name.toLowerCase() === 'mission.rdr')!)));
      got = { data, valves };
      loaded.set(stem, got);
    }
    return { ...got, arsenal };
  }
  async function open(stem: string, side: 'seal' | 'terrorist', campaignUnlocks?: boolean) {
    const { data, valves, arsenal: ars } = await map(stem);
    const t = { now: 0 };
    const a = new Armory({ clock: () => t.now, change: () => {}, ...(campaignUnlocks === undefined ? {} : { campaignUnlocks }) });
    a.setData(data);
    a.setWorld({ arsenal: ars, valves, side, map: stem, archive: stem });
    expect(a.open(null), `${stem} ${side}`).toBe(true);
    for (let i = 0; i < 42; i++) { t.now += 1 / 60; a.frame(1 / 60); }
    return { a, r: a.scripts()!, valves };
  }

  for (const [stem, aop] of Object.entries(MAPS)) {
    it(`${stem} (InWhichAOP ${aop}): both sides' fourth open under the ruling, the original's lock with it off`, async () => {
      for (const side of ['seal', 'terrorist'] as const) {
        const p = side === 'seal' ? 'Seal4' : 'Terr4', text = side === 'seal' ? 'Seal4Text' : 'Merc4Text';
        const ruled = await open(stem, side);
        expect(ruled.valves.get('InWhichAOP'), stem).toBe(aop);
        expect(ruled.a.text(ruled.r.node(text).caption), `${stem} ${side}`).toBe(CAPTION[aop]![side]);
        expect([ruled.r.node(`${p}Dis`).visible, ruled.r.node(`${p}Lock`).visible], `${stem} ${side}`).toEqual([false, false]);
        expect(ruled.r.valve('DisableFourthChar'), `${stem} ${side}`).toBe(0);
        expect(ruled.a.context()!.fourthOpen, `${stem} ${side}`).toBe(true);
        const original = await open(stem, side, false);
        expect(original.a.text(original.r.node(text).caption), `${stem} ${side} original`).toBe(CAPTION[aop]![side]);
        expect([original.r.node(`${p}Dis`).visible, original.r.node(`${p}Lock`).visible], `${stem} ${side} original`).toEqual([true, true]);
        expect(original.r.valve('DisableFourthChar'), `${stem} ${side} original`).toBe(1);
      }
    });
  }
});
