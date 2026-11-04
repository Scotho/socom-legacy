import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FsAssetSource } from '@s2u/archive/node';
import type { CollisionOwner, GridParams, WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc } from '../src/effectData';
import { Effects } from '../src/effects';
import { fallDeathLine, mountEffects } from '../src/matchEffects';
import { Hud } from '../src/hud';
import { killLine, NetPage, type NetPageDeps } from '../src/netPage';
import type { WebSocketLike } from '../src/net/client';
import type { ServerEvent } from '../src/net/protocol';
import type { RemotePlayers } from '../src/remotePlayers';
import { DEFAULT_PLAYER } from '../src/scoreboard';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import type { PlayEvent } from '../src/play';
import type { RemoteStep } from '../src/remotePlayers';
import { TraversalPage } from '../src/traversalPage';
import { groundGrid, packGround, Walker, type GroundData, type TraversalHooks, type WalkMode } from '../src/walk';

/**
 * PAR-8, PAR-9, PAR-10 (web research 257): the shared effects both pages mount (`./matchEffects`) -- /testroom's
 * `main.ts` lines, written once. The menu-launched match (`./matchMount`) hands its footfall hooks the step's sound alone
 * today (`sound.playEvent`, `sound.remoteStep`), so a footfall on sand prints nothing there. No browser is run.
 */

const SAND = 7;
const quad = (pts: number[], material: number): WorldPoly => ({
  modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype: 3, material, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
});
/** A floor at y 0 over x, z -100..100 of `material`. */
function floorGrid(material = SAND) {
  const polys = [quad([-100, 0, -100, 100, 0, -100, 100, 0, 100, -100, 0, 100], material)];
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  return groundGrid(packGround(params, polys, owners));
}

type Print = [at: number[], material: number, normal: number[], forward: number[], prone: boolean];
/** The page's parts as the menu match lends them: the firearm's effects (a recorder), the walk, the sound's step hook. */
function parts(o: { mode?: string; yaw?: number; stance?: string; grid?: boolean; material?: number } = {}) {
  const prints: Print[] = [];
  const effects = { footfall: (...a: Print) => { prints.push(a); return true; } };
  const grid = o.grid === false ? null : floorGrid(o.material);
  const walk = {
    mode: () => o.mode ?? 'walk',
    snapshot: () => ({ feet: [5, 0, 5], yaw: o.yaw ?? 90, stance: o.stance ?? 'stand' }),
    grid: () => grid,
  } as unknown as Pick<WalkMode, 'mode' | 'snapshot' | 'grid'>;
  const steps: unknown[] = [];
  const sound = { remoteStep: (id: number, step: RemoteStep, feet: [number, number, number]) => { steps.push([id, step, feet]); } };
  return { effects, walk, sound, prints, steps };
}
const footfall = (position: [number, number, number] | null = [10, 0.5, 20], foot: 'left' | 'right' = 'left'): PlayEvent =>
  ({ kind: 'footfall', foot, clip: 'seal_run', position }) as PlayEvent;
const close = (got: number[], want: number[]): void => { want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 6)); };

