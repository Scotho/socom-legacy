import { describe, expect, it } from 'vitest';
import { pickContext, type ActionContext } from '../src/actionContext';
import {
  actionInputs, actionPromptOf, ActionWiring, fireContext, fireTable, observeCommands, pageSources, RoomEvents, TurretTrigger,
  turretInterval, type ActionSources, type FireCalls,
} from '../src/actionWiring';
import { DEFUSE_PROMPT_ICON_READING } from '../src/bombPage';
import { TICK_HZ, type ClientEvent, type ServerEvent } from '../src/net/protocol';
import { FrameTime } from '../src/frameTime';
import { fireFrames } from '../src/accuracy';
import { GAME_FRAME_DT, type CollisionOwner, type GridParams, type TurretPlacement, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround } from '../src/mover';
import { TurretPage } from '../src/turretPage';

/**
 * Sprint 27 wave 4 (research 214 s7): the wiring `main.ts` hands the action button -- the pages' answers into the
 * picker (`pickContext`), the lifecycle's edges, each context's one page call, the room's events relayed to the pages
 * across connections, and the commands' `ActionHeld` bit observed for the bomb's prediction.
 */

function calls(log: string[], answers: Partial<Record<keyof FireCalls, boolean>> = {}): FireCalls {
  const one = (k: keyof FireCalls) => () => { log.push(k); return answers[k] ?? true; };
  return { door: one('door'), switch: one('switch'), bombDrop: one('bombDrop'), c4: one('c4'), turret: one('turret') };
}

function sources(over: Partial<ActionSources> = {}, asked: string[] = []): ActionSources {
  const t = (k: string, v = false) => () => { asked.push(k); return v; };
  return {
    canAct: () => true, mounted: () => false, locked: () => false,
    door: t('door'), switch: t('switch'), bombPrompt: () => { asked.push('bomb'); return null; }, c4: t('c4'), turret: t('turret'), traversal: t('traversal'),
    ...over,
  };
}

