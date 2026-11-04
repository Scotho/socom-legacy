import { describe, expect, it } from 'vitest';
import {
  ACTION_CONTEXT_BITS, ACTION_CONTEXT_ORDER, ActionLifecycle, ActionSelection, contextPrompt, isHoldContext, pickContext,
  type ActionContext, type ContextInputs,
} from '../src/actionContext';
import { DEFUSE_PROMPT_ICON_READING } from '../src/bombPage';
import { PadWatch, type PadLike } from '../src/gamepad';
import { PICKUP_PROMPT_COOLDOWN_READING } from '../src/net/pickupRules';
import { FrameTime } from '../src/frameTime';

/**
 * XR-06 (research 214 s4): one action context on the page, picked in the game's order, and its press / hold / release /
 * cancel kept apart -- a release fires a one-shot context, a hold (the bomb's plant and defuse) fires nothing on its
 * release, and a cancel (a port rule: the browser's blur, a menu, the ARMORY, a pad lost, a death) never fires.
 */

/**
 * AD-6 (research 214 s4): `FUN_0021f850`'s build order (D:L74050-74293), one bit an action, as the picker appends each
 * entry at the list's tail (`FUN_002209c0` D:L74589-74590) -- a transcription the context order is checked against.
 */
const FUN_0021F850_ORDER = [
  0x80000, 0x100000, 0x800, 0x400, 0x1000, 0x80, 0x10000, 0x2, 0x4, 0x2000, 0x40000, 0x20000, 0x8, 0x200000, 0x10, 0x20,
  0x100, 0x200, 0x4000, 0x8000, 0x40,
] as const;

