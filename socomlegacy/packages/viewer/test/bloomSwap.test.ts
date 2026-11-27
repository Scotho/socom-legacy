import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, readKitTable, weaponCategory } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Accuracy, ITEM_RETICLE_ZERO_CATEGORIES, itemReticleOf, TICK, type AccuracyInput, type ItemReticle } from '../src/accuracy';

/**
 * BLOOM-SWAP (Craig's report "nade swapping doesn't reset bloom"; research 321 section 3.4). The kit's tick
 * `FUN_005c2670` (D:L477256-477377; r0004's twin r4 0x5c9b40, the same arithmetic) runs on the SELECTED slot's item
 * (`kit+0x824`, D:L477280), whatever it is: a grenade up ticks the one kit size `+0x84c` with the grenade's own
 * `Reticule_Modifiers` stance, its `TargetMin`/`TargetMax` taken as 0 and 0 for the categories 0x97, 0x79, 0xbe, 0xc9
 * (D:L477282-477288) -- so it closes at the grenade's `TargetConstrict` (60 a second on the disc) to 0. Back on the rifle,
 * the size carried (R321.3, kept) is lifted to the rifle's min and opens at its own rate.
 *
 * The capture (proven: seat ac's capture of r0004 on M51, the M4A1 SD with the Mk141 on L2 and through the R2 menu, three
 * trials each, `agent-mail/evidence/eph-hunt-2026-11-01/bloom-swap/`, `qs-t*`, `menu-t*`, `ctl-t*`, `run-t*`): running
 * opens the rifle 1 -> 26 at +1 a frame; the Mk141 up, 26 -> 24 on its first frame and 2 a frame to 0 (about 0.45 s);
 * back on the rifle, 0 -> 2 on its first frame and +1 a frame to 26 (about 0.8 s); the control holds 26 running and
 * closes to 1 in about 0.5 s stopped. One `tick(TICK)` here is one 30 Hz game frame (`FUN_005c2670`'s `param_1`, the
 * capture's 2.0019 a frame = 60 x 525/15734), so the frame counts are the capture's; the page runs the same rule
 * continuously (MISSION R8), which moves only the sub-frame steps, not the rates.
 */

const zweapon = fixture('RUN/ZWEAPON.ZAR');
const table = zweapon ? readKitTable(zweapon) : null;
const RUN: AccuracyInput = { stance: 'stand', velocity: [0, 0, 65], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 1 };
const STILL: AccuracyInput = { ...RUN, velocity: [0, 0, 0] };
const MK141 = 123;

/** Frames of `input` until `done` (at most 200); the count run. */
const framesUntil = (a: Accuracy, input: AccuracyInput, done: (size: number) => boolean): number => {
  let n = 0;
  while (!done(a.state().size)) { a.tick(TICK, input); if (++n > 200) throw new Error('never'); }
  return n;
};

/** The M4A1 SD run up to 26 from rest. */
const bloomed = (): Accuracy => {
  const a = new Accuracy(HELD_RIFLE);
  expect(framesUntil(a, RUN, (s) => s >= 26)).toBe(25);                // 1 -> 26 at +1 a frame: 25 frames
  return a;
};

