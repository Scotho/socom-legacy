import { describe, expect, it } from 'vitest';
import { flat } from './parity/world';
import { ACTION_SECONDS, type Stance } from '../src/mover';
import { Button, COMMAND_STANCE_CODES, STANCE_CODES, type Command } from '../src/net/protocol';
import { bodyOf, snapshotOf } from '../src/net/body';
import { decodeCommands, decodeSnapshot, encodeCommands, encodeSnapshot } from '../src/net/codec';
import { popStance } from '../src/stanceButton';

/**
 * OT.R67 (`PRONE_POP_ADAPTATION`; no original -- the owner's word, MISSION OT.R67): the prone-pop's two seams on the
 * mover, `Walker.popStand` (settled prone, the forward drop) and `Traversal.cancelDive` (the dive), through the shared
 * `popStance` the page and the room both run. Ported from Benny's playtest (`playtests/prone-pop/cancel.test.ts` and
 * `dive.test.ts`, retired with OT.R67): its cases on the mover, each named by its old title in the comment beside it.
 * The port reads the mover's state, not a ticket a button holds -- the room has no ticket and must decide alike -- so
 * the two ticket cases are restated (`C12`, `D5`).
 */

/** The parity world's flat floor, its mover standing (or crouched) still. */
function rig(from: 'stand' | 'crouch' = 'crouch') {
  const r = flat(), w = r.walker;
  w.stance = from;
  /** `n` ticks, the stick across at `right` (cancel.test.ts's `advance`). */
  const advance = (n: number, right = 0): void => { for (let i = 0; i < n; i++) w.tick({ forward: 0, right, boost: false }); };
  return { ...r, w, advance };
}

/** The parity world, run up to speed by the room's commands (dive.test.ts's rig), and its stance press as a command. */
function runner(speed = 1) {
  const r = flat(), w = r.walker;
  let seq = 0;
  const cmd = (forward: number, buttons = 0, stance = 0): Command =>
    ({ seq: ++seq, forward, right: 0, yaw: -90, pitch: 0, turn: 0, buttons, stance, weapon: 0 });
  const tick = (forward = speed): void => { r.sim.apply(cmd(forward)); };
  const press = (to: Stance | 'pop', forward = speed): void => {
    r.sim.apply(cmd(forward, Button.Stance, COMMAND_STANCE_CODES.indexOf(to)));   // stand, crouch, prone as `STANCE_CODES`
  };
  for (let i = 0; i < 90; i++) tick();
  return { ...r, w, tick, press };
}