describe('the action context (XR-06; research 214 s4)', () => {
  it("AD-6: the contexts sit in FUN_0021f850's order of their bits -- the turret (0x80000 mount, 0x100000 release) first, the victory point (0x200000) before the pickups (0x10, 0x20), the pickups before a hostage's order (0x4000, 0x8000), the drop (0x40) last", () => {
    expect(ACTION_CONTEXT_BITS).toEqual({
      turret: [0x80000, 0x100000], bombPlant: [0x80], bombDefuse: [0x80], traversal: [0x10000, 0x4], door: [0x2000], switch: [0x2000],
      c4: [0x40000], victory: [0x200000], pickup: [0x10], pickup2: [0x20], escortee: [0x4000, 0x8000], bombDrop: [0x40],
    });
    // Every context's bits are among the list's, and the contexts follow their first bit's place in it.
    const at = (bit: number) => FUN_0021F850_ORDER.indexOf(bit as (typeof FUN_0021F850_ORDER)[number]);
    for (const c of ACTION_CONTEXT_ORDER) for (const b of ACTION_CONTEXT_BITS[c]) expect(at(b), `${c} 0x${b.toString(16)}`).toBeGreaterThanOrEqual(0);
    const first = (c: (typeof ACTION_CONTEXT_ORDER)[number]) => at(ACTION_CONTEXT_BITS[c][0]!);
    expect([...ACTION_CONTEXT_ORDER].sort((a, b) => first(a) - first(b))).toEqual([...ACTION_CONTEXT_ORDER]);
    expect(ACTION_CONTEXT_ORDER).toEqual(['turret', 'bombPlant', 'bombDefuse', 'traversal', 'door', 'switch', 'c4', 'victory', 'pickup', 'pickup2', 'escortee', 'bombDrop']);   // LkPaioX5 (c): the two TAKE actions
    // Offered together (chunk 08: the order of what is offered together, not a claim the original offers these at once),
    // the earlier bit is the head: the turret over C4 and over the plant; the victory point over a pickup; a pickup over a
    // hostage's order and over the drop.
    expect(pickContext({ turret: true, c4: true })).toBe('turret');
    expect(pickContext({ turret: true, bombPlant: true, door: true })).toBe('turret');
    expect(pickContext({ victory: true, pickup: true })).toBe('victory');
    expect(pickContext({ c4: true, victory: true, pickup: true })).toBe('c4');
    expect(pickContext({ pickup: true, escortee: true, bombDrop: true })).toBe('pickup');
  });

  it("the context is the head of the picker's list in its build order: the turret (0x80000, 0x100000), the bomb's plant or defuse (0x80), the traversal (0x10000 the ladder slide, 0x4 the climb), a door or switch (0x2000), C4 (0x40000), the drop (0x40) last -- FUN_0021d9d0 D:L73370-73404, FUN_0021f850", () => {
    const all: ContextInputs = { door: true, switch: true, bombPlant: true, bombDefuse: true, bombDrop: true, c4: true, turret: true, traversal: true, pickup: true, pickup2: true, escortee: true, victory: true };
    expect(pickContext(all)).toBe('turret');
    expect(pickContext({ ...all, turret: false })).toBe('bombPlant');
    expect(pickContext({})).toBeNull();
    // Each one taken away in turn: the next in the order answers.
    const order: ActionContext[] = [];
    const left: ContextInputs = { ...all };
    for (let c = pickContext(left); c !== null; c = pickContext(left)) { order.push(c); left[c] = false; }
    expect(order).toEqual(['turret', 'bombPlant', 'bombDefuse', 'traversal', 'door', 'switch', 'c4', 'victory', 'pickup', 'pickup2', 'escortee', 'bombDrop']);   // AD-6; PF-34's pickup, HX-4a's escortee, research 303's victory
    expect(order).toEqual([...ACTION_CONTEXT_ORDER]);
    // The cases the game meets: the carrier at the tent with a ledge beside it plants; beside a planted bomb with C4's
    // target in reach the defuse wins; carrying, aimed down, at a C4 target: C4 -- the drop (0x40) is the list's last;
    // a ledge or a ladder's slide beside a door: the traversal (0x10000, 0x4 before 0x2000).
    expect(pickContext({ bombPlant: true, traversal: true })).toBe('bombPlant');
    expect(pickContext({ bombDefuse: true, c4: true, traversal: true })).toBe('bombDefuse');
    expect(pickContext({ bombDrop: true, c4: true })).toBe('c4');
    expect(pickContext({ bombDrop: true, turret: true })).toBe('turret');
    expect(pickContext({ bombDrop: true })).toBe('bombDrop');
    expect(pickContext({ door: true, traversal: true })).toBe('traversal');
    expect(pickContext({ switch: true, c4: true })).toBe('switch');
    expect(pickContext({ c4: true, traversal: true })).toBe('traversal');
    expect(pickContext({ traversal: true })).toBe('traversal');
    // Each context's bit in the action mask (1 << action: `FUN_00544c80` D:L411188), as the picker appends them (AD-6's
    // test above holds them against `FUN_0021f850`'s order).
    expect(ACTION_CONTEXT_BITS.turret).toEqual([0x80000, 0x100000]);
    expect([...ACTION_CONTEXT_BITS.pickup, ...ACTION_CONTEXT_BITS.pickup2]).toEqual([0x10, 0x20]);   // LkPaioX5 (c): one context a bit
    expect(contextPrompt('victory')).toBe('victory');
    // The holds are the plant and the defuse (action 7); the rest fire once on the release.
    expect(ACTION_CONTEXT_ORDER.filter(isHoldContext)).toEqual(['bombPlant', 'bombDefuse']);
    // The prompts the HUD shows for each (research 87 s5; the switch's from its record's bitmap).
    expect(contextPrompt('door')).toBe('door');
    expect(contextPrompt('switch', 'lever')).toBe('lever');
    expect(contextPrompt('switch')).toBe('action');
    expect(contextPrompt('bombPlant')).toBe('bomb');
    expect(contextPrompt('bombDefuse')).toBe(DEFUSE_PROMPT_ICON_READING);
    expect(contextPrompt('bombDrop')).toBe('bomb_drop');
    expect(contextPrompt('c4')).toBe('c4');
    expect(contextPrompt('turret')).toBe('turret_mount');
    expect(contextPrompt('traversal')).toBeNull();                       // the ledge's prompt is the climb's own (`Hud.feed`)
    expect(contextPrompt(null)).toBeNull();
  });

  it('a release fires a one-shot context once and ends a hold; a cancel ends the hold and fires nothing; blur, menu, ARMORY, pad loss and death are cancels', () => {
    let ctx: ActionContext = 'door';
    const life = new ActionLifecycle(() => ctx);
    expect(life.press()).toEqual({ fire: null, heldContext: 'door' });
    expect(life.hold(0.1)).toEqual({ fire: null, heldContext: 'door' });
    expect(life.release()).toEqual({ fire: 'door', heldContext: null });
    expect(life.release()).toEqual({ fire: null, heldContext: null });      // once
    expect(life.cancel('blur')).toEqual({ fire: null, heldContext: null });  // a cancel after the release: nothing (lostpointercapture after pointerup)
    expect(life.down()).toBe(false);
    // The game takes the context on the release edge (`FUN_00594cf0` D:L453194-453243): a press on nothing, released at
    // a switch, works the switch.
    ctx = null;
    life.press();
    ctx = 'switch';
    expect(life.release().fire).toBe('switch');
    // The plant: a hold, nothing fired on its release; the hold ends.
    ctx = 'bombPlant';
    expect(life.press()).toEqual({ fire: null, heldContext: 'bombPlant' });
    for (let i = 0; i < 10; i++) expect(life.hold(0.5)).toEqual({ fire: null, heldContext: 'bombPlant' });
    expect(life.heldFor()).toBeCloseTo(5, 9);
    expect(life.release()).toEqual({ fire: null, heldContext: null });
    expect(life.heldFor()).toBe(0);
    // Every cancel: the hold ends, nothing fires, and the release that follows is nothing too.
    for (const cause of ['blur', 'menu', 'armory', 'padLost', 'death', 'touch'] as const) {
      for (const c of ['door', 'switch', 'bombDrop', 'c4', 'traversal', 'turret', 'bombPlant', 'bombDefuse'] as const) {
        ctx = c;
        life.press();
        life.hold(1);
        expect(life.cancel(cause), `${cause} ${c}`).toEqual({ fire: null, heldContext: null });
        expect(life.lastCancel()).toBe(cause);
        expect(life.down()).toBe(false);
        expect(life.release(), `${cause} ${c} release`).toEqual({ fire: null, heldContext: null });
        expect(life.hold(1)).toEqual({ fire: null, heldContext: null });
      }
    }
    // A fresh press after a cancel works again.
    ctx = 'door';
    life.press();
    expect(life.release().fire).toBe('door');
    expect(life.lastCancel()).toBeNull();
    // The pad lost (`./gamepad` `PadWatch`): its `cancel` is called before `disconnected`, so a held Cross does not fire
    // on the pad's vanishing lanes.
    const said: string[] = [];
    const watch = new PadWatch({ connected: () => said.push('on'), disconnected: () => said.push('off'), cancel: () => { said.push('cancel'); life.cancel('padLost'); } });
    const pad = { id: 'pad', index: 0, connected: true, mapping: 'standard', buttons: [], axes: [] } as unknown as PadLike;
    watch.poll({ getGamepads: () => [pad] });
    ctx = 'door';
    life.press();
    watch.poll({ getGamepads: () => [] });
    expect(said).toEqual(['on', 'cancel', 'off']);
    expect(life.release()).toEqual({ fire: null, heldContext: null });
  });

  it('holding the bomb\'s plant never also climbs, opens a door or plants C4', () => {
    let inputs: ContextInputs = { bombPlant: true, traversal: true, c4: true };
    const life = new ActionLifecycle(() => pickContext(inputs));
    expect(life.press().heldContext).toBe('bombPlant');
    life.hold(2);
    inputs = { door: true, traversal: true, c4: true };                    // a door under the reticle, a ledge, C4's target
    expect(life.hold(2).heldContext).toBe('bombPlant');
    expect(life.release()).toEqual({ fire: null, heldContext: null });
    // Pressed at a ledge and walked into the tent's reach still held: the hold is the plant's from then on, and its release
    // climbs nothing.
    inputs = { traversal: true };
    expect(life.press().heldContext).toBe('traversal');
    inputs = { bombPlant: true, traversal: true };
    expect(life.hold(0.5).heldContext).toBe('bombPlant');
    inputs = { traversal: true };
    expect(life.release().fire).toBeNull();
    // The defuse the same.
    inputs = { bombDefuse: true, c4: true };
    life.press();
    inputs = { c4: true };
    expect(life.release().fire).toBeNull();
    // Not held, the same ledge climbs.
    inputs = { traversal: true };
    life.press();
    expect(life.release().fire).toBe('traversal');
  });
});

