import { describe, expect, it } from 'vitest';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import * as blast from '../src/net/blast';
import * as emplacement from '../src/net/emplacement';
import { groundGrid, packGround, SEAL_ANIMS, Walker, type ActionEnd, type KnockMoves } from '../src/sim';
import { TURRET_MOUNT_ASK_WINDOW_READING } from '../src/turretPage';
import { TICK_HZ } from '../src/net/protocol';

/**
 * A1 (LATER 239, 217, 218, 243; research 215 s8.6, the push read; reading, pending review): the turret's take on the body.
 * The take replaces whatever the body was doing (`FUN_005a6fc0` D:L462175-462200 -> `FUN_0058c4a0` -> `FUN_0058c350`
 * D:L447957-447994): the overlay cleared (D:L447983), the stack popped to its base (`FUN_0058a5e0(actor, 0, 1)`
 * D:L446796-446798), the standing base motion at stance 0 (D:L447989), the stance request cleared (`+0x374` = 0,
 * D:L447992); a pending swap completed to its target first (`FUN_005be040` D:L474757-474760). A traversal under way is
 * ended by its own pop's end handler (`FUN_00589aa0` -> `FUN_003157d0`, D:L446538-446640), whose placements are unread
 * one by one: the knock's settle stands in (MOUNT_TRAVERSAL_POP_READING). The take refuses a knock-down fall on top
 * (`FUN_00588030` D:L445700-445713). The room's take and the page's call the one `mountPop`.
 */

const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};

function flat(): Walker {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const w = new Walker(groundGrid(packGround(params, [FLOOR], owners)));
  w.place(0, 20, 0);
  w.settle();
  return w;
}

const still = { forward: 0, right: 0, boost: false };

/** `mountPop` and its siblings off the module, `undefined` before A1 (the RED reads as a missing export, not a crash). */
const mountPop = (blast as Record<string, unknown>).mountPop as ((w: Walker, m: KnockMoves | null) => void) | undefined;
const mountFallRefuses = (blast as Record<string, unknown>).mountFallRefuses as ((w: Pick<Walker, 'action'>) => boolean) | undefined;

/** The take on `w` (no moves) and the ends it raised, in order. */
function take(w: Walker, moves: KnockMoves | null = null): ActionEnd[] {
  const ends: ActionEnd[] = [];
  const off = w.onActionEnd((e) => ends.push(e));
  expect(mountPop, 'mountPop exported (`./net/blast`)').toBeTypeOf('function');
  mountPop!(w, moves);
  off();
  return ends;
}

/** Standing, with no action, hold or overlay, and no stance asked. */
function stood(w: Walker): void {
  expect(w.stance).toBe('stand');
  expect(w.posture).toBe('stand');
  expect(w.pendingStance).toBeNull();
  expect(w.action).toBeNull();
  expect(w.holding).toBeNull();
  expect(w.overlay).toBeNull();
}

