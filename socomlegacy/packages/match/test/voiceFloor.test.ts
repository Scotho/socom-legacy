import { beforeAll, describe, expect, it } from 'vitest';
import * as voiceFloorModule from '../src/voiceFloor';
import {
  VOICE_CHANNEL_MAP_READING,
  VOICE_CUTOFF_LOCKOUT_READING,
  VOICE_DEAD_CHANNEL_READING,
  VOICE_FLOOR_HOLD_READING,
  VOICE_FLOOR_RETRY_READING,
  VOICE_LATE_JOINER_READING,
  VOICE_OFFENSE_DEFENSE_NUMBER_READING,
  VOICE_SIDE_BIT_READING,
  VOICE_SPECTATOR_CHANNEL_READING,
  VOICE_TALK_LOCKOUT_MS_READING,
  VoiceFloor,
  channelOf,
  hears,
  type VoiceAsk,
} from '../src/voiceFloor';

/**
 * SVC-20a (sprint 20, wave 1): the room's floor table and channel function, pure, transcribed from research 170 §2-§3
 * and its corrections C1-C3 (note 225). Every `it` is named by the cite it holds. The clock is the test's own (`now`),
 * passed in: the module keeps none. Members are the room's ids (the connection's identity, 170 §2.1's review box).
 */

const A = 1;
const B = 2;
const C = 3;
const D = 4;

/** Sweeps every millisecond from `from` (exclusive) to `to` (inclusive), as the room's tick would, coarser. */
function sweepTo(floor: VoiceFloor, from: number, to: number): number[] {
  const changed: number[] = [];
  for (let t = from + 1; t <= to; t++) changed.push(...floor.sweep(t));
  return changed;
}