describe('PF-34: the pickup context (research 234 s5; ruling PF.R54)', () => {
  it("pickup is a context after the victory point (0x200000) and before a hostage's order -- its bits 0x10 / 0x20, the candidates +0x14c / +0x150 (FUN_005937c0 D:L452427-452434) -- with the HUD's pickup prompt, and a chosen pickup holds the weapon prompt 3 s (00592d50 D:L452158-452175, PICKUP_PROMPT_COOLDOWN_READING)", () => {
    expect(PICKUP_PROMPT_COOLDOWN_READING).toBe(3);
    expect(ACTION_CONTEXT_ORDER.indexOf('pickup')).toBe(ACTION_CONTEXT_ORDER.indexOf('victory') + 1);
    expect(ACTION_CONTEXT_ORDER.indexOf('escortee')).toBe(ACTION_CONTEXT_ORDER.indexOf('pickup') + 2);   // LkPaioX5 (c): pickup2 between
    expect(pickContext({ pickup: true, c4: true })).toBe('c4');
    expect(pickContext({ pickup: true, turret: true, bombDrop: true })).toBe('turret');
    expect(pickContext({ pickup: true, bombDrop: true })).toBe('pickup');
    expect(pickContext({ pickup: true, victory: true })).toBe('victory');
    expect(pickContext({ pickup: true, door: true })).toBe('door');
    expect(isHoldContext('pickup')).toBe(false);                 // one-shot: it fires on the release
    expect(contextPrompt('pickup')).toBe('pickup');
    // A chosen pickup holds the prompt 3 s, counted only while a candidate is in reach (FUN_00593da0 D:L452547-452549).
    let inputs: ContextInputs = { pickup: true };
    const life = new ActionLifecycle(() => pickContext(inputs));
    expect(life.pickupHeld()).toBe(false);
    life.press();
    expect(life.release().fire).toBe('pickup');
    expect(life.pickupHeld()).toBe(true);
    life.elapse(2.5, true);
    life.elapse(5, false);                                       // out of reach: the hold does not run down
    expect(life.pickupHeld()).toBe(true);
    life.elapse(0.4, true);
    expect(life.pickupHeld()).toBe(true);
    life.elapse(0.2, true);
    expect(life.pickupHeld()).toBe(false);
    // Any other context's release sets nothing; a cancel neither.
    inputs = { door: true };
    life.press();
    expect(life.release().fire).toBe('door');
    expect(life.pickupHeld()).toBe(false);
    inputs = { pickup: true };
    life.press(); life.cancel('blur');
    expect(life.pickupHeld()).toBe(false);
  });
});

