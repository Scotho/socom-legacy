// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  actionPoints, carriesTeam, HOSTAGE_KILL_SCORE_READING, objectivePoints, OBJECTIVE_POINTS, OBJECTIVE_STAT_KIND_READING, statKind, teamCarry,
  TEAM_CARRY_RESCUE_READING,
} from '../src/net/objectiveScore';

/**
 * PF-14a (web sprint 27; socomlegacy/docs/research/214-demolition-as-built.md s5; research 192 s3.6, s6.5): the objective
 * events' points, the action record's points, the team carry and the YOUR STATS kind -- the table the room applies
 * (`match/src/room.ts` `scoreObjective`).
 */

describe('objective scoring (research 192 s3.6, s6.5; FUN_005455d0, FUN_00545650, FUN_00545750, FUN_00545530, FUN_00544d60)', () => {
  it("plant +2, defuse +2, detonation +2 and +4 in BREACH (FUN_005455d0 / FUN_00545650 / FUN_00545750, D:L411594-411655); an action's points are its record's", () => {
    expect(OBJECTIVE_POINTS.plant).toBe(2);
    expect(OBJECTIVE_POINTS.defuse).toBe(2);
    expect(OBJECTIVE_POINTS.detonate(1)).toBe(4);                                  // BREACH (type 1)
    for (const t of [0, 2, 3, 4, 5]) expect(OBJECTIVE_POINTS.detonate(t)).toBe(2);
    expect(objectivePoints({ kind: 'plant' }, 2)).toBe(2);
    expect(objectivePoints({ kind: 'defuse' }, 1)).toBe(2);
    expect(objectivePoints({ kind: 'detonate' }, 1)).toBe(4);
    expect(objectivePoints({ kind: 'detonate' }, 2)).toBe(2);
    // FUN_00545530: the record's own `points` (Crossroads' switches and Vigilance's access actions: 2), none without.
    expect(actionPoints({ points: 2 })).toBe(2);
    expect(actionPoints({ points: 0 })).toBe(0);
    expect(actionPoints({ points: 5 })).toBe(5);
    expect(objectivePoints({ kind: 'action', points: 2 }, 5)).toBe(2);
    // The YOUR STATS kind (OBJECTIVE_STAT_KIND_READING, PF.R34): primary the detonation and BREACH's defuse.
    expect(OBJECTIVE_STAT_KIND_READING).toBe('detonate-and-breach-defuse-primary');
    expect(statKind({ kind: 'detonate' }, 2)).toBe('primary');
    expect(statKind({ kind: 'detonate' }, 1)).toBe('primary');
    expect(statKind({ kind: 'defuse' }, 1)).toBe('primary');
    expect(statKind({ kind: 'defuse' }, 2)).toBe('bonus');
    expect(statKind({ kind: 'plant' }, 1)).toBe('bonus');
    expect(statKind({ kind: 'action', points: 2 }, 5)).toBe('bonus');
  });

  it("each objective adds +1 to the side's team score per living teammate, the scorer included; a dead teammate none (FUN_00544d60 D:L411236-411306)", () => {
    const players = [
      { team: 'seal' as const, alive: true },        // the scorer
      { team: 'seal' as const, alive: true },
      { team: 'seal' as const, alive: false },       // dead: +0xe1 bit 4 clear
      { team: 'terrorist' as const, alive: true },   // no team bit shared
      { team: 'terrorist' as const, alive: true },
    ];
    expect(teamCarry('seal', players)).toBe(2);
    expect(teamCarry('terrorist', players)).toBe(2);
    // A dead scorer (a charge's owner fallen before it went off) counts as any dead teammate does: none.
    expect(teamCarry('seal', [{ team: 'seal', alive: false }, { team: 'seal', alive: true }])).toBe(1);
    expect(teamCarry('seal', [])).toBe(0);
  });

  it("a rescue scores +3 and a hostage kill -2 (+3 for a Terrorist in ESCORT, type 3) and neither is a YOUR STATS objective (statKind)", () => {
    // HX-5 (research 239 s4): FUN_00545480 D:L411554-411572 (+3, brought out +1) and FUN_00545390 D:L411524-411547.
    expect(OBJECTIVE_POINTS.rescue).toBe(3);
    expect(HOSTAGE_KILL_SCORE_READING).toBe(-2);
    for (const t of [0, 1, 2, 4, 5]) {
      expect(objectivePoints({ kind: 'rescue' }, t)).toBe(3);
      expect(objectivePoints({ kind: 'hostageKill', killerTeam: 'seal' }, t)).toBe(-2);
      expect(objectivePoints({ kind: 'hostageKill', killerTeam: 'terrorist' }, t)).toBe(-2);
    }
    // ESCORT (type 3, D:L411530): a SEAL's kill -2, a Terrorist's +3.
    expect(objectivePoints({ kind: 'hostageKill', killerTeam: 'seal' }, 3)).toBe(-2);
    expect(objectivePoints({ kind: 'hostageKill', killerTeam: 'terrorist' }, 3)).toBe(3);
    // Neither feeds +0x576 / +0x578: brought out (+0x1c) and escortees killed (+0x18) are the room's own counters.
    expect(statKind({ kind: 'rescue' }, 4)).toBe('none');
    expect(statKind({ kind: 'hostageKill', killerTeam: 'seal' }, 4)).toBe('none');
    // The rescue carries the team (FUN_00544d60(leader, 1)); the kill's FUN_00544d60(killer, 0) adds none.
    expect(TEAM_CARRY_RESCUE_READING).toBe('FUN_00544d60(leader, 1): teamCarry');
    expect(carriesTeam({ kind: 'rescue' })).toBe(true);
    expect(carriesTeam({ kind: 'hostageKill', killerTeam: 'terrorist' })).toBe(false);
    expect(carriesTeam({ kind: 'plant' })).toBe(true);
  });
});