describe('the floor table (FUN_0030e8e0 D:L210896-210964; research 170 §2.1)', () => {
  it('FUN_0030e8e0 / FUN_0030e790 D:L210828-210842: twelve entries, one per channel 0-11, each free (0x100) as null', () => {
    const floor = new VoiceFloor();
    for (let c = 0; c < 12; c++) expect(floor.holder(c)).toBeNull();
    expect(() => floor.holder(12)).toThrow(RangeError);
    expect(() => floor.holder(-1)).toThrow(RangeError);
  });

  it('FUN_0030e8e0 type 1 (D:L210896-210964): granted only into a free entry; owner the requester, expiry now + 15 000', () => {
    const floor = new VoiceFloor();
    let now = 1234;
    expect(floor.talkOn(A, 0, now)).toEqual([0]);
    expect(floor.holder(0)).toEqual({ owner: A, expiry: 1234 + 15_000 });
    now = 1300;
    expect(floor.talkOn(B, 0, now)).toEqual([]);              // held: simply not granted, no refusal (R170.4)
    expect(floor.holder(0)).toEqual({ owner: A, expiry: 1234 + 15_000 });
    expect(floor.wanting(B)).toBe(true);
    expect(floor.talkOn(B, 4, now)).toEqual([4]);             // one entry per channel: another channel is free
    expect(floor.holder(4)?.owner).toBe(B);
    expect(floor.holder(0)?.owner).toBe(A);
  });

  it('R170.3/R170.4, VOICE_FLOOR_RETRY_READING (D:L211126, D:L211198; strict, D:L211182): C re-asks once 1 000 ms have passed, on the server clock, and wins after A releases, without a new press', () => {
    const floor = new VoiceFloor();
    let now = 0;
    floor.talkOn(A, 9, now);
    now = 250;
    expect(floor.talkOn(C, 9, now)).toEqual([]);               // asks at once (250); the next ask once past 1250
    expect(sweepTo(floor, 250, 1500)).toEqual([]);            // C re-asked at 1251 into A's hold: not granted
    now = 1500;
    expect(floor.talkOff(A, now)).toEqual([9]);               // type 2: released; nobody is handed it (no queue)
    expect(floor.holder(9)).toBeNull();
    expect(sweepTo(floor, 1500, 2251)).toEqual([]);           // C's retry is not due yet (2251 is not past 2251)
    expect(floor.holder(9)).toBeNull();
    expect(floor.sweep(2252)).toEqual([9]);                   // C's next retry, 752 ms after the release, < 1 000
    expect(floor.holder(9)?.owner).toBe(C);
  });

  it('R170.4 (§2.2, D:L211186-211199): no queue -- with two waiting, the one whose retry falls due first after the release wins', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    floor.talkOn(C, 0, 100);                                   // C re-asks at 1101, 2102, ...
    floor.talkOn(D, 0, 300);                                   // D re-asks at 1301, ...
    sweepTo(floor, 300, 1200);                                 // C re-asked at 1101 into A's hold
    expect(floor.talkOff(A, 1200)).toEqual([0]);
    expect(sweepTo(floor, 1200, 1300)).toEqual([]);
    expect(floor.sweep(1301)).toEqual([0]);                    // D, first due after the release, though C asked first
    expect(floor.holder(0)?.owner).toBe(D);
    expect(sweepTo(floor, 1301, 2102)).toEqual([]);            // C re-asks at 2102 into D's hold
    expect(floor.holder(0)?.owner).toBe(D);
    expect(floor.wanting(C)).toBe(true);
  });

  it('R170.4 (§2.2), the tie: two wants due at the same instant -- the one made first asks first and wins', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    floor.talkOn(C, 0, 100);                                   // both re-ask once past 1100
    floor.talkOn(D, 0, 100);
    expect(floor.talkOff(A, 500)).toEqual([0]);
    expect(sweepTo(floor, 500, 1100)).toEqual([]);
    expect(floor.sweep(1101)).toEqual([0]);
    expect(floor.holder(0)?.owner).toBe(C);
    expect(floor.wanting(D)).toBe(true);
  });

  it('R170.3 (D:L211126): a repeated talk on while wanting does not ask again before the retry is due', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    floor.talkOn(C, 0, 100);                                   // re-asks once past 1100
    floor.talkOff(A, 200);
    expect(floor.talkOn(C, 0, 300)).toEqual([]);               // a modified page's spam is no ask
    expect(floor.holder(0)).toBeNull();
    expect(floor.talkOn(D, 0, 400)).toEqual([0]);              // a fresh press asks at once and wins
    expect(sweepTo(floor, 400, 1101)).toEqual([]);             // C's re-ask at 1101 finds D's hold
    expect(floor.holder(0)?.owner).toBe(D);
  });

  it('one hold a member (voice+0x24, one channel): a holder\'s talk on another channel releases its entry and asks there', () => {
    const floor = new VoiceFloor();
    expect(floor.talkOn(A, 0, 0)).toEqual([0]);
    expect(floor.talkOn(A, 1, 10)).toEqual([0, 1]);
    expect(floor.holder(0)).toBeNull();
    expect(floor.holder(1)?.owner).toBe(A);
    expect(floor.talkOn(A, 1, 20)).toEqual([]);                // the same channel again: nothing changes
    expect(floor.holder(1)).toEqual({ owner: A, expiry: 10 + 15_000 });
  });

  it('FUN_0030e8e0 type 2 (D:L210913; 170 §2.1 review box): a release frees the entry only when the owner matches', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 2, 0);
    expect(floor.talkOff(B, 10)).toEqual([]);                  // B never owned it: nothing freed
    expect(floor.holder(2)?.owner).toBe(A);
    expect(floor.drop(B)).toEqual([]);
    expect(floor.holder(2)?.owner).toBe(A);
    expect(floor.talkOff(A, 20)).toEqual([2]);
    expect(floor.holder(2)).toBeNull();
    expect(floor.wanting(A)).toBe(false);
    // The voice object has no wait after a plain release (D:L211039-211103); the talk input's 1.0 s does (D:L83910),
    // held on the server since the close review's F1: a re-press 1 ms later is granted once that has strictly passed.
    expect(floor.talkOn(A, 2, 21)).toEqual([]);
    expect(sweepTo(floor, 21, 1020)).toEqual([]);
    expect(floor.sweep(1021)).toEqual([2]);
  });

  it('FUN_0030e8e0 types 3 and 4 (D:L210934; 170 §2.1 review box): not in this API -- only talkOn sets an owner; only talkOff, sweep, clearAll, drop and setChannel clear', () => {
    const methods = Object.getOwnPropertyNames(VoiceFloor.prototype).filter((n) => n !== 'constructor').sort();
    expect(methods).toEqual(['clearAll', 'drop', 'holder', 'setChannel', 'sweep', 'takeOver', 'talkOff', 'talkOn', 'wanting']);
    expect(Object.keys(voiceFloorModule).sort()).toEqual([
      'VOICE_CHANNEL_MAP_READING', 'VOICE_CUTOFF_LOCKOUT_READING', 'VOICE_DEAD_CHANNEL_READING',
      'VOICE_FLOOR_HOLD_READING', 'VOICE_FLOOR_RETRY_READING', 'VOICE_LATE_JOINER_READING',
      'VOICE_OFFENSE_DEFENSE_NUMBER_READING', 'VOICE_SIDE_BIT_READING', 'VOICE_SPECTATOR_CHANNEL_READING',
      'VOICE_TALK_LOCKOUT_MS_READING', 'VoiceFloor', 'channelOf', 'hears',
    ]);
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    const entry = floor.holder(0)!;
    expect(Object.isFrozen(entry)).toBe(true);                 // the entry handed out cannot be written back
    expect(() => { (entry as { owner: number }).owner = B; }).toThrow(TypeError);
    expect(floor.holder(0)?.owner).toBe(A);
  });

  it('the sweep (D:L211271-211300): an entry past its expiry is freed and the wanting re-tried; it returns the changed channels', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 1, 0);
    floor.talkOn(B, 5, 0);
    floor.talkOn(C, 1, 500);                                   // waits on 1, re-asks once past 1500, ...
    expect(floor.sweep(15_001)).toEqual([1, 5]);               // one late sweep: both entries past their hold, freed;
    expect(floor.holder(1)?.owner).toBe(C);                    //   C, due, re-tried and granted in the same sweep
    expect(floor.holder(5)).toBeNull();
    expect(floor.sweep(15_002)).toEqual([]);                   // nothing changed: nothing reported
  });

  it('FUN_00310080 D:L211751-211753, D:L158881, D:L211217: VOICE_FLOOR_HOLD_READING -- recording cap 10 000 ms, host expiry +5 000 = 15 000 ms', () => {
    expect(VOICE_FLOOR_HOLD_READING.recordMs).toBe(10_000);
    expect(VOICE_FLOOR_HOLD_READING.expiryMs).toBe(VOICE_FLOOR_HOLD_READING.recordMs + 5000);
    expect(VOICE_FLOOR_RETRY_READING).toBe(1000);
    expect(VOICE_CUTOFF_LOCKOUT_READING).toBe(10_000);
    const floor = new VoiceFloor();
    floor.talkOn(A, 3, 777);
    expect(floor.holder(3)?.expiry).toBe(777 + 15_000);
  });

  it('FUN_0030e7f0 D:L210844-210892 (called at D:L55846): the round\'s start clears all twelve', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    floor.talkOn(B, 4, 0);
    floor.talkOn(C, 10, 0);
    expect(floor.clearAll()).toEqual([0, 4, 10]);
    for (let c = 0; c < 12; c++) expect(floor.holder(c)).toBeNull();
    expect(floor.clearAll()).toEqual([]);
  });

  it('170 §2.3 "Leaving" (OT.R27: freed at once, not at the expiry): drop(member) frees every entry it owns and forgets its want', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 9, 0);
    floor.talkOn(B, 9, 10);
    expect(floor.drop(A)).toEqual([9]);
    expect(floor.holder(9)).toBeNull();
    expect(floor.wanting(A)).toBe(false);
    expect(sweepTo(floor, 10, 1011)).toEqual([9]);             // B's retry at 1011 takes it
    expect(floor.holder(9)?.owner).toBe(B);
    expect(floor.drop(D)).toEqual([]);                         // an unknown member: nothing
  });

  it('170 §2.3 "Leaving": drop(member) forgets its hold-off too -- the id comes back as a new member', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    expect(floor.sweep(10_001)).toEqual([0]);                  // cut: A held off past 20 001
    floor.drop(A);
    expect(floor.talkOn(A, 0, 12_000)).toEqual([0]);
  });

  it('W20.R5 (R170.3: D:L211217 the cap, D:L211257-211265 state 4; strict, D:L211262): a hold is cut at 10 000 ms of talk from the grant, and the next grant waits VOICE_CUTOFF_LOCKOUT_READING more', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    expect(sweepTo(floor, 0, 10_000)).toEqual([]);             // 10 000 ms of talk: still held
    expect(floor.sweep(10_001)).toEqual([0]);                  // past the cap: cut, from the grant's time
    expect(floor.holder(0)).toBeNull();
    floor.talkOff(A, 10_500);                                  // the honest page lets go
    expect(floor.talkOn(A, 0, 12_000)).toEqual([]);            // inside its hold-off: not granted
    expect(sweepTo(floor, 12_000, 20_001)).toEqual([]);        // nor by a retry, nor at 20 001 (not past it)
    expect(floor.sweep(20_002)).toEqual([0]);                  // past the hold-off's end: the want re-tried then
    expect(floor.holder(0)?.owner).toBe(A);
  });

  it('W20.R5 with C6 (D:L211255-211263, R170.3): a want still on at the cut resumes by itself at 20 s, and others may take the floor meanwhile', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 9, 0);                                     // held through: the flag stays set (lobby, L2)
    expect(floor.sweep(10_001)).toEqual([9]);
    expect(floor.wanting(A)).toBe(true);
    expect(floor.talkOn(B, 9, 11_000)).toEqual([9]);           // B is not in a hold-off
    expect(floor.talkOff(B, 12_000)).toEqual([9]);
    expect(sweepTo(floor, 12_000, 20_001)).toEqual([]);        // A is held off to 20 001
    expect(floor.sweep(20_002)).toEqual([9]);                  // the 20 s resume
    expect(floor.holder(9)).toEqual({ owner: A, expiry: 20_002 + 15_000 });
    expect(floor.sweep(30_003)).toEqual([9]);                  // and is cut again 10 s later: 10 on, 10 off
    expect(floor.holder(9)).toBeNull();
  });

  it('W20.R5, state 4 is the voice object\'s, not the flag: the hold-off survives setChannel and clearAll', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    expect(floor.sweep(10_001)).toEqual([0]);                  // cut: held off past 20 001
    expect(floor.setChannel(A, 3)).toEqual([]);                // a change: the want cleared, nothing held
    expect(floor.wanting(A)).toBe(false);
    expect(floor.clearAll()).toEqual([]);
    expect(floor.talkOn(A, 3, 15_000)).toEqual([]);            // still held off
    expect(sweepTo(floor, 15_000, 20_001)).toEqual([]);
    expect(floor.sweep(20_002)).toEqual([3]);
    expect(floor.holder(3)?.owner).toBe(A);
  });

  it('FUN_0030fcd0 D:L211574-211599, the guard D:L211589-211590: a channel change ends a hold and clears the want', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    floor.talkOn(B, 0, 0);
    expect(floor.setChannel(A, 3)).toEqual([0]);               // the death's move to the dead zone, say
    expect(floor.holder(0)).toBeNull();
    expect(floor.wanting(A)).toBe(false);
    expect(floor.setChannel(B, 4)).toEqual([]);                // a change: nothing held, the want cleared
    expect(floor.wanting(B)).toBe(false);
    expect(sweepTo(floor, 0, 2000)).toEqual([]);               // nobody re-asks
    expect(() => floor.setChannel(A, 12)).toThrow(RangeError);
  });

  it('FUN_0030fcd0 D:L211589-211590: a set to the channel already held changes nothing -- a talker on TEAM who re-picks TEAM keeps his hold', () => {
    const floor = new VoiceFloor();
    floor.setChannel(A, 0);
    floor.setChannel(B, 0);
    expect(floor.talkOn(A, 0, 0)).toEqual([0]);
    expect(floor.talkOn(B, 0, 10)).toEqual([]);
    expect(floor.setChannel(A, 0)).toEqual([]);
    expect(floor.holder(0)?.owner).toBe(A);
    expect(floor.wanting(A)).toBe(true);
    expect(floor.setChannel(B, 0)).toEqual([]);                // B's want stays on too, and its retry
    expect(floor.wanting(B)).toBe(true);
  });

  it('FUN_0030e490 D:L210683: RADIO OFF clears the flag every time, even when already on 11', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    expect(floor.setChannel(A, 11)).toEqual([0]);
    expect(floor.wanting(A)).toBe(false);
    expect(floor.setChannel(A, 11)).toEqual([]);
    expect(floor.wanting(A)).toBe(false);
  });

  it('FUN_0030e6e0 D:L210785-210796: a talker on 11 is refused the flag -- no ask, no want', () => {
    const floor = new VoiceFloor();
    expect(floor.talkOn(A, 11, 0)).toEqual([]);
    expect(floor.holder(11)).toBeNull();
    expect(floor.wanting(A)).toBe(false);
    expect(() => floor.talkOn(A, 12, 0)).toThrow(RangeError);
    expect(() => floor.talkOn(A, 1.5, 0)).toThrow(RangeError);
  });
});