describe('OT.R67: the pop out of the forward drop (Walker.popStand)', () => {
  // C1 (42): "${from}, second edge ${ticks} ticks, movement ${movement}: returns without a recovery clip"
  for (const from of ['stand', 'crouch'] as const) for (const ticks of [1, 3, 6, 9, 18, 30, 45]) for (const movement of [0, 0.2, 0.4]) {
    it(`${from}: ${ticks} ticks into the drop, the stick across at ${movement}: stands at once, no clip`, () => {
      const r = rig(from);
      r.w.changeStance('prone');
      r.advance(ticks, movement);
      expect(r.w.action?.name).toBe(from === 'stand' ? 'standToProne' : 'crouchToProne');
      expect(r.w.action?.reversed).toBe(false);
      expect(popStance(r.w, r.moves)).toBe('drop');
      expect(r.w.stance).toBe('stand');
      expect(r.w.posture).toBe('stand');
      expect(r.w.action).toBeNull();
      expect(r.w.pendingStance).toBeNull();
      expect(Number.isFinite(r.w.state.x) && Number.isFinite(r.w.state.z)).toBe(true);
    });
  }

  // C9 (2): "checks headroom before cancelling ${from}'s drop to standing"
  for (const from of ['stand', 'crouch'] as const) {
    it(`${from}'s drop: no headroom to stand refuses the pop, the drop kept`, () => {
      const r = rig(from);
      r.w.changeStance('prone');
      r.advance(6);
      const serial = r.w.action!.serial;
      (r.w as unknown as { headroom: () => boolean }).headroom = () => false;
      expect(popStance(r.w, r.moves)).toBe('refused');
      expect(r.w.stance).toBe('prone');
      expect(r.w.action?.serial).toBe(serial);
    });
  }

  // C6 (dead, airborne): "refuses cancellation while ${reason}"
  for (const reason of ['dead', 'airborne'] as const) {
    it(`refused while ${reason}: nothing changed`, () => {
      const r = rig();
      r.w.changeStance('prone');
      r.advance(6);
      if (reason === 'dead') r.w.dead = true; else r.w.setAirborne(true);
      const serial = r.w.action?.serial;
      expect(popStance(r.w, r.moves)).toBe('refused');
      expect(r.w.stance).toBe('prone');
      expect(r.w.action?.serial).toBe(serial);
    });
  }

  // C5: "does not erase an intervening full-body action"
  it('a hit over the drop is no pop: the press is the ordinary one, the hit kept', () => {
    const r = rig();
    r.w.changeStance('prone');
    r.advance(6);
    (r.w as unknown as { start: (n: string, s: number, rev: boolean) => void }).start('hit', 1, false);
    const serial = r.w.action!.serial;
    expect(popStance(r.w, r.moves)).toBeNull();
    expect(r.w.action?.serial).toBe(serial);
  });

  // C12 (restated): "will not cancel a new unrelated transition with a stale ticket"
  it('a forward drop is popped whatever began it: no ticket, so the room decides alike', () => {
    const r = rig();
    r.w.changeStance('prone');
    r.advance(6);
    (r.w as unknown as { start: (n: string, s: number, rev: boolean) => void }).start('crouchToProne', ACTION_SECONDS.crouchToProne, false);
    expect(popStance(r.w, r.moves)).toBe('drop');
    expect(r.w.stance).toBe('stand');
    expect(r.w.action).toBeNull();
  });

  // C13: "does not adopt a pre-existing forward clip as a newly started drop"
  it('a drop whose stance word a later press stood up is no pop: the clip kept', () => {
    const r = rig('stand');
    r.w.changeStance('prone');
    r.advance(6);
    const serial = r.w.action!.serial;
    r.w.changeStance('stand');                                  // standToProne refuses crouch only: the word stands, the clip runs on
    expect(r.w.stance).toBe('stand');
    expect(popStance(r.w, r.moves)).toBeNull();
    expect(r.w.action?.serial).toBe(serial);
  });
});

describe('OT.R67: the pop from settled prone (Walker.popStand)', () => {
  // C3: "a tap from fully prone stands immediately without a recovery clip"
  it('stands at once, no get-up clip, the velocity zeroed as the get-up would', () => {
    const r = rig();
    r.w.changeStance('prone');
    r.advance(90);
    expect(r.w.action).toBeNull();
    expect(popStance(r.w, r.moves)).toBe('prone');
    expect(r.w.stance).toBe('stand');
    expect(r.w.action).toBeNull();
    expect([r.w.state.vx, r.w.state.vz]).toEqual([0, 0]);
    r.advance(1);
    expect(r.w.stance).toBe('stand');
    expect(r.w.action).toBeNull();
  });

  // C4: "fully prone immediate return still requires standing headroom"
  it('still asks the headroom to stand', () => {
    const r = rig();
    r.w.changeStance('prone');
    r.advance(90);
    (r.w as unknown as { headroom: () => boolean }).headroom = () => false;
    expect(popStance(r.w, r.moves)).toBe('refused');
    expect(r.w.stance).toBe('prone');
    expect(r.w.action).toBeNull();
  });

  // C10 + C11 + D7 (restated): the gates restored after the pop, and after a throwing callback
  it('patches nothing on the mover or the moves: the seams are public, no gate is swapped', () => {
    const r = rig();
    r.w.changeStance('prone');
    r.advance(6);
    const own = Object.keys(r.w).sort(), moves = Object.keys(r.moves).sort();
    expect(popStance(r.w, r.moves)).toBe('drop');
    expect(Object.keys(r.w).sort()).toEqual(own);
    expect(Object.keys(r.moves).sort()).toEqual(moves);
    expect(Object.hasOwn(r.w, 'bodyRefuses')).toBe(false);
    expect(Object.hasOwn(r.moves, 'busy')).toBe(false);
  });

  it('standing or crouched there is no pop (the press is the ordinary one)', () => {
    for (const from of ['stand', 'crouch'] as const) {
      const r = rig(from);
      expect(popStance(r.w, r.moves)).toBeNull();
      expect(r.w.stance).toBe(from);
    }
  });
});

