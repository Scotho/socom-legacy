import { describe, expect, it } from 'vitest';
import type { CombatReport } from '../../viewer/src/net/protocol';
import { isDead, MP_HEALTH, overall } from '../../viewer/src/net/damage';
import { damagePanelRows, DAMAGE_PANEL_COLUMNS_ADAPTATION } from '../../viewer/src/damagePanel';
import type { DamageReport as PageReport } from '../../viewer/src/netPage';
import { damageScript, isReport, type DamageReport, type Run } from './helpers/damageReportRoom';

/**
 * Intake item 2, option (C) (the main controller a36e1735's step 4; merged on the owner's pick (INTAKE 144, as the main controller read it)):
 * the test that JOINS the two units the v0.4.23 build kept apart (the room booked the six parts' raw health,
 * the panel drew it x 100: one head shot read 800). PRODUCT TRACK (`DAMAGE_REPORT_ADAPTATION`, a browser adaptation).
 *
 * DMG under (C): per applied enemy hit that took health, the fall of the victim's HUD bar (`overall()`, `FUN_005a56d0`
 * D:L461416-461437) x 100, and at a kill the bar that was left -- so every kill from full is 100 (a life). The room books
 * it; the panel draws the room's figure as it is. Transcribed here on its own (not imported from the head's module) so
 * the room's books are checked against an independent reading of the rule.
 */

const LIFE = 100;
/** (C) for one applied hit, from the combat report's six parts before and after. */
function pointsOf(before: readonly number[], after: readonly number[]): number {
  const bar = (hp: readonly number[]): number => overall({ hp: [...hp], armour: [] });
  return (isDead({ hp: [...after], armour: [] }) ? bar(before) : bar(before) - bar(after)) * LIFE;
}

/** Player 1's timeline as (C) books it: by (attacker, victim), between two timeline indices. */
function booked(run: Run, from = 0, to = run.timeline.length): Map<string, { hits: number; dmg: number }> {
  const out = new Map<string, { hits: number; dmg: number }>();
  for (const e of run.timeline.slice(from, to)) {
    if (e.type !== 'combat') continue;
    const c = e as CombatReport;
    if (c.friendlyFire || c.selfDamage || !(c.damageApplied > 0) || !c.attacker || !c.target || c.attacker.team === c.target.team) continue;
    const k = `${c.attacker.id}>${c.target.id}`, t = out.get(k) ?? { hits: 0, dmg: 0 };
    t.hits++; t.dmg += pointsOf(c.healthBefore!, c.healthAfter!);
    out.set(k, t);
  }
  return out;
}

/** The figure the panel draws in the DMG column for a report's line (the page's own row builder). */
function drawn(r: DamageReport, side: 'taken' | 'dealt', id: number): string {
  const page: PageReport = {
    round: r.round, life: 'life' in r,
    taken: r.taken.map((t) => ({ id: t.from, name: `P${t.from}`, hits: t.hits, health: t.health })),
    dealt: (r.dealt ?? []).map((d) => ({ id: d.to, name: `P${d.to}`, hits: d.hits, health: d.health })),
  };
  const rows = damagePanelRows(page).rows[side === 'dealt' ? 0 : 1];
  const i = (side === 'dealt' ? page.dealt : page.taken).findIndex((l) => l.id === id);
  expect(i, `${side} line for ${id}`).toBeGreaterThanOrEqual(0);
  return rows[i]!.cells.find((c) => c.x === DAMAGE_PANEL_COLUMNS_ADAPTATION.dmg)!.text;
}

let cached: Run | null = null;
const run = (): Run => (cached ??= damageScript(false));
const reports = (id: number): DamageReport[] => run().cs[id - 1]!.events().filter(isReport);
const lifeReports = (id: number): DamageReport[] => reports(id).filter((r) => 'life' in r);
const roundReports = (id: number): DamageReport[] => reports(id).filter((r) => !('life' in r));

describe('intake item 2 (C): the room\'s DMG and the panel\'s drawn DMG are one unit (a life is 100)', () => {
  it('a kill from full is 100 on the panel: each of 2\'s two life reports draws 1\'s line as "100"', () => {
    const two = lifeReports(2);
    expect(two).toHaveLength(2);
    for (const r of two) expect(drawn(r, 'taken', 1)).toBe('100');
  });

  it('the respawn report of the next round: 3, killed from full by 1, draws "100"', () => {
    const three = lifeReports(3);
    expect(three).toHaveLength(1);
    expect(drawn(three[0]!, 'taken', 1)).toBe('100');
  });

  it('the round report: 1\'s two kills of 2 draw "200" -- never thousands', () => {
    const r1 = roundReports(1)[0]!;
    expect(drawn(r1, 'dealt', 2)).toBe('200');
  });

  it('the room\'s figure is (C) per hit, summed: every line of every round report equals the timeline\'s (C) books', () => {
    const t = run().timeline;
    const overs = t.flatMap((e, i) => (e.type === 'roundOver' ? [i] : []));
    const starts = [0, ...overs.slice(0, -1).map((i) => i + 1)];
    for (const id of [1, 2, 3, 4]) {
      roundReports(id).forEach((r, n) => {
        const b = booked(run(), starts[n], overs[n]! + 1);
        for (const d of r.dealt ?? []) expect(d.health, `round ${r.round}: ${id} dealt to ${d.to}`).toBeCloseTo(b.get(`${id}>${d.to}`)!.dmg, 6);
        for (const k of r.taken) expect(k.health, `round ${r.round}: ${id} took from ${k.from}`).toBeCloseTo(b.get(`${k.from}>${id}`)!.dmg, 6);
      });
    }
  });

  it('the panel draws the room\'s figure as it is (rounded to a whole point), not scaled', () => {
    for (const id of [1, 2, 3, 4]) for (const r of reports(id)) {
      for (const d of r.dealt ?? []) expect(drawn(r, 'dealt', d.to)).toBe(String(Math.round(d.health)));
      for (const k of r.taken) expect(drawn(r, 'taken', k.from)).toBe(String(Math.round(k.health)));
    }
  });

  it('a wound that is not a kill reads the bar\'s fall: 1\'s one hit on 3 in the first round is under a life and above 0', () => {
    const r3 = roundReports(3)[0]!;
    const fromOne = r3.taken.find((k) => k.from === 1)!;
    expect(fromOne.hits).toBe(1);
    expect(fromOne.health).toBeGreaterThan(0);
    expect(fromOne.health).toBeLessThan(LIFE);
    expect(MP_HEALTH).toEqual([8, 30, 30, 50, 30, 30]);         // the bar's parts this test's reading assumes
  });
});