describe.skipIf(table === null)(`BLOOM-SWAP: the grenade slot's own tick closes the kit's size (FUN_005c2670)${table ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const nade = (): ItemReticle => {
    const r = itemReticleOf(table!, MK141);
    expect(r).not.toBeNull();
    return r!;
  };

  it('every item read: each hand grenade, charge, gear item and armour carries its own Reticule_Modifiers (the Mk141: constrict 60)', () => {
    const r = nade();
    expect(r.stances.stand.constrict).toBe(60);                       // zweapon.rdr Mark141 STANCE_STAND TargetConstrict
    for (const id of [121, 122, 123, 126, 127, 128, 151, 152, 153, 158, 190, 193, 195]) {
      const it = itemReticleOf(table!, id);
      expect(it, String(id)).not.toBeNull();
      expect(ITEM_RETICLE_ZERO_CATEGORIES).toContain(weaponCategory(id));
      for (const st of ['stand', 'crouch', 'prone'] as const) expect(it!.stances[st].constrict, `${id} ${st}`).toBe(60);
    }
    expect(itemReticleOf(table!, 62)).toBeNull();                      // a firearm runs its own record (`setWeapon`)
  });

  it('control: running holds the rifle at 26; stopping closes it at 50 a second to 1 in 15 frames (about 0.5 s)', () => {
    const a = bloomed();
    for (let i = 0; i < 60; i++) { a.tick(TICK, RUN); expect(a.state().size).toBe(26); }
    const n = framesUntil(a, STILL, (s) => s <= 1);
    expect(n).toBe(15);                                               // (26 - 1) / (50 x TICK) = 14.98
    expect(n * TICK).toBeCloseTo(0.5, 1);
  });

  it('the Mk141 up while running: 26 -> 24 on its first frame, 2 a frame to 0 in 13 frames (about 0.45 s), held at 0', () => {
    const a = bloomed();
    a.setItem(nade());
    a.tick(TICK, RUN);
    expect(a.state().size).toBeCloseTo(26 - 60 * TICK, 9);             // the capture's 24.00
    const n = 1 + framesUntil(a, RUN, (s) => s <= 0);
    expect(n).toBe(13);                                               // 26 / (60 x TICK) = 12.99
    expect(n * TICK).toBeGreaterThan(0.4);
    expect(n * TICK).toBeLessThan(0.47);
    expect(a.state().size).toBe(0);                                   // the floor is 0, not the rifle's 1
    for (let i = 0; i < 20; i++) { a.tick(TICK, RUN); expect(a.state().size).toBe(0); }
  });

  it('back on the rifle: it enters at 2 (0 lifted to 1, +1) and opens +1 a frame to 26 in 25 frames (about 0.8 s)', () => {
    const a = bloomed();
    a.setItem(nade());
    framesUntil(a, RUN, (s) => s <= 0);
    a.setItem(null);
    a.tick(TICK, RUN);
    expect(a.state().size).toBe(2);                                   // the capture's 2.00
    a.tick(TICK, RUN);
    expect(a.state().size).toBe(3);
    const n = 2 + framesUntil(a, RUN, (s) => s >= 26);
    expect(n).toBe(25);
    expect(n * TICK).toBeCloseTo(0.83, 2);
  });

  it('a short swap (6 frames, 0.2 s) closes it only partly; the rifle carries what the grenade left (R321.3 kept)', () => {
    const a = bloomed();
    a.setItem(nade());
    for (let i = 0; i < 6; i++) a.tick(TICK, RUN);
    const left = a.state().size;
    expect(left).toBeCloseTo(26 - 6 * 60 * TICK, 9);                  // 13.99
    a.setItem(null);
    a.tick(TICK, RUN);
    expect(a.state().size).toBeCloseTo(left + 1, 9);                  // carried, then the rifle's +1
  });

  it('the R2 menu path and the L2 path are the same item: a grenade stays up through the menu as on L2 (one setItem)', () => {
    // The kit does not know which button selected the slot (`FUN_005c4b10` writes +0x824 either way, D:L478842); the
    // capture's qs-t* and menu-t* agree to the frame. The page's two paths both raise the item (`./grenade` `equip`).
    const a = bloomed(), b = bloomed();
    a.setItem(nade()); b.setItem(nade()); b.setItem(nade());
    for (let i = 0; i < 8; i++) { a.tick(TICK, RUN); b.tick(TICK, RUN); }
    expect(b.state().size).toBe(a.state().size);
  });

  it("the first shot after the swap, walking (ac's first-shot capture, w100-t*): regrown to the walk's target by the release, then +7", () => {
    // The capture: walking at half stick, the Mk141 up and down, the trigger pressed 0.1 s after the rifle's return; the
    // round leaves about 0.33 s after the return (10 frames; the release's timing is not this row's), the size the frame
    // before 6.42-6.47 (6.56 walking with no swap), the round +7 (`TargetDilateUponFire` 7, the SD's AccScalar 0). The
    // walk's speed is chosen so the target is 6.45 (|v|^2 / 65, 20.5 units a second); the CSV's positions give about 21
    // at the median over uneven sample intervals (research 321 section 3.4).
    const WALK: AccuracyInput = { ...RUN, velocity: [0, 0, Math.sqrt(6.45 * 65)] };
    const a = new Accuracy(HELD_RIFLE);
    for (let i = 0; i < 30; i++) a.tick(TICK, WALK);
    expect(a.state().size).toBeCloseTo(6.45, 6);                      // walking, no swap: at the target
    a.setItem(nade());
    framesUntil(a, WALK, (s) => s <= 0);
    a.setItem(null);
    for (let i = 0; i < 10; i++) a.tick(TICK, WALK);                   // 10 frames = 0.334 s after the return
    expect(a.state().size).toBeCloseTo(6.45, 6);                      // 2, 3, 4, 5, 6, 6.45: regrown by frame 6
    a.round(1, 'stand');
    expect(a.state().size).toBeCloseTo(6.45 + 7, 6);                  // the capture's 13.37 from 6.42
  });

  // The size only: the knock's offset returns at the item's rate on the page and the firearm's in the room (LATER 652).
  it("the room's cone (the rifle all through, no item on the wire): its size never stands under the page's", () => {
    const page = bloomed(), room = bloomed();
    page.setItem(nade());
    for (let i = 0; i < 20; i++) { page.tick(TICK, RUN); room.tick(TICK, RUN); expect(room.state().size).toBeGreaterThanOrEqual(page.state().size); }
    page.setItem(null);
    for (let i = 0; i < 40; i++) {
      const input = i < 10 ? RUN : STILL;
      page.tick(TICK, input); room.tick(TICK, input);
      expect(room.state().size).toBeGreaterThanOrEqual(page.state().size);
    }
  });
});

/**
 * SWAP-FIRE P1 (keyjob SWAP-FIRE (i) sections 4.2 and 7 "P1"; reading, pending review). A hand grenade's launch is not a
 * quiet frame: the launch tick (r4 0x5c8860's countdown branch) counts the pull +1 (r4 0x5c93c8; r0001 D:L477025) and
 * calls the round function (r4 0x5cc9d0, r0001 `FUN_005c5340`), which adds 0.35 to the exertion (r4 0x5cd5c8-0x5cd5d4;
 * D:L479407) and ends in the round's reticle step on the GRENADE's own record (r4 0x5cdbb4-0x5cdbc4 -> 0x5ca830, r0001
 * `FUN_005c3360` D:L477714-477808; D:L479541-479543): the knock by the record's `KnockCount` rule clamped to its
 * `ReticuleKnockMax`, and the size set to clamp(size + DilateUponFire x (1 + burst), the record's own TargetMin,
 * TargetMax) -- loaded from the record's getters (r4 0x5ca8e8, 0x5ca8f4; stored 0x5caba0, 0x5cabb4), the file's 2 to 6,
 * not the tick's category range 0 to 0. Then the grenade's tick closes it again at 60 a second while it stays up.
 */
describe.skipIf(table === null)(`SWAP-FIRE P1: the grenade's launch runs the round's reticle step on the item's record (r4 0x5ca830)${table ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const nade = (): ItemReticle => itemReticleOf(table!, MK141)!;
  /** The M4A1 SD bloomed, the Mk141 up and closed to 0 (bloomSwap's 13 frames). */
  const closed = (): Accuracy => {
    const a = bloomed();
    a.setItem(nade());
    framesUntil(a, RUN, (s) => s <= 0);
    expect(a.state().size).toBe(0);
    return a;
  };

  it('(i) the size jumps from 0 to clamp(0 + DilateUponFire x (1 + 0), TargetMin, TargetMax) = 6 on the launch: at least the record\'s TargetMin 2, never the category\'s 0', () => {
    const a = closed();
    const s = nade().stances.stand;
    a.launch(1, 'stand', nade());
    expect(a.state().size).toBe(Math.min(Math.max(0 + s.dilateFire, s.targetMin), s.targetMax));
    expect(a.state().size).toBe(6);                                   // zweapon.rdr Mark141: 13 clamped to [2, 6]
    expect(a.state().size).toBeGreaterThanOrEqual(2);
  });

  it('(ii) the pull count goes up by one (r4 0x5c93c8)', () => {
    const a = closed();
    const before = a.rounds();
    a.launch(1, 'stand', nade());
    expect(a.rounds()).toBe(before + 1);
  });

  it('(iii) the exertion goes up 0.35 from a value under 1 (r4 0x5cd5d4, FUN_005c5340 D:L479407)', () => {
    const a = closed();
    a.load({ ...a.save(), exertion: 0.2 });
    a.launch(1, 'stand', nade());
    expect(a.state().exertion).toBeCloseTo(0.55, 9);
  });

  it("(iv) the knock by the item's KnockCount rule (3), clamped to its ReticuleKnockMax (70)", () => {
    const s = nade().stances.stand;
    expect([s.knock, s.knockCount, s.knockEntry, s.knockMax]).toEqual([13, 3, 1, 70]);
    // The pull's first or second count: under KnockCount, no knock.
    const a = closed();
    a.launch(1, 'stand', nade());
    expect(a.state().offset[1]).toBe(0);
    // The count equal to KnockCount: ReticuleKnock x KnockEntryStrength, up (y down).
    const b = closed();
    b.load({ ...b.save(), burst: 2, offY: 0 });
    b.launch(1, 'stand', nade());
    expect(b.state().offset[1]).toBe(-13);
    // Past it: the plain knock, clamped at ReticuleKnockMax.
    const c = closed();
    c.load({ ...c.save(), burst: 5, offY: -65 });
    c.launch(1, 'stand', nade());
    expect(c.state().offset[1]).toBe(-70);
  });

  it('(v) the grenade still up: down 60 x TICK a game frame from 6, 0 within 3 frames (0.1 s)', () => {
    const a = closed();
    a.launch(1, 'stand', nade());
    a.tick(TICK, RUN);
    expect(a.state().size).toBeCloseTo(6 - 60 * TICK, 9);
    expect(1 + framesUntil(a, RUN, (s) => s <= 0)).toBe(3);           // 6 / (60 x TICK) = 2.997
  });

  it('(vi) the rifle back on the frame after the launch: its tick starts from the remainder (6 -> 7 running), not from 0 (-> 2)', () => {
    const a = closed();
    a.launch(1, 'stand', nade());
    a.setItem(null);
    a.tick(TICK, RUN);
    expect(a.state().size).toBe(7);
  });

  it('the firearm round is not changed: round() still runs on the firearm record (the SD +7 from the walk target)', () => {
    const a = new Accuracy(HELD_RIFLE);
    const before = a.state().size;
    a.round(1, 'stand');
    expect(a.state().size).toBe(Math.min(Math.max(before + HELD_RIFLE.stances.stand.dilateFire, HELD_RIFLE.stances.stand.targetMin), HELD_RIFLE.stances.stand.targetMax));
  });
});