describe("the close review's F1 (W20.R5, constraint 4): no floor kept by cycling talk off / on -- the talk input's 1.0 s on the server", () => {
  it("VOICE_TALK_LOCKOUT_MS_READING: 1 000 ms, the talk input's lockout after route B's end (DAT_003dcb08, D:L83910), in ms", () => {
    expect(VOICE_TALK_LOCKOUT_MS_READING).toBe(1000);
  });

  it('the cycling page (off then on, back to back, every 9 s) loses the floor to the waiter C within 1 s of its first release', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 9, 0);
    floor.talkOn(C, 9, 100);                                   // C waits: re-asks once past 1100, 2101, ...
    expect(sweepTo(floor, 100, 9000)).toEqual([]);
    expect(floor.talkOff(A, 9000)).toEqual([9]);               // the modified page lets go ...
    expect(floor.talkOn(A, 9, 9000)).toEqual([]);              // ... and presses again at once: no ask, the want kept
    expect(floor.holder(9)).toBeNull();
    expect(floor.wanting(A)).toBe(true);
    let grantedAt = -1;
    for (let t = 9001; t <= 10_000 && grantedAt < 0; t++) if (floor.sweep(t).includes(9)) grantedAt = t;
    expect(floor.holder(9)?.owner).toBe(C);                    // the waiter's retry fell due first
    expect(grantedAt - 9000).toBeGreaterThan(0);
    expect(grantedAt - 9000).toBeLessThanOrEqual(1000);
    // Cycling on to 120 s (the reviewer's probe): C, still pressing, is granted again and again -- never shut out.
    let grantsToC = 1, last: number | null = C;
    for (let t = grantedAt + 1; t <= 120_000; t++) {
      if (t % 9000 === 0) { floor.talkOff(A, t); floor.talkOn(A, 9, t); }
      floor.sweep(t);
      const now = floor.holder(9)?.owner ?? null;
      if (now === C && last !== C) grantsToC++;
      last = now;
    }
    expect(grantsToC).toBeGreaterThanOrEqual(4);
  });

  it("the honest page: its re-press 1.0 s after its release (the talk input's lock, now >= lockUntil) asks at once and is granted when free", () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    expect(floor.talkOff(A, 500)).toEqual([0]);
    expect(floor.talkOn(A, 0, 1500)).toEqual([0]);
    expect(floor.holder(0)).toEqual({ owner: A, expiry: 1500 + 15_000 });
  });

  it("the holder's release and re-press with no waiter: not at once, re-granted once 1.0 s has strictly passed since the release", () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 9, 0);
    expect(floor.talkOff(A, 500)).toEqual([9]);
    expect(floor.talkOn(A, 9, 600)).toEqual([]);
    expect(floor.talkOn(A, 9, 700)).toEqual([]);               // a second press while wanting asks nothing new
    expect(sweepTo(floor, 700, 1500)).toEqual([]);
    expect(floor.sweep(1501)).toEqual([9]);
    expect(floor.holder(9)?.owner).toBe(A);
  });

  it('a waiter that cycles off / on asks no sooner than its 1 s retry', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    floor.talkOn(C, 0, 100);                                   // C re-asks once past 1100
    floor.talkOff(A, 200);
    floor.talkOff(C, 300);
    expect(floor.talkOn(C, 0, 300)).toEqual([]);               // inside its window: no ask at once
    expect(floor.talkOn(D, 0, 400)).toEqual([0]);              // a member that did not just let go asks at once
    expect(floor.holder(0)?.owner).toBe(D);
  });

  it("a set that ends the flag starts the window too (the radio's, the ARMORY's OFF and back): no grant at once", () => {
    const floor = new VoiceFloor();
    floor.setChannel(A, 0, 0);
    floor.talkOn(A, 0, 0);
    expect(floor.setChannel(A, 11, 3000)).toEqual([0]);        // RADIO OFF: the hold ended (D:L210683)
    expect(floor.setChannel(A, 0, 3000)).toEqual([]);          // RADIO ON
    expect(floor.talkOn(A, 0, 3000)).toEqual([]);
    expect(sweepTo(floor, 3000, 4000)).toEqual([]);
    expect(floor.sweep(4001)).toEqual([0]);
    expect(floor.setChannel(B, 0, 4001)).toEqual([]);          // a set that ends no flag starts no window
    expect(floor.talkOn(B, 1, 4002)).toEqual([1]);
  });

  it('drop forgets the window: the id comes back as a new member', () => {
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    floor.talkOff(A, 100);
    floor.drop(A);
    expect(floor.talkOn(A, 0, 200)).toEqual([0]);
  });

  it('LATER 20, a takeover: the hold-off and the re-press window move to the new id, a held flag ended at the takeover', () => {
    // The hold-off (W20.R5): A cut at the cap, then taken over as D -- D is refused until the hold-off has passed.
    const floor = new VoiceFloor();
    floor.talkOn(A, 0, 0);
    const cut = VOICE_FLOOR_HOLD_READING.recordMs + 1;
    expect(floor.sweep(cut)).toEqual([0]);
    floor.takeOver(A, D, cut + 2000);
    floor.drop(A);
    expect(floor.talkOn(D, 0, cut + 2000)).toEqual([]);
    expect(sweepTo(floor, cut + 2000, cut + VOICE_CUTOFF_LOCKOUT_READING)).toEqual([]);
    expect(floor.sweep(cut + VOICE_CUTOFF_LOCKOUT_READING + 1)).toEqual([0]);
    expect(floor.holder(0)?.owner).toBe(D);
    // The re-press window (F1): A holds, B waits; A taken over as D -- D's press waits the window, B's retry wins.
    const second = new VoiceFloor();
    second.talkOn(A, 0, 0);
    second.talkOn(B, 0, 100);
    second.takeOver(A, D, 9900);
    expect(second.drop(A)).toEqual([0]);
    expect(second.talkOn(D, 0, 9900)).toEqual([]);
    expect(second.sweep(9901)).toEqual([0]);
    expect(second.holder(0)?.owner).toBe(B);
  });
});

