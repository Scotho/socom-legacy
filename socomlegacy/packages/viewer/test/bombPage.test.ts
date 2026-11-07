import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseRdr, parseZdb, rdrGet, Zar, zdbEntry, type RdrNode } from '@s2u/archive';
import { gridCast } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { PLACE_CLAYMORE_ANIM } from '@s2u/scene';
import { parseBankFile, soundParams, soundScriptFromArchive } from '@s2u/sound';
import {
  BASE_MARK_SPECTATOR_PLACEHOLDER, BOMB_DROP_PUSH_PASS_READING, BOMB_MODEL_READING, BombPage, bombSound, DEFUSE_PROMPT_ICON_READING, HOLD_BAR_DIRECTION_READING, HOLD_BAR_PLACEMENT_READING,
  ownBombBody, PICKUP_SOUND,
  PLANT_ANIM, PLANT_PUSH_PASS, PLANT_SOUND_READING, type BombHud, type BombPageView,
} from '../src/bombPage';
import { fittingsLibrary } from '../src/body';
import { Hud, type CompassMark } from '../src/hud';
import type { MapAction } from '../src/mapActions';
import { loadGrenadeAssets } from '../src/grenadeAssets';
import { motionTableFromArchive } from '../src/motionTable';
import { HOLD_TICKS, type BombWire } from '../src/net/objective';
import { restsOn } from '../src/net/placing';
import { ThrowPose } from '../src/throwPose';
import type { MotionEntry } from '../src/motionTable';
import type { MotionClip } from '@s2u/scene';
import { simMapFromBytes } from '../src/sim';
import { bodyHoldBits, bodyHoldOf, TICK_HZ, type ServerEvent, type Team } from '../src/net/protocol';

/**
 * XR-05 (research 214 s1-s2): the page's bomb follows the room -- the welcome's `objective`, then every `bomb` event --
 * and predicts its own 5 s hold from the Action-held commands it sends, by the room's rule (`net/objective` `holdKind`),
 * so its prompt and progress need no round trip; the defuse timer counts the fuse's tick against the server's clock.
 */

function tent(node: string, at: [number, number, number]): MapAction {
  return {
    node, type: 'MPBOMB', typeCode: 4, valve: '', anims: ['BombPlace'], team: null, range: 15, elevation: 15, points: 0,
    bitmap: 'action_mp_bomb.tif', path: `worldmodel/${node}`, at,
  };
}

/**
 * PLANT-AIM: the action button's pick for a headless page -- the tent's patch (60 x 60 about each tent below) struck under
 * the feet, as a look down at the patch there would strike it; else none. Stands in for the walk's look (`BombPageDeps.pick`).
 */
function patchUnder(feet: readonly number[] | null): { path: string; point: [number, number, number] } | null {
  if (!feet) return null;
  for (const [node, x] of [['terrorist_tent', 300], ['seal_tent', -300]] as const) {
    if (Math.abs(feet[0]! - x) <= 30 && Math.abs(feet[2]! - 300) <= 30) return { path: `worldmodel/${node}`, point: [feet[0]!, feet[1]!, feet[2]!] };
  }
  return null;
}