describe('PAR-8: the footprints on sand and snow, the own body\'s and the others\' (FUN_005a3570, FUN_005a3280)', () => {
  it("the own body's footfall prints once at the floor under the foot, along the SEAL's forward, with the floor's material and its upward normal (main.ts:893-904)", () => {
    const p = parts({ yaw: 90 });
    const fx = mountEffects(p);
    fx.playEvent(footfall());
    expect(p.prints).toHaveLength(1);
    const [at, material, normal, forward, prone] = p.prints[0]!;
    close(at, [10, 0, 20]);                                        // the floor's height under the foot, not the foot's
    expect(material).toBe(SAND);
    close(normal, [0, 1, 0]);                                      // a downward polygon normal is turned up
    close(forward, [-1, 0, 0]);                                    // yaw 90: [-sin, 0, -cos]
    expect(prone).toBe(false);
  });

  it('the foot\'s own point, else the feet; prone passed on (the effects print none prone); not walking, no grid or no floor: no print', () => {
    const p = parts({ stance: 'prone' });
    const fx = mountEffects(p);
    fx.playEvent(footfall(null));
    expect(p.prints).toHaveLength(1);
    close(p.prints[0]![0], [5, 0, 5]);
    expect(p.prints[0]![4]).toBe(true);
    fx.playEvent({ kind: 'callback', name: 'jump_whoosh' } as PlayEvent);   // not a footfall
    fx.playEvent(footfall([500, 0, 500]));                                 // off the floor
    expect(p.prints).toHaveLength(1);
    for (const o of [{ mode: 'fly' }, { grid: false }]) {
      const q = parts(o);
      mountEffects(q).playEvent(footfall());
      expect(q.prints, JSON.stringify(o)).toHaveLength(0);
    }
  });

  it("another body's footfall: its step heard once, then its print at the foot with the body's facing -- the sound and the print side by side (FUN_005a3570 D:L460344-460345, L460372-460374)", () => {
    const p = parts();
    const fx = mountEffects(p);
    const step: RemoteStep = { at: [-30, 0.2, 40], stance: 0, stick: 0.8 };
    fx.footfall(3, step, [-31, 0, 41], 180);
    expect(p.steps).toEqual([[3, step, [-31, 0, 41]]]);
    expect(p.prints).toHaveLength(1);
    close(p.prints[0]![0], [-30, 0, 40]);
    close(p.prints[0]![3], [0, 0, 1]);                             // yaw 180: facing +z
    expect(p.prints[0]![4]).toBe(false);
    fx.footfall(3, { ...step, stance: 2 }, [-31, 0, 41], 180);     // the crawl's right foot: heard, prone (no print drawn)
    expect(p.steps).toHaveLength(2);
    expect(p.prints[1]![4]).toBe(true);
    fx.footfall(3, step, [-31, 0, 41]);                            // no facing (a caller without one): heard, no print
    expect(p.steps).toHaveLength(3);
    expect(p.prints).toHaveLength(2);
  });
});

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

