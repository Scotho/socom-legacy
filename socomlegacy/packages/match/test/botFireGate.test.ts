// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { WeaponRecord } from '@s2u/scene';
import { fireCycleTicks, fireScheduleTicks, FIRE_GATE_NONE, FIRE_SCHEDULE_SLACK_ADAPTATION, FIRE_SCHEDULE_WINDOW_ADAPTATION, gapOpen, scheduleAfter, scheduleOpen } from '../../viewer/src/net/fireGate';
import { TICK_HZ } from '../../viewer/src/net/protocol';
import { BotFirePolicy } from '../src/bots/roles';
import { botRaise } from '../src/bots/matchBots';

/**
 * LATER 1147 (research 443 §1-§2; reading, pending review): the room's gate re-derived for the page's rounds at kit steps
 * (`FIRE_SCHEDULE_SLACK_ADAPTATION` kept at 2, one tick enough for the page's honest rounds; `../../viewer/src/net/fireGate`)
 * refuses none of the CPU seats' rounds, at today's slack or at the one a tightening would take. The original's AI
 * bypasses the pad layer (`FUN_00597810` D:L428041, D:L454390-454420: ctrl+0x118 0 -> 2 on its first call), and the port's bots fire through
 * `BotFirePolicy` (OBF-19: the console's frames counted on the room's tick, each round on the tick at or after its moment,
 * `Math.ceil`), never through the page's pad. So their fire counts stay what they were: every round the policy fires passes
 * both bounds the room's `fireAt` asks (`gapOpen` against the strict cycle, `scheduleOpen`), under today's slack (2) and
 * under 1 alike -- every weapon in every firearm mode it enables, single, burst and automatic, 40 s held.
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const FIREARMS = Object.values(PIN.records).filter((r) => r.fireModes.some((m) => m >= 1 && m <= 3));

/** The bot held on `rec` in `mode` for `ticks`: the ticks its rounds went (as `fireRateParity.test.ts`'s `botPulls`). */
function botRounds(rec: WeaponRecord, mode: number, ticks: number): number[] {
  const policy = new BotFirePolicy(), record = { ...rec, fireModes: [mode] }, at: number[] = [];
  for (let tick = 0; tick < ticks; tick++) {
    if (policy.update(record, 0, 'rusher', 50, 1000, tick, true).due) { at.push(tick); policy.fired(tick); }
  }
  return at;
}

/** The rounds the room's two bounds take, on the seat's whole record (its fastest mode), the schedule's slack `slack`. */
function taken(rec: WeaponRecord, rounds: readonly number[], slack: number): number {
  let last = FIRE_GATE_NONE, schedule = FIRE_GATE_NONE, n = 0;
  for (const c of rounds) {
    const open = gapOpen(last, rec, c) && (slack === FIRE_SCHEDULE_SLACK_ADAPTATION
      ? scheduleOpen(schedule, rec, c)
      : c >= schedule + fireScheduleTicks(rec) - slack);
    if (!open) continue;
    n++; last = c; schedule = scheduleAfter(schedule, rec, c);
  }
  return n;
}

describe("LATER 1147: the room's re-derived gate leaves the bots' fire counts unchanged (BotFirePolicy, FUN_00597810)", () => {
  it('the constants: the schedule slack 2 (re-derived, kept), the window 7, the gap the wait less a tick', () => {
    expect(FIRE_SCHEDULE_SLACK_ADAPTATION).toBe(2);
    expect(FIRE_SCHEDULE_WINDOW_ADAPTATION).toBe(7);
    const m4 = FIREARMS.find((r) => r.name === 'M4A1')!;
    expect(fireCycleTicks(m4)).toBeCloseTo(m4.fireWait * 0.8 * TICK_HZ - 1, 12);
  });

  it('every firearm in every mode, 40 s held: every bot round taken under the slack of 2, and the same count under 1', () => {
    const off: string[] = [];
    let total = 0;
    for (const rec of FIREARMS) {
      for (const mode of rec.fireModes.filter((m) => m >= 1 && m <= 3)) {
        const rounds = botRounds(rec, mode, 40 * TICK_HZ);
        total += rounds.length;
        const now = taken(rec, rounds, FIRE_SCHEDULE_SLACK_ADAPTATION), tight = taken(rec, rounds, 1);
        if (now !== rounds.length || now !== tight) off.push(`${rec.name} m${mode}: ${rounds.length} fired, ${now} taken (slack 2), ${tight} (slack 1)`);
      }
    }
    expect(FIREARMS.length).toBeGreaterThan(30);
    expect(total).toBeGreaterThan(FIREARMS.length * 40);
    expect(off).toEqual([]);
  });

  // LATER 1147's raise fix (the page's raise on the kit's held read, `Fire.padHeldRead`) is the human page's alone: the
  // original's AI steps ctrl+0x118 0 -> 2 on its first call with no pad layer (`FUN_00597810` D:L428041, D:L454390-454420),
  // and the port's bot is raised at the contact (`botRaise`, `BOT_RAISE_READING`) and fires on `BotFirePolicy`'s ticks. So a
  // bot's first round from a lowered rifle stays where it was: up on the contact's tick, its first round on the policy's
  // first due tick: the contact's own tick, in every M4A1 mode (read with the raise fix in; the bot path imports neither
  // file the fix changes, `../../viewer/src/fire.ts` nor `matchFirearm.ts`).
  it("a bot's first round from a lowered rifle is unchanged: raised on the contact's tick, its round on the policy's first due tick", () => {
    expect(botRaise({ engaged: true, throwing: false, tick: 0, until: -1 }).raise).toBe(true);   // up at the contact
    const m4 = FIREARMS.find((r) => r.name === 'M4A1')!;
    const first = m4.fireModes.filter((m) => m >= 1 && m <= 3).map((mode) => [mode, botRounds(m4, mode, 2 * TICK_HZ)[0]]);
    expect(first).toEqual([[1, 0], [2, 0], [3, 0]]);                                     // no second read, no raise wait
  });
});