describe('OT.R67: the pop out of the dive (Traversal.cancelDive)', () => {
  // D1 (21): "running ${speed}, second Triangle at tick ${offset}: stand without teleport or velocity loss"
  for (const speed of [0.7, 0.85, 1]) for (const offset of [1, 3, 6, 9, 12, 18, 24]) {
    it(`running ${speed}, ${offset} ticks into the dive: stands where it is, its velocity kept`, () => {
      const r = runner(speed);
      expect(r.moves.canDive(r.w)).toBe(true);
      r.press('prone');
      expect(r.moves.state().kind).toBe('dive');
      for (let i = 0; i < offset; i++) r.tick();
      expect(r.moves.pose()!.rootY).toBeGreaterThan(2.2);
      const before = { ...r.w.state };
      expect(popStance(r.w, r.moves)).toBe('dive');
      expect(r.w.stance).toBe('stand');
      expect(r.w.action).toBeNull();
      expect(r.moves.state().kind).toBe('none');
      expect(r.moves.yaw()).toBeNull();
      expect([r.w.state.x, r.w.state.y, r.w.state.z]).toEqual([before.x, before.y, before.z]);
      expect([r.w.state.vx, r.w.state.vz]).toEqual([before.vx, before.vz]);
      expect(r.w.airborne).toBe(false);
      r.tick();
      expect(r.w.stance).toBe('stand');
      expect(Number.isFinite(r.w.state.x)).toBe(true);
    });
  }

  // D2 (headroom, dead, airborne): "does not force a dive return when ${reason}"
  for (const reason of ['headroom', 'dead', 'airborne'] as const) {
    it(`refused with ${reason === 'headroom' ? 'no headroom' : reason}: the dive kept`, () => {
      const r = runner();
      r.press('prone');
      r.tick();
      if (reason === 'headroom') (r.w as unknown as { headroom: () => boolean }).headroom = () => false;
      if (reason === 'dead') r.w.dead = true;
      if (reason === 'airborne') r.w.setAirborne(true);
      expect(popStance(r.w, r.moves)).toBe('refused');
      expect(r.moves.inDive()).toBe(true);
      expect(r.moves.state().kind).toBe('dive');
    });
  }

  // D4: "a press at the end of descent still cancels the owned dive immediately"
  it('down on the ground and sliding, the dive still pops', () => {
    const r = runner();
    r.press('prone');
    let limit = 100;
    while ((r.moves.pose()?.rootY ?? 0) > 2.2 && limit-- > 0) r.tick();
    expect(r.moves.state().kind).toBe('dive');
    expect(popStance(r.w, r.moves)).toBe('dive');
    expect(r.moves.state().kind).toBe('none');
    expect(r.w.stance).toBe('stand');
    expect(r.w.action).toBeNull();
  });

  // D5 (restated): "will not cancel a replacement dive with a stale ticket"
  it('a dive is popped whichever press began it (no ticket)', () => {
    const r = runner();
    r.press('prone');
    r.tick();
    expect(popStance(r.w, r.moves)).toBe('dive');
    for (let i = 0; i < 90; i++) r.tick();                      // up to speed again
    r.press('prone');
    expect(r.moves.inDive()).toBe(true);
    expect(popStance(r.w, r.moves)).toBe('dive');
  });

  // D6: "does not cancel an intervening hit action during a dive"
  it('a hit over the dive refuses the pop: the hit and the dive kept', () => {
    const r = runner();
    r.press('prone');
    r.tick();
    (r.w as unknown as { start: (n: string, s: number, rev: boolean) => void }).start('hit', 1, false);
    const action = r.w.action;
    expect(popStance(r.w, r.moves)).toBe('refused');
    expect(r.w.action).toBe(action);
    expect(r.moves.inDive()).toBe(true);
  });

  it('the dive asks the same test it always did (canDive is dive\'s): standing still, none', () => {
    const r = rig('stand');
    expect(r.moves.canDive(r.w)).toBe(false);
    expect(r.moves.dive(r.w)).toBe(false);
    expect(r.moves.cancelDive(r.w)).toBeNull();
  });
});