/** One ask of `FUN_002c2c20`: the base asked, and the member as the function reads him then. */
const ask = (base: VoiceAsk['base'], over: Partial<Omit<VoiceAsk, 'base'>> = {}): number =>
  channelOf({ base, actorDead: false, spectator: false, team: 'seals', ...over });

describe('the channel function, literal (FUN_002c2c20 D:L164422-164461; research 170 §3.1, C1-C3)', () => {
  it('FUN_0027c9f0 D:L125568 asks 9: the game lobby\'s players are 9, whatever their side (the base-9 exemption, D:L164449)', () => {
    expect(VOICE_CHANNEL_MAP_READING.lobby).toBe(9);
    expect(ask(9)).toBe(9);
    expect(ask(9, { team: 'terrorists' })).toBe(9);
  });

  it('D:L164437-164440, C2, VOICE_SPECTATOR_CHANNEL_READING: a spectator is 10 whatever is asked, and never +4 (his team word is 0x10000)', () => {
    expect(VOICE_SPECTATOR_CHANNEL_READING).toBe(10);
    for (const base of [0, 1, 2, 3, 9, 10] as const) {
      expect(ask(base, { spectator: true, team: 'spectators' })).toBe(10);
      expect(ask(base, { spectator: true, team: 'spectators', actorDead: true })).toBe(10);   // the spectator step comes after the dead one
    }
  });

  it('170 §3 review box (:202-206), D:L164454 / FUN_0030fcd0 D:L211588: a side bit ORed on 10 gives 14, outside the table, and is refused', () => {
    expect(() => ask(10, { spectator: true, team: 'terrorists' })).toThrow(RangeError);
    expect(() => ask(10, { team: 'terrorists' })).toThrow(RangeError);
  });

  it('FUN_0030e490 D:L210680, FUN_0027d8c0 D:L126094-126102, D:L158882: radio off is 11, set directly, not through FUN_002c2c20', () => {
    expect(VOICE_CHANNEL_MAP_READING.radioOff).toBe(11);
    expect(ask(11)).toBe(11);
    expect(ask(11, { team: 'terrorists', actorDead: true })).toBe(11);
    expect(ask(11, { spectator: true, team: 'spectators' })).toBe(11);
  });

  it('C1, FUN_002344e0 D:L83791-83792 / FUN_0022f950 D:L81576-81592, VOICE_OFFENSE_DEFENSE_NUMBER_READING: TEAM 0, DEFENSE 1, OFFENSE 2', () => {
    expect(VOICE_OFFENSE_DEFENSE_NUMBER_READING).toEqual({ team: 0, defense: 1, offense: 2 });
    expect(ask(0)).toBe(0);
    expect(ask(1)).toBe(1);
    expect(ask(2)).toBe(2);
  });

  it('D:L164432-164435, VOICE_DEAD_CHANNEL_READING: a dead actor is put on 3 at every ask, whatever the base and the game', () => {
    expect(VOICE_DEAD_CHANNEL_READING).toBe(3);
    for (const base of [0, 1, 2, 3] as const) expect(ask(base, { actorDead: true })).toBe(3);
    expect(ask(9, { actorDead: true })).toBe(3);                // the dead test runs before the base-9 exemption (170 §3 box)
    expect(ask(9, { actorDead: true, team: 'terrorists' })).toBe(7);
    expect(ask(3)).toBe(3);                                     // 0x22's ask (D:L497729-497730) or a late joiner's
  });

  it('D:L55848-55849, VOICE_LATE_JOINER_READING: the round\'s start asks the dead zone for a late joiner', () => {
    expect(VOICE_LATE_JOINER_READING).toBe(3);
    expect(ask(VOICE_LATE_JOINER_READING)).toBe(3);
    expect(ask(VOICE_LATE_JOINER_READING, { team: 'terrorists' })).toBe(7);
  });

  it('C2, D:L164449-164458 (OR, FUN_0030fcd0 D:L211588), VOICE_SIDE_BIT_READING: Terrorists OR 4, SEALs 0-3, never on 9 or 11', () => {
    expect(VOICE_SIDE_BIT_READING).toBe(4);
    expect(ask(0, { team: 'terrorists' })).toBe(4);
    expect(ask(1, { team: 'terrorists' })).toBe(5);
    expect(ask(2, { team: 'terrorists' })).toBe(6);
    expect(ask(3, { team: 'terrorists' })).toBe(7);
    expect(ask(2, { team: 'terrorists', actorDead: true })).toBe(7);
    expect(ask(9, { team: 'terrorists' })).toBe(9);
    expect(ask(11, { team: 'terrorists' })).toBe(11);
  });

  it('170 §3 review box (:202-206), W20.R4: a base no caller asks (4-8, 12, a fraction) is refused, and no result is above 11', () => {
    for (const base of [-1, 4, 5, 6, 7, 8, 12, 1.5, Number.NaN] as unknown as VoiceAsk['base'][]) {
      expect(() => ask(base)).toThrow(RangeError);
    }
    const seen = new Set<number>();
    let refused = 0;
    for (const base of [0, 1, 2, 3, 9, 10, 11] as const) for (const actorDead of [true, false])
      for (const spectator of [true, false]) for (const team of ['seals', 'terrorists', 'spectators'] as const) {
        try { seen.add(channelOf({ base, actorDead, spectator, team })); } catch (e) { expect(e).toBeInstanceOf(RangeError); refused++; }
      }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11]);
    expect(refused).toBe(13);    // 10 ORed with the Terrorists' word, 14: a spectator flag on that word (6 bases x 2), or a living ask of 10
  });
});