describe.skipIf(!MP2)(`PAR-8 on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("a footfall on sand leaves a decal through the firearm's Effects, on metal none; the round's clear wipes them (clearFootprints)", async () => {
    const d = await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2');
    const effects = new Effects(() => 0.5);
    effects.setData(d);
    const sand = parts({ material: d.materials.indexOf('SAND') });
    const fx = mountEffects({ ...sand, effects });
    fx.playEvent(footfall());
    fx.footfall(2, { at: [-30, 0, 40], stance: 0, stick: 1 }, [-30, 0, 40], 0);
    expect(effects.footprintMeshes()).toHaveLength(2);
    const metal = parts({ material: d.materials.indexOf('METAL_THICK') });
    mountEffects({ ...metal, effects }).playEvent(footfall());
    expect(effects.footprintMeshes()).toHaveLength(2);
    effects.clearFootprints();                                     // matchMount's roundClear, /testroom's clearDecals
    expect(effects.footprintMeshes()).toHaveLength(0);
  });
});


/**
 * PAR-9 (research 257 s2): "%s falls to their death" (0x65c440) is a kill line -- `FUN_00547860` (D:L412879-412880,
 * research 91 s10) posts it on the fall's death (`FUN_005ac1f0` D:L464955-464959: cause 0xfd, the faller its own
 * killer). In a match the room is every console (`room.ts` `fallDamage`: `kill`, how 'fall'), and `NetPage` -- both
 * pages' -- posts its line (`killLine`). `main.ts:892` posts it again off the page's own landing of the death class, so
 * /testroom's match showed it twice; without a room (`&nomatch`'s free walk) that line is the only one.
 */
function netPage(hud: Hud) {
  let socket: WebSocketLike | null = null;
  const walk = {
    setNetTap: () => undefined, setLocked: () => undefined, respawn: () => true, nudge: () => undefined,
    setTrigger: () => undefined, setDeathPose: () => undefined, setDeathKiller: () => undefined, setMode: () => true,
    mode: () => 'walk', feet: () => [0, 0, 0],
  } as unknown as WalkMode;
  const remote = { setTeam: () => undefined, forget: () => undefined, died: () => undefined, clear: () => undefined, frame: () => undefined } as unknown as RemotePlayers;
  const deps: NetPageDeps = {
    walk, remote, hud, clips: () => null, remoteGrenade: () => undefined, spectate: () => undefined,
    respawned: () => undefined, newRound: () => undefined, roundEffects: () => undefined, weapons: () => [HELD_RIFLE, HELD_SIDEARM],
    socket: () => { socket = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike; return socket; },
  };
  const net = new NetPage(deps, 'ws://test/ws', 'MP2', 'Tester', undefined, false, 'classic');
  socket!.onopen?.({} as Event);
  const server = (ev: ServerEvent): void => { socket!.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent); };
  server({
    type: 'welcome', id: 1, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Tester',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false, epoch: 0, env: { revision: 0, epoch: 0, states: [] },
  } as ServerEvent);
  return { net, server, socket: () => socket! };
}
/** A HUD whose message window records its lines. */
function postedHud(name = 'Tester') {
  const hud = new Hud();
  hud.setPlayerName(name);
  const lines: string[] = [];
  hud.postMessage = ((text: unknown) => { lines.push(Array.isArray(text) ? text.map((l) => (typeof l === 'string' ? l : (l as { text: string }).text)).join('/') : String(text)); }) as typeof hud.postMessage;
  return { hud, lines };
}
const landing = (cls: 0 | 1 | 2 | 3): PlayEvent => ({ kind: 'land', speed: 250, clip: 'landDeath', cls }) as PlayEvent;
const FALL = (victim: number): ServerEvent => ({ type: 'kill', killer: null, victim, weapon: null, how: 'fall', clip: 'seal_death', cause: 0xfd }) as unknown as ServerEvent;

describe('PAR-9: the fall-death message, once on each page (FUN_00547860, 0x65c440)', () => {
  it("a fall death in a match posts its line once: the room's kill line, and no landing line beside it (/testroom posted two)", () => {
    const { hud, lines } = postedHud();
    const { net, server } = netPage(hud);
    const onLand = fallDeathLine({ hud, net: () => net });
    lines.length = 0;
    onLand(landing(3));                                            // the page's own landing of the death class
    server(FALL(1));                                               // the room's death: how 'fall'
    expect(lines.filter((l) => l.endsWith('falls to their death'))).toEqual([killLine('fall', null, 'Tester', null)]);
  });

  it("the menu match's line is the room's (NetPage, both pages'): once for its own fall and once for another's", () => {
    const { hud, lines } = postedHud();
    const { server } = netPage(hud);
    server({ type: 'joined', id: 2, name: 'Bravo', team: 'terrorist' } as unknown as ServerEvent);
    lines.length = 0;
    server(FALL(2));
    server(FALL(1));
    expect(lines.filter((l) => l.endsWith('falls to their death'))).toEqual(['Bravo falls to their death', 'Tester falls to their death']);
  });

  it("no room (/testroom's free walk): the landing of the death class posts the line once, the player's name or the default; any other landing nothing", () => {
    const { hud, lines } = postedHud();
    const onLand = fallDeathLine({ hud, net: () => null });
    for (const c of [0, 1, 2] as const) onLand(landing(c));
    onLand({ kind: 'footfall', foot: 'left', clip: 'x', position: null } as PlayEvent);
    expect(lines).toEqual([]);
    onLand(landing(3));
    expect(lines).toEqual(['Tester falls to their death']);
    const unnamed = postedHud('');
    fallDeathLine({ hud: unnamed.hud, net: () => null })(landing(3));
    expect(unnamed.lines).toEqual([`${DEFAULT_PLAYER} falls to their death`]);
  });

  it("a room that was live and then closed (the server down, the connection lost; the NetPage kept, retrying, the walk unlocked) is no room: the landing of the death class posts the line once (the PAR-9 review's finding)", () => {
    const { hud, lines } = postedHud();
    const { net, socket } = netPage(hud);
    const onLand = fallDeathLine({ hud, net: () => net });
    expect(net.client.state).toBe('open');
    lines.length = 0;
    onLand(landing(3));                                            // live: the room's line is the one
    expect(lines.filter((l) => l.endsWith('falls to their death'))).toEqual([]);
    socket().onclose?.({ code: 1006, reason: '' } as CloseEvent);
    expect(net.client.state).toBe('closed');
    lines.length = 0;
    onLand(landing(3));
    expect(lines.filter((l) => l.endsWith('falls to their death'))).toEqual(['Tester falls to their death']);
  });
});

/**
 * PAR-10 (research 257 s3; research 250 s9's owed line): the water's splash and wading ripples on both pages are the
 * traversal's own (`TraversalPage`, research 86 s5.4: `FUN_005b52b0`), once it is handed the firearm's `Effects`
 * (`traversal.setEffects(firearm.effects)`) -- the menu's match never handed it any, and `/testroom` played them
 * through a second keeper (`effects.waterFrame`, the `s2u:traversal` listener's `effects.splash`; both since retired,
 * research 257 §5). The effects' stats
 * (the hooks' `effects().water`) report what runs, whoever keeps it.
 */
function poolPage() {
  const quadW = (pts: number[], ditype: number, material = 25): WorldPoly => ({
    modelName: 'worldmodel', path: 'worldmodel/q', region: 0, ditype, material, ptcount: 4, cameratype: 0, points: Float32Array.from(pts),
  });
  const floor = (x0: number, z0: number, x1: number, z1: number, y: number, material?: number): WorldPoly =>
    quadW([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3, material);
  const polys = [floor(-100, -100, 100, 100, 0), floor(-100, 20, -60, 60, 6, 11)];   // the floor, a pool 6 deep (WATER)
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
  const g: GroundData = packGround(params, polys, owners);
  const walker = new Walker(groundGrid(g));
  let moves: TraversalHooks | null = null;
  const walk = {
    useTraversal(f: (w: Walker, gd: GroundData) => TraversalHooks) { moves = f(walker, g); walker.driver = moves; },
    traversal: () => moves, mode: () => 'walk', drawnFeet: () => walker.drawnFeet(), isLocked: () => false, isDead: () => false,
    lean: () => undefined,
  } as unknown as WalkMode;
  return { traversal: new TraversalPage(walk), walker };
}
const STILL = { forward: 0, right: 0, boost: false };

describe.skipIf(!MP2)(`PAR-10 on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("the firearm's Effects handed to the traversal: a fall into the pool splashes once, the wading ripple runs, both in the effects' stats; the round's clear stops it", async () => {
    const d = await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2');
    const effects = new Effects(() => 0.5);
    effects.setData(d);
    const { traversal, walker } = poolPage();
    traversal.setEffects(effects);                                  // the line both pages are to run (s4.3)
    walker.place(-80, 40, 40);
    walker.setAirborne(true, 0);
    walker.state.y = 30;
    for (let i = 0; i < 120 && walker.airborne; i++) { walker.tick(STILL); traversal.effectsFrame(); }
    expect(effects.stats().played['seal_fall_in_water']).toBe(1);
    expect(effects.stats().water.splashes).toBe(1);
    walker.tick(STILL);
    traversal.effectsFrame();
    // One big ripple (the water across the body), at the pace it began with -- the landing's speed; the keeper starts a new
    // one only when the last has ended (FUN_005b52b0, research 86 s5.4), and the loop never ends by itself.
    expect(effects.stats().water.ripples).toMatch(/^big_ripple_anim(_walk|_run)?$/);
    traversal.clearRipples();                                        // a round's clear (RIPPLES_AT_ROUND_CLEAR_READING)
    expect(effects.stats().water.ripples).toBe('');
  });
});