describe('the action wiring (wave 4; research 214 s7)', () => {
  it('the fire table routes each one-shot context to its page call: door, switch, bombDrop, c4, turret; traversal, a hold and none are the walk own action (false)', () => {
    for (const c of ['door', 'switch', 'bombDrop', 'c4', 'turret'] as const) {
      const log: string[] = [];
      expect(fireContext(c, calls(log))).toBe(true);
      expect(log).toEqual([c]);
    }
    for (const c of ['traversal', 'bombPlant', 'bombDefuse', null] as ActionContext[]) {
      const log: string[] = [];
      expect(fireContext(c, calls(log))).toBe(false);
      expect(log).toEqual([]);
    }
    const log: string[] = [];
    expect(fireContext('door', calls(log, { door: false }))).toBe(false);   // a page that refused: the walk's own action
  });

  it("the pick inputs come from the pages: the bomb's prompt split into plant, defuse and drop; asked lazily in the picker's order", () => {
    const asked: string[] = [];
    expect(pickContext(actionInputs(sources({ bombPrompt: () => 'bomb' }, asked)))).toBe('bombPlant');
    expect(asked).toEqual(['turret']);                             // AD-6: the turret's test first (0x80000), then the head answered: no door's or C4's raycast
    expect(pickContext(actionInputs(sources({ bombPrompt: () => DEFUSE_PROMPT_ICON_READING })))).toBe('bombDefuse');
    expect(pickContext(actionInputs(sources({ bombPrompt: () => 'bomb_drop' })))).toBe('bombDrop');
    expect(pickContext(actionInputs(sources({ door: () => true, c4: () => true })))).toBe('door');
    expect(pickContext(actionInputs(sources({ switch: () => true, c4: () => true })))).toBe('switch');
    expect(pickContext(actionInputs(sources({ c4: () => true, turret: () => true, bombPrompt: () => 'bomb_drop' })))).toBe('turret');   // AD-6: 0x80000 first
    expect(pickContext(actionInputs(sources({ c4: () => true, bombPrompt: () => 'bomb_drop' })))).toBe('c4');
    expect(pickContext(actionInputs(sources({ turret: () => true, bombPrompt: () => 'bomb_drop' })))).toBe('turret');
    expect(pickContext(actionInputs(sources({ traversal: () => true, door: () => true })))).toBe('traversal');
    expect(pickContext(actionInputs(sources()))).toBeNull();
  });

  it('nothing is in reach dead, not walking or locked; mounted, the turret alone (the room refuses a mounted seat every other event)', () => {
    const all = { door: () => true, switch: () => true, c4: () => true, turret: () => true, traversal: () => true, bombPrompt: () => 'bomb' as const };
    expect(pickContext(actionInputs(sources({ ...all, canAct: () => false })))).toBeNull();
    expect(pickContext(actionInputs(sources({ ...all, locked: () => true })))).toBeNull();
    expect(pickContext(actionInputs(sources({ ...all, locked: () => true, mounted: () => true })))).toBe('turret');
    expect(pickContext(actionInputs(sources({ ...all, mounted: () => true })))).toBe('turret');
  });

  it("the HUD's prompt: the context's (contextPrompt), the switch's from its record, the turret's mount or dismount from its page", () => {
    const p = { switch: () => 'button' as const, turret: () => 'turret_dismount' as const };
    expect(actionPromptOf('door', p)).toBe('door');
    expect(actionPromptOf('switch', p)).toBe('button');
    expect(actionPromptOf('turret', p)).toBe('turret_dismount');
    expect(actionPromptOf('c4', p)).toBe('c4');
    expect(actionPromptOf('traversal', p)).toBeNull();
    expect(actionPromptOf(null, p)).toBeNull();
  });

  it('the release fires the context picked then, once; the walk action that follows is told the page took it', () => {
    let now: ActionContext = 'door';
    const log: string[] = [];
    const w = new ActionWiring({ pick: () => now, fire: calls(log), cancel: () => undefined });
    w.press();
    w.release();
    expect(log).toEqual(['door']);
    expect(w.filter()).toBe(true);                                 // the press stays off the command and the moves
    expect(log).toEqual(['door']);                                 // not fired twice
    now = 'traversal';
    w.press();
    w.release();
    expect(w.filter()).toBe(false);                                // the walk's own action: the climb
    now = null;
    w.press();
    w.release();
    expect(w.filter()).toBe(false);                                // nothing in reach: the command's Action press (the respawn's)
  });

  it("HX-OBEY: a one-frame TAP of the action button on the escortee context fires the order once -- press, one hold frame, release; or press and release in the same frame -- as the original fires an action on the release edge (FUN_00594cf0 D:L453194-453243), no hold asked", () => {
    const log: string[] = [];
    const escortee = () => { log.push('escortee'); return true; };
    // The page's inputs as `padFrame` reads them: the hostage under the crosshair (the offer), nothing else in reach.
    const w = new ActionWiring({ pick: () => pickContext(actionInputs(sources({ escortee: () => true }))), fire: { ...calls(log), escortee }, cancel: () => undefined });
    w.press();                                                     // frame N: Cross down (matchActions.ts `lanes`)
    w.hold(1 / 60);
    w.release();                                                   // frame N + 1: Cross up
    expect(log).toEqual(['escortee']);
    expect(w.filter()).toBe(true);                                 // the walk's own action told the page took it
    w.endFrame();
    w.press();                                                     // the same frame: down and up (a tap shorter than a frame the poll still saw)
    w.release();
    expect(log).toEqual(['escortee', 'escortee']);
    // The order is not a hold context: holding Cross does not fire it early and does not change what the release fires.
    w.press();
    for (let i = 0; i < 30; i++) w.hold(1 / 60);
    expect(log).toEqual(['escortee', 'escortee']);
    w.release();
    expect(log).toEqual(['escortee', 'escortee', 'escortee']);
  });

  it("a hold's release fires nothing and is not the walk's (no climb after a plant); a press walked into a site holds it", () => {
    let now: ActionContext = 'bombPlant';
    const log: string[] = [];
    const w = new ActionWiring({ pick: () => now, fire: calls(log), cancel: () => undefined });
    w.press();
    now = 'traversal';
    w.release();
    expect(log).toEqual([]);
    expect(w.filter()).toBe(true);
    now = 'door';
    w.press();
    now = 'bombDefuse';
    w.hold(0.1);
    now = 'door';
    w.hold(0.1);
    w.release();
    expect(log).toEqual([]);
    expect(w.filter()).toBe(true);
  });

  it("a cancel fires nothing, tells the traversal's and the walk's cancel its cause, and the release after it is nothing", () => {
    const log: string[] = [], causes: string[] = [];
    const w = new ActionWiring({ pick: () => 'door', fire: calls(log), cancel: (c) => causes.push(c) });
    w.press();
    w.cancel('touch');
    w.release();
    expect(log).toEqual([]);
    expect(w.filter()).toBe(true);
    expect(causes).toEqual(['touch']);
    expect(w.lifecycle.lastCancel()).toBe('touch');
  });

  it("the loading hold cancels a Cross held into it ('loading'): the release that lands in it is nothing, and the next press and release fire", () => {
    // The integration review of wave 4 (the main merge controller, 2026-10-05): padFrame's loading branch returned before the
    // wiring saw any edge, so a Cross released during the hold left the button "down" and the next real press was lost.
    const log: string[] = [], causes: string[] = [];
    const w = new ActionWiring({ pick: () => 'door', fire: calls(log), cancel: (c) => causes.push(c) });
    const loadingFrame = () => { if (w.lifecycle.down()) w.cancel('loading'); };   // padFrame's loading branch, each frame
    w.press();
    loadingFrame();
    expect(w.lifecycle.down()).toBe(false);
    w.release();                                       // the pad's release edge, unseen by the loading branch, lands after it
    expect(log).toEqual([]);
    loadingFrame();                                    // a later loading frame: the button is up, nothing to cancel
    w.press();
    w.release();
    expect(log).toEqual(['door']);
    expect(causes).toEqual(['loading']);
  });

  it("a bare action (the hook's, no press seen) fires the context now; a resolved edge the walk never asked is dropped at the frame's end", () => {
    let now: ActionContext = 'c4';
    const log: string[] = [];
    const w = new ActionWiring({ pick: () => now, fire: calls(log), cancel: () => undefined });
    expect(w.filter()).toBe(true);
    expect(log).toEqual(['c4']);
    now = 'bombPlant';
    expect(w.filter()).toBe(false);                                // a hold is no bare action's
    now = 'turret';
    w.press();
    w.release();                                                   // mounted: the walk is locked and never asks
    expect(log).toEqual(['c4', 'turret']);
    w.endFrame();
    now = null;
    expect(w.filter()).toBe(false);                                // not the stale edge's answer
  });

  it("the room's events reach every page across connections; a reset is a bare welcome; an old client's are let go", () => {
    const seen: string[] = [];
    const relay = new RoomEvents();
    relay.on((ev) => seen.push(ev.type));
    const listeners = new Set<(ev: ServerEvent) => void>();
    const client = { on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
    relay.follow(client);
    for (const l of listeners) l({ type: 'roundStart' } as ServerEvent);
    relay.follow(null);
    expect(listeners.size).toBe(0);
    relay.reset();
    expect(seen).toEqual(['welcome', 'roundStart', 'welcome', 'welcome']);   // following another (or none) resets first
  });

  it("each command is observed as the walk sends it, before the client's tap (the bomb's ActionHeld prediction and the drop's stick, once a command)", () => {
    const sent: number[] = [], held: boolean[] = [];
    let tap: ((cmd: { buttons: number }, feet: [number, number, number]) => void) | null = null;
    const walk = { setNetTap: (t: typeof tap) => { tap = t; } };
    observeCommands(walk, (cmd) => held.push((cmd.buttons & 0x4) !== 0));
    walk.setNetTap((cmd) => sent.push(cmd.buttons));
    tap!({ buttons: 0x4 }, [0, 0, 0]);
    tap!({ buttons: 0x1 }, [0, 0, 0]);
    expect(held).toEqual([true, false]);
    expect(sent).toEqual([0x4, 0x1]);
    walk.setNetTap(null);
    expect(tap).toBeNull();
  });

  it('the relay re-followed to a second client (a reconnect) hears the second and no longer the first', () => {
    const seen: string[] = [];
    const relay = new RoomEvents();
    relay.on((ev) => seen.push(ev.type));
    const client = () => {
      const ls = new Set<(ev: ServerEvent) => void>();
      return { emit: (ev: ServerEvent) => { for (const l of ls) l(ev); }, on: (l: (ev: ServerEvent) => void) => { ls.add(l); return () => ls.delete(l); } };
    };
    const a = client(), b = client();
    relay.follow(a);
    expect(relay.following()).toBe(a);
    relay.follow(b);
    expect(relay.following()).toBe(b);
    seen.length = 0;
    a.emit({ type: 'roundStart' } as ServerEvent);
    expect(seen).toEqual([]);
    b.emit({ type: 'roundOver' } as ServerEvent);
    expect(seen).toEqual(['roundOver']);
  });

  it("the concrete fire table: door -> doors.action, switch -> actions.action, bombDrop -> the drop's send, c4 -> grenade.plantC4, turret -> turrets.action", () => {
    const log: string[] = [];
    const page = (name: string) => ({ action: () => { log.push(name); return true; } });
    const table = fireTable({
      doors: page('doors'), actions: page('actions'), turrets: page('turrets'),
      grenade: { plantC4: () => { log.push('grenade'); return true; } }, bombDrop: () => { log.push('bombDrop'); return true; },
    });
    for (const c of ['door', 'switch', 'bombDrop', 'c4', 'turret'] as const) fireContext(c, table);
    expect(log).toEqual(['doors', 'actions', 'bombDrop', 'grenade', 'turrets']);
  });

  it("the concrete pick inputs: each context from its own page's answer", () => {
    const answer = (on: string) => pickContext(actionInputs(pageSources({
      walk: { mode: () => 'walk', isDead: () => false, isLocked: () => false },
      doors: { target: () => (on === 'door' ? 1 : null) },
      actions: { target: () => (on === 'switch' ? {} : null) },
      bomb: { prompt: () => (on === 'bomb' ? 'bomb' : on === 'drop' ? 'bomb_drop' : on === 'defuse' ? DEFUSE_PROMPT_ICON_READING : null) },
      grenade: { c4Target: () => (on === 'c4' ? {} : null) },
      turrets: { mounted: () => (on === 'mounted' ? 3 : null), prompt: () => (on === 'turret' || on === 'mounted' ? 'turret_mount' : null) },
      traversal: { hudClimb: () => (on === 'climb' ? { visible: true } : null), traversal: () => (on === 'ladder' ? { state: () => ({ kind: 'ladder' }) } : null) },
    })));
    expect(answer('door')).toBe('door');
    expect(answer('switch')).toBe('switch');
    expect(answer('bomb')).toBe('bombPlant');
    expect(answer('defuse')).toBe('bombDefuse');
    expect(answer('drop')).toBe('bombDrop');
    expect(answer('c4')).toBe('c4');
    expect(answer('turret')).toBe('turret');
    expect(answer('mounted')).toBe('turret');
    expect(answer('climb')).toBe('traversal');
    expect(answer('ladder')).toBe('traversal');
    expect(answer('none')).toBeNull();
  });

  it("the mounted trigger: a round at the press, then one each turret interval while held (the room's fastest mode: FireWait x 0.8 automatic), none released", () => {
    expect(turretInterval({ fireWait: 0.12, fireModes: [3] })).toBeCloseTo(0.096);
    expect(turretInterval({ fireWait: 0.12, fireModes: [1] })).toBeCloseTo(0.12);
    expect(turretInterval(null)).toBeNull();
    const t = new TurretTrigger();
    const shots: boolean[] = [];
    for (let i = 0; i < 14; i++) shots.push(t.frame(1 / 60, true, 0.096));
    // LATER 588 (b): frames 0, 7, 13 -- 3 game frames (0.1001 s, 6.006 page frames) a round; was 0, 6, 12.
    expect(shots.flatMap((x, i) => (x ? [i] : []))).toEqual([0, 7, 13]);
    expect(shots[0]).toBe(true);
    expect(t.frame(1 / 60, false, 0.096)).toBe(false);
    expect(new TurretTrigger().frame(1 / 60, true, null)).toBe(false);   // no record: nothing (the room fires nothing either)
  });
});

/**
 * PAR-24 (research 252 s3): the mounted gun's cadence (`TurretTrigger`) is a timed rule the room bounds (`room.ts` `fire`
 * drops a claim before its interval as 'rate'): fed the frame's real seconds it claims at its interval or once a frame,
 * whichever is slower, and never sooner than the interval in real time; fed the 0.1 s-clamped step, below 10 fps it
 * claims slower than the frames allow.
 */
describe("PAR-24: the turret's cadence counts the frame's real seconds (research 252)", () => {
  /** The real times (s) of the claims a trigger held through `periods` makes at `interval`, each frame fed `fed(real)`. */
  const claims = (periods: readonly number[], interval: number, fed: (real: number) => number): number[] => {
    const trigger = new TurretTrigger(), t = new FrameTime(), out: number[] = [];
    let now = 0;
    t.frame(now);
    for (const ms of periods) {
      now += ms;
      if (trigger.frame(fed(t.frame(now)), true, interval)) out.push(now / 1000);
    }
    return out;
  };
  const gaps = (at: readonly number[]): number[] => at.slice(1).map((x, i) => x - at[i]!);
  const frames = (n: number, ms: number): number[] => Array.from({ length: n }, () => ms);

  it("fed the frame's real seconds (FrameTime), a 0.15 s gun at 5 fps claims every frame (0.2 s apart) and at 60 fps every 5 game frames (LATER 588 (b)), never sooner; fed the clamped step at 5 fps, every other frame (0.4 s apart)", () => {
    const real = (s: number): number => s, clamped = (s: number): number => Math.min(s, 0.1);
    for (const g of gaps(claims(frames(20, 200), 0.15, real))) expect(g).toBeCloseTo(0.2, 9);
    const fast = gaps(claims(frames(120, 1000 / 60), 0.15, real));
    expect(fast.length).toBeGreaterThan(5);
    // LATER 588 (b): the 0.15 s wait is 5 game frames (0.1668 s); a gap within a page frame of them, never sooner over the chain.
    const q = 5 * GAME_FRAME_DT;
    for (const g of fast) { expect(g).toBeGreaterThanOrEqual(q - 1 / 60 - 1e-9); expect(g).toBeLessThanOrEqual(q + 1 / 60 + 1e-9); }
    expect(fast.reduce((a, b) => a + b, 0) / fast.length).toBeGreaterThanOrEqual(q - 1 / 60 / fast.length - 1e-9);
    for (const g of gaps(claims(frames(20, 200), 0.15, clamped))) expect(g).toBeCloseTo(0.4, 9);   // the lane's wiring
  });
});

/**
 * LATER 104 (`TURRET_RELEASE_SEQ_ADAPTATION`; the fold's re-review, research 215 s7.9): while this page's predicted release
 * is on its way -- `held` let go at the press, the room's event a round trip off -- the press is the turret's, as it was
 * before the prediction while `held` stayed set: the picker still picks the turret (`pageSources`' `mounted`), its page
 * keeps the press and sends nothing, and a door or a weapon drop in reach does not take it. Once the room's release lands,
 * the door is picked again. A real `TurretPage`, its own mount keyed on `after` and stepped past its clip; no game data.
 */
describe('LATER 104: the action button during a predicted release (no game data)', () => {
  const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
  const FLOOR: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
  const OWNERS: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const PLACE = {
    id: 0, name: 'synthetic', origin: [0, 13.5, 0], facing: 0, gunOrigin: [0, 13.5, 0], firepointOrigin: [0, 13.5, -9.7],
    limits: { yaw: [(-70 * Math.PI) / 180, (70 * Math.PI) / 180], pitch: [(-45 * Math.PI) / 180, (45 * Math.PI) / 180] },
    mountRange: 22, mountAngleCos: Math.cos((35 * Math.PI) / 180), parts: { turret: 't', gun: 'g', firepoint: 'f' },
  } as unknown as TurretPlacement;
  const AFTER = 40;

  it("the picker keeps the turret through the round trip -- its action keeps the press, nothing sent, the door and the drop in reach untouched -- and picks the door again once the room's release lands", () => {
    let now = 0, seq = AFTER, locked = false, feet: [number, number, number] = [0, 0, 8.5];
    const sent: ClientEvent[] = [], log: string[] = [];
    const page = new TurretPage({
      turrets: () => [PLACE], feet: () => feet, look: () => ({ yaw: 0, pitch: 0 }), setLook: () => undefined,
      setLocked: (on) => { locked = on; }, bodyLook: () => null, move: () => undefined,
      net: () => ({ role: 'player', id: 1, send: (ev) => sent.push(ev), lastSeq: () => seq }),
      clips: () => ({
        clips: [{ name: 'seal_stand2turret', frameCount: 26 }, { name: 'seal_p_stand2turret', frameCount: 26 }, { name: 'seal_turret_poses', frameCount: 3 }],
        table: [['seal_stand2turret', { playback: 0.3 }], ['seal_p_stand2turret', { playback: 0.3 }], ['seal_turret_poses', { playback: 1 }]],
      }),
      now: () => now,
    });
    const w = { state: { x: 0, y: 0, z: 8.5, yaw: 0, vx: 0, vz: 0, pitch: 0 }, grid: groundGrid(packGround(PARAMS, [FLOOR], OWNERS)) };
    page.event({ type: 'turret', id: 0, occupant: 1, ammo: 750, steer: { ticks: 0, after: AFTER } });
    while (seq < AFTER + 75) { page.holdTick(w); seq++; now += 1 / TICK_HZ; }   // past its own clip: the hold
    const doors = { target: () => 1, action: () => { log.push('door'); return true; } };
    const sources = pageSources({
      walk: { mode: () => 'walk', isDead: () => false, isLocked: () => locked }, doors, actions: { target: () => null }, bomb: null,
      grenade: { c4Target: () => null }, turrets: page, traversal: { hudClimb: () => null, traversal: () => null }, drops: { prompt: () => 5 },
    });
    const table = fireTable({
      doors, actions: { action: () => false }, grenade: { plantC4: () => false }, turrets: page, bombDrop: () => false,
      pickup: () => { log.push('pickup'); return true; },
    });
    expect(pickContext(actionInputs(sources)), 'held: the turret').toBe('turret');
    expect(fireContext('turret', table), 'the dismount').toBe(true);
    expect(page.mounted(), 'the release predicted').toBeNull();
    const dismounts = sent.length;
    const during = pickContext(actionInputs(sources));
    expect(during, 'the round trip: still the turret').toBe('turret');
    expect(fireContext(during, table), 'the press kept').toBe(true);
    expect(sent, 'the same dismount re-sent, nothing else').toEqual([...sent.slice(0, dismounts), sent[dismounts - 1]]);
    expect(log, 'the door and the drop untouched').toEqual([]);
    page.event({ type: 'turret', id: 0, occupant: null, ammo: 750 });   // the room's release
    // The picker's own logic again: the freed gun in reach offers its mount first (AD-6's order), and out of its reach the
    // door is picked.
    expect(page.prompt()).toBe('turret_mount');
    expect(pickContext(actionInputs(sources)), "the free turret's mount, as today").toBe('turret');
    feet = [0, 0, 100];
    expect(pickContext(actionInputs(sources)), 'the door again').toBe('door');
  });
});

/**
 * LATER 180 (research 215 s8.3, s8.4): the raise latch on a PKM or LMG TURRET (`FUN_005c0ae0` D:L476423-476438): a pull's
 * first round from a body whose raise reads below 1 waits one game frame; after it the latch falls inside the rate's wait;
 * the bit survives a let-go; not lowered (raised, or the MGL's class 230: the caller's `lowered` false), none.
 */
describe('LATER 180: the turret\'s raise latch (TurretTrigger)', () => {
  it('RED: lowered, the pull\'s first round waits a game frame (today: on the press)', () => {
    const t = new TurretTrigger();
    expect(t.frame(GAME_FRAME_DT, true, 0.096, true)).toBe(false);      // the latch's frame
    expect(t.frame(GAME_FRAME_DT, true, 0.096, true)).toBe(true);       // the next game frame: class 205 exempt
  });
  it('lowered, a held burst keeps its cadence (the latch inside the rate\'s wait)', () => {
    const t = new TurretTrigger(), shots: number[] = [];
    for (let i = 0; i < 13; i++) if (t.frame(1 / 60, true, 0.096, true)) shots.push(i);
    // LATER 588 (b): 3 game frames are 6.006 page frames at 60 fps -- a gap of 6 or 7 (was 6 always).
    for (const g of shots.slice(1).map((s, i) => s - shots[i]!)) expect([6, 7]).toContain(g);
    expect(shots[0]).toBeGreaterThanOrEqual(2);
  });
  it('not lowered: on the press, as before', () => {
    expect(new TurretTrigger().frame(1 / 60, true, 0.096, false)).toBe(true);
  });
  it('the bit survives a let-go before the round: the next pull fires on its press (states 0 and 3 return first)', () => {
    const t = new TurretTrigger();
    expect(t.frame(1 / 60, true, 0.096, true)).toBe(false);
    for (let i = 0; i < 3; i++) t.frame(1 / 60, false, 0.096, true);
    expect(t.frame(1 / 60, true, 0.096, true)).toBe(true);
  });
});

/**
 * LATER 191 (research 215 s8.2): the kit gate's refusal -- the mount clip's bare `NoFire ()` -- comes after the raise latch in
 * `FUN_005c0ae0` (the latch D:L476423-476429, the gate `FUN_005a7de0` D:L476442): through a refused span no round goes and the
 * cadence is not spent, the latch is taken in it, and the first unrefused frame fires at once.
 */
describe("LATER 191: a refused span after the latch (TurretTrigger's `refused`)", () => {
  it('lowered, held through a refused span: the latch is taken in it, no round, and the first unrefused frame fires at once', () => {
    const t = new TurretTrigger();
    expect(t.frame(GAME_FRAME_DT, true, 0.096, true, true)).toBe(false);          // the latch's frame
    for (let i = 0; i < 10; i++) expect(t.frame(GAME_FRAME_DT, true, 0.096, true, true), `refused ${i}`).toBe(false);
    expect(t.frame(GAME_FRAME_DT, true, 0.096, true, false)).toBe(true);          // the span lifts: at once
  });
  it('not lowered: refused frames fire nothing and spend no cadence; the first unrefused frame fires', () => {
    const t = new TurretTrigger();
    for (let i = 0; i < 5; i++) expect(t.frame(1 / 60, true, 0.096, false, true), `refused ${i}`).toBe(false);
    expect(t.frame(1 / 60, true, 0.096, false, false)).toBe(true);
  });
});

/**
 * LATER 220 (research 369 §2; reading, pending review): `FUN_00593500` builds the action offers only past the common gate
 * (D:L452277 -> `FUN_005a7de0`): shut, no door, no switch and no turret is offered -- the first head's contexts; the climb
 * keeps its own rule (the traversal), the rest follow head by head.
 */
describe('LATER 220: the picker behind the prompts\' common gate', () => {
  // The seventh head: the victory dance's offer (0x200000, D:L452376-452377) is built past the gate; the page's input is
  // the room's offer (`victoryOffer`), a round trip behind its own body -- shut, none.
  it('the seventh head: shut, no victory dance offered; open, as before', () => {
    expect(pickContext(actionInputs(sources({ victory: () => true, gateShut: () => true })))).toBeNull();
    expect(pickContext(actionInputs(sources({ victory: () => true, gateShut: () => false })))).toBe('victory');
  });

  it('the sixth head: shut, no bomb drop offered; open, as before', () => {
    expect(pickContext(actionInputs(sources({ bombPrompt: () => 'bomb_drop', gateShut: () => true })))).toBeNull();
    expect(pickContext(actionInputs(sources({ bombPrompt: () => 'bomb_drop', gateShut: () => false })))).toBe('bombDrop');
  });

  it("the fifth head: shut, no hostage order offered; open, as before", () => {
    expect(pickContext(actionInputs(sources({ escortee: () => true, gateShut: () => true })))).toBeNull();
    expect(pickContext(actionInputs(sources({ escortee: () => true, gateShut: () => false })))).toBe('escortee');
  });

  it('the fourth head: shut, no pickup offered; open, as before', () => {
    expect(pickContext(actionInputs(sources({ pickup: () => true, gateShut: () => true })))).toBeNull();
    expect(pickContext(actionInputs(sources({ pickup: () => true, gateShut: () => false })))).toBe('pickup');
  });

  it('the third head: shut, no C4 offered; open, as before', () => {
    expect(pickContext(actionInputs(sources({ c4: () => true, gateShut: () => true })))).toBeNull();
    expect(pickContext(actionInputs(sources({ c4: () => true, gateShut: () => false })))).toBe('c4');
  });

  it("the second head: shut, no plant and no defuse offered; open, each as before", () => {
    for (const [prompt, ctx] of [['bomb', 'bombPlant'], [DEFUSE_PROMPT_ICON_READING, 'bombDefuse']] as const) {
      expect(pickContext(actionInputs(sources({ bombPrompt: () => prompt, gateShut: () => true }))), `${ctx}, shut`).toBeNull();
      expect(pickContext(actionInputs(sources({ bombPrompt: () => prompt, gateShut: () => false }))), `${ctx}, open`).toBe(ctx);
    }
  });

  it('shut: no door, no switch, no turret mount offered; open: each as before', () => {
    let shut = true;
    const on = { door: () => true, switch: () => true, turret: () => true, gateShut: () => shut } as Partial<ActionSources>;
    for (const only of ['door', 'switch', 'turret'] as const) {
      const over: Partial<ActionSources> = { door: () => false, switch: () => false, turret: () => false, gateShut: on.gateShut };
      over[only] = () => true;
      shut = true;
      expect(pickContext(actionInputs(sources(over))), `${only}, shut`).toBeNull();
      shut = false;
      expect(pickContext(actionInputs(sources(over))), `${only}, open`).toBe(only);
    }
  });

  // The review's F3, settled by the last head: the original offers only the ladder's slide and a climb in the air past a
  // shut gate (D:L452278-452307). The traversal's input is the climb's prompt (`climbOffered`: the ground's common gate,
  // the air none) or the ladder, so the picker takes it as it comes, the gate already asked inside it -- the slide and the
  // air's climb under a shut gate offered (the escapes); a ground climb under it never reaches here (traversal.test 'LATER 220').
  it('shut: the traversal (the ladder\'s slide, the air\'s climb) is offered -- the escapes; the ground climb is refused inside its own offer', () => {
    expect(pickContext(actionInputs(sources({ traversal: () => true, gateShut: () => true })))).toBe('traversal');
  });
});

/**
 * LATER 588 (b) (reading, pending review): the mounted gun's wait on the game-frame clock, as LATER 326 put the kit's
 * (`./fire` `update`): the kit's timer `+0x81c` set to the wait at a round and run down a game frame at a time, clamped
 * at 0 (`FUN_005c0fd0` D:L476643-476647; the gate `FUN_005c0ae0` D:L476446-476448), so a round every ceil(wait / frame)
 * game frames (`./accuracy` `fireFrames`, OBF-19) at any page frame rate. Was: run down a browser frame at a time -- the
 * PKM and LMG TURRET (0.096 s, 3 frames: 9.99 a second) at 10.0 at 60 fps and 10.29 at 144.
 */
describe("LATER 588 (b): the turret's cadence on the game-frame clock", () => {
  /** A trigger held `seconds` at `fps` on a gun of `interval` s: its rounds' times (s). */
  const held = (interval: number, fps: number, seconds: number): number[] => {
    const t = new TurretTrigger(), at: number[] = [];
    for (let i = 0; i < Math.round(seconds * fps); i++) if (t.frame(1 / fps, true, interval)) at.push(i / fps);
    return at;
  };
  it.each([
    [0.096, 60], [0.096, 144], [0.096, 30], [1.0, 60], [1.0, 144], [1.0, 30],
  ] as const)('a %s s gun at %s fps: the rounds of the original\'s whole frames, never sooner, at most a page frame later', (interval, fps) => {
    const q = fireFrames(interval, 1) * GAME_FRAME_DT, seconds = 30, at = held(interval, fps, seconds);
    // Round j no sooner than j x q (the press's round at 0), never a page frame after it.
    const bad = at.findIndex((x, j) => !(x >= j * q - 1e-9 && x <= j * q + 1 / fps + 1e-9));
    expect(bad, `round ${bad} at ${at[bad]} against ${bad * q}`).toBe(-1);
    const rate = (at.length - 1) / at.at(-1)!;
    expect(rate).toBeLessThanOrEqual(1 / q + 1e-6);
    expect(rate).toBeGreaterThan(1 / q * 0.99);
  });
});