describe('OT.R67: the room runs the pop by the command\'s stance code (MoverSim.prepare)', () => {
  it('the code is 3, past the postures; the postures keep theirs', () => {
    expect(COMMAND_STANCE_CODES.indexOf('pop')).toBe(3);
    expect([...COMMAND_STANCE_CODES.slice(0, 3)]).toEqual([...STANCE_CODES]);
  });

  it('a pop command out of the dive stands the room\'s mover as popStance does', () => {
    const r = runner();
    r.press('prone');
    r.tick();
    r.tick();
    r.press('pop');
    expect(r.w.stance).toBe('stand');
    expect(r.moves.state().kind).toBe('none');
  });
});

describe('OT.R67: the wire pins -- a posture never decodes as the pop; an older room reads code 3 as stand', () => {
  const EXTRAS = { alive: true, weapon: 0 as const, aiming: false, trigger: false, boost: false };

  it('a body\'s stance (BodyState.stance, two bits on the wire) decodes to a posture for every code it carries, never pop', () => {
    const r = flat();
    // The encoder: each posture's code is its STANCE_CODES index, never the pop's 3.
    for (const s of STANCE_CODES) {
      r.walker.stance = s;
      expect(bodyOf(1, r.sim.body(), EXTRAS).stance).toBe(STANCE_CODES.indexOf(s));
    }
    // The decoder: every code the two bits can carry, through the snapshot frame and `snapshotOf`, is a posture.
    const body = bodyOf(1, r.sim.body(), EXTRAS);
    for (let code = 0; code < 4; code++) {
      const back = decodeSnapshot(encodeSnapshot({ tick: 1, own: null, bodies: [{ ...body, stance: code }] })).bodies[0]!;
      const posture: string = snapshotOf(back).stance;
      expect(STANCE_CODES as readonly string[]).toContain(posture);
      expect(posture).not.toBe('pop');
      expect(posture).toBe(STANCE_CODES[code] ?? 'stand');
    }
  });

  it('the command\'s code 3 crosses the wire, and an older room (main 6963dfc1e) reads it as stand: the get-up clip there', () => {
    const pop: Command = {
      seq: 1, forward: 0, right: 0, yaw: -90, pitch: 0, turn: 0, buttons: Button.Stance, stance: COMMAND_STANCE_CODES.indexOf('pop'), weapon: 0,
    };
    const back = decodeCommands(encodeCommands({ viewTick: 0, commands: [pop] })).commands[0]!;
    expect(back.stance).toBe(3);                                  // the stance nibble (`encodeCommands`) carries it
    // The older room's decode, `MoverSim.prepare` as it stands on main 6963dfc1e (`net/moverSim.ts` L205):
    // `this.stance(STANCE_CODES[cmd.stance] ?? 'stand')` -- the unknown code is stand.
    const olderRoom = (code: number): Stance => STANCE_CODES[code] ?? 'stand';
    expect(olderRoom(back.stance)).toBe('stand');
    // What that room then runs from settled prone: the ordinary stand -- the get-up clip (the drop reversed) plays there.
    const older = rig();
    older.w.changeStance('prone');
    older.advance(90);
    expect(older.w.action).toBeNull();
    older.sim.apply({ ...back, seq: 1, stance: STANCE_CODES.indexOf(olderRoom(back.stance)) });
    expect(older.w.stance).toBe('stand');
    expect(older.w.action?.reversed).toBe(true);
    // This room runs the pop from the same place: up at once, no clip.
    const now = rig();
    now.w.changeStance('prone');
    now.advance(90);
    now.sim.apply({ ...back, seq: 1 });
    expect(now.w.stance).toBe('stand');
    expect(now.w.action).toBeNull();
  });
});
