import { describe, expect, it } from 'vitest';
import { RuleHost } from '../../src/creator/rules';
import type { RoomOptions } from '../../src/room';
import { duelScript, rulesRoom, ticks, type V3 } from './rulesHarness';

/**
 * FCW-31's retail-parity proof (the plan's FCW-31 RED; spec §6, "after disable the round is exactly the retail round";
 * FCW.R18: with every rules pack off the game is unchanged). One room on one map with one scripted input record and a
 * seeded `RoomOptions.random` (the only difference from main's run, whose default is `Math.random`), run twice: (i) as
 * main builds it -- no rule host -- and (ii) with the rule host present and no pack enabled. Everything the recorder
 * keeps (each broadcast, the lobby's players, each omniscient snapshot, each command run) and every round report must
 * be equal, under both rule sets. The present host must also have heard the room's outcomes (it listens through the
 * room's seam), so the run with it is not the run without it under another name.
 */

const AT: readonly V3[] = [[0, 0, 0], [150, 0, 0]];

function record(opts: Partial<RoomOptions>, host: RuleHost | null, until: number, from = 0) {
  const r = rulesRoom(AT, { ...opts, ...(host ? { ruleHost: host } : {}) });
  r.run(duelScript(from), until);
  return { lines: r.recorder.lines, reports: r.reports.map((x) => JSON.stringify(x)), room: r.room };
}

describe('FCW-31: a retail round with the rule host present and no pack equals main\'s', () => {
  it('respawn: the same broadcasts, players, snapshots, commands and round report', () => {
    const opts: Partial<RoomOptions> = { rules: 'respawn', roundSeconds: 8 };
    const until = ticks(8) + ticks(18);                    // the clock, then EXPIRED_PLAY_S + RESULT_S (16 s)
    const main = record(opts, null, until);
    const host = new RuleHost();
    const present = record(opts, host, until);
    expect(main.reports.length).toBeGreaterThan(0);                       // the round ended inside the record
    expect(main.lines.some((l) => l.includes('"type":"kill"'))).toBe(true);   // and someone died in it
    expect(present.lines.length).toBe(main.lines.length);
    expect(present.lines).toEqual(main.lines);
    expect(present.reports).toEqual(main.reports);
    const heard = host.snapshot();
    expect(heard.state).toBe('off');
    for (const e of ['round.start', 'player.spawn', 'player.hit', 'player.death', 'player.kill', 'round.end'] as const) expect(heard.heard[e] ?? 0).toBeGreaterThan(0);
  });

  it('classic: the same, across a decided round and the next round\'s start', () => {
    const opts: Partial<RoomOptions> = { rules: 'classic', roundSeconds: 20, launchCountdownS: 1 };
    const until = ticks(1) + ticks(40);
    const main = record(opts, null, until, 1.5);
    const host = new RuleHost();
    const present = record(opts, host, until, 1.5);
    expect(main.reports.length).toBeGreaterThan(0);
    expect(main.lines.some((l) => l.includes('"type":"kill"'))).toBe(true);
    expect(present.lines).toEqual(main.lines);
    expect(present.reports).toEqual(main.reports);
    const heard = host.snapshot();
    for (const e of ['match.start', 'round.start', 'player.hit', 'player.death', 'player.eliminated', 'round.end'] as const) expect(heard.heard[e] ?? 0).toBeGreaterThan(0);
  });
});
