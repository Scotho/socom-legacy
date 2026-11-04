import { describe, expect, it, vi } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc } from '../src/effectData';
import { Effects } from '../src/effects';
import { noInput } from '../src/gamepad';
import type { ActionPrompt } from '../src/hud';
import { TRAVERSAL_CLIP } from '../src/traversal';
import { FALL_IN_WATER, RIPPLES_AT_ROUND_CLEAR_READING, TraversalPage } from '../src/traversalPage';
import { groundGrid, packGround, Walker, type GroundData, type TraversalHooks, type WalkInput, type WalkMode } from '../src/walk';

/**
 * The traversal on the page (web research 86 section 7): the pad's Cross presses the action and its d-pad sides hold the
 * peek, the HUD gets the climb prompt and the ladder slide's icon, and the sounds no clip carries go to the audio.
 */

const quad = (pts: number[], ditype: number, appflags = 0): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material: 25, ptcount: 4, cameratype: 0, appflags, points: Float32Array.from(pts),
});
const floor = (x0: number, z0: number, x1: number, z1: number, y: number): WorldPoly => quad([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3);

/** A 12-high crate (appflags 4) at z -30..0, and a ladder (appflags 2) up a 40 wall at x 60 with a deck behind it. */
function ground(): GroundData {
  const polys = [
    floor(-100, 0, 100, 100, 0), floor(-100, -100, 50, 0, 0), floor(50, -100, 100, 0, 40),
    quad([-10, 0, 0, 10, 0, 0, 10, 12, 0, -10, 12, 0], 2, 4), floor(-10, -30, 10, 0, 12),
    quad([50, 0, 0, 100, 0, 0, 100, 40, 0, 50, 40, 0], 2),
    quad([57, 0, 0.2, 63, 0, 0.2, 63, 40, 0.2, 57, 40, 0.2], 2, 2), quad([63, 40, 0.2, 57, 40, 0.2, 57, 50, 0.2, 63, 50, 0.2], 2, 2),
    { ...floor(-100, 20, -60, 60, 6), material: 11 },               // a pool 6 deep (WATER)
  ];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return packGround(params, polys, owners);
}

/** The part of `WalkMode` the page drives, over a real mover and the moves the page's factory makes. */
function page(sounds: ConstructorParameters<typeof TraversalPage>[1] = null) {
  const g = ground();
  const walker = new Walker(groundGrid(g));
  let moves: TraversalHooks | null = null;
  let actions = 0, lean = 0;
  const state = { locked: false, dead: false, mode: 'walk' as 'walk' | 'fly' };
  const walk = {
    useTraversal(f: (w: Walker, g: GroundData) => TraversalHooks) { moves = f(walker, g); walker.driver = moves; },
    traversal: () => moves,
    action: () => { actions++; moves?.action(); return true; },
    mode: () => state.mode,
    lean: (side: -1 | 0 | 1) => { lean = side; moves?.lean(side); },
    drawnFeet: () => walker.drawnFeet(),
    isLocked: () => state.locked,
    isDead: () => state.dead,
  } as unknown as WalkMode;
  const p = new TraversalPage(walk, sounds);
  return { p, walker, state, moves: () => moves, actions: () => actions, lean: () => lean };
}

const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const STILL: WalkInput = { forward: 0, right: 0, boost: false };

describe('the pad on the traversal (research 86 section 7.4)', () => {
  // LATER 362 (research 92 section 6): the action button's pressure chased each frame at 3/s rising and 1.5/s falling
  // (`FUN_00594cf0` D:L453194-453203), the release's own frame included before its action fires -- the door reads it.
  it('LATER 362 -- the action press is chased over the frames: 17 page frames held (8 game frames) and the release reach 0.5, 15 (7) do not', () => {
    const at = (n: number): number => {
      const { p } = page();
      const down = { ...noInput(), action: true };
      const P = p as unknown as { padLanes(b: unknown, a: unknown, dt?: number): void; actionPress(): number };
      P.padLanes(noInput(), down, 1 / 60);
      for (let k = 1; k < n; k++) P.padLanes(down, down, 1 / 60);
      P.padLanes(down, noInput(), 1 / 60);
      return P.actionPress();
    };
    expect(at(17)).toBeGreaterThanOrEqual(0.5);                    // review F2: whole game frames (was 15 / 14 page frames)
    expect(at(15)).toBeLessThan(0.5);
  });

  // LATER 362b's review F2 (ACT.R8: a timed hold takes the original's real time, never less): `FUN_00594cf0` chases the
  // pressure once a game frame (`GAME_FRAME_DT`), so the kick needs 8 frames held (0.267 s) whatever the page's rate --
  // 7 rising frames give 0.522, the release frame's own fall 0.496.
  it('RED: LATER 362b F2 -- the chase steps on game frames: 0.25 s held opens and 0.283 s kicks, at 60 Hz and at 144 Hz', () => {
    const at = (seconds: number, hz: number): number => {
      const { p } = page();
      const down = { ...noInput(), action: true };
      const P = p as unknown as { padLanes(b: unknown, a: unknown, dt?: number): void; actionPress(): number };
      const n = Math.round(seconds * hz);
      P.padLanes(noInput(), down, 1 / hz);
      for (let k = 1; k < n; k++) P.padLanes(down, down, 1 / hz);
      P.padLanes(down, noInput(), 1 / hz);
      return P.actionPress();
    };
    for (const hz of [60, 144]) {
      expect(at(0.25, hz), `${hz} Hz, 0.25 s`).toBeLessThan(0.5);           // today: 0.512 at 60 Hz, a kick
      expect(at(0.2834, hz), `${hz} Hz, 0.283 s`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('Cross takes the action on its release (the game\'s state 3), once; the d-pad sides hold the peek', () => {
    const { p, actions, lean } = page();
    const down = { ...noInput(), action: true };
    p.padLanes(noInput(), down);
    p.padLanes(down, down);                                         // held: nothing yet
    expect(actions()).toBe(0);
    p.padLanes(down, noInput());
    expect(actions()).toBe(1);
    p.padLanes(noInput(), down);
    p.padLanes(down, { ...noInput(), leanRight: true });
    p.input();
    expect(lean()).toBe(1);
    p.padLanes(noInput(), { ...noInput(), leanLeft: true });
    p.input();
    expect(lean()).toBe(-1);
    p.padLanes(noInput(), noInput());
    p.input();
    expect(lean()).toBe(0);
  });
});

describe("the action held (M-1 of review 2: no hold while locked or dead, the lean's gate)", () => {
  const held = (m: TraversalHooks | null): boolean => (m as unknown as { actionHeldNow(): boolean }).actionHeldNow();

  it("the pad's Cross held reaches the move alive; a death or a lock while it is down drops it at the next frame", () => {
    const { p, state, moves } = page();
    const down = { ...noInput(), action: true };
    p.padLanes(noInput(), down);
    expect(held(moves())).toBe(true);
    state.dead = true;
    p.input();                                                      // the frame after the kill: the hold is gone
    expect(held(moves())).toBe(false);
    p.padLanes(down, down);                                         // still down, still dead: none
    expect(held(moves())).toBe(false);
    state.dead = false;                                             // the respawn: the button still down holds again
    p.input();
    expect(held(moves())).toBe(true);
    state.locked = true;
    p.input();
    expect(held(moves())).toBe(false);
  });

  it("the keyboard's X pressed while dead or locked holds nothing", () => {
    const { p, state, moves } = page();
    const target = new EventTarget();
    p.bindKeys(target);
    const key = (type: string): void => { const e = new Event(type) as Event & { code: string }; e.code = 'KeyX'; target.dispatchEvent(e); };
    state.dead = true;
    key('keydown');
    expect(held(moves())).toBe(false);
    key('keyup');
    state.dead = false; state.locked = true;
    key('keydown');
    expect(held(moves())).toBe(false);
    key('keyup');
    state.locked = false;
    key('keydown');
    expect(held(moves())).toBe(true);
  });

  it('the keys do nothing while a menu over the game holds the input (the ARMORY: `keysOpen`)', () => {
    const { p, moves } = page();
    const target = new EventTarget();
    p.bindKeys(target);
    let open = false;
    p.keysOpen = () => !open;
    const key = (type: string, code = 'KeyX'): void => { const e = new Event(type) as Event & { code: string }; e.code = code; target.dispatchEvent(e); };
    open = true;
    key('keydown');
    expect(held(moves())).toBe(false);
    key('keyup');
    open = false;
    key('keydown');
    expect(held(moves())).toBe(true);
  });
});

describe('the HUD and the sounds (research 86 sections 3.4, 7.5)', () => {
  it('feeds the climb prompt as the HUD reads it (the one icon for every class)', () => {
    const { p, walker } = page();
    walker.place(0, 10, 12);
    walker.state.yaw = 0;
    expect(p.hudClimb()).toBeNull();
    for (let i = 0; i < 60; i++) walker.tick(FORWARD);
    expect(p.hudClimb()).toEqual({ visible: true, kind: 'low' });
  });

  it('shows the ladder slide icon on a ladder only, and sends the slide loop and its landing to the audio', () => {
    // PAR-89 (research 305 s3): the loop is held for the "Ladderslide" clip alone, following the feet, never one pass at the
    // slide's start (the "Ladder -> slide" clip) and never through the landing.
    const heard: { at: [number, number, number] | null; clip: string | null }[] = [], landed: number[] = [];
    let p!: TraversalPage;
    const made = page({ slide: (at) => { heard.push({ at: at ? [...at] : null, clip: p.traversal()?.pose()?.clip ?? null }); }, land: (speed) => { landed.push(speed); } });
    p = made.p;
    const { walker } = made;
    const slots: (ActionPrompt | null)[] = [];
    const hud = { setAction: (a: ActionPrompt | null) => { slots.push(a); } };
    walker.place(60, 10, 20);
    walker.state.yaw = 0;
    for (let i = 0; i < 240 && p.traversal()?.state().kind !== 'ladder'; i++) walker.tick(FORWARD);
    p.hudFrame(hud);
    expect(slots).toEqual(['ladder_slide']);
    for (let i = 0; i < 60; i++) walker.tick(FORWARD);
    p.hudFrame(hud);
    expect(slots).toEqual(['ladder_slide']);                        // set once, not every frame
    p.soundFrame();
    expect(heard.every((h) => h.at === null)).toBe(true);           // on the ladder: no loop
    p.action();
    for (let i = 0; i < 240 && p.traversal()?.state().kind !== 'none'; i++) { walker.tick(STILL); p.soundFrame(); }
    p.hudFrame(hud);
    expect(slots).toEqual(['ladder_slide', null]);
    const on = heard.filter((h) => h.at !== null);
    expect(on.length).toBeGreaterThan(1);
    expect(on.every((h) => h.clip === TRAVERSAL_CLIP.slide)).toBe(true);    // the slide clip alone
    expect(heard.some((h) => h.at === null && h.clip === TRAVERSAL_CLIP.toSlide)).toBe(true);   // "Ladder -> slide": none
    expect(new Set(on.map((h) => h.at![1])).size).toBeGreaterThan(1);       // it follows the feet down the ladder
    expect(heard.at(-1)!.at).toBeNull();                                     // stopped on the way out
    expect(landed.length).toBe(1);
    expect(landed[0]).toBeGreaterThan(0);
  });
});

describe("the ladder slide's loop (PAR-89, research 305 s3)", () => {
  const pose = (clip: string) => ({ clip, frame: 0, loop: true, rootY: null });

  it('is held on the slide clip only, at the feet, and stopped on exit, on death, out of the walk and without a mover', () => {
    const heard: ([number, number, number] | null)[] = [];
    const { p, walker, state } = page({ slide: (at) => { heard.push(at ? [...at] : null); }, land: () => {} });
    walker.place(60, 10, 20);
    const t = p.traversal()!;
    const spy = vi.spyOn(t, 'pose');
    const draw = (clip: string): void => { spy.mockReturnValue(pose(clip)); p.soundFrame(); };
    draw(TRAVERSAL_CLIP.ladder); expect(heard.at(-1)).toBeNull();
    draw(TRAVERSAL_CLIP.toSlide); expect(heard.at(-1)).toBeNull();             // "Ladder -> slide": not yet
    draw(TRAVERSAL_CLIP.slide); expect(heard.at(-1)).toEqual(walker.drawnFeet());
    walker.place(60, 4, 20); walker.tick(STILL);
    draw(TRAVERSAL_CLIP.slide); expect(heard.at(-1)).toEqual(walker.drawnFeet());   // follows the feet
    draw(TRAVERSAL_CLIP.slideLand); expect(heard.at(-1)).toBeNull();           // "Ladderslide land": stopped
    draw(TRAVERSAL_CLIP.slide); expect(heard.at(-1)).not.toBeNull();
    state.dead = true; p.soundFrame(); expect(heard.at(-1)).toBeNull();        // a death
    state.dead = false; p.soundFrame(); expect(heard.at(-1)).not.toBeNull();
    state.mode = 'fly'; p.soundFrame(); expect(heard.at(-1)).toBeNull();       // out of the walk
    state.mode = 'walk'; p.soundFrame(); expect(heard.at(-1)).not.toBeNull();
    vi.spyOn(p, 'traversal').mockReturnValue(null); p.soundFrame(); expect(heard.at(-1)).toBeNull();   // no mover
  });

  it("sends no one-pass sound at the slide's start: the sounds the page lends are the loop and the landing only", () => {
    const calls: string[] = [];
    const sounds = { slide: () => { calls.push('slide'); }, land: () => { calls.push('land'); }, play: () => { calls.push('play'); } };
    const { p, walker } = page(sounds);
    walker.place(60, 10, 20);
    walker.state.yaw = 0;
    for (let i = 0; i < 240 && p.traversal()?.state().kind !== 'ladder'; i++) walker.tick(FORWARD);
    for (let i = 0; i < 60; i++) walker.tick(FORWARD);
    p.action();
    for (let i = 0; i < 240 && p.traversal()?.state().kind !== 'none'; i++) walker.tick(STILL);
    expect(calls).not.toContain('play');
    expect(calls).toEqual(['land']);                                        // no frame driven: the loop is soundFrame's
  });
});

describe('the water effects (research 86 section 5.4)', () => {
  it('keeps one ripple running, following the SEAL, a new one only when it ends; a fall into the pool splashes', () => {
    const { p, walker } = page();
    const spawned: string[] = [], played: string[] = [];
    let live = { finished: false, stopped: false };
    p.setEffects({
      spawn: (name) => { spawned.push(name); live = { finished: false, stopped: false }; const h = live; return { get finished() { return h.finished; }, stop: () => { h.stopped = true; h.finished = true; } }; },
      play: (name) => { played.push(name); return true; },
    });
    walker.place(-80, 10, 40);
    walker.tick(STILL);
    p.effectsFrame();
    p.effectsFrame();
    expect(spawned).toEqual(['big_ripple_anim']);                  // still: the anim pace; one at a time
    live.finished = true;
    p.effectsFrame();
    expect(spawned).toEqual(['big_ripple_anim', 'big_ripple_anim']);
    walker.place(-80, 40, 40);
    walker.setAirborne(true, 0);
    walker.state.y = 30;
    for (let i = 0; i < 120 && walker.airborne; i++) walker.tick(STILL);
    expect(played).toContain(FALL_IN_WATER);
  });
});

/**
 * PAR-10 (research 257 s3): the keeper on both pages (`traversal.setEffects(firearm.effects)`) -- its ripples loop until
 * stopped (research 89: `WHILE`/`END_WHILE`), so nothing the keeper forgets may run on unowned: a new effects object
 * (a new map's hand-off) and a round's clear (RIPPLES_AT_ROUND_CLEAR_READING) stop what is running.
 */
describe('the water effects\' resets (PAR-10)', () => {
  const keeper = () => {
    const { p, walker, state } = page();
    const runs: { name: string; stopped: boolean }[] = [];
    const fx = {
      spawn: (name: string) => { const r = { name, stopped: false }; runs.push(r); return { get finished() { return r.stopped; }, stop: () => { r.stopped = true; } }; },
      play: () => true,
    };
    p.setEffects(fx);
    walker.place(-80, 10, 40);
    walker.tick(STILL);
    p.effectsFrame();
    return { p, walker, state, runs, fx };
  };

  it('a new effects object handed over (the next map\'s) stops the ripple the old one ran; none runs on unowned', () => {
    const { p, runs, fx } = keeper();
    expect(runs).toEqual([{ name: 'big_ripple_anim', stopped: false }]);
    p.setEffects({ ...fx });
    expect(runs[0]!.stopped).toBe(true);
  });

  it('a round\'s clear stops the ripples running and forgets them; the next frame in the water starts one afresh (RIPPLES_AT_ROUND_CLEAR_READING)', () => {
    expect(RIPPLES_AT_ROUND_CLEAR_READING).toBe('stopped');
    const { p, runs } = keeper();
    p.clearRipples();
    expect(runs[0]!.stopped).toBe(true);
    p.effectsFrame();
    expect(runs.map((r) => r.stopped)).toEqual([true, false]);
  });

  it('the SEAL dying in the water stops the ripple running and forgets it, and starts none while dead (FUN_005b52b0 D:L469904-469913: +0xe1 bit 4 clear)', () => {
    const { p, walker, state, runs } = keeper();
    expect(runs).toEqual([{ name: 'big_ripple_anim', stopped: false }]);
    state.dead = true;                                               // the death clears +0xe1 bit 4 (research 180 U8)
    walker.tick(STILL);
    p.effectsFrame();
    expect(runs[0]!.stopped).toBe(true);
    p.effectsFrame();
    expect(runs.length).toBe(1);                                     // dead: none started
    state.dead = false;                                              // alive again in the water: the next one afresh
    p.effectsFrame();
    expect(runs.map((r) => r.stopped)).toEqual([true, false]);
  });

  it('a death out of the water stops nothing: FUN_005b52b0 runs only on a probe that met water', () => {
    const { p, walker, state, runs } = keeper();
    walker.place(0, 0, 60);                                          // out of the pool: the loop runs on (no band, no stop)
    walker.tick(STILL);
    p.effectsFrame();
    state.dead = true;
    walker.tick(STILL);
    p.effectsFrame();
    expect(runs).toEqual([{ name: 'big_ripple_anim', stopped: false }]);
  });
});

/**
 * The wading case moved from `test/effects.test.ts` (research 257 s5: `Effects.waterFrame` and `splash` retired, the
 * traversal's keeper the one on both pages): the game's effects handed to `TraversalPage`, the big ripple while the water
 * crosses the body, its rings drawn, the small one with the water over the body's top (the big one stopped), and a fall
 * into the water splashing once (`FUN_005b52b0`, D:L469808-469921; research 86 s5.4, research 89).
 */
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`the keeper wades on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('wades: the big ripple while the water crosses the body, the small one over its top; a fall splashes', async () => {
    const d = await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2');
    const fx = new Effects(() => 0.5);
    fx.setData(d);
    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld();
    // The floor, a pool 6 deep (across the standing body, 19.6) and one 25 deep (within 10 over its top).
    const polys = [
      floor(-100, -100, 100, 100, 0), { ...floor(-100, 20, -60, 60, 6), material: 11 }, { ...floor(60, 20, 100, 60, 25), material: 11 },
    ];
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
    const owners: CollisionOwner[] = polys.map((q, i) => ({ modelName: q.modelName, path: `${q.path}${i}`, first: i, count: 1 }));
    const g = packGround(params, polys, owners);
    const walker = new Walker(groundGrid(g));
    let moves: TraversalHooks | null = null;
    const walk = {
      useTraversal(f: (w: Walker, gd: GroundData) => TraversalHooks) { moves = f(walker, g); walker.driver = moves; },
      traversal: () => moves, mode: () => 'walk', drawnFeet: () => walker.drawnFeet(), isLocked: () => false, isDead: () => false,
      lean: () => undefined,
    } as unknown as WalkMode;
    const p = new TraversalPage(walk);
    p.setEffects(fx);
    walker.place(-80, 0, 40);
    walker.tick(STILL);
    p.effectsFrame();
    expect(fx.stats().water.ripples).toBe('big_ripple_anim');
    for (let i = 0; i < 90; i++) { walker.tick(STILL); p.effectsFrame(); fx.update(1 / 60, camera); }
    expect(fx.stats().water.ripples).toBe('big_ripple_anim');        // one, kept
    expect(fx.stats().particles).toBeGreaterThan(0);                 // its rings on the water
    walker.place(80, 0, 40);
    walker.tick(STILL);
    p.effectsFrame();
    expect(fx.stats().water.ripples).toBe('small_ripple_anim');      // the big one stopped on the switch
    walker.place(-80, 40, 40);
    walker.setAirborne(true, 0);
    walker.state.y = 30;
    for (let i = 0; i < 120 && walker.airborne; i++) { walker.tick(STILL); p.effectsFrame(); }
    expect(fx.stats().played['seal_fall_in_water']).toBe(1);
    expect(fx.stats().water.splashes).toBe(1);
  });
});