describe('the page\'s bomb (XR-05; research 214)', () => {
  // LATER 220's second head, its review's F1 (research 369 §2; research 214, D:L74302-74307, D:L74429): the hold's bar
  // needs the bomb's prompt heading the list, built past the prompts' common gate -- under it no prompt, no bar: a held
  // Action under a shut gate (a reload, a swap) counts nothing, and the hold begins from 0 when the gate opens, as the
  // room counts it (`match/src/bomb.ts` `command`, `BombActor.gateShut`). Was: the bar filled from the press.
  it("LATER 220: a held Action under the prompts' common gate fills no bar; the gate open, the hold begins from 0", () => {
    const listeners = new Set<(ev: ServerEvent) => void>();
    const client = { on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
    const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
    const me = { tick: 1000, shut: true };
    const page = new BombPage(client, {
      id: () => 2, team: () => 'seal', alive: () => true, feet: () => [310, 0, 300],
      actions: () => [tent('terrorist_tent', [300, 0, 300]), tent('seal_tent', [-300, 0, 300])],
      look: () => ({ forward: 0, right: 0, pitch: 0 }), serverTick: () => me.tick, gateShut: () => me.shut,
      pick: () => patchUnder([310, 0, 300]),
    });
    const ground: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
    emit({
      type: 'welcome', id: 2, version: 11, map: 'MP72', tick: 990, role: 'player', team: 'seal', queue: 0, name: 'S', players: [],
      rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 1, states: [] }, epoch: 1, startTick: 900, objective: ground,
    });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 2, pickupAfterTick: 0 });
    for (let i = 0; i < 60; i++) { me.tick++; page.tick(true); }
    expect(page.holdProgress(), 'shut: no hold').toBeNull();
    expect(page.holdBar()).toBeNull();
    me.shut = false;
    me.tick++; page.tick(true);
    expect(page.holdProgress(), 'open: the first tick').toBeCloseTo(1 / 300, 9);
  });

  it('follows the welcome\'s objective and each bomb event; predicts its own hold from ActionHeld ticks at the site and resets on a release; shows the defuse timer from detonateTick against the server tick', () => {
    const listeners = new Set<(ev: ServerEvent) => void>();
    const client = { on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
    const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
    const me = { id: 2, team: 'seal' as Team, alive: true, feet: [0, 0, 0] as [number, number, number], pitch: 0, forward: 0, tick: 1000 };
    const page = new BombPage(client, {
      id: () => me.id, team: () => me.team, alive: () => me.alive, feet: () => me.feet,
      actions: () => [tent('terrorist_tent', [300, 0, 300]), tent('seal_tent', [-300, 0, 300])],
      look: () => ({ forward: me.forward, right: 0, pitch: me.pitch }), serverTick: () => me.tick,
      pick: () => patchUnder(me.feet),
    });
    expect(page.state()).toBeNull();
    const ground: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
    emit({
      type: 'welcome', id: 2, version: 11, map: 'MP72', tick: 990, role: 'player', team: 'seal', queue: 0, name: 'S', players: [],
      rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 1, states: [] }, epoch: 1, startTick: 900, objective: ground,
    });
    expect(page.state()).toEqual(ground);
    expect(page.prompt()).toBeNull();
    // Carried by this page's player: the drop's prompt when still and aiming down after the cooldown.
    emit({ type: 'bomb', ...ground, state: 2, carrier: 2, pickupAfterTick: 1100 });
    expect(page.state()).toMatchObject({ state: 2, carrier: 2 });
    me.pitch = -20;
    expect(page.prompt()).toBeNull();                                         // the cooldown runs to 1100
    me.tick = 1100;
    expect(page.prompt()).toBe('bomb_drop');
    me.forward = 1;
    expect(page.prompt()).toBeNull();
    me.forward = 0; me.pitch = 0;
    // At the SEALs' site (terrorist_tent): the bomb's prompt, and the hold predicted from the page's own held commands.
    me.feet = [310, 0, 300];
    expect(page.prompt()).toBe('bomb');
    expect(page.holdProgress()).toBeNull();
    for (let i = 0; i < 150; i++) { me.tick++; page.tick(true); }               // PAR-34: a room tick a command (60 fps)
    expect(page.holdProgress()).toBeCloseTo(0.5, 9);
    page.tick(false);                                                         // a release: back to 0
    expect(page.holdProgress()).toBeNull();
    for (let i = 0; i < 299; i++) { me.tick++; page.tick(true); }
    expect(page.holdProgress()).toBeCloseTo(299 / 300, 9);
    me.tick++; page.tick(true);
    expect(page.holdProgress()).toBe(1);
    me.feet = [-290, 0, 300];                                                 // the own tent: no hold counts
    page.tick(true);
    expect(page.holdProgress()).toBeNull();
    expect(page.prompt()).toBe(null);
    // Planted: the defuse timer from the fuse's tick against the server's; the other side's prompt within reach.
    emit({ type: 'bomb', ...ground, state: 3, pos: [310, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 1100 + 30 * TICK_HZ, pickupAfterTick: 1100 });
    me.tick = 1100 + 12 * TICK_HZ;
    expect(page.defuseTimer()).toBeCloseTo(18, 9);
    me.feet = [312, 0, 300];
    expect(page.prompt()).toBeNull();                                         // the planting side: no defuse
    me.team = 'terrorist'; me.id = 1;
    expect(page.prompt()).toBe(DEFUSE_PROMPT_ICON_READING);
    page.tick(true);
    expect(page.holdProgress()).toBeCloseTo(1 / 300, 9);
    me.tick = 1100 + 31 * TICK_HZ;
    expect(page.defuseTimer()).toBe(0);
    emit({ type: 'bomb', ...ground, state: 4, pos: [310, 0, 300], planter: 2, plantingTeam: 'seal', defuser: 1, detonateTick: 1100 + 30 * TICK_HZ, pickupAfterTick: 1100 });
    expect(page.defuseTimer()).toBeNull();
    expect(page.prompt()).toBeNull();
    page.tick(true);
    expect(page.holdProgress()).toBeNull();
    // A welcome without the bomb (another map) clears it.
    emit({
      type: 'welcome', id: 1, version: 11, map: 'MP2', tick: 0, role: 'player', team: 'terrorist', queue: 0, name: 'T', players: [],
      rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 0, states: [] }, epoch: 0,
    });
    expect(page.state()).toBeNull();
    expect(page.defuseTimer()).toBeNull();
  });

  it("PLANT-AIM: the plant on the action button's pick, measured from the firepoint; the pick named to the room when it changes while carrying, none once it stops", () => {
    const listeners = new Set<(ev: ServerEvent) => void>();
    const client = { on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
    const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
    const me = { feet: [340, 0, 300] as [number, number, number], pick: null as { path: string; point: [number, number, number] } | null, tick: 1000 };
    const named: ({ surface: { path: string; point: [number, number, number] } } | null)[] = [];
    const page = new BombPage(client, {
      id: () => 2, team: () => 'seal', alive: () => true, feet: () => me.feet,
      actions: () => [tent('terrorist_tent', [300, 0, 300]), tent('seal_tent', [-300, 0, 300])],
      look: () => ({ forward: 0, right: 0, pitch: 0 }), serverTick: () => me.tick,
      pick: () => me.pick, body: () => ({ yaw: 90, posture: 'stand' }), aim: (c) => { named.push(c); },
    });
    const ground: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
    emit({
      type: 'welcome', id: 2, version: 11, map: 'MP72', tick: 990, role: 'player', team: 'seal', queue: 0, name: 'S', players: [],
      rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 1, states: [] }, epoch: 1, startTick: 900, objective: ground,
    });
    // Not carrying: the pick is not read, nothing named.
    me.pick = { path: 'worldmodel/terrorist_tent', point: [326, 0, 300] };
    page.tick(false);
    expect(named).toEqual([]);
    emit({ type: 'bomb', ...ground, state: 2, carrier: 2, pickupAfterTick: 0 });
    // 40 u from the node, facing -x (yaw 90): the look strikes the patch 14 u ahead, 5.4 from the standing firepoint.
    expect(page.prompt()).toBe('bomb');
    page.tick(true);
    expect(page.holdProgress()).toBeCloseTo(1 / 300, 9);
    expect(named).toEqual([{ surface: { path: 'worldmodel/terrorist_tent', point: [326, 0, 300] } }]);
    page.tick(true);
    expect(named).toHaveLength(1);                                            // unchanged: named once
    // The look off the patch: the hold back to 0, none named.
    me.pick = { path: 'worldmodel/floor', point: [355, 0, 300] };
    page.tick(true);
    expect(page.holdProgress()).toBeNull();
    expect(named.at(-1)).toBeNull();
    // A pick on the patch out of reach of the firepoint (here 21 u from it): no plant, nothing named.
    me.pick = { path: 'worldmodel/terrorist_tent', point: [310, 0, 300] };
    expect(page.prompt()).toBeNull();
    page.tick(true);
    expect(named).toHaveLength(2);
  });

  it("PLANT-AIM's review F3: a look drifting over the patch names its pick when the polygon changes, else at most once each 6 ticks and only past 4 u -- never one a frame", () => {
    const listeners = new Set<(ev: ServerEvent) => void>();
    const client = { on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
    const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
    const me = { feet: [340, 0, 300] as [number, number, number], pick: null as { path: string; point: [number, number, number] } | null, tick: 1000 };
    const named: ({ surface: { path: string; point: [number, number, number] } } | null)[] = [];
    const page = new BombPage(client, {
      id: () => 2, team: () => 'seal', alive: () => true, feet: () => me.feet,
      actions: () => [tent('terrorist_tent', [300, 0, 300]), tent('seal_tent', [-300, 0, 300])],
      look: () => ({ forward: 0, right: 0, pitch: 0 }), serverTick: () => me.tick,
      pick: () => me.pick, body: () => ({ yaw: 90, posture: 'stand' }), aim: (c) => { named.push(c); },
    });
    const ground: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
    emit({
      type: 'welcome', id: 2, version: 11, map: 'MP72', tick: 990, role: 'player', team: 'seal', queue: 0, name: 'S', players: [],
      rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 1, states: [] }, epoch: 1, startTick: 900, objective: ground,
    });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 2, pickupAfterTick: 0 });
    // 120 frames, one command each, the look sliding 0.1 u a frame over the patch: 12 u in all.
    for (let i = 0; i < 120; i++) {
      me.tick++;
      me.pick = { path: 'worldmodel/terrorist_tent', point: [326 + i * 0.1, 0, 300] };
      page.tick(true);
    }
    expect(named[0]).toEqual({ surface: { path: 'worldmodel/terrorist_tent', point: [326, 0, 300] } });   // the first at once
    expect(named.length).toBeLessThanOrEqual(4);                              // 12 u at 4 u a resend, not 120
    expect(page.holdProgress()).toBeCloseTo(120 / 300, 9);                    // the prediction unbroken
    // The polygon changes (off the patch): named at once, whatever the clock.
    const before = named.length;
    me.pick = { path: 'worldmodel/floor', point: [345, 0, 300] };
    page.tick(true);
    expect(named.length).toBe(before + 1);
    expect(named.at(-1)).toBeNull();
  });

  it("LATER 145 (the review's F1): a page that joins or reconnects in a decided hold cues a pickup, never a plant -- switch_timer stopped by the elimination", () => {
    const log: string[] = [];
    const view: BombPageView = { roundAudio: { bomb: (kind) => { log.push(`cue ${kind}`); } } };
    const { emit, ground } = harness(view, { 3: 'terrorist', 4: 'seal' });
    emit(welcome({ objective: ground, phase: 'decided' }));                   // a joiner (or a reconnect) inside the hold
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', detonateTick: 1000 + 30 * TICK_HZ });
    expect(log).toEqual(['cue pickup']);
    // The same for a page in play when the round was decided; the next round's roundStart cues its plant again.
    log.length = 0;
    emit({ type: 'roundStart', round: 2, seconds: 300, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 2000 });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    emit({ type: 'eliminated', winner: 'seal' });
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', detonateTick: 3000 + 30 * TICK_HZ });
    expect(log).toEqual(['cue pickup']);
    log.length = 0;
    emit({ type: 'roundStart', round: 3, seconds: 300, wins: { seal: 2, terrorist: 0 }, rounds: 11, epoch: 3, startTick: 4000 });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', detonateTick: 5000 + 30 * TICK_HZ });
    expect(log).toEqual(['cue pickup', 'cue planted']);
  });

  it("LATER 150: after a time-out the plant reaches the round audio (MP61 / MP62's time-out leaves switch_timer running; the cues decide); after an elimination or a decided welcome it does not", () => {
    const log: string[] = [];
    const view: BombPageView = { roundAudio: { bomb: (kind) => { log.push(`cue ${kind}`); } } };
    const { emit, ground } = harness(view, { 3: 'terrorist', 4: 'seal' });
    emit(welcome({ objective: ground }));
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    emit({ type: 'timedOut', winner: 'terrorist' });
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', detonateTick: 1000 + 30 * TICK_HZ });
    emit({ type: 'bomb', ...ground, state: 4, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', defuser: 3, detonateTick: 1000 + 30 * TICK_HZ });
    expect(log).toEqual(['cue pickup', 'cue planted', 'cue defused']);
    // An elimination's hold: the plant's cue goes quiet (LATER 145), as for a welcome in `decided` (its reason unknown:
    // an elimination's taken).
    log.length = 0;
    emit({ type: 'roundStart', round: 2, seconds: 300, wins: { seal: 0, terrorist: 1 }, rounds: 11, epoch: 2, startTick: 2000 });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    emit({ type: 'eliminated', winner: 'seal' });
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', detonateTick: 3000 + 30 * TICK_HZ });
    expect(log).toEqual(['cue pickup']);
    // A time-out after an elimination changes nothing: the first decision is the round's.
    log.length = 0;
    emit({ type: 'roundStart', round: 3, seconds: 300, wins: { seal: 1, terrorist: 1 }, rounds: 11, epoch: 3, startTick: 4000 });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    emit({ type: 'eliminated', winner: 'seal' });
    emit({ type: 'timedOut', winner: 'terrorist' });
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', detonateTick: 5000 + 30 * TICK_HZ });
    expect(log).toEqual(['cue pickup']);
  });

  /**
   * LATER 155 (reading, pending review): the welcome names what decided the round (`decided`, additive): a time-out's hold
   * is the plant's to post (MP61's and MP62's leave `switch_timer` running; the round audio's cues decide), an
   * elimination's or a bomb's is not; an older room's welcome names none and an elimination's is taken, as before.
   */
  it("LATER 155: a welcome into a time-out's decided hold (decided.reason 'timeout') reaches the round audio with the plant; an elimination's, a bomb's or none does not", () => {
    const planted = (decided: unknown): string[] => {
      const log: string[] = [];
      const view: BombPageView = { roundAudio: { bomb: (kind) => { log.push(`cue ${kind}`); } } };
      const { emit, ground } = harness(view, { 3: 'terrorist', 4: 'seal' });
      emit(welcome({ objective: ground, phase: 'decided', ...(decided !== undefined ? { decided } : {}) } as never));
      emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
      emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 4, plantingTeam: 'seal', detonateTick: 1000 + 30 * TICK_HZ });
      return log;
    };
    expect(planted({ winner: 'terrorist', reason: 'timeout' }), 'a time-out').toEqual(['cue pickup', 'cue planted']);
    expect(planted({ winner: 'seal', reason: 'elimination' }), 'an elimination').toEqual(['cue pickup']);
    expect(planted({ winner: 'seal', reason: 'bomb' }), "a bomb's result").toEqual(['cue pickup']);
    expect(planted(undefined), "an older room's (none)").toEqual(['cue pickup']);
  });

  it("LATER 145: the page's hold prediction and prompt run on through a decided hold (the room's bomb is live there); they stop at the round's end", () => {
    const { emit, page, me, ground } = harness();
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    me.feet = [310, 0, 300];                                                   // the carrier at the SEALs' site
    expect(page.prompt()).toBe('bomb');
    page.tick(true);
    expect(page.holdProgress()).toBeCloseTo(1 / 300, 9);
    // An elimination decides the round: the bomb stays live through its hold (LATER 145), the hold and the prompt with it.
    emit({ type: 'eliminated', winner: 'seal' });
    expect(page.inPlay()).toBe(true);
    expect(page.prompt()).toBe('bomb');
    me.tick++; page.tick(true);                                                // a room tick later (PAR-34: room ticks counted)
    expect(page.holdProgress()).toBeCloseTo(2 / 300, 9);
    emit({ type: 'timedOut', winner: 'seal' });
    expect(page.inPlay()).toBe(true);
    // A welcome into a decided hold: live too.
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 }, phase: 'decided' }));
    expect(page.inPlay()).toBe(true);
    emit({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [] });
    expect(page.inPlay()).toBe(false);
    expect(page.prompt()).toBeNull();
    // The next round: in play again from its roundStart.
    emit({ type: 'roundStart', round: 2, seconds: 300, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 2000 });
    expect(page.inPlay()).toBe(true);
    expect(page.prompt()).toBe('bomb');
    page.tick(true);
    expect(page.holdProgress()).toBeCloseTo(1 / 300, 9);
    // The bomb's own result decides it too; the round over, abandoned, or a welcome before any round: not in play.
    emit({ type: 'bomb', ...ground, state: 4, pos: [310, 0, 300], plantingTeam: 'terrorist', defuser: 2, detonateTick: 3000 });
    expect(page.inPlay()).toBe(false);
    emit({ type: 'roundStart', round: 3, seconds: 300, wins: { seal: 2, terrorist: 0 }, rounds: 11, epoch: 3, startTick: 4000 });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 2 });
    expect(page.prompt()).toBe('bomb');
    emit({ type: 'roundOver', round: 3, winner: null, wins: { seal: 2, terrorist: 0 }, matchOver: false, screens: [] });
    expect(page.prompt()).toBeNull();
    emit({ type: 'roundStart', round: 4, seconds: 300, wins: { seal: 2, terrorist: 0 }, rounds: 11, epoch: 4, startTick: 5000 });
    emit({ type: 'abandoned' });
    expect(page.prompt()).toBeNull();
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 }, startTick: undefined, waiting: true }));
    expect(page.inPlay()).toBe(false);
    expect(page.prompt()).toBeNull();
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    expect(page.prompt()).toBe('bomb');
    // A late joiner after the round is decided or over (the welcome carries `startTick` in every phase but `waiting`):
    // the bomb's result in its objective, or the room's first score with no clock (expired, over), puts nothing in play.
    emit(welcome({ objective: { ...ground, state: 5, pos: [310, 0, 300], plantingTeam: 'seal', detonateTick: 3000 } }));
    expect(page.inPlay()).toBe(false);
    expect(page.prompt()).toBeNull();
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    emit({ type: 'score', rows: [], timeLeft: null, spectators: [], wins: { seal: 3, terrorist: 2 } });
    expect(page.inPlay()).toBe(false);
    expect(page.prompt()).toBeNull();
    page.tick(true);
    expect(page.holdProgress()).toBeNull();
    // A score with the clock running leaves the round as it was.
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    emit({ type: 'score', rows: [], timeLeft: 120, spectators: [], wins: { seal: 3, terrorist: 2 } });
    expect(page.inPlay()).toBe(true);
    // ONL-18b: the welcome's `phase` (the room's state) decides a joiner's round: the load hold, the expired play-on and
    // the round screens are not live; `play` is, the bomb undecided -- and since LATER 145 a decided hold is too (the
    // LATER 145 case above).
    for (const phase of ['loading', 'expired', 'over', 'waiting'] as const) {
      emit(welcome({ objective: { ...ground, state: 2, carrier: 2 }, phase }));
      expect(page.inPlay(), phase).toBe(false);
      expect(page.prompt(), phase).toBeNull();
      emit({ type: 'score', rows: [], timeLeft: 120, spectators: [], wins: { seal: 3, terrorist: 2 } });
      expect(page.inPlay(), `${phase}, then a score`).toBe(false);
    }
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 }, phase: 'play' }));
    expect(page.inPlay()).toBe(true);
    emit(welcome({ objective: { ...ground, state: 5, pos: [310, 0, 300], plantingTeam: 'seal', detonateTick: 3000 }, phase: 'play' }));
    expect(page.inPlay()).toBe(false);
  });

  // OT.R99 (the owner, 2026-11-02, amended to match the original): the carried bomb is marked on nobody's compass --
  // neither side's, team mates included. The pickup frees the viewer's BOMB_GROUND mark (FUN_002c1c30 state 2,
  // D:L163950-163955 -> FUN_005bbf10 D:L473680-473685) and makes only ALL_YOUR_BASE (D:L473693-473701); the one type-1
  // (ret_bomb) mark is made on the ground (FUN_0059dab0 D:L457516-457526). The ground states are unchanged.
  it("OT.R99: a carrier's ret_bomb is drawn for no viewer -- not the other side, not his team mates, not a side-less watcher; the bomb on the ground is drawn for both sides", () => {
    const marks: CompassMark[][] = [];
    const hud: BombHud = {
      setExtraMarks: (m) => { marks.push(m.map((x) => ({ ...x }))); },
      setDefuseTimer: () => {}, setHoldBar: () => {}, postMessage: () => {},
    };
    const { emit, page, me, ground } = harness({ hud }, { 3: 'terrorist', 4: 'seal' });
    emit(welcome({ objective: ground }));
    me.bodies[3] = [10, 0, 20];
    me.bodies[4] = [50, 0, 60];
    const bitmaps = (): string[] => (marks.at(-1) ?? []).map((m) => m.bitmap);
    // A SEAL (4) carries: no ret_bomb for anyone; both sides see only the base his side must reach (BOMB-MARKS: type 2
    // for his side, type 3 for the other).
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    me.team = 'seal';
    page.hudFrame();
    expect(bitmaps()).not.toContain('ret_bomb.tif');
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 2, pulse: true }]);
    me.team = 'terrorist';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 3, pulse: true }]);
    // A Terrorist (3) carries: the same, the sides swapped.
    emit({ type: 'bomb', ...ground, state: 2, carrier: 3 });
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: -300, z: 300, type: 2, pulse: true }]);
    me.team = 'seal';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: -300, z: 300, type: 3, pulse: true }]);
    // A viewer with no side (a watcher's page): no ret_bomb on the carrier either.
    me.team = null as unknown as Team;
    page.hudFrame();
    expect(marks.at(-1)).toEqual([]);
    // The ground bomb is unchanged: both sides see it where it lies.
    emit({ type: 'bomb', ...ground, state: 1, pos: [70, 0, 80] });
    me.team = 'seal';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_bomb.tif', x: 70, z: 80 }]);
    me.team = 'terrorist';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_bomb.tif', x: 70, z: 80 }]);
  });

  // BOMB-MARKS (the owner, seat b6, 2026-11-06; research 214 s3 "The base mark for both sides"; reading, pending
  // review): the pickup gives every console's viewer an ALL_YOUR_BASE mark at the base the CARRIER's side must reach
  // (FUN_005bbf10 D:L473686-473701; the base chosen by FUN_002c30b0 as the plant check FUN_00594480 D:L452753-452760
  // chooses it): type 2 when the viewer's +200 mask meets the carrier's, else type 3 (D:L473696-473699). Types 1-13
  // pulse (FUN_00211510 D:L68125-68130). A side-less watcher: BASE_MARK_SPECTATOR_PLACEHOLDER, none.
  it("BOMB-MARKS: while carried both sides see ret_base at the carrier's side's site -- type 2 for his side, type 3 for the other, pulsing; a side-less watcher none; a drop takes it away", () => {
    const marks: CompassMark[][] = [];
    const hud: BombHud = {
      setExtraMarks: (m) => { marks.push(m.map((x) => ({ ...x }))); },
      setDefuseTimer: () => {}, setHoldBar: () => {}, postMessage: () => {},
    };
    const { emit, page, me, ground } = harness({ hud }, { 3: 'terrorist', 4: 'seal' });
    emit(welcome({ objective: ground }));
    // A SEAL (4) carries: the SEALs' site is terrorist_tent (300, 300), for both sides.
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    me.team = 'seal';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 2, pulse: true }]);
    me.team = 'terrorist';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 3, pulse: true }]);
    // A Terrorist (3) carries: the Terrorists' site is seal_tent (-300, 300), for both sides.
    emit({ type: 'bomb', ...ground, state: 2, carrier: 3 });
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: -300, z: 300, type: 2, pulse: true }]);
    me.team = 'seal';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: -300, z: 300, type: 3, pulse: true }]);
    // This page's own player carries: his own side's mark.
    emit({ type: 'bomb', ...ground, state: 2, carrier: 2 });
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 2, pulse: true }]);
    // A viewer with no side: none (the port's default, BASE_MARK_SPECTATOR_PLACEHOLDER).
    expect(BASE_MARK_SPECTATOR_PLACEHOLDER).toBe('none');
    me.team = null as unknown as Team;
    page.hudFrame();
    expect(marks.at(-1)).toEqual([]);
    // Dropped: the base mark goes for everyone (FUN_0059dab0 D:L457531-457532); the bomb where it lies.
    me.team = 'terrorist';
    emit({ type: 'bomb', ...ground, state: 1, pos: [50, 0, 60] });
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_bomb.tif', x: 50, z: 60 }]);
  });

  // BOMB-MARKS (research 87 s12, 214 s3 "The scoreboard's satchel"): the board's satchel is the row of the player who
  // holds item 0x9a (FUN_0022a290 D:L79026) -- the carrier, in the carried state only; every viewer sees it (OT.R109 as amended).
  it("BOMB-MARKS: hudFrame hands the scoreboard the carrier's id while carried, null otherwise", () => {
    const carriers: (number | null)[] = [];
    const hud: BombHud = {
      setExtraMarks: () => {}, setDefuseTimer: () => {}, setHoldBar: () => {}, postMessage: () => {},
      setBombCarrier: (id) => { carriers.push(id); },
    };
    const { emit, page, ground } = harness({ hud }, { 3: 'terrorist', 4: 'seal' });
    emit(welcome({ objective: ground }));
    page.hudFrame();
    emit({ type: 'bomb', ...ground, state: 2, carrier: 3 });
    page.hudFrame();
    emit({ type: 'bomb', ...ground, state: 2, carrier: 2 });
    page.hudFrame();
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 5000 });
    page.hudFrame();
    expect(carriers).toEqual([null, 3, 2, null]);
    // The real Hud takes it.
    const real = new Hud();
    page.hudFrame(real);
    expect(real.state().model.bombCarrier).toBeNull();
  });

  it("the carrier's body shows its Satchel and the others' not; the world bomb is drawn on the ground and planted, never while carried; state 5 plays base_explosion1 at the bomb", () => {
    const log: string[] = [];
    const marks: CompassMark[][] = [];
    const timers: (number | null)[] = [];
    const hud: BombHud = {
      setExtraMarks: (m) => { marks.push(m.map((x) => ({ ...x }))); },
      setDefuseTimer: (s) => { timers.push(s); },
      setHoldBar: () => {},
      postMessage: (text, scale) => { log.push(`post ${text} ${scale}`); },
    };
    const view: BombPageView = {
      hud,
      remotePlayers: { setGearVisible: (id, name, on) => { log.push(`gear ${id} ${name} ${on}`); } },
      worldBomb: { place: (pos) => { log.push(`bomb ${pos ? pos.join(',') : 'off'}`); } },
      effects: { play: (name, place) => { log.push(`effect ${name} ${place.position!.join(',')}`); return true; } },
      roundAudio: { bomb: (kind, owner, team, post) => { log.push(`cue ${kind} ${owner} ${team}`); post?.('LINE', 0.7); } },
    };
    const { emit, page, me, ground } = harness(view, { 3: 'terrorist', 4: 'seal' });
    // A late joiner: the bomb as it lies, drawn; no cue, no effect (JOIN_SILENT_READING).
    emit(welcome({ objective: ground }));
    expect(log).toEqual(['bomb 0,0,0']);
    log.length = 0;
    // Another SEAL picks it up: his satchel shows, the world bomb goes; the script's pickup cue by the carrier's side.
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    expect(log).toEqual(['gear 4 Satchel true', 'bomb off', 'cue pickup seal seal', 'post LINE 0.7']);
    log.length = 0;
    // The compass: no ret_bomb on the carrier (OT.R99), ret_base at the SEALs' target (terrorist_tent) for his side.
    me.bodies[4] = [50, 0, 60];
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 2, pulse: true }]);
    expect(timers.at(-1)).toBeNull();
    // A Terrorist: no ret_bomb on the carrier (OT.R99); the SEALs' base in type 3 (BOMB-MARKS).
    me.team = 'terrorist';
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 3, pulse: true }]);
    me.team = 'seal';
    // Dropped where he stood: his satchel off, the bomb on the ground; the drop's cue.
    emit({ type: 'bomb', ...ground, state: 1, pos: [50, 0, 60], pickupAfterTick: 1240 });
    expect(log).toEqual(['gear 4 Satchel false', 'bomb 50,0,60', 'cue drop seal seal', 'post LINE 0.7']);
    log.length = 0;
    // This page's player picks it up: its own satchel (the body the others draw); its own compass shows no bomb mark.
    emit({ type: 'bomb', ...ground, state: 2, pos: [50, 0, 60], carrier: 2 });
    expect(log).toEqual(['gear 2 Satchel true', 'bomb off', 'cue pickup seal seal', 'post LINE 0.7']);
    log.length = 0;
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_base.tif', x: 300, z: 300, type: 2, pulse: true }]);
    // Planted: the satchel off, the bomb drawn where it was set; the plant's cue by the planting side; the fuse on the HUD.
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 1000 + 30 * TICK_HZ });
    expect(log).toEqual(['gear 2 Satchel false', 'bomb 305,0,300', 'cue planted seal seal', 'post LINE 0.7']);
    log.length = 0;
    me.tick = 1000 + 10 * TICK_HZ;
    page.hudFrame();
    expect(marks.at(-1)).toEqual([{ bitmap: 'ret_bomb.tif', x: 305, z: 300 }]);
    expect(timers.at(-1)).toBeCloseTo(20, 9);
    // The fuse's end: base_explosion1 at the bomb, the bomb gone (FUN_002c1c30 hides its node), the detonation's cue.
    emit({ type: 'bomb', ...ground, state: 5, pos: [305, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 1000 + 30 * TICK_HZ });
    expect(log).toEqual(['effect base_explosion1 305,0,300', 'bomb off', 'cue detonated seal seal', 'post LINE 0.7']);
    log.length = 0;
    page.hudFrame();
    expect(marks.at(-1)).toEqual([]);
    expect(timers.at(-1)).toBeNull();
    // A defuse (the next round): the defuser's side's cue; the bomb stays where it was set (no read hides it on a defuse).
    emit({ type: 'roundStart', round: 2, seconds: 300, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 3000 });
    emit({ type: 'bomb', ...ground, state: 1, pos: [0, 0, 0] });
    expect(log).toEqual(['bomb 0,0,0']);                                     // a round's reset: no drop cue
    log.length = 0;
    emit({ type: 'bomb', ...ground, state: 3, pos: [-300, 0, 300], planter: 3, plantingTeam: 'terrorist', detonateTick: 9000 });
    emit({ type: 'bomb', ...ground, state: 4, pos: [-300, 0, 300], planter: 3, plantingTeam: 'terrorist', defuser: 2, detonateTick: 9000 });
    expect(log).toEqual(['bomb -300,0,300', 'cue planted terrorist seal', 'post LINE 0.7', 'bomb -300,0,300', 'cue defused seal seal', 'post LINE 0.7']);
    log.length = 0;
    // A session takeover (`BombAuthority.rekey`): the same carried bomb under the new id -- the satchel moves to it, and no
    // pickup cue plays nor line is posted (`bomb_pickup` fires on entering mp_bomb == 2 only).
    emit({ type: 'roundStart', round: 3, seconds: 300, wins: { seal: 1, terrorist: 1 }, rounds: 11, epoch: 3, startTick: 9500 });
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
    log.length = 0;
    emit({ type: 'bomb', ...ground, state: 2, carrier: 7 });
    expect(log).toEqual(['gear 4 Satchel false', 'gear 7 Satchel true', 'bomb off']);
    log.length = 0;
    // A joiner after the detonation sees no blast.
    emit(welcome({ objective: { ...ground, state: 5, pos: [305, 0, 300], plantingTeam: 'seal' } }));
    expect(log).toEqual(['gear 7 Satchel false', 'bomb off']);                 // the last carrier's satchel off too
    // The world bomb's model: item 154 (MPBOMB) has no ModelName in zweapon.rdr; the game hangs FLIB's `Satchel` at the
    // bomb's point (`FUN_0059dab0` D:L457497-457506, the strings at 0x65f0f8 and 0x65f100) and names the node `MPFootBomb`.
    expect(BOMB_MODEL_READING).toEqual({ item: 154, model: 'Satchel', node: 'MPFootBomb' });
  });
});

