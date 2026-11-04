import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM, type WeaponRecord } from '@s2u/scene';
import type { Accuracy, AccuracyInput } from '../src/accuracy';
import { ShotCone, type AimMover } from '../src/net/shotCone';
import { Button, type Command } from '../src/net/protocol';

/**
 * LATER 178 (reading, pending review): the room's cone blooms a round lent across a mount or a release at the round's own
 * command and runs the commands since again in order (`ShotCone.round`'s replay). The merge controller's condition 2 on
 * the design: the replay's cost is bounded -- it re-runs at most the commands still held (the 64-command history); since
 * LATER 248 for every round with a command run since its own (was: only when a mount or a release ran between the round's
 * command and now, an ordinary round taking none), and none for a round on the newest command. The cost is
 * counted in re-run commands (each one `Accuracy.update`), not wall time alone; the worst case -- a round named at the
 * oldest command held, a mount on the next -- is timed and its figures printed for the record.
 *
 * The records: the hand's `HELD_SIDEARM` and, standing in for the mounted record, `HELD_RIFLE` -- two different rows,
 * which is all the replay reads (a test's choice; the turret's own record is `roomMountRoundAtCommand.test.ts`'s).
 */

/** The commands the cone holds (`shotCone.ts` `RING`): a round's replay re-runs at most this less one. */
const HELD = 64;
/**
 * The worst case's stated bound on its mean time, milliseconds a round (a test's bound, generous for a loaded host: the
 * replay is `HELD - 1` updates of the page's own `Accuracy`; the count, asserted exactly, is the bound that holds).
 */
const WORST_MEAN_MS_BOUND = 2;

const HAND = HELD_SIDEARM, MOUNT = HELD_RIFLE;
const still: AimMover = { feet: [0, 0, 0], velocity: [0, 0, 0], airborne: false, posture: 'stand', moveRoot: null, peek: 0, weapon: 1 };
const mounted: AimMover = { ...still, coneStance: 'stand', turret: 1 };
const cmd = (seq: number, over: Partial<Command> = {}): Command =>
  ({ seq, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 1, ...over });
/** The look swung back and forth (degrees), so every command's bloom differs: a turn in the replay's inputs. */
const yawAt = (i: number): number => 20 * Math.sin(i / 7);

/** The re-run commands: every `Accuracy.update` the cone's kit runs from here on. */
const counting = (cone: ShotCone): { n: number } => {
  const acc = (cone as unknown as { acc: Accuracy }).acc;
  const update = acc.update.bind(acc), seen = { n: 0 };
  acc.update = (dt: number, input: AccuracyInput): void => { seen.n++; update(dt, input); };
  return seen;
};

/**
 * Commands `1 .. n`, the trigger held: `on(i)` says what the body held after command i (null: the hand; a number: mounted,
 * the record set before that command runs, as the room's mount sets it). Each record change is a `setWeapon` before the tick.
 */
const play = (cone: ShotCone, n: number, on: (i: number) => number | null, from = 1): void => {
  for (let i = from; i <= n; i++) {
    const t = on(i);
    cone.setWeapon(t === null ? HAND : MOUNT);
    cone.tick(cmd(i, { yaw: yawAt(i), buttons: Button.Trigger }), t === null ? still : mounted, i);
  }
};

/** The cones of every frame held, by seq. */
const cones = (c: ShotCone): [number, number, number, number][] => {
  const out: [number, number, number, number][] = [];
  for (let i = 1; i <= HELD; i++) { const f = c.frame(i); if (f) out.push([i, f.cone.offsetX, f.cone.offsetY, f.cone.radius]); }
  return out;
};

/** The room's lend (`room.ts` `decide`): the round's own record set, the round, the record held now given back. */
const lend = (cone: ShotCone, seq: number, record: WeaponRecord, back: WeaponRecord): number => {
  cone.setWeapon(record);
  const t0 = performance.now();
  cone.round(seq);
  const ms = performance.now() - t0;
  cone.setWeapon(back);
  return ms;
};

