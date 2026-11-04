// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { killLine } from '../src/netPage';
import { ELIMINATED_HOLD_S, ELIMINATED_HOLD_UNREAD_MAP_S, eliminatedHoldS, ROUND_WATCH_S } from '../src/net/rules';

/**
 * TA-ROUND (the test-architecture wave): the round's kill lines and the classic script's waits, pinned to research 91
 * sections 10 and 18-19 (socomlegacy/docs/research/91-the-round.md) with no game data. Registry:
 * socomlegacy/docs/parity/registry/round.json.
 */

describe('the kill lines (research 91 section 10: FUN_00547860 L412879-412891)', () => {
  it('"%s fragged %s with %s" for an enemy and a team kill alike: no team-kill wording exists', () => {
    expect(killLine('weapon', 'Alpha', 'Bravo', 'M4A1 SD')).toBe('Alpha fragged Bravo with M4A1 SD');
    expect(killLine('teamkill', 'Alpha', 'Bravo', 'M4A1 SD')).toBe('Alpha fragged Bravo with M4A1 SD');
  });

  it('"%s commits suicide with %s" when the killer is the victim (0x65c460)', () => {
    expect(killLine('suicide', 'Bravo', 'Bravo', 'M67')).toBe('Bravo commits suicide with M67');
    expect(killLine('weapon', 'Bravo', 'Bravo', 'M67')).toBe('Bravo commits suicide with M67');
  });

  it('"%s falls to their death" for a fall, the one who fell named (0x65c440, cause 0xfd)', () => {
    expect(killLine('fall', null, 'Bravo', null)).toBe('Bravo falls to their death');
  });
});

describe('the classic round\'s scripted waits (research 91 sections 18.2.1, 19: MP51 objectives `start`, `success` / `failure`)', () => {
  it('nothing ends a round in its first 15 s (WAIT 5, WAIT 10; mission_timer WAIT 15)', () => {
    expect(ROUND_WATCH_S).toBe(15);
  });

  it('an elimination\'s result 23 s on: WAIT 2, WAIT 20, then WAIT 1 before mission_complete', () => {
    expect(ELIMINATED_HOLD_S).toBe(23);
  });

  it('the hold is the map\'s own script: 20 + 1 s on MP2, MP5, MP64 (no WAIT 2); 2 + 20 + 1 s on MP8, MP51, MP81 (research 176 §3)', () => {
    for (const stem of ['MP2', 'MP5', 'MP64', 'mp2']) expect(eliminatedHoldS(stem), stem).toBe(20 + 1);
    for (const stem of ['MP8', 'MP51', 'MP81']) expect(eliminatedHoldS(stem), stem).toBe(2 + 20 + 1);
  });

  it('the PF-11 review\'s recount of all 22 maps: the breach and VIP maps hold 20 + 1 s too; every other disc map 2 + 20 + 1 s', () => {
    // `start` has no WAIT after its 10 s guard on MP52, MP53, MP61, MP62, MP73, MP82, as on MP2, MP5, MP64.
    for (const stem of ['MP52', 'MP53', 'MP61', 'MP62', 'MP73', 'MP82']) expect(eliminatedHoldS(stem), stem).toBe(20 + 1);
    // The other 13 have a WAIT 2 in every outcome branch.
    for (const stem of ['MP1', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP71', 'MP72', 'MP81', 'MP83']) {
      expect(eliminatedHoldS(stem), stem).toBe(2 + 20 + 1);
    }
    // A map that is not one of the disc's 22 (one built by hand) takes the named fallback, MP51's value.
    expect(ELIMINATED_HOLD_UNREAD_MAP_S).toBe(ELIMINATED_HOLD_S);
    expect(eliminatedHoldS('MP99')).toBe(ELIMINATED_HOLD_UNREAD_MAP_S);
  });
});
