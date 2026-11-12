import { describe, expect, it } from 'vitest';
import { PART } from '../../viewer/src/net/damage';
import { NO_PART } from '../../viewer/src/net/hitVolumes';
import { bodyApplications, walkOrder } from '../src/bodyWalk';

/**
 * BONE-BOXES (research 398 s0 rules 3-4, s13.3; reading, pending review): the walk over a round's body records, pure.
 * `walkOrder`: nearest first, each record strictly farther than the last one handled (`FUN_003c9b70` D:L319990: the
 * test is `last < this`), so two records at one distance are handled once -- the first in the list. `bodyApplications`:
 * which records damage -- a body's memory of the round (`+0x1048`, tested `FUN_005ab850` D:L464597) is set by a HEAD or
 * BODY hit (`FUN_005abbc0` D:L464741-464743, D:L464755-464757), never by a limb's; a no-damage bone applies nothing and
 * sets nothing; a volley's ray (class 'Q', D:L464703-464737) applies once a body and remembers it, whatever the bone.
 */

type R = { distance: number; tag: { id: number; part: number; hostage?: true } };
const rec = (distance: number, id: number, part: number, hostage?: true): R => ({ distance, tag: { id, part, ...(hostage ? { hostage } : {}) } });
const parts = (rs: readonly R[]): string => rs.map((r) => `${r.tag.hostage ? 'h' : ''}${r.tag.id}:${r.tag.part}`).join(' ');

describe('BONE-BOXES: the walk\'s order', () => {
  it('nearest first; an equal distance gives one record, the first in the list (the strict less-than, D:L319990)', () => {
    const rs = [rec(5, 2, PART.BODY), rec(3, 2, PART.RARM), rec(3, 3, PART.HEAD), rec(7, 2, PART.LARM)];
    expect(parts(walkOrder(rs))).toBe(`2:${PART.RARM} 2:${PART.BODY} 2:${PART.LARM}`);
  });
  it('a tie between two parts of one body applies once', () => {
    const rs = walkOrder([rec(4, 2, PART.RARM), rec(4, 2, PART.RARM)]);
    expect(bodyApplications(rs, false)).toHaveLength(1);
  });
});

describe('BONE-BOXES: which records damage (research 398 s0, rule 4)', () => {
  const apps = (rs: R[], volley = false): string => parts(bodyApplications(walkOrder(rs), volley));
  it('A: an arm then the trunk damages both; B: the trunk then an arm, the trunk only', () => {
    expect(apps([rec(1, 2, PART.RARM), rec(2, 2, PART.BODY), rec(3, 2, PART.LARM)])).toBe(`2:${PART.RARM} 2:${PART.BODY}`);
    expect(apps([rec(1, 2, PART.BODY), rec(2, 2, PART.RARM)])).toBe(`2:${PART.BODY}`);
  });
  it('C: two bones of one limb, twice; E: two legs, both; D: the head then the trunk, the head only', () => {
    expect(apps([rec(1, 2, PART.RARM), rec(2, 2, PART.RARM)])).toBe(`2:${PART.RARM} 2:${PART.RARM}`);
    expect(apps([rec(1, 2, PART.RLEG), rec(2, 2, PART.LLEG)])).toBe(`2:${PART.RLEG} 2:${PART.LLEG}`);
    expect(apps([rec(1, 2, PART.HEAD), rec(2, 2, PART.BODY), rec(3, 2, PART.RLEG)])).toBe(`2:${PART.HEAD}`);
  });
  it('a no-damage bone applies nothing and remembers nothing; the trunk behind it is damaged', () => {
    expect(apps([rec(1, 2, NO_PART)])).toBe('');
    expect(apps([rec(1, 2, NO_PART), rec(2, 2, PART.BODY), rec(3, 2, PART.RARM)])).toBe(`2:${PART.BODY}`);
  });
  it('the memory is each body\'s own: a trunk hit spares nothing of the next body; a hostage and a player of one id are two bodies', () => {
    expect(apps([rec(1, 2, PART.BODY), rec(2, 3, PART.RARM), rec(3, 3, PART.BODY), rec(4, 2, PART.RLEG)])).toBe(`2:${PART.BODY} 3:${PART.RARM} 3:${PART.BODY}`);
    expect(apps([rec(1, 2, PART.BODY), rec(2, 2, PART.BODY, true)])).toBe(`2:${PART.BODY} h2:${PART.BODY}`);
  });
  it('a volley\'s ray (class Q): the first record of a body applies, whatever its bone, and remembers', () => {
    expect(apps([rec(1, 2, NO_PART), rec(2, 2, PART.BODY), rec(3, 3, PART.RARM), rec(4, 3, PART.LARM)], true)).toBe(`2:${NO_PART} 3:${PART.RARM}`);
  });
});