describe('A1: the take pops the body (Walker.mountTake via mountPop; FUN_0058c350 D:L447957-447994)', () => {
  it('crouched: stood at once, no clip (D:L447989)', () => {
    const w = flat();
    w.stance = 'crouch';
    expect(take(w)).toEqual([]);
    stood(w);
  });

  it('prone: stood at once, no clip', () => {
    const w = flat();
    w.stance = 'prone';
    take(w);
    stood(w);
  });

  it('a stance change asked and not yet taken: the request cleared (+0x374 = 0, D:L447992)', () => {
    const w = flat();
    w.requestStance('crouch');
    expect(w.pendingStance).toBe('crouch');
    take(w);
    stood(w);
  });

  it("mid-swap (the standing swap's action): completed to its target, the hand kept the swap's (FUN_005be040 D:L474757-474760)", () => {
    const w = flat();
    expect(w.swapWeapon('pistol', false)?.action).toBe('swapStand');
    const ends = take(w);
    expect(ends.map((e) => [e.body?.name ?? e.overlay?.clip, e.reason])).toEqual([['swapStand', 'completed']]);
    expect(w.hand).toBe(1);
    stood(w);
  });

  it("mid-swap moving (the overlay): completed, the overlay off", () => {
    const w = flat();
    w.state.vx = 40;
    expect(w.swapWeapon('pistol', false)?.overlay).toBe(true);
    expect(w.overlay?.clip).toBe(SEAL_ANIMS.swapMoving);
    const ends = take(w);
    expect(ends.map((e) => e.reason)).toEqual(['completed']);
    stood(w);
  });

  it("a crouched reload's hold: off 'replaced', standing", () => {
    const w = flat();
    w.stance = 'crouch';
    expect(w.hold('seal_crouch_reload')).toBe(true);
    const ends = take(w);
    expect(ends.map((e) => [e.body?.source, e.reason])).toEqual([['hold', 'replaced']]);
    stood(w);
  });

  it("a knock's get-up: off 'replaced', standing", () => {
    const w = flat();
    w.knock([0, 48.8, 0], 'fallForward');
    for (let i = 0; i < 6 * 60 && w.action?.name !== 'getUp'; i++) w.tick(still);
    expect(w.action?.name).toBe('getUp');
    const ends = take(w);
    expect(ends.map((e) => [e.body?.name, e.reason])).toEqual([['getUp', 'replaced']]);
    stood(w);
  });

  it('a traversal under way (MOUNT_TRAVERSAL_POP_READING): its pop settles it (`popSettle`), then the move is put on the floor where it is (`reset(walker)`)', () => {
    const w = flat();
    const calls: string[] = [];
    // `Traversal.popSettle` leaves the move for the caller's `reset` (busy until then), as the knock's path relies on.
    const moves: KnockMoves = {
      busy: () => !calls.includes('reset(walker)'),
      reset: (walker) => { calls.push(walker === w ? 'reset(walker)' : 'reset()'); },
      popSettle: (walker) => { calls.push(walker === w ? 'popSettle' : 'popSettle(other)'); },
    };
    take(w, moves);
    expect(calls).toEqual(['popSettle', 'reset(walker)']);
    expect((blast as Record<string, unknown>).MOUNT_TRAVERSAL_POP_READING).toBe('popSettle, then the move reset on the floor');
    stood(w);
  });

  it('no traversal: the moves untouched', () => {
    const w = flat();
    const calls: string[] = [];
    take(w, { busy: () => false, reset: () => { calls.push('reset'); }, popSettle: () => { calls.push('popSettle'); } });
    expect(calls).toEqual([]);
  });
});

describe("A1: the take's knock-down refusal (mountFallRefuses; FUN_00588030 D:L445700-445713)", () => {
  it('true on `Fall forward` and `Fall backwards` alone', () => {
    expect(mountFallRefuses, 'mountFallRefuses exported (`./net/blast`)').toBeTypeOf('function');
    const of = (name: string | null): boolean => mountFallRefuses!({ action: name === null ? null : { name } } as unknown as Pick<Walker, 'action'>);
    expect(['fallForward', 'fallBackwards'].map(of)).toEqual([true, true]);
    expect(['proneCover', 'landBackwards', 'landDeath', 'getUp', 'getUpBackwards', 'swapStand', null].map(of)).toEqual([false, false, false, false, false, false, false]);
  });

  it("a real knock's fall refuses until it lands", () => {
    const w = flat();
    w.knock([0, 48.8, 0], 'fallForward');
    expect(mountFallRefuses!(w)).toBe(true);
    for (let i = 0; i < 6 * 60 && w.airborne; i++) w.tick(still);
    w.tick(still);
    expect(w.action?.name).not.toBe('fallForward');
    expect(mountFallRefuses!(w)).toBe(false);
  });
});

describe("A1: the room's two adaptations (`./net/emplacement`)", () => {
  it("MOUNT_WORD_BOUND_ADAPTATION is the ask's window (TURRET_MOUNT_ASK_WINDOW_READING), in commands at TICK_HZ", () => {
    const e = emplacement as Record<string, unknown>;
    expect(e.MOUNT_WORD_BOUND_ADAPTATION).toBe(TURRET_MOUNT_ASK_WINDOW_READING);
    expect(e.MOUNT_WORD_BOUND_TICKS).toBe(Math.round(TURRET_MOUNT_ASK_WINDOW_READING * TICK_HZ));
    expect(e.MOUNT_GRANT_CHECKS_ADAPTATION).toBeTypeOf('string');
  });
});