describe("LATER 178: the cone's replay is bounded (the merge controller's condition 2)", () => {
  it('the worst case: a round named at the oldest command held, a mount on the next -- it re-runs the 63 commands since, no more, and the cone is the one the page ran in order', () => {
    const mountAt = (i: number): number | null => (i === 1 ? null : 1);
    const room = new ShotCone(HAND);
    play(room, HELD, mountAt);
    expect(room.frame(1), 'command 1 still held').toBeDefined();
    const seen = counting(room);
    lend(room, 1, HAND, MOUNT);
    expect(seen.n, 're-run commands').toBe(HELD - 1);
    // the page: the round bloomed right after its own command, the mount after it
    const page = new ShotCone(HAND);
    play(page, 1, mountAt);
    page.round(1);
    play(page, HELD, mountAt, 2);
    expect(room.state(), 'the kit').toEqual(page.state());
    expect(cones(room), "every held frame's cone").toEqual(cones(page));
  });

  it(`the worst case timed: each replay re-runs ${HELD - 1} commands, its mean under ${WORST_MEAN_MS_BOUND} ms`, () => {
    const room = new ShotCone(HAND);
    play(room, HELD, (i) => (i === 1 ? null : 1));
    const seen = counting(room), times: number[] = [], counts: number[] = [];
    for (let k = 0; k < 200; k++) {
      const before = seen.n;
      times.push(lend(room, 1, HAND, MOUNT));
      counts.push(seen.n - before);
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length, sorted = [...times].sort((a, b) => a - b);
    console.info(`LATER 178 replay cost (worst case, ${times.length} rounds): commands re-run each ${[...new Set(counts)].join(', ')}; mean ${mean.toFixed(4)} ms, median ${sorted[sorted.length >> 1]!.toFixed(4)} ms, max ${sorted[sorted.length - 1]!.toFixed(4)} ms`);
    expect(new Set(counts), 'every replay re-ran the commands since, no more').toEqual(new Set([HELD - 1]));
    expect(mean, 'the mean replay, ms').toBeLessThan(WORST_MEAN_MS_BOUND);
  });

  it('a release since (LATER 174\'s mirror): a turret round named on a mounted command re-runs the commands since, the hand run after it', () => {
    const on = (i: number): number | null => (i <= 32 ? 1 : null);
    const room = new ShotCone(MOUNT);
    play(room, HELD, on);
    const seen = counting(room);
    lend(room, 10, MOUNT, HAND);
    expect(seen.n, 're-run commands: 11 .. 64').toBe(HELD - 10);
    const page = new ShotCone(MOUNT);
    play(page, 10, on);
    page.round(10);
    play(page, HELD, on, 11);
    expect(room.state(), 'the kit').toEqual(page.state());
    expect(cones(room)).toEqual(cones(page));
  });

  // LATER 248 re-pins this case (was "an ordinary round takes no replay": a round on an older held command, no mount or
  // release since, re-ran nothing): the page blooms a round at its own command before the next command's tick
  // (`FUN_005c0fd0` D:L476543 before D:L476624/476638), so every round with a command run since its own replays them --
  // the bound, `HELD - 1`, unchanged. A round on the newest command, or one no longer held, still replays none.
  it('LATER 248: a round with commands run since its own replays them (at most HELD - 1); the newest command, or a command no longer held, replays none', () => {
    const plain = new ShotCone(HAND);
    play(plain, HELD + 20, () => null);
    const a = counting(plain);
    plain.round(21);                                               // the oldest held: the commands since re-run
    expect(a.n, 're-run commands: 22 .. HELD + 20').toBe(HELD - 1);
    plain.round(HELD + 20);                                        // the newest: none since
    plain.round(3);                                                // no longer held: the newest frame's row, none
    expect(a.n, 'no more re-run').toBe(HELD - 1);
    const held = new ShotCone(HAND);
    play(held, HELD, (i) => (i <= 4 ? null : 1));
    const b = counting(held);
    held.round(30);                                                // mounted at 30 and every command since: those since re-run
    expect(b.n, 're-run commands: 31 .. HELD').toBe(HELD - 30);
    held.round(HELD);                                              // the newest: none since
    expect(b.n).toBe(HELD - 30);
  });
});

describe("LATER 210 (by LATER 248's replay): a hand round named on the command just before a swap's press", () => {
  // The room's `aim` sets the sidearm's record into the cone on the press's command S + 1, before its tick
  // (`room.ts` `p.cone.setWeapon(p.records[w])`), and decides the rifle's round named S once S + 1 has run (`due`),
  // with no lend (`fire`: `p.cone.round(ev.seq)`). The page bloomed it by the rifle's row before the press. Was: bloomed
  // on the present kit, the sidearm's row (`HELD_SIDEARM`, the Mark 23: its stand DilateFire 20, a 20 px knock).
  it("blooms by its own command's record (the rifle's), then the press's command runs on the sidearm's -- the page's order", () => {
    const S = 10;
    const swapAt = (i: number): WeaponRecord => (i <= S ? HELD_RIFLE : HELD_SIDEARM);
    const run = (c: ShotCone, from: number, to: number): void => {
      for (let i = from; i <= to; i++) {
        c.setWeapon(swapAt(i));
        c.tick(cmd(i, { yaw: yawAt(i), buttons: Button.Trigger }), { ...still, weapon: i <= S ? 0 : 1 }, i);
      }
    };
    const room = new ShotCone(HELD_RIFLE);
    run(room, 1, S + 1);
    room.round(S);
    const page = new ShotCone(HELD_RIFLE);
    run(page, 1, S);
    page.round(S);
    run(page, S + 1, S + 1);
    expect(room.state(), 'the kit').toEqual(page.state());
    expect(cones(room), "every held frame's cone").toEqual(cones(page));
  });
});