/**
 * PAR-24 (research 252 s2; ACT.R8's general rule: timed holds count real time, not page frames): the claim hold
 * (`PICKUP_PROMPT_COOLDOWN_READING`) counts the frame's real seconds -- `FUN_00593da0` takes its frame's elapsed time off
 * `+0x23c` (D:L452547-452549) -- never the 0.1 s-clamped step the pages hand their simulation.
 */
describe("PAR-24: the claim hold counts the frame's real seconds (ACT.R8's rule; research 252)", () => {
  /** A claim armed by a pickup's release, in reach each frame, fed `fed(real)` of each frame's FrameTime: the real time (s) it ends at. */
  const endsAt = (periods: readonly number[], fed: (real: number) => number): number | null => {
    const life = new ActionLifecycle(() => 'pickup');
    life.press();
    life.release();
    const t = new FrameTime();
    let now = 0, real = 0;
    t.frame(now);
    for (const ms of periods) {
      now += ms;
      real += ms / 1000;
      life.elapse(fed(t.frame(now)), true);
      if (!life.pickupHeld()) return real;
    }
    return null;
  };
  const frames = (n: number, ms: number): number[] => Array.from({ length: n }, () => ms);
  const real = (s: number): number => s, clamped = (s: number): number => Math.min(s, 0.1);   // the pages' clamp (main.ts, matchMount.ts)

  it("fed the frame's real seconds (FrameTime), the claim hold ends after 3.0 s of real time at 5 fps, at 60 fps and across a 1 s stall, never sooner; fed the clamped step, as the lane wires it, 6 s at 5 fps and 3.9 s across the stall", () => {
    const slow = frames(40, 200), fast = frames(240, 1000 / 60), stall = [...frames(60, 1000 / 60), 1000, ...frames(150, 1000 / 60)];
    const oneFrame = 1 / 60 + 1e-9;
    expect(endsAt(slow, real)).toBeCloseTo(PICKUP_PROMPT_COOLDOWN_READING, 9);
    for (const periods of [fast, stall]) {
      const at = endsAt(periods, real)!;
      expect(at).toBeGreaterThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING - 1e-9);             // never early: a long frame credits its real time, no more
      expect(at).toBeLessThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING + oneFrame);
    }
    expect(endsAt(slow, clamped)).toBeCloseTo(2 * PICKUP_PROMPT_COOLDOWN_READING, 9);    // the defect E01 names
    expect(endsAt(stall, clamped)).toBeGreaterThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING + 0.9 - 1e-9);   // the stall's 1 s credited 0.1
    expect(endsAt(stall, clamped)).toBeLessThanOrEqual(PICKUP_PROMPT_COOLDOWN_READING + 0.9 + oneFrame);
    expect(endsAt(fast, clamped)).toBe(endsAt(fast, real));                              // at or above 10 fps the two agree
  });
});