describe('who hears whom (FUN_0030f7e0 D:L211395-211449, D:L211408; research 170 §3.2, R170.6), as sequences of asks', () => {
  // The callers' asks (note 225 §5, SVC-20c's): the lobby asks 9; the round's start 0 (3 for a late joiner); the radio
  // 0, 1 or 2; RADIO ON 0 (10 for a spectator); a death asks 3 only without respawn or for a ghost; 0x23 asks +0xc4
  // unless game +0xd2; RADIO OFF sets 11.
  let lobbyPlayer: number, lobbyPlayer2: number, lobbySpectator: number, sealTeam: number, sealOffense: number;
  let sealDefense: number, terrTeam: number, terrOffense: number, sealDead: number, terrDead: number, spectator: number;
  let off: number;
  beforeAll(() => {
    lobbyPlayer = ask(9);
    lobbyPlayer2 = ask(9, { team: 'terrorists' });
    lobbySpectator = ask(9, { spectator: true, team: 'spectators' });
    sealTeam = ask(0);
    sealOffense = ask(2);
    sealDefense = ask(1);
    terrTeam = ask(0, { team: 'terrorists' });
    terrOffense = ask(2, { team: 'terrorists' });
    sealDead = ask(3, { actorDead: true });                 // a classic death's 0x22 asks 3
    terrDead = ask(3, { actorDead: true, team: 'terrorists' });
    spectator = ask(0, { spectator: true, team: 'spectators' });
    off = ask(11);
  });

  it('§3.2 row 1 (FUN_0027c9f0 D:L125568): a game-lobby player hears the lobby\'s other players, not spectators', () => {
    expect(hears(lobbyPlayer, lobbyPlayer2)).toBe(true);
    expect(hears(lobbyPlayer, lobbySpectator)).toBe(false);
  });

  it('§3.2 row 2 (D:L164437-164440): a game-lobby spectator hears spectators, not the players', () => {
    expect(hears(lobbySpectator, ask(9, { spectator: true, team: 'spectators' }))).toBe(true);
    expect(hears(lobbySpectator, lobbyPlayer)).toBe(false);
  });

  it('§3.2 row 3 (C2, D:L211408): after the round\'s start asks 0, a living player on TEAM hears his side\'s living on TEAM only', () => {
    expect(hears(sealTeam, ask(0))).toBe(true);
    expect(hears(terrTeam, ask(0, { team: 'terrorists' }))).toBe(true);
    for (const other of [terrTeam, sealOffense, sealDefense, sealDead, spectator]) expect(hears(sealTeam, other)).toBe(false);
  });

  it('§3.2 row 4 (C1, D:L211408): after the radio asks 2 or 1, a living player hears his side\'s living on the same setting only', () => {
    expect(hears(sealOffense, ask(2))).toBe(true);
    expect(hears(sealDefense, ask(1))).toBe(true);
    for (const other of [sealTeam, sealDefense, terrOffense, sealDead, terrDead, spectator, lobbyPlayer]) {
      expect(hears(sealOffense, other)).toBe(false);
    }
    expect(hears(terrOffense, sealOffense)).toBe(false);
  });

  it('§3.2 row 5 (C3, D:L454484-454492, D:L497729-497730): a classic death asks 3 -- he hears his side\'s dead only, and the living do not hear him', () => {
    let channel = ask(2);                                       // living, on OFFENSE
    expect(channel).toBe(2);
    channel = ask(3, { actorDead: true });                      // the death: no respawn, so 0x22 asks 3
    expect(channel).toBe(3);
    expect(hears(channel, ask(3, { actorDead: true }))).toBe(true);
    for (const other of [sealTeam, sealOffense, terrTeam, terrDead, spectator]) {
      expect(hears(channel, other)).toBe(false);
      expect(hears(other, channel)).toBe(false);
    }
  });

  it('§3.2 row 5, the respawn case (C3, D:L454485): a death in a respawn room asks nothing -- the SEAL keeps his living channel and is heard by his living side', () => {
    const channel = ask(0);                                     // living, on TEAM; then he dies, and nothing asks
    expect(hears(sealTeam, channel)).toBe(true);
    expect(hears(channel, sealTeam)).toBe(true);
    expect(hears(sealDead, channel)).toBe(false);
    expect(ask(0, { actorDead: true })).toBe(3);                // but should he re-pick his radio while dead, the ask puts him on 3
  });

  it('§3.2 row 5, a ghost (C3, D:L497733-497737): a ghost\'s death asks 3, and his 0x23 asks nothing while game +0xd2 is set -- he stays on 3', () => {
    let channel = ask(1);
    expect(channel).toBe(1);
    channel = ask(3, { actorDead: true });                      // a ghost's death asks 3, respawn or not
    expect(channel).toBe(3);
    channel = ask(3);                                           // 0x23 with game +0xd2 set asks 3 (D:L497737): alive again, still the dead zone
    expect(channel).toBe(3);
    expect(hears(channel, sealDead)).toBe(true);
    expect(hears(channel, sealDefense)).toBe(false);
    channel = ask(1);                                           // 0x23 once +0xd2 is clear: +0xc4 asked, the actor alive
    expect(hears(channel, sealDefense)).toBe(true);
  });

  it('§3.2 row 6 (D:L164437-164440, C2): a spectator in the round hears spectators, not any player, living or dead', () => {
    expect(hears(spectator, ask(10, { spectator: true, team: 'spectators' }))).toBe(true);   // RADIO ON asks 10 for him
    for (const other of [sealTeam, sealOffense, sealDead, terrTeam, terrOffense, terrDead]) {
      expect(hears(spectator, other)).toBe(false);
      expect(hears(other, spectator)).toBe(false);
    }
  });

  it('§3.2 row 7 (FUN_0030e6e0 D:L210785-210796): radio off hears nobody and is heard by nobody, not even another on 11', () => {
    expect(hears(off, ask(11, { team: 'terrorists' }))).toBe(false);
    for (const other of [lobbyPlayer, lobbySpectator, sealTeam, sealDead, terrTeam, spectator]) {
      expect(hears(off, other)).toBe(false);
      expect(hears(other, off)).toBe(false);
    }
  });
});
