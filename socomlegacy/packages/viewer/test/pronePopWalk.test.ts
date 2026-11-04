// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { FlyCamera } from '../src/camera';
import { groundGrid, groundPolygons, packGround, Walker, WalkMode, type GroundData } from '../src/walk';
import { Traversal } from '../src/traversal';
import { MoverSim } from '../src/net/moverSim';
import { Button, COMMAND_STANCE_CODES, type Command } from '../src/net/protocol';
import { StanceButton } from '../src/stanceButton';

/**
 * OT.R67 (`PRONE_POP_ADAPTATION`; no original -- the owner's word, MISSION OT.R67): the prone-pop on the page's own walk
 * -- `WalkMode` with its `Walker` and `Traversal`, pressed through the touch C (`stanceTouch`), the keyboard's `C` and
 * the pad's lane (`StanceButton.lanes` on the walk, as `./matchLanes` feeds it) -- and the room beside it: every command
 * the page sends run by a `MoverSim` of its own, the two movers compared after every frame (A=B), for each pop (prone,
 * the dive, the drop). Ported from Benny's playtest (`playtests/prone-pop/input.test.ts`, `dive.test.ts`, retired with
 * OT.R67): each case named by its old title beside it.
 */

const canvas = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  return c;
};

const GROUND: GroundData = packGround(
  { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
  [{
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
  }],
  [{ modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1 }],
);

const FRAME = 1 / 60;
const made: WalkMode[] = [];
afterEach(() => { for (const m of made.splice(0)) m.unbindKey(); });

/** The page's walk on the floor, with its moves, and the room's mover running every command it sends. */
function rig() {
  const fly = new FlyCamera(canvas());
  const walk = new WalkMode(fly);
  made.push(walk);
  walk.setGround(GROUND, [0, 0, 0]);
  walk.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  let wish = { forward: 0, right: 0, boost: false };
  fly.groundWish = () => wish;
  const grid = groundGrid(GROUND);
  const room = new MoverSim(new Walker(grid), new Traversal(grid, groundPolygons(GROUND)));
  room.walker.place(5, 40 - 10, 6);
  const sent: Command[] = [];
  walk.setNetTap((cmd) => { const c = { ...cmd, seq: sent.length + 1 }; sent.push(c); room.apply(c); });
  walk.setMode('walk');
  const page = (): Walker => walk['walker'] as Walker;
  const moves = (): Traversal => walk['moves'] as Traversal;
  /** `n` frames; the commands they sent. */
  const frames = (n = 1): Command[] => { const from = sent.length; for (let i = 0; i < n; i++) walk.frame(FRAME); return sent.slice(from); };
  const ms = (t: number): Command[] => frames(Math.round(t / (1000 * FRAME)));
  /** A tap of the touch C held `t` ms; the commands sent. */
  const touch = (t = 50): Command[] => { walk.stanceTouch('down'); const c = ms(t); walk.stanceTouch('up'); return [...c, ...frames()]; };
  const setWish = (forward: number): void => { wish = { forward, right: 0, boost: false }; };
  /** The page's mover and the room's: the feet, the stance, the action, the dive -- the same. */
  const agree = (): void => {
    const a = page(), b = room.walker;
    for (const k of ['x', 'y', 'z', 'vx', 'vz'] as const) expect(Math.abs(a.state[k] - b.state[k]), k).toBeLessThan(1e-6);
    expect(a.stance).toBe(b.stance);
    expect(a.action?.name ?? null).toBe(b.action?.name ?? null);
    expect(moves().inDive()).toBe((room.moves as Traversal).inDive());
  };
  frames(10);                                                    // settled on the floor
  return { walk, room, page, moves, frames, ms, touch, setWish, agree, sent: () => sent };
}

/** The stance codes the commands carried, by name (`COMMAND_STANCE_CODES`). */
const stanceCodes = (cmds: readonly Command[]): string[] =>
  cmds.filter((c) => (c.buttons & Button.Stance) !== 0).map((c) => COMMAND_STANCE_CODES[c.stance] ?? `code ${c.stance}`);

// PP-5 (the merge controller's A=B check; the gameplay seat's precision): a bound Prone in the prone-pop mode is the
// ordinary full press -- code 2 ('prone') from stand, code 0 ('stand') with the get-up from prone -- never code 3, and
// the room lands the same.
describe('PP-5: a bound Prone in the prone-pop mode sends an ordinary stance, page = room', () => {
  it('stand to Prone is code 2; prone to Prone is code 0, the get-up; never 3', () => {
    const r = rig();
    const sb = new StanceButton();
    const lanes = (prone: boolean): void => { sb.lanes('pop', { triangle: false, prone }, FRAME, r.walk); };
    lanes(true);
    const down = r.ms(3000);
    lanes(false); r.frames();
    expect(stanceCodes(down)).toContain('prone');
    expect(stanceCodes(down)).not.toContain('pop');
    expect(r.page().stance).toBe('prone');
    r.agree();
    lanes(true);
    const up = r.ms(4000);
    lanes(false); r.frames();
    expect(stanceCodes(up)).toContain('stand');
    expect(stanceCodes(up)).not.toContain('pop');
    expect(r.page().stance).toBe('stand');
    r.agree();
  });
});

const popped = (cmds: readonly Command[]): boolean =>
  cmds.some((c) => (c.buttons & Button.Stance) !== 0 && COMMAND_STANCE_CODES[c.stance] === 'pop');

describe('OT.R76: the stance mode \'pop\' on the page\'s walk (the touch C, the keyboard\'s C, the pad\'s lane): the original\'s stance, a jump press in a hold\'s drop or dive pops', () => {
  // I1 (3): "stationary tap ${ms}ms crouches and stays crouched"
  for (const t of [30, 100, 300]) {
    it(`still: a tap of ${t} ms crouches and stays crouched`, () => {
      const r = rig();
      r.touch(t);
      expect(r.walk.stance()).toBe('crouch');
      r.ms(900);
      expect(r.walk.stance()).toBe('crouch');
    });
  }

  // I2: "a second stationary tap returns crouch to stand"
  it('still: a tap from crouched stands', () => {
    const r = rig();
    r.touch();
    r.ms(300);
    r.touch();
    expect(r.walk.stance()).toBe('stand');
  });

  // I3 (2), OT.R76: the hold's drop is a window -- a jump press in it pops; the release does nothing.
  for (const from of ['stand', 'crouch'] as const) {
    it(`${from}: a hold goes prone, its release does nothing, a jump press in the drop stands at once`, () => {
      const r = rig();
      if (from === 'crouch') { r.touch(); r.ms(600); }
      expect(r.walk.stance()).toBe(from);
      r.walk.stanceTouch('down');
      r.ms(350);
      expect(r.walk.stance()).toBe(from);
      r.ms(100);
      expect(r.walk.stance()).toBe('prone');
      r.walk.stanceTouch('up');
      r.frames();
      expect(r.walk.stance()).toBe('prone');
      expect(r.walk.jumpPress()).toBe(true);
      const cmds = r.frames();
      expect(popped(cmds)).toBe(true);
      expect(r.walk.stance()).toBe('stand');
      expect(r.page().action).toBeNull();
    });
  }

  // I4, OT.R76: running, the hold dives (the original's full press); a jump press in the dive stands out of it.
  it('running: a hold dives; a jump press in the dive stands out of it', () => {
    const r = rig();
    r.setWish(1);
    r.ms(1500);
    r.walk.stanceTouch('down');
    r.ms(450);
    expect(r.moves().inDive()).toBe(true);
    r.walk.stanceTouch('up');
    r.frames();
    expect(r.walk.jumpPress()).toBe(true);
    r.frames();
    expect(r.walk.stance()).toBe('stand');
    expect(r.moves().inDive()).toBe(false);
  });

  // I5, OT.R76 (the double tap retired): settled prone, the window has closed -- a stance press takes the button's own
  // rule through its clip (the touch C's `KEY_STANCE`: crouch), and a jump press is no pop.
  it('settled prone: a stance press takes its clip, never a pop; a jump press is no pop either', () => {
    const r = rig();
    r.walk.stanceTouch('down');
    r.ms(450);
    r.walk.stanceTouch('up');
    r.ms(1500);
    expect(r.walk.stance()).toBe('prone');
    expect(r.page().action).toBeNull();
    const jumped = r.walk.jumpPress();
    expect(popped(r.frames())).toBe(false);
    expect(r.walk.stance()).toBe('prone');
    expect(typeof jumped).toBe('boolean');
    const cmds = r.touch();
    expect(popped(cmds)).toBe(false);
    expect(r.page().action?.name).toBe('crouchToProne');
    expect(r.page().action?.reversed).toBe(true);
  });

  // I8: "slow movement still allows tap crouch"
  it('walking slowly, a tap still crouches (no dive)', () => {
    const r = rig();
    r.setWish(0.2);
    r.ms(800);
    r.touch();
    expect(r.walk.stance()).toBe('crouch');
    expect(r.moves().inDive()).toBe(false);
  });

  // D3: one press held through the dive does nothing more (no pop of its own).
  it('one press held through the dive does nothing more', () => {
    const r = rig();
    r.setWish(1);
    r.ms(1500);
    r.walk.stanceTouch('down');
    r.ms(450);
    expect(r.moves().inDive()).toBe(true);
    r.setWish(0);
    const cmds = r.frames(120);
    expect(popped(cmds)).toBe(false);
    expect(r.walk.stance()).toBe('prone');
    expect(r.moves().inDive()).toBe(false);
    r.walk.stanceTouch('up');
  });

  it('the keyboard\'s C and Space are the same sequence: a C hold drops, Space in the drop stands at once', () => {
    const r = rig();
    r.walk.bindKey(window);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    for (let i = 0; i < 30 && r.walk.stance() !== 'prone'; i++) r.frames();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    r.frames();
    expect(r.page().action?.name).toBe('standToProne');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(popped(r.frames())).toBe(true);
    expect(r.walk.stance()).toBe('stand');
    expect(r.page().action).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  });

  // B193 e2e triage (walk.spec.ts:158, red on main since aeae3e91b): the e2e's own sequence -- a C hold drops, its
  // release, 200 ms, a C press. OT.R76 retired OT.R67's double tap: a stance press from prone takes the keys' rule
  // (`KEY_STANCE`, the owner's 2026-09-29: from prone a tap crouches), pending under the drop's clip, never a stand.
  it('OT.R76: the keyboard\'s C tap in the drop is the keys\' rule -- crouch once the clip ends, never a stand (walk.spec.ts:158)', () => {
    const r = rig();
    r.walk.bindKey(window);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    for (let i = 0; i < 30 && r.walk.stance() !== 'prone'; i++) r.frames();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    r.ms(200);
    expect(r.walk.stance()).toBe('prone');                          // the hold's release is no tap
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    const seen = new Set<string>();
    for (let i = 0; i < 180; i++) { r.frames(); seen.add(r.walk.stance()); }
    expect(seen.has('stand')).toBe(false);
    expect(r.walk.stance()).toBe('crouch');
  });

  it('the review\'s 2: the keyboard\'s fresh C closes the window at its press -- C then Space before the next frame is no pop', () => {
    const r = rig();
    r.walk.bindKey(window);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    for (let i = 0; i < 30 && r.walk.stance() !== 'prone'; i++) r.frames();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
    r.frames();
    expect(r.page().action?.name).toBe('standToProne');              // the window open on the drop
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(popped(r.frames())).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
  });

  it('the pad\'s lane (StanceButton.lanes on the walk, as playerLanes runs it): a hold drops, the jump press pops', () => {
    const r = rig();
    const pad = new StanceButton();
    for (let i = 0; i < 30 && r.walk.stance() !== 'prone'; i++) { pad.lanes(r.walk.stanceMode(), { triangle: true }, FRAME, r.walk); r.frames(); }
    pad.lanes(r.walk.stanceMode(), { triangle: false }, FRAME, r.walk);
    r.frames();
    expect(r.walk.jumpPress()).toBe(true);
    expect(popped(r.frames())).toBe(true);
    expect(r.walk.stance()).toBe('stand');
  });

  it('the fallback (separate): the touch C keeps KEY_STANCE -- from prone a tap crouches, through its clip', () => {
    const r = rig();
    r.walk.setStanceMode('separate');
    r.walk.setStance('prone');
    r.ms(1200);
    r.touch();
    expect(r.walk.stance()).toBe('crouch');
    expect(r.page().action?.name).toBe('crouchToProne');
    expect(r.page().action?.reversed).toBe(true);
  });

  it('a pop refused (no headroom) sends no pop, and the jump press is the native jump\'s', () => {
    const r = rig();
    r.walk.stanceTouch('down');
    r.ms(450);
    r.walk.stanceTouch('up');
    r.frames();
    expect(r.page().action?.name).toBe('standToProne');
    (r.page() as unknown as { headroom: () => boolean }).headroom = () => false;
    r.walk.jumpPress();
    const cmds = r.frames();
    expect(r.walk.stance()).toBe('prone');
    expect(popped(cmds)).toBe(false);
  });
});

describe('OT.R76: the page and the room agree on every pop (A=B; the command\'s stance code 3)', () => {
  it('settled prone: the window closed, a jump press is no pop on the page or in the room', () => {
    const r = rig();
    r.walk.stanceTouch('down');
    for (let i = 0; i < 30; i++) { r.frames(); r.agree(); }
    r.walk.stanceTouch('up');
    for (let i = 0; i < 90; i++) { r.frames(); r.agree(); }
    expect(r.page().action).toBeNull();
    r.walk.jumpPress();
    const cmds = r.frames();
    expect(popped(cmds)).toBe(false);
    r.agree();
    expect(r.room.walker.stance).toBe('prone');
  });

  it('the dive: the pop on the page and in the room, the carried velocity kept in both', () => {
    const r = rig();
    r.setWish(1);
    for (let i = 0; i < 90; i++) { r.frames(); r.agree(); }
    r.walk.stanceTouch('down');
    for (let i = 0; i < 27 && !r.moves().inDive(); i++) { r.frames(); r.agree(); }
    expect(r.moves().inDive()).toBe(true);
    r.walk.stanceTouch('up');
    for (let i = 0; i < 6; i++) { r.frames(); r.agree(); }
    r.walk.jumpPress();
    const cmds = r.frames();
    expect(popped(cmds)).toBe(true);
    r.agree();
    expect(r.room.walker.stance).toBe('stand');
    expect(Math.hypot(r.room.walker.state.vx, r.room.walker.state.vz)).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) { r.frames(); r.agree(); }
  });

  it('the drop: the pop on the page and in the room, the drop ended in both', () => {
    const r = rig();
    r.walk.stanceTouch('down');
    for (let i = 0; i < 30; i++) { r.frames(); r.agree(); }   // the hold: prone at its threshold, the drop under way
    expect(r.page().action?.name).toBe('standToProne');
    r.walk.stanceTouch('up');
    for (let i = 0; i < 3; i++) { r.frames(); r.agree(); }
    r.walk.jumpPress();
    const cmds = r.frames();
    expect(popped(cmds)).toBe(true);
    r.agree();
    expect(r.room.walker.action).toBeNull();
    expect(r.room.walker.stance).toBe('stand');
    for (let i = 0; i < 30; i++) { r.frames(); r.agree(); }
  });

  // PP.R3 (the merge controller's word, 2026-10-20: "no ticket") is superseded by OT.R76 (2026-10-23): the window is a
  // stance press's own. Crouched by the crouch shortcut, a drop the hook begins (no stance press) opens none -- the jump
  // press is no pop; a drop the keyboard's C begins (a stance press of its own) opens it -- Space pops it, page and room.
  for (const by of ['hook', 'key'] as const) {
    it(`OT.R76: crouched by the crouch shortcut, a drop begun by ${by === 'hook' ? 'the hook is no window' : 'the keyboard\'s C is one: Space pops it'}, on the page and in the room`, () => {
      const r = rig();
      expect(r.walk.crouch()).toBe(true);                         // the crouch shortcut: crouch, never prone
      for (let i = 0; i < 60; i++) { r.frames(); r.agree(); }
      expect(r.walk.stance()).toBe('crouch');
      r.walk.bindKey(window);
      if (by === 'hook') {
        r.walk.setStance('prone');
        for (let i = 0; i < 6; i++) { r.frames(); r.agree(); }
      } else {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }));
        for (let i = 0; i < 30 && r.walk.stance() !== 'prone'; i++) { r.frames(); r.agree(); }
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
        for (let i = 0; i < 3; i++) { r.frames(); r.agree(); }
      }
      expect(r.page().action?.name).toBe('crouchToProne');
      expect(r.room.walker.action?.name).toBe('crouchToProne');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      const cmds = r.frames();
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
      r.agree();
      expect(popped(cmds)).toBe(by === 'key');
      expect(r.walk.stance()).toBe(by === 'key' ? 'stand' : 'prone');
      expect(r.room.walker.stance).toBe(by === 'key' ? 'stand' : 'prone');
    });
  }

  // The prone-pop's fresh review, F2 (2026-10-20): a drop with a hold under it is no pop (`Walker.popStand`'s null). The
  // original's crouchToProne refuses the stand (`TRANSITION_REFUSES`, `FUN_00552ec0` D:L418995) and the hold owns the
  // body after it. OT.R76: the drop a stance hold began (a window), the reload's hold pushed under it, a jump press --
  // no pop; prone kept on the page and in the room.
  it('a drop with the prone reload\'s hold under it: the jump press is no pop -- prone kept, on the page and in the room', () => {
    const r = rig();
    expect(r.walk.crouch()).toBe(true);
    for (let i = 0; i < 60; i++) { r.frames(); r.agree(); }
    expect(r.walk.stance()).toBe('crouch');
    r.walk.stanceTouch('down');
    for (let i = 0; i < 30 && r.page().action?.name !== 'crouchToProne'; i++) { r.frames(); r.agree(); }
    r.walk.stanceTouch('up');
    expect(r.page().action?.name).toBe('crouchToProne');
    expect(r.page().action?.reversed).toBe(false);
    expect(r.walk.holdReload()).toBe(true);                       // the prone reload's hold pushed under the drop
    r.frames();
    r.agree();
    expect(r.page().holding?.clip).toBe('seal_prone_reload');
    expect(r.room.walker.holding?.clip).toBe('seal_prone_reload');
    r.walk.jumpPress();
    const cmds = r.frames();
    r.agree();
    expect(popped(cmds)).toBe(false);
    expect(r.page().stance).toBe('prone');
    expect(r.room.walker.stance).toBe('prone');
  });

  // The prone-pop's fresh review, F1 (2026-10-20): in the air the press is the original's. PAR-19 (research 251
  // section 2): the press writes the request (`actor+0x374`, `FUN_00594cf0` D:L453331-453430) and the body takes it
  // when it can (`FUN_00552d60` D:L418867-418908, `Walker.retryStance`) -- on landing -- so the prone-pop's machine
  // took an airborne press as the original's (OT.R76: every press of the stance button is now `update`'s); the pops refuse in the air themselves.
  for (const lane of ['touch', 'pad'] as const) {
    it(`in the air, a tap of ${lane === 'touch' ? 'the touch C' : 'the pad\'s Triangle'} is the original's: crouch pending, landed crouched, on the page and in the room`, () => {
      const r = rig();
      expect(r.walk.stanceMode()).toBe('pop');
      for (const w of [r.page(), r.room.walker]) { w.state.y += 40; w.setAirborne(true, 0); }   // a fall begun, page and room alike
      r.frames();
      r.agree();
      expect(r.page().airborne).toBe(true);
      const pad = new StanceButton();                             // the pad's lane, as `playerLanes` feeds it
      const press = (down: boolean): void => {
        if (lane === 'touch') r.walk.stanceTouch(down ? 'down' : 'up');
        else pad.lanes(r.walk.stanceMode(), { triangle: down }, FRAME, r.walk);
      };
      press(true);
      for (let i = 0; i < 2; i++) { r.frames(); r.agree(); }
      press(false);
      r.frames();
      r.agree();
      expect(r.page().airborne).toBe(true);                       // still falling: the request written, not taken
      expect(r.room.walker.airborne).toBe(true);
      expect(r.page().pendingStance).toBe('crouch');
      expect(r.room.walker.pendingStance).toBe('crouch');
      expect(r.walk.stanceIntent()).toBe('crouch');
      for (let i = 0; i < 300 && (r.page().airborne || r.room.walker.airborne); i++) { r.frames(); r.agree(); }
      expect(r.page().airborne).toBe(false);
      for (let i = 0; i < 60; i++) { r.frames(); r.agree(); }
      expect(r.page().stance).toBe('crouch');                     // taken on landing
      expect(r.room.walker.stance).toBe('crouch');
      expect(r.page().pendingStance).toBeNull();
      expect(r.room.walker.pendingStance).toBeNull();
      expect(r.walk.stance()).toBe('crouch');
    });
  }

  // The prone-pop's narrow re-review (2026-10-20, the rest of F1): a press begun on the ground and still under way when
  // the body leaves it is not forgotten. The original's tap (at the release) and hold (at `STANCE_HOLD_S_PLACEHOLDER`)
  // write the request in the air as anywhere (PAR-19, `FUN_00594cf0` D:L453331-453430) and the body takes it on landing
  // (`FUN_00552d60` D:L418867-418908); `'separate'` (the original's machine) is the control.
  for (const mode of ['pop', 'separate'] as const) {
    for (const lane of ['touch', 'pad'] as const) {
      for (const kind of ['tap', 'hold'] as const) {
        const want = kind === 'tap' ? 'crouch' : 'prone';
        it(`${mode}: a ${kind} of ${lane === 'touch' ? 'the touch C' : 'the pad\'s Triangle'} begun on the ground, the body airborne under it -- ${want} asked, landed ${want}, on the page and in the room`, () => {
          const r = rig();
          r.walk.setStanceMode(mode);
          expect(r.walk.stanceMode()).toBe(mode);
          const pad = new StanceButton();                         // the pad's lane, fed every frame as `playerLanes` does
          let down = false;
          const press = (on: boolean): void => {
            down = on;
            if (lane === 'touch') r.walk.stanceTouch(on ? 'down' : 'up');
          };
          const step = (): void => {
            if (lane === 'pad') pad.lanes(r.walk.stanceMode(), { triangle: down }, FRAME, r.walk);
            r.frames();
            r.agree();
          };
          press(true);
          for (let i = 0; i < 4; i++) step();                     // pressed on the ground
          expect(r.page().airborne).toBe(false);
          for (const w of [r.page(), r.room.walker]) { w.state.y += 60; w.setAirborne(true, 0); }   // off the ground under the press
          for (let i = 0; i < (kind === 'tap' ? 3 : 30); i++) step();
          expect(r.page().airborne).toBe(true);
          press(false);
          step();                                                 // released in the air
          expect(r.page().airborne).toBe(true);
          expect(r.room.walker.airborne).toBe(true);
          expect(r.page().pendingStance).toBe(want);              // the request written, waiting for the floor
          expect(r.room.walker.pendingStance).toBe(want);
          for (let i = 0; i < 300 && (r.page().airborne || r.room.walker.airborne); i++) step();
          expect(r.page().airborne).toBe(false);
          for (let i = 0; i < 240 && (r.page().pendingStance !== null || r.room.walker.pendingStance !== null); i++) step();
          for (let i = 0; i < 30; i++) step();
          expect(r.page().pendingStance).toBeNull();
          expect(r.room.walker.pendingStance).toBeNull();
          expect(r.page().stance).toBe(want);                     // taken on landing
          expect(r.room.walker.stance).toBe(want);
          expect(r.walk.stance()).toBe(want);
        });
      }
    }
  }
});