/**
 * PAR-34 group 7 (research 252 s4; `./drops` PICKUP_HOLD_PER_CLASS_READING): `FUN_00593da0` subtracts the frame's time
 * from the weapon prompt's hold `+0x23c` in its first-candidate branch (D:L452547-452549) and again in its
 * second-candidate branch (D:L452563-452565), the second only while the hold is still above 0: with both candidates in
 * reach the 3 s hold ends in 1.5 s.
 */
describe('PAR-34 group 7: the claim hold runs down once per candidate class in reach (FUN_00593da0)', () => {
  const held = (): ActionLifecycle => { const life = new ActionLifecycle(() => 'pickup'); life.press(); life.release(); return life; };
  it('two candidates: the 3 s hold ends after 1.5 s of frames; one (or true): after 3 s; none: it stands', () => {
    for (const [candidates, ends] of [[2, PICKUP_PROMPT_COOLDOWN_READING / 2], [1, PICKUP_PROMPT_COOLDOWN_READING], [true, PICKUP_PROMPT_COOLDOWN_READING]] as const) {
      const life = held();
      let t = 0;
      while (life.pickupHeld() && t < 10) { life.elapse(0.25, candidates); t += 0.25; }
      expect(t, String(candidates)).toBeCloseTo(ends, 6);
    }
    const none = held();
    none.elapse(10, 0);
    expect(none.pickupHeld()).toBe(true);
  });
});

/**
 * LkPaioX5 part 2 (a) (research 87 §5, "The action list"): the HUD draws the list's head and list[1], list[2] beside it
 * (`FUN_0021f210` D:L73979-74032), so the selection lends its whole list in its order (`FUN_0021d9d0`'s, turned by the
 * d-pad as `FUN_00595320` asks, D:L73332-73386).
 */
describe('LkPaioX5 (a): the selection lends its list', () => {
  it('the list in the picker\'s order, turned by the d-pad; empty before a pick and after a reset', () => {
    const s = new ActionSelection();
    expect(s.list()).toEqual([]);
    s.pick({ door: true, c4: true, bombDrop: true });
    expect(s.list()).toEqual(['door', 'c4', 'bombDrop']);
    s.rotate('left');
    expect(s.list()).toEqual(['c4', 'bombDrop', 'door']);
    s.rotate('right');
    s.rotate('right');
    expect(s.list()).toEqual(['bombDrop', 'door', 'c4']);
    s.reset();
    expect(s.list()).toEqual([]);
  });
});

describe('LkPaioX5 (b): the defuse\'s prompt, read (FUN_002209c0 D:L74585-74586)', () => {
  it('is the bomb record\'s own icon, bomb_defuse -- apart from the plant\'s bomb', () => {
    expect(DEFUSE_PROMPT_ICON_READING).toBe('bomb_defuse');
    expect(contextPrompt('bombDefuse')).not.toBe(contextPrompt('bombPlant'));
  });
});

/**
 * LkPaioX5 part 2 (c) (research 87 §5, "The action list"; research 234 §7): the two TAKE actions are two entries, action 4
 * (bit 0x10, `FUN_00544c30`'s candidate `+0x14c`) and action 5 (bit 0x20, `FUN_00544c20`'s `+0x150`), set apart by
 * `FUN_005937c0` (D:L452427-452434) and appended apart by `FUN_0021f850` (records 0x40c580 and 0x40c660), each its own icon
 * (`action_pickup_item1.tif`, `_item2`) and its own caption's weapon (`FUN_00220870` D:L74508-74536).
 */
describe('LkPaioX5 (c): the two TAKE entries', () => {
  it('two contexts, in the bits\' order, each its own prompt; both in the list when both are in reach', () => {
    const order = ACTION_CONTEXT_ORDER as readonly string[];
    expect(order.indexOf('pickup2')).toBe(order.indexOf('pickup') + 1);
    expect([contextPrompt('pickup'), contextPrompt('pickup2')]).toEqual(['pickup', 'pickup2']);
    const s = new ActionSelection();
    expect(s.pick({ pickup: true, pickup2: true, door: true })).toBe('door');
    expect(s.list()).toEqual(['door', 'pickup', 'pickup2']);
  });
  it('either TAKE released starts the one 3 s hold (PICKUP_PROMPT_COOLDOWN_READING), unchanged', () => {
    let now: ActionContext = 'pickup2';
    const life = new ActionLifecycle(() => now);
    life.press();
    expect(life.release().fire).toBe('pickup2');
    expect(life.pickupHeld()).toBe(true);
    life.elapse(PICKUP_PROMPT_COOLDOWN_READING, 1);
    expect(life.pickupHeld()).toBe(false);
    now = 'pickup';
    life.press();
    expect(life.release().fire).toBe('pickup');
    expect(life.pickupHeld()).toBe(true);
  });
});