/**
 * PB-8 (issue #120; research 214 s3 and s6; PB2.R2, PB2.R3): the hold bar on the HUD, for the plant and the defuse alike.
 * The original draws it from the kit's one hold timer (+0x160, 5.0 at the hold's start, `FUN_00594600` D:L453262-453270;
 * counted down by the frame's dt, `FUN_005920c0` D:L451493-451506) while its flags are set (`FUN_00220350` D:L74429); the
 * page feeds its prediction (`holdProgress`) through `hudFrame` once a frame, null off a hold.
 */
describe('the hold bar fed to the HUD (PB-8; issue #120)', () => {
  const fed = () => {
    const bars: (number | null)[] = [];
    const hud: BombHud = { setExtraMarks: () => {}, setDefuseTimer: () => {}, setHoldBar: (f) => { bars.push(f); }, postMessage: () => {} };
    return { bars, hud };
  };

  it("the plant's hold feeds the bar filling with the hold (DAT_0044d4a0 0: no world bomb, D:L74434-74435), and none from the commit on (it clears +0x171 bit 5, D:L451516: HOLD_BAR_PLACEMENT_READING)", () => {
    const { bars, hud } = fed();
    const { emit, page, me, ground } = harness({ hud });
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    me.feet = [310, 0, 300];                                                     // the carrier at the SEALs' site
    page.hudFrame();
    expect(bars.at(-1)).toBeNull();
    page.tick(true);
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(1 / 300, 9);
    for (let i = 1; i < 150; i++) { me.tick++; page.tick(true); }               // PAR-34: a room tick a command (60 fps)
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(0.5, 9);
    for (let i = 150; i < 299; i++) { me.tick++; page.tick(true); }
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(299 / 300, 9);
    me.tick++; page.tick(true);                                                  // the 300th: the commit
    page.hudFrame();
    expect(bars.at(-1)).toBeNull();
    expect(HOLD_BAR_PLACEMENT_READING).toBe('ends-at-commit');
    expect(HOLD_BAR_DIRECTION_READING).toEqual({ plant: 'fills', defuse: 'empties' });
  });

  it("the defuse's hold feeds the same bar, emptying with the timer (DAT_0044d4a0 the planted bomb, D:L74434; PB2.R2), the box left empty at its commit (D:L451519-451524 keep bit 5)", () => {
    const { bars, hud } = fed();
    const { emit, page, me, ground } = harness({ hud });
    emit(welcome({ objective: { ...ground, state: 3, pos: [-300, 0, 300], planter: 3, plantingTeam: 'terrorist', detonateTick: 9000 } }));
    me.feet = [-305, 0, 300];                                                     // a SEAL within reach of the Terrorists' bomb
    expect(page.prompt()).toBe(DEFUSE_PROMPT_ICON_READING);
    page.hudFrame();
    expect(bars.at(-1)).toBeNull();
    page.tick(true);
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(1 - 1 / 300, 9);
    for (let i = 1; i < 150; i++) { me.tick++; page.tick(true); }               // PAR-34: a room tick a command (60 fps)
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(0.5, 9);
    for (let i = 150; i < 300; i++) { me.tick++; page.tick(true); }
    page.hudFrame();
    expect(bars.at(-1)).toBe(0);                                                 // the box, its fill empty
    // The room's defuse (state 4) ends the hold: no bar.
    emit({ type: 'bomb', ...ground, state: 4, pos: [-300, 0, 300], planter: 3, plantingTeam: 'terrorist', defuser: 2, detonateTick: 9000 });
    page.tick(true);
    page.hudFrame();
    expect(bars.at(-1)).toBeNull();
  });

  it('no bar while no hold plays, out of reach or out of play; a release resets it (D:L453277-453281: the timer back to 5.0)', () => {
    const { bars, hud } = fed();
    const { emit, page, me, ground } = harness({ hud });
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    page.tick(true);                                                             // held away from the site
    page.hudFrame();
    expect(bars.at(-1)).toBeNull();
    me.feet = [310, 0, 300];
    for (let i = 0; i < 60; i++) { me.tick++; page.tick(true); }                // PAR-34: a room tick a command (60 fps)
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(60 / 300, 9);
    page.tick(false);                                                            // a release
    page.hudFrame();
    expect(bars.at(-1)).toBeNull();
    page.tick(true);                                                             // held again: from the start
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(1 / 300, 9);
    emit({ type: 'eliminated', winner: 'seal' });                                // the round decided: the bomb live on (LATER 145)
    page.hudFrame();
    expect(bars.at(-1)).toBeCloseTo(1 / 300, 9);
    emit({ type: 'roundOver', round: 1, winner: 'seal', wins: { seal: 1, terrorist: 0 }, matchOver: false, screens: [] });   // out of play
    page.hudFrame();
    expect(bars.at(-1)).toBeNull();
  });

  it("both pages lend their Hud to the bomb and call bomb.hudFrame() once a frame, so the bar draws on /testroom (main.ts) and the menu match (matchMount.ts) alike (PB2.R3)", () => {
    // The Hud is a BombHud: its setHoldBar is what the page feeds.
    const real: BombHud = new Hud();
    real.setHoldBar(0.5);
    expect((real as Hud).state().model.holdBar).toEqual({ fill: 0.5 });
    for (const f of ['main.ts', 'matchMount.ts']) {
      const text = readFileSync(join(import.meta.dirname, '..', 'src', f), 'utf8');
      expect(text, f).toMatch(/bombView: \{\s*\n\s*roundAudio[^\n]*\bhud,/);
      expect(text, f).toMatch(/\n\s+acts\.bomb\.hudFrame\(\);/);
    }
  });
});

/**
 * PB-1 (issue #84; research 214 s3 and s6): the bomb carried, on the carrier's own body -- the satchel, the plant's clip
 * and the plant's sound, as the original's code gives them. The own body is lent to the page (`BombPageView.ownBody`:
 * `./play` `Play.setGearVisible`, and the throw's pose layer with the mover's hold); the others' bodies follow the hold's
 * code on the wire (`BODY_HOLD_SHIFT`, `./remotePlayers` through `./throwPose` `follow`).
 */
describe('the bomb carried on the own body (PB-1; issue #84)', () => {
  const ownView = (log: string[], pistol = false): BombPageView => ({
    remotePlayers: { setGearVisible: (id, name, on) => { log.push(`gear ${id} ${name} ${on}`); } },
    ownBody: {
      setGearVisible: (name, on) => { log.push(`own ${name} ${on}`); return true; },
      startClip: (anim, hold) => { log.push(`clip ${anim.clip} ${hold}`); },
      pistol: () => pistol,
    },
    roundAudio: { bomb: (kind) => { log.push(`cue ${kind}`); } },
    sound: { play: (name, at) => { log.push(`sound ${name} ${at.join(',')}`); } },
  });
  const own = (log: string[]): string[] => log.filter((l) => l.startsWith('own '));

  it("the carrier's own body wears its Satchel: shown at this page's pickup (FUN_005bbf10 D:L473670), off at its drop (FUN_0059ddb0 D:L457602-457605) and its plant (FUN_005bc200 D:L473727), never for another's carrying", () => {
    const log: string[] = [];
    const { emit, ground } = harness(ownView(log), { 4: 'seal' });
    emit(welcome({ objective: ground }));
    emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });                  // another's pickup: not the own body
    emit({ type: 'bomb', ...ground, state: 1, pos: [50, 0, 60] });
    expect(own(log)).toEqual([]);
    emit({ type: 'bomb', ...ground, state: 2, pos: [50, 0, 60], carrier: 2 });  // this page's: on
    expect(own(log)).toEqual(['own Satchel true']);
    emit({ type: 'bomb', ...ground, state: 1, pos: [60, 0, 60] });            // its drop: off
    expect(own(log)).toEqual(['own Satchel true', 'own Satchel false']);
    log.length = 0;
    emit({ type: 'bomb', ...ground, state: 2, pos: [60, 0, 60], carrier: 2 });
    emit({ type: 'bomb', ...ground, state: 2, pos: [60, 0, 60], carrier: 2, hold: { by: 2, kind: 'plant', sinceTick: 1000 } });
    emit({ type: 'bomb', ...ground, state: 2, pos: [60, 0, 60], carrier: 2, hold: { by: 2, kind: 'place', sinceTick: 1300 } });
    expect(own(log)).toEqual(['own Satchel true']);                           // worn through the hold and the placement
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 9000 });
    expect(own(log)).toEqual(['own Satchel true', 'own Satchel false']);      // the plant: off
    log.length = 0;
    // A welcome as the carrier (a reconnect's takeover) draws it, silently; a welcome with another carrying takes it off.
    emit({ type: 'roundStart', round: 2, seconds: 300, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 3000 });
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    expect(own(log)).toEqual(['own Satchel true']);
    emit(welcome({ objective: { ...ground, state: 2, carrier: 4 } }));
    expect(own(log)).toEqual(['own Satchel true', 'own Satchel false']);
  });

  it("the plant's start plays Place claymore on the planter's own body (FUN_005be9a0's MPBOMB branch, D:L475480-475481: DAT_003deb48, 'Place claymore' at D:L495216), the pistol's pair with the sidearm in the hand; once, on the room's placement for this page's id, never for another's nor at a welcome", () => {
    for (const pistol of [false, true]) {
      const log: string[] = [];
      const { emit, ground } = harness(ownView(log, pistol), { 4: 'seal' });
      const carried: BombWire = { ...ground, state: 2, carrier: 2 };
      const clips = (): string[] => log.filter((l) => l.startsWith('clip '));
      emit(welcome({ objective: ground }));
      emit({ type: 'bomb', ...carried });
      emit({ type: 'bomb', ...carried, hold: { by: 2, kind: 'plant', sinceTick: 1000 } });   // the 5 s hold: no clip yet
      expect(clips()).toEqual([]);
      emit({ type: 'bomb', ...carried, hold: { by: 2, kind: 'place', sinceTick: 1300 } });   // the commit: the placement
      const want = pistol ? 'clip seal_p_place_claymore seal_place_claymore' : 'clip seal_place_claymore seal_place_claymore';
      expect(clips(), `pistol ${pistol}`).toEqual([want]);
      emit({ type: 'bomb', ...carried, hold: { by: 2, kind: 'place', sinceTick: 1300 } });   // the same placement again: once
      emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 9000 });
      expect(clips()).toEqual([want]);
      // Another's placement: his own page plays it, and the others see it on his body's hold code.
      emit({ type: 'roundStart', round: 2, seconds: 300, wins: { seal: 1, terrorist: 0 }, rounds: 11, epoch: 2, startTick: 3000 });
      emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
      emit({ type: 'bomb', ...ground, state: 2, carrier: 4, hold: { by: 4, kind: 'place', sinceTick: 3400 } });
      expect(clips()).toEqual([want]);
      // A welcome into this page's placement plays nothing (a joiner's welcome is drawn silently).
      emit(welcome({ objective: { ...carried, hold: { by: 2, kind: 'place', sinceTick: 3500 } } }));
      emit({ type: 'bomb', ...carried, hold: { by: 2, kind: 'place', sinceTick: 3500 } });
      expect(clips()).toEqual([want]);
    }
    // The clip is the action's (`Place claymore`, the string at 0x661628; its pistol pair at 0x661640, FUN_005e1cf0
    // D:L494772) -- the claymore's placing, not C4's `Put on wall` (H161's stand-in is not needed).
    expect(PLANT_ANIM).toBe(PLACE_CLAYMORE_ANIM);
    expect([PLANT_ANIM.type, PLANT_ANIM.clip]).toEqual(['Place claymore', 'seal_place_claymore']);
    // The others: the mover's hold rides the body's hold code (`BODY_HOLD_SHIFT`), which `RemotePlayers` follows.
    expect(bodyHoldOf(bodyHoldBits('seal_place_claymore'))).toBe('seal_place_claymore');
  });

  // PB-1 re-review: the room names the drop (`dropWhy`, option B; `BombWire.dropWhy`, net/objective.ts, set by the room's
  // `match/src/bomb.ts` since P25). Its events are built with `as ServerEvent` to send the reasons the wire never carries.
  const dropEvent = (over: Partial<BombWire>, dropWhy?: string): ServerEvent =>
    ({ type: 'bomb', state: 1, pos: [60, 0, 60], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 1240, ...over, ...(dropWhy ? { dropWhy } : {}) }) as ServerEvent;

  it("the manual drop the room names (dropWhy 'manual') plays Place claymore on the dropper's own body (FUN_0059ddb0 D:L457606-457612: pushed when the actor is not remote, CRemoteCtrl IsRemote at +0x34), the pistol's pair with the sidearm in the hand; a drop for a death, a leave or a lost seat, a reset and another's drop play none", () => {
    for (const pistol of [false, true]) {
      const log: string[] = [];
      const { emit, ground } = harness(ownView(log, pistol), { 4: 'seal' });
      const clips = (): string[] => log.filter((l) => l.startsWith('clip '));
      const carried: BombWire = { ...ground, state: 2, carrier: 2 };
      emit(welcome({ objective: carried }));
      emit(dropEvent({}, 'manual'));                                            // the room took this page's drop
      const want = pistol ? 'clip seal_p_place_claymore seal_place_claymore' : 'clip seal_place_claymore seal_place_claymore';
      expect(clips(), `pistol ${pistol}`).toEqual([want]);
      for (const why of ['death', 'leave', 'gone', undefined]) {                // the others' reasons, and none (a reset)
        emit({ type: 'bomb', ...carried });
        emit(dropEvent({}, why));
        expect(clips(), String(why)).toEqual([want]);
      }
      // Another's manual drop: his page plays it; this page sees it on his body's hold code.
      emit({ type: 'bomb', ...ground, state: 2, carrier: 4 });
      emit(dropEvent({}, 'manual'));
      expect(clips()).toEqual([want]);
      // Out of play (a decided round) nothing is dropped by hand; a welcome onto a manual drop plays nothing.
      emit(welcome({ objective: carried }));
      emit({ type: 'roundOver', round: 1, winner: null, wins: { seal: 0, terrorist: 0 }, matchOver: false, screens: [] });
      emit(dropEvent({}, 'manual'));
      emit(welcome({ objective: { ...ground, state: 1, dropWhy: 'manual' } as BombWire }));
      expect(clips()).toEqual([want]);
    }
  });

  it("a death drop after a refused manual drop plays no clip: the room's refusal sends no bomb event (Room.bombAction -> dropped, room.ts:3188-3195; publish unchanged, bomb.ts:359-365), then the carrier dies -- its drop, then its kill: no clip on the dead body", () => {
    const log: string[] = [];
    const { emit, page, ground } = harness(ownView(log), { 4: 'seal' });
    const clips = (): string[] => log.filter((l) => l.startsWith('clip '));
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    // The page's drop was sent and refused: the room sent nothing (PB-1's first fix kept a page-side ask here; gone).
    // The room's death drop comes before its kill (`Room.kill`: `bomb.dropped(..., 'death')`, then the `kill` broadcast).
    emit(dropEvent({ pos: [70, 0, 60], pickupAfterTick: 1500 }, 'death'));
    emit({ type: 'kill', victim: 2, killer: 4, weapon: 'M4A1', how: 'weapon' } as unknown as ServerEvent);
    expect(clips()).toEqual([]);
  });

  // PB-1 re-review (option B): the drop's reason on the wire -- `BombWire.dropWhy` in net/objective.ts and
  // `BombAuthority`'s drop in match/src/bomb.ts (the room's `manualDrop` against `dropped`). An `it.fails` from PB-1
  // (2026-10-09) until the online-parity sweep's P25 (BO-1) landed it; the room's own cases are central `roomBomb.test.ts`'s.
  it("the room names the drop on the wire (PB-1 re-review, option B): BombWire's dropWhy in net/objective.ts, set by bomb.ts's drop and cleared by its reset", () => {
    const objective = readFileSync(new URL('../src/net/objective.ts', import.meta.url), 'utf8');
    const bomb = readFileSync(new URL('../../match/src/bomb.ts', import.meta.url), 'utf8');
    expect(objective).toMatch(/dropWhy\?: 'manual' \| 'death' \| 'leave' \| 'gone';/);
    expect(bomb).toMatch(/this\.dropWhy = why;/);
    expect(bomb).toMatch(/dropWhy: this\.dropWhy/);
  });

  it("the own satchel does not outlive the connection: off when the followed room's socket is no longer open (hudFrame) and at the page's dispose", () => {
    const log: string[] = [];
    let open = true;
    const listeners = new Set<(ev: ServerEvent) => void>();
    const client = { on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
    const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
    const deps = {
      id: () => 2, team: () => 'seal' as Team, alive: () => true, feet: () => [0, 0, 0], actions: () => [],
      look: () => ({ forward: 0, right: 0, pitch: 0 }), serverTick: () => 1000, open: () => open,
    };
    const view = ownView(log);
    const ground: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
    const own = (): string[] => log.filter((l) => l.startsWith('own '));
    const page = new BombPage(client, deps, view);
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    page.hudFrame();
    expect(own()).toEqual(['own Satchel true']);
    open = false;                                                              // the room lost, no new welcome
    page.hudFrame();
    page.hudFrame();
    expect(own()).toEqual(['own Satchel true', 'own Satchel false']);
    // A new connection's welcome as the carrier draws it again; the page's dispose takes it off.
    open = true;
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    expect(own()).toEqual(['own Satchel true', 'own Satchel false', 'own Satchel true']);
    page.dispose();
    expect(own()).toEqual(['own Satchel true', 'own Satchel false', 'own Satchel true', 'own Satchel false']);
  });

  it("the plant plays no sound of its own (PLANT_SOUND_READING): MPBOMB names no FireAnim, the Place claymore clips no callback, and FUN_005bc730 returns before the item's FireAnim on a network game (D:L473980-473984); its sound is the objectives script's switch_timer at state 3", () => {
    const log: string[] = [];
    const { emit, ground } = harness(ownView(log), { 4: 'seal' });
    const carried: BombWire = { ...ground, state: 2, carrier: 2 };
    const heard = (): string[] => log.filter((l) => l.startsWith('sound ') || l.startsWith('cue '));
    emit(welcome({ objective: ground }));
    emit({ type: 'bomb', ...carried });
    log.length = 0;
    emit({ type: 'bomb', ...carried, hold: { by: 2, kind: 'plant', sinceTick: 1000 } });
    emit({ type: 'bomb', ...carried, hold: { by: 2, kind: 'place', sinceTick: 1300 } });
    expect(heard()).toEqual([]);
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 9000 });
    expect(heard()).toEqual(['cue planted']);
    expect(PLANT_SOUND_READING).toBe('script-only');
  });

  it('the pickup sounds .FOOTBOMB at the carrier, on every page (FUN_005bbf10 D:L473662-473664, from the state-2 handler FUN_002c1c30 D:L163953); not at a welcome, a takeover, a drop or a plant', () => {
    const log: string[] = [];
    const { emit, me, ground } = harness(ownView(log), { 4: 'seal' });
    me.feet = [12, 0, 14];
    me.bodies[4] = [50, 0, 60];
    const sounds = (): string[] => log.filter((l) => l.startsWith('sound '));
    emit(welcome({ objective: { ...ground, state: 2, carrier: 4 } }));        // a joiner: silent
    emit({ type: 'bomb', ...ground, state: 2, carrier: 7 });                  // a takeover's rekey: no pickup
    emit({ type: 'bomb', ...ground, state: 1, pos: [50, 0, 60] });            // a drop
    expect(sounds()).toEqual([]);
    emit({ type: 'bomb', ...ground, state: 2, pos: [50, 0, 60], carrier: 4 });   // another's pickup: at his body
    expect(sounds()).toEqual(['sound .FOOTBOMB 50,0,60']);
    emit({ type: 'bomb', ...ground, state: 1, pos: [50, 0, 60] });
    emit({ type: 'bomb', ...ground, state: 2, pos: [50, 0, 60], carrier: 2 });   // this page's: at its own feet
    expect(sounds()).toEqual(['sound .FOOTBOMB 50,0,60', 'sound .FOOTBOMB 12,0,14']);
    emit({ type: 'bomb', ...ground, state: 3, pos: [305, 0, 300], planter: 2, plantingTeam: 'seal', detonateTick: 9000 });
    expect(sounds()).toHaveLength(2);
    expect(PICKUP_SOUND).toBe('.FOOTBOMB');
  });

  it("the pages lend the own body and the sound alike (ownBombBody, bombSound): the satchel through Play, the clip on the throw's pose layer and the mover's hold, the sound at 1.0", () => {
    const log: string[] = [];
    const body = ownBombBody(
      { setGearVisible: (name, on) => { log.push(`gear ${name} ${on}`); return true; } },
      { start: (anim) => { log.push(`pose ${anim.clip}`); return true; } },
      { hold: (clip) => { log.push(`hold ${clip}`); return true; } },
      () => true,
    );
    body.setGearVisible('Satchel', true);
    body.startClip!(PLANT_ANIM, 'seal_place_claymore');
    expect(body.pistol!()).toBe(true);
    bombSound({ play: (name, at, event, volume) => { log.push(`play ${name} ${at!.join(',')} ${event} ${volume}`); return true; } }).play('.FOOTBOMB', [1, 2, 3]);
    // NU-8b B3: the mover's hold first, then the clip it carries (as `./matchThrow`'s `throwStart`). *Was* 'pose' before 'hold'.
    expect(log).toEqual(['gear Satchel true', 'hold seal_place_claymore', 'pose seal_place_claymore', 'play .FOOTBOMB 1,2,3 play 1']);
  });

  // NU-8b, research 326 section 6 B3 (D6; reading, pending review): the bomb's plant is `Place claymore` (PAR-74), the
  // same stack push as the claymore's placing -- the stack's top, popped at its hold's end whatever the reason
  // (`./throwPose` `throwPoseEnds`). So `ownBombBody` lays the mover's hold first and starts the clip it carries
  // (`ThrowPose.start(anim, held)`), as `./matchThrow`'s `throwStart` does: an earlier hold the new one replaces ends
  // before the plant's clip starts, and the clip stays on top past its last key to the hold's end. *Was*: the clip
  // started first with no hold carrying it, out on its own clock from its last key.
  it("NU-8b B3: the plant's clip rides the placings' class -- the hold first, then the clip it carries, on top past its last key to the hold's end (ownBombBody)", () => {
    const keys = 55;
    const c: MotionClip = {
      name: PLANT_ANIM.clip, version: 5, duration: keys / 30, frameCount: keys, rate: 30, unknown10: -1, unknown14: 1,
      parts: [{ index: 0, name: 'lthigh', flags: 0x0c | 0x10 | 0x20, translations: Float32Array.from([1, -1, 0]), rotations: Float32Array.from([0, 0, 0, 1]) }],
    };
    const table = new Map<string, MotionEntry>([[c.name, {
      looped: false, playback: 2.7, maxVelocity: -1, blendTime: null, transitionA: null, transitionB: null, noInterrupt: 0.9, noPitchtwist: true, callbacks: [],
    }]]);
    const pose = new ThrowPose(() => ({ clips: new Map([[c.name, c]]), table }));
    const log: string[] = [];
    const body = ownBombBody(
      { setGearVisible: () => true },
      { start: (anim, held) => { log.push(`pose ${anim.clip} ${held}`); return pose.start(anim, held); } },
      { hold: (clip, _period, pass) => { log.push(`hold ${clip} ${pass}`); return true; } },
      () => false,
    );
    body.startClip!(PLANT_ANIM, 'seal_place_claymore', PLANT_PUSH_PASS);
    expect(log).toEqual(['hold seal_place_claymore before', 'pose seal_place_claymore true']);
    for (let i = 0; i < 200; i++) pose.step(1 / 60);                       // 3.33 s: past its last key (2.60 s) and a 0.4 s fade
    expect(pose.playing()).toBe(true);                                      // on top, to the hold's end
    expect(pose.stats().weight).toBe(1);
    pose.cut();                                                             // the hold's end (`throwPoseEnds`)
    expect(pose.playing()).toBe(false);
    expect(pose.layer.sample({ clip: c, frame: 0, phase: 0 })?.crossFade).toBe(0.4);   // the pop: the body's cross-fade
  });

  // PAR-74 (research 251 section 12.5, "PAR-74"; PTW.R3 with roomHoldOverHold.test): the plant's clip is pushed before the
  // frame's driver (the plant's hold timer in the controller's tick, `FUN_00594cf0` D:L453273 -> `FUN_005920c0`
  // D:L451514 -> D:L475481), so the page lays its hold on the push's own clock -- the same code as the claymore's and the
  // PMN's, which lag: the pass rides `startClip` to the walk's hold, never the wire. The drop's: BOMB_DROP_PUSH_PASS_READING.
  it("PAR-74: the plant's clip and the manual drop's lay the walk's hold before the driver (PLANT_PUSH_PASS, BOMB_DROP_PUSH_PASS_READING); ownBombBody hands the pass to the walk", () => {
    expect(PLANT_PUSH_PASS).toBe('before');
    expect(BOMB_DROP_PUSH_PASS_READING).toBe('before');
    const passes: string[] = [];
    const view: BombPageView = { ownBody: { setGearVisible: () => true, startClip: (_anim, hold, pass) => { passes.push(`${hold} ${pass}`); }, pistol: () => false } };
    const { emit, ground } = harness(view, { 4: 'seal' });
    const carried: BombWire = { ...ground, state: 2, carrier: 2 };
    emit(welcome({ objective: ground }));
    emit({ type: 'bomb', ...carried });
    emit({ type: 'bomb', ...carried, hold: { by: 2, kind: 'place', sinceTick: 1300 } });   // the placement: the plant's clip
    expect(passes).toEqual(['seal_place_claymore before']);
    emit({ type: 'bomb', ...carried });
    emit({ type: 'bomb', state: 1, pos: [60, 0, 60], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 1240, dropWhy: 'manual' } as ServerEvent);
    expect(passes).toEqual(['seal_place_claymore before', 'seal_place_claymore before']);
    const held: string[] = [];
    const body = ownBombBody({ setGearVisible: () => true }, { start: () => true }, { hold: (clip, period, pass) => { held.push(`${clip} ${period} ${pass}`); return true; } }, () => false);
    body.startClip!(PLANT_ANIM, 'seal_place_claymore', PLANT_PUSH_PASS);
    expect(held).toEqual(['seal_place_claymore undefined before']);
  });

  // HOT (PAR.R3): the lending is `./main`'s and `./matchMount`'s, PB-1's hunks landed in the main merge controller's window
  // (wave 2, `agent/w2`): `bombView`'s `ownBody: ownBombBody(play, throwPose, walk, ...)` and `sound: bombSound(...)` on both pages.
  it('both pages lend the bomb the own body and the sound (PB.R2): main.ts and matchMount.ts pass ownBombBody and bombSound in bombView', () => {
    const src = (f: string): string => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/bombView: \{[\s\S]{0,400}?ownBody: ownBombBody\(play, [\s\S]{0,200}?sound: bombSound\(/);
    }
  });

  // HOT (PAR.R3): `./matchActions` is the one place both pages make the bomb -- PB-1 review F2's hunk there, landed in
  // wave 2 (`agent/w2`): the followed socket's state in the page's deps (`open`).
  it("matchActions lends the bomb the socket's state (PB-1 review F2): open in its deps", () => {
    const src = readFileSync(new URL('../src/matchActions.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/open: \(\) => d\.net\(\)\?\.client\.state === 'open'/);
  });
});

/** A page with its seat (id 2, a SEAL) at the two tents of Crossroads' shape, the events emitted by hand. */
function harness(view: BombPageView = {}, teams: Record<number, Team> = {}) {
  const listeners = new Set<(ev: ServerEvent) => void>();
  const client = { on: (l: (ev: ServerEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
  const emit = (ev: ServerEvent): void => { for (const l of listeners) l(ev); };
  const me = {
    team: 'seal' as Team, feet: [0, 0, 0] as [number, number, number], tick: 1000,
    bodies: {} as Record<number, [number, number, number]>,
  };
  const page = new BombPage(client, {
    id: () => 2, team: () => me.team, alive: () => true, feet: () => me.feet,
    actions: () => [tent('terrorist_tent', [300, 0, 300]), tent('seal_tent', [-300, 0, 300])],
    look: () => ({ forward: 0, right: 0, pitch: 0 }), serverTick: () => me.tick, pick: () => patchUnder(me.feet),
    teamOf: (id) => (id === 2 ? me.team : teams[id] ?? null), bodyAt: (id) => me.bodies[id] ?? null,
  }, view);
  const ground: BombWire = { state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0 };
  return { emit, page, me, ground };
}

/** Crossroads' welcome for seat 2, a round in play (its `startTick`), with `over` laid on it. */
function welcome(over: Partial<Extract<ServerEvent, { type: 'welcome' }>>): ServerEvent {
  return {
    type: 'welcome', id: 2, version: 11, map: 'MP72', tick: 990, role: 'player', team: 'seal', queue: 0, name: 'S', players: [],
    rules: 'classic', round: 1, rounds: 11, ghost: false, env: { revision: 0, epoch: 1, states: [] }, epoch: 1, startTick: 900, ...over,
  };
}

const MP72 = fixture('RUN/MP72.ZDB');

/**
 * XR-06 (research 214 s3): the world bomb's model off the disc -- FLIB's `Satchel` (`BOMB_MODEL_READING`), the model
 * `FUN_0059dab0` hangs at the bomb's point (D:L457497-457500), decoded in the worker with the throwables
 * (`loadGrenadeAssets`). Its frame stands it on its origin, so at StartBomb's quantised height (47.334,
 * `BOMB_GROUND_READING`) it rises over Crossroads' floor (47.500 there) by its height less 0.166 -- where C4's placed
 * model, centred on its origin, lay under the floor but for a sliver (the owner's playtest, 2026-10-06).
 */
describe.skipIf(!MP72)(`the world bomb's model on MP72 (XR-06)${MP72 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("MP72's fittings hold the Satchel (FLIB_MDL.ZED): decoded with the throwables, its frame from y 0 to 4.114, so at StartBomb it stands on the floor, 0.166 of it under the 47.500 floor", () => {
    const toc = parseZdb(MP72!);
    const assets = loadGrenadeAssets(MP72!, toc, 'MP72', (n) => n.toLowerCase(), () => {});
    const model = assets.models.find((m) => m.name === BOMB_MODEL_READING.model);
    expect(model?.parts.length).toBeGreaterThan(0);
    let lo = Infinity, hi = -Infinity;
    for (const part of model!.parts) for (let i = 1; i < part.positions.length; i += 3) { lo = Math.min(lo, part.positions[i]!); hi = Math.max(hi, part.positions[i]!); }
    expect(lo).toBeCloseTo(0, 3);
    expect(hi).toBeCloseTo(4.114, 3);
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const at = map.bombStart!;
    const floor = gridCast(map.grid, map.defaultMaterial ?? '')([at[0], at[1] + 20, at[2]], [at[0], at[1] - 20, at[2]]).find(restsOn)!;
    expect(floor.point[1]).toBeCloseTo(47.5, 3);
    expect(floor.point[1] - (at[1] + lo)).toBeCloseTo(0.166, 3);               // the cell's quantised height, as the original's
    expect(at[1] + hi).toBeGreaterThan(floor.point[1] + 3.9);                  // the satchel stands over the floor
  }, 120_000);

  it("the fittings library is parsed once per map archive: the bodies and the world bomb share one parse", () => {
    const toc = parseZdb(MP72!);
    const lib = fittingsLibrary(MP72!, toc);
    expect(lib).not.toBeNull();
    expect(fittingsLibrary(MP72!, toc)).toBe(lib);
    const at = zdbEntry(toc, 'FLIB_MDL.ZED').offset;
    const parse = vi.spyOn(Zar, 'parse');
    try {
      const assets = loadGrenadeAssets(MP72!, toc, 'MP72', (n) => n.toLowerCase(), () => {});
      expect(assets.models.some((m) => m.name === BOMB_MODEL_READING.model)).toBe(true);
      expect(parse.mock.calls.filter(([b]) => b.byteOffset === MP72!.byteOffset + at)).toEqual([]);
    } finally {
      parse.mockRestore();
    }
  }, 120_000);
});

/**
 * XR-06 review: the world bomb's fittings read. A map whose archive has no FLIB draws no world bomb and says nothing (its
 * body's gear is missing, `loadBody`); a FLIB that is there but will not read is a line in the map's notes, not silence.
 */
describe("the world bomb's fittings library, missing and broken (XR-06)", () => {
  const junkToc = [{ name: 'RUN/COMMON/FLIB_MDL.ZED', offset: 0, size: 128 }, { name: 'RUN/COMMON/FLIB_GEO.ZED', offset: 128, size: 128 }];
  const fittingLines = (notes: string[]): string[] => notes.filter((l) => /FLIB|Satchel/.test(l));

  it('no FLIB in the archive: no Satchel and no line', () => {
    const notes: string[] = [];
    expect(fittingsLibrary(new Uint8Array(0), [])).toBeNull();
    const assets = loadGrenadeAssets(new Uint8Array(0), [], 'MP00', (n) => n, (l) => notes.push(l));
    expect(assets.models.find((m) => m.name === BOMB_MODEL_READING.model)).toBeUndefined();
    expect(fittingLines(notes)).toEqual([]);
  });

  it('a FLIB that will not parse: no Satchel, one line naming it; the failure is kept, not parsed again', () => {
    const junk = new Uint8Array(256);
    const notes: string[] = [];
    const assets = loadGrenadeAssets(junk, junkToc, 'MP00', (n) => n, (l) => notes.push(l));
    expect(assets.models.find((m) => m.name === BOMB_MODEL_READING.model)).toBeUndefined();
    expect(fittingLines(notes)).toHaveLength(1);
    expect(fittingLines(notes)[0]).toMatch(/Satchel.*ZAR version/);
    const parse = vi.spyOn(Zar, 'parse');
    try {
      expect(() => fittingsLibrary(junk, junkToc)).toThrow(/ZAR version/);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });
});

const ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
const READERC = fixture('RUN/READERC.ZAR');

/**
 * PB-1 (research 214 s6, `PLANT_SOUND_READING`): the disc's half of the plant's silence -- item 154 (MPBOMB) names no
 * `FireAnimName` where the claymore and C4 name `c4_start`, and neither `Place claymore` clip carries a `zanim_callback`.
 */
describe.skipIf(!ZWEAPON || !READERC)(`the plant's sound on the disc (PB-1)${ZWEAPON && READERC ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("MPBOMB (item 154) names no FireAnim (NOT FOUND) where the claymore and C4 name c4_start; seal_place_claymore and seal_p_place_claymore carry no zanim_callback", () => {
    const zar = Zar.parse(ZWEAPON!);
    const rdr = parseRdr(zar.data(zar.root.children.find((k) => k.name.toLowerCase() === 'zweapon.rdr')!));
    const records = (rdrGet(rdr, 'ZWEAPON') as RdrNode[]).filter((r): r is RdrNode[] => Array.isArray(r));
    const str = (n: RdrNode | undefined): string | undefined => (typeof n === 'string' ? n : Array.isArray(n) && typeof n[0] === 'string' ? n[0] : undefined);
    const fireAnim = (name: string): (string | undefined)[] => {
      const r = records.find((x) => str(rdrGet(x, 'InternalName')) === name)!;
      return [str(rdrGet(r, 'ID')), str(rdrGet(r, 'FireAnimName'))];
    };
    expect([fireAnim('MPBOMB'), fireAnim('Claymore'), fireAnim('C4')]).toEqual([['154', 'NOT FOUND'], ['153', 'c4_start'], ['151', 'c4_start']]);
    const table = motionTableFromArchive(READERC!)!;
    expect(['seal_place_claymore', 'seal_p_place_claymore'].map((c) => table.get(c)?.callbacks)).toEqual([[], []]);
  });
});

const DISC = process.env.SOCOM_DISC;
const BNKSTORE = DISC ? join(DISC, 'RUN/SOUNDS/BNKSTORE.ZAR') : null;
const HAVE_BANKS = !!BNKSTORE && existsSync(BNKSTORE) && !!fixture('RUN/SOUNDRDR.ZAR');

/**
 * PB-1 F4 (research 214 s3): the pickup's `.FOOTBOMB` is in Crossroads' own bank -- `MP72_am.bnk`, the map's
 * `<map>_am.bnk` the page loads (`./soundData`), with its `sounds.rdr` entry in the block `MP72_AM`.
 */
describe.skipIf(!HAVE_BANKS)(`the pickup's sound in Crossroads' bank (PB-1)${HAVE_BANKS ? '' : ' (SOCOM_DISC with RUN/SOUNDS/BNKSTORE.ZAR absent)'}`, () => {
  it("MP72_am.bnk holds .FOOTBOMB (index 76) and sounds.rdr's MP72_AM block gives its parameters", () => {
    const zar = Zar.parse(new Uint8Array(readFileSync(BNKSTORE!)));
    const bank = parseBankFile(zar.data(zar.find('MP72_am.bnk')!));
    expect(bank.names.get(PICKUP_SOUND)).toBe(76);
    const script = soundScriptFromArchive(fixture('RUN/SOUNDRDR.ZAR')!);
    expect(soundParams(script, [bank.name], PICKUP_SOUND)).not.toBeNull();
  });
});

/**
 * PAR-34 group 6 (research 252 s3; ACT.R8): the page's prediction of its own plant and defuse hold. The room counts its
 * own ticks while the hold is live (`match/src/bomb.ts` `step`: one a tick from the first held command's, committing on
 * the 300th, `HOLD_TICKS`), not commands; a page sends one command a 1/60 tick of its clamped step, so below 10 fps it
 * sends fewer than 60 a second (6 a 5-fps frame, while the room runs 12 ticks). Counting its commands, the page's bar ran
 * at half the room's rate there; it counts the room's ticks as it reckons them (`serverTick`) from its first held
 * command's, and its commands only begin, keep and reset the hold, as the room's do.
 */
describe("PAR-34 group 6: the page's hold prediction counts the room's ticks, not its commands (research 252 s3; ACT.R8)", () => {
  /** The carrier held at its site for `frames` frames of `ticks` room ticks and `commands` held commands: the bar after each. */
  function plant(frames: number, ticks: number, commands: number): (number | null)[] {
    const bars: (number | null)[] = [];
    const hud: BombHud = { setExtraMarks: () => {}, setDefuseTimer: () => {}, setHoldBar: (f) => { bars.push(f); }, postMessage: () => {} };
    const { emit, page, me, ground } = harness({ hud });
    emit(welcome({ objective: { ...ground, state: 2, carrier: 2 } }));
    me.feet = [310, 0, 300];
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < commands; c++) { me.tick += ticks / commands; page.tick(true); }
      page.hudFrame();
    }
    return bars;
  }
  /** The real time (s) at the end of the frame whose bar the commit ended (none drawn), frames of `seconds`. */
  const ends = (bars: readonly (number | null)[], seconds: number): number | null => {
    const i = bars.findIndex((b, k) => b === null && k > 0 && bars[k - 1] !== null);
    return i < 0 ? null : (i + 1) * seconds;
  };

  it('the plant at 5 fps ends its bar at the room\'s commit, within a frame of 5 s of real time, as at 60 fps -- not at 10 s', () => {
    const at60 = ends(plant(400, 1, 1), 1 / 60), at5 = ends(plant(80, 12, 6), 0.2);
    expect(at60).toBeGreaterThanOrEqual(HOLD_TICKS / TICK_HZ - 1e-9);
    expect(at60).toBeLessThanOrEqual(HOLD_TICKS / TICK_HZ + 1 / 60 + 1e-9);
    expect(at5).toBeGreaterThanOrEqual(HOLD_TICKS / TICK_HZ - 1e-9);
    expect(at5).toBeLessThanOrEqual(HOLD_TICKS / TICK_HZ + 0.2 + 1e-9);                 // the lane: 10 s
  });

  it('commands without the room\'s ticks do not hurry it: 300 held commands in one tick are 1 tick of the hold', () => {
    const bars = plant(1, 1, 300);
    expect(bars.at(-1)).toBeCloseTo(1 / HOLD_TICKS, 9);                                   // the lane: the commit (none)
  });
});
