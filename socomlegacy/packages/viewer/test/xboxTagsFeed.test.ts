// @vitest-environment jsdom
/**
 * XBOX-TAGS-FEED (MISSION OT.R148, product track): the lightweight fork draws the teammates' over-head name tags and the
 * kill feed the same as the standard engine -- the standard builders (`../src/hudTags` `teamTagInput` / `teamTags`,
 * `../src/killFeed` `killFeedLine` / `killFeedSubject`, `../src/netPage` `killLine`) fed by the fork's own wiring.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { Matrix4, PerspectiveCamera } from 'three';
import type { MotionClip } from '@s2u/scene';
import { HudState } from '../src/hudState';
import { FONT_TEXT_01 } from '../src/hudFont';
import { MESSAGE_SCALE, type BannerLine } from '../src/hud';
import * as hudTags from '../src/hudTags';
import { killFeedLine } from '../src/killFeed';
import { killLine } from '../src/netPage';
import { botDisplayName } from '../src/botPresentation';
import { BAKED_LOADOUT } from '../src/loadout';
import { packGround } from '../src/walk';
import { bareMeta } from '../src/worldState';
import { BodyFlag, type BodyState, type ServerEvent } from '../src/net/protocol';
import type { WebSocketLike } from '../src/net/client';
import type { BodyRig, WalkingMap } from '../src/xboxPrototype/runtimeAssets';
import { walkingRuntime } from '../src/xboxPrototype/walkingRuntime';
import { walkingMatch, type WalkingMatchDeps } from '../src/xboxPrototype/walkingMatch';
import { prototypeRemotes } from '../src/xboxPrototype/remoteRuntime';

vi.mock('../src/hudTags', async (original) => {
  const real = await original<typeof import('../src/hudTags')>();
  return { ...real, teamTagInput: vi.fn(real.teamTagInput), teamTags: vi.fn(real.teamTags) };
});

/** A HudState stand-in: the RawHud's state with no submission; the message window's posts read back. */
class TestHud extends HudState {
  protected build() {} protected clear() {} protected hasDrawables() { return true; }
  sizes() { return { white: { width: 1, height: 1 }, [FONT_TEXT_01.texture]: { width: 256, height: 256 } }; }
  lines(): BannerLine[] { return this.posts.flatMap(post => post.lines); }
}

const clean: (() => void)[] = [];
afterEach(() => { for (const dispose of clean.splice(0).reverse()) dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(hudTags.teamTagInput).mockClear(); });

const identity = () => new Float32Array(new Matrix4().elements);
const clip = (name: string, y: number): MotionClip => ({ name, version: 5, duration: 1, frameCount: 30, rate: 30, unknown10: -1, unknown14: 1,
  parts: [{ index: 0, name: 'skel_root', flags: 0x3c, translations: Float32Array.of(0, y, 0), rotations: Float32Array.of(0, 0, 0, 1) }] });
const clips = { clips: [clip('seal_stand', 11), clip('seal_fp_stand', 11), clip('death_stand_head01', 2)], table: null };
const body: BodyRig = { model: 'fixture', height: 20, at: null, fittings: [],
  parts: ['skel_root', 'head', 'neck', 'rhand'].map((name, i) => ({ name, parent: i ? 0 : -1,
    bindLocal: identity(), bindWorld: identity(), bbox: new Float32Array([-1, -1, -1, 1, 1, 1]) })) };
const state = (id: number, feet: [number, number, number], alive = true): BodyState => ({ id, feet, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0,
  flags: alive ? BodyFlag.Alive : 0, stance: 0, landing: 0, jumps: 0, ground: 0, groundForward: 0, groundRight: 0, groundCls: -1,
  stickSnaps: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1, overlay: 0, overlayT: 0, overlaySeconds: 0, turnRate: 0,
  trav: 0, travFrame: 0, travRootY: Number.NaN, travBlend: 0, travBlendWeight: 0, peek: 0, weapon: BAKED_LOADOUT[0], slot: 0 });

/** The fork's walking runtime on a fake room socket, with a HudState stand-in for the RawHud. */
function mount(teamNames: number | null) {
  let socket!: WebSocketLike;
  vi.stubGlobal('WebSocket', class {
    readyState = 1; bufferedAmount = 0; binaryType = 'arraybuffer';
    onopen = null; onclose = null; onmessage = null; onerror = null;
    constructor() { socket = this; }
    send() {}
    close() { this.readyState = 3; }
  });
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const canvas = document.createElement('canvas'); document.body.append(canvas); clean.push(() => canvas.remove());
  const ground = packGround({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 },
    [{ modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-200, 0, 200, 200, 0, 200, 200, 0, -200, -200, 0, -200]) }],
    [{ modelName: 'worldmodel', path: 'worldmodel/ground', first: 0, count: 1 }]);
  const hud = new TestHud();
  const runtime = walkingRuntime(canvas, { ground, meta: bareMeta(), doors: [], camera: null, origin: [0, 0, 0], metersPerUnit: 0.1 } as unknown as WalkingMap,
    clips, [body], { url: 'ws://fixture.invalid', map: 'MP2', name: 'Fixture' }, hud, null,
    { without: { menus: true, talk: true }, ...(teamNames === null ? {} : { gameVars: { valve: (name: string) => name === 'DISPLAY_MP_TEAM_NAMES' ? teamNames : null } }) });
  clean.push(() => runtime.dispose()); canvas.focus(); socket.onopen?.({});
  const server = (event: ServerEvent) => socket.onmessage?.({ data: JSON.stringify(event) });
  server({ type: 'welcome', id: 7, version: 4, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'Me', rules: 'classic', round: 1, rounds: 3,
    players: [{ id: 7, name: 'Me', team: 'seal' }, { id: 8, name: 'Ally', team: 'seal' }, { id: 9, name: 'Enemy', team: 'terrorist' }], phase: 'play' } as unknown as ServerEvent);
  const rows = [7, 8, 9].map(id => ({ id, name: ['Me', 'Ally', 'Enemy'][id - 7]!, team: id === 9 ? 'terrorist' : 'seal', kills: 0, deaths: 0, score: 0, alive: true, ping: 0,
    ...(id === 8 ? { clan: 'TAG' } : {}) }));
  server({ type: 'score', rows, timeLeft: 360, spectators: [], wins: { seal: 0, terrorist: 0 } } as unknown as ServerEvent);
  server({ type: 'spawn', id: 7, at: [0, 0, 0], yaw: 0, after: 0 } as ServerEvent);
  const client = runtime.client()!;
  // The room's snapshots stand in: the ally and the enemy ahead of the page's own body.
  vi.spyOn(client, 'bodies').mockImplementation(() => [state(7, [0, 0, 0]), state(8, [0, 0, -120]), state(9, [10, 0, -120])]);
  return { runtime, hud, server, rows };
}

it('(a) feeds the HUD the standard engine\'s teammate tags each frame, from the standard input builder', () => {
  const { runtime, hud } = mount(null);
  for (let i = 0; i < 3; i++) runtime.step(1 / 30, performance.now());
  const build = vi.mocked(hudTags.teamTagInput);
  expect(build).toHaveBeenCalled();
  const [page, remotes, camera, voice, drawn] = build.mock.calls.at(-1)!;
  // The fork's facts in the standard shapes: the seat, the room's rows, the names, the sides and the heads.
  expect(page.client).toMatchObject({ id: 7, role: 'player', team: 'seal' });
  expect(page.rows.map(row => row.id)).toEqual([7, 8, 9]);
  expect(page.nameOf(8)).toBe('Ally'); expect(page.isBot?.(8)).toBe(false);
  expect(remotes.teamOf(8)).toBe('seal'); expect(remotes.teamOf(9)).toBe('terrorist');
  expect(remotes.headAt(8)).not.toBeNull(); expect(remotes.deathAge(8)).toBeNull();
  expect(camera).toBe(runtime.fly.camera);
  // The same view the standard engine computes for the same input (`matchMount`'s line), on the fork's HUD.
  const expected = hudTags.teamTags({ ...hudTags.teamTagInput(page, remotes, camera, voice, drawn), original: hud.teammateNamesOriginal() });
  const shown = hud.state().model.teamTags;
  expect(shown).toEqual(expected);
  expect(shown!.points.map(point => [point.id, point.text])).toEqual([[8, '[TAG] Ally']]);
  expect(hud.teammateNamesOn()).toBe(true);
});

it('(a) TEAMMATE NAMES 0 draws no tag text on the fork\'s HUD, as the standard HUD\'s valve hides them', () => {
  const on = mount(1), off = mount(0);
  for (let i = 0; i < 3; i++) { on.runtime.step(1 / 30, performance.now()); off.runtime.step(1 / 30, performance.now()); }
  // The HUD shown (the fixture's spawn waits on the client's walk), so only the valve decides whether the texts draw.
  const texts = (hud: TestHud) => { hud.setVisible(true); return hud.layoutFrame({ width: 640, height: 448 }, 0).quads.filter(quad => quad.element === 'teamTags').length; };
  expect(on.hud.teammateNamesOn()).toBe(true); expect(texts(on.hud)).toBeGreaterThan(0);
  expect(off.hud.teammateNamesOn()).toBe(false); expect(texts(off.hud)).toBe(0);
});

it('(a) the fork\'s remotes give the standard tag input its head and death clock', () => {
  const remotes = prototypeRemotes({ map: {} as WalkingMap, models: [body], clips,
    ownId: () => 1, team: () => 'seal', kit: () => [...BAKED_LOADOUT], setKit() {}, grid: () => null, step() {} });
  const camera = new PerspectiveCamera();
  remotes.frame(0.1, [state(2, [0, 0, -50])], camera, [0, 0, 0]);
  expect(remotes.headAt(2)).toEqual(remotes.targets.node(2, 'head'));
  expect(remotes.deathAge(2)).toBeNull();
  remotes.event({ type: 'kill', victim: 2, killer: 1, weapon: null, how: 'weapon', clip: 'death_stand_head01' } as ServerEvent);
  remotes.frame(0.1, [state(2, [0, 0, -50], false)], camera, [0, 0, 0], 0.25);
  expect(remotes.deathAge(2)).toBeCloseTo(0.25);
  expect(remotes.headAt(3)).toBeNull();
  remotes.dispose();
});

function matchSetup() {
  const bodies = [{ id: 7, feet: [0, 0, 0], yaw: 0, flags: 0 }, { id: 8, feet: [10, 0, 0], yaw: 0, flags: BodyFlag.Alive },
    { id: 9, feet: [20, 0, 0], yaw: 0, flags: BodyFlag.Alive }, { id: 10, feet: [30, 0, 0], yaw: 0, flags: BodyFlag.Alive }];
  const client = { id: 7, role: 'player', team: 'seal', state: 'open', bodies: () => bodies, roomSecondsDead: () => null, healthOf: () => null };
  const walk = { mode: () => 'walk', isDead: () => true, setMode: vi.fn(), resumeBody: vi.fn(), setDead: vi.fn(),
    gridOfGround: () => null, queueRespawnAction: vi.fn(() => true), setDeathKiller: vi.fn(), setDeathPose: vi.fn(), setFlinchPose: vi.fn(), pushHeard: vi.fn() };
  const fly = { camera: new PerspectiveCamera(), setPose: vi.fn(), setMagnification: vi.fn(), aspect: () => 1 };
  const hud = new TestHud();
  const match = walkingMatch({ client: () => client, walk, fly, hud, now: () => 0, ownCorpseExpired: () => false, rootOf: () => null } as unknown as WalkingMatchDeps);
  match.event({ type: 'welcome', id: 7, role: 'player', team: 'seal', name: 'Me', rules: 'classic', round: 1, rounds: 3, resumed: true,
    players: [{ id: 7, team: 'seal', name: 'Me' }, { id: 8, team: 'seal', name: 'Ally' }, { id: 9, team: 'terrorist', name: 'Enemy' },
      { id: 10, team: 'terrorist', name: 'Robo', bot: true }] } as unknown as ServerEvent, 0);
  return { match, hud };
}
/** The standard engine's post for the same kill, on a fresh HUD: `netPage`'s `case 'kill'` line. */
function standard(...args: Parameters<typeof killFeedLine>): BannerLine[] {
  const ref = new TestHud(); ref.postMessage([killFeedLine(...args)]); return ref.lines();
}
const kill = (k: { killer: number | null; victim: number; weapon: string | null; how: string; killerName?: string; victimKind?: string }) =>
  ({ type: 'kill', clip: null, ...k }) as unknown as ServerEvent;

it('(b) posts the standard kill-feed line on each kill, the orange mark on the page\'s own', () => {
  const { match, hud } = matchSetup();
  match.event(kill({ killer: 7, victim: 9, weapon: 'M4A1', how: 'weapon' }), 0);
  const mine = standard('weapon', { name: 'Me', side: 'seal' }, { name: 'Enemy', side: 'terrorist' }, 'M4A1', true, MESSAGE_SCALE);
  expect(hud.lines()).toEqual(mine);
  expect(mine[0]!.text).toBe(killLine('weapon', 'Me', 'Enemy', 'M4A1'));
  expect(mine[0]!.feedMark).toBeDefined();
  match.event(kill({ killer: 9, victim: 8, weapon: 'AK47', how: 'weapon' }), 0);
  const theirs = standard('weapon', { name: 'Enemy', side: 'terrorist' }, { name: 'Ally', side: 'seal' }, 'AK47', false, MESSAGE_SCALE);
  expect(hud.lines().slice(1)).toEqual(theirs);
  expect(theirs[0]!.feedMark).toBeUndefined();
});

it('(b) the standard line for a bot, a suicide, an orphan grenade, and none for a hostage', () => {
  const { match, hud } = matchSetup();
  match.event(kill({ killer: 8, victim: 10, weapon: 'M4A1', how: 'weapon' }), 0);
  match.event(kill({ killer: 7, victim: 7, weapon: 'M67', how: 'suicide' }), 0);
  match.event(kill({ killer: null, victim: 8, weapon: 'M67', how: 'orphan', killerName: 'Gone' }), 0);
  match.event(kill({ killer: 9, victim: 40, weapon: 'AK47', how: 'weapon', victimKind: 'hostage' }), 0);
  expect(hud.lines()).toEqual([
    ...standard('weapon', { name: 'Ally', side: 'seal' }, { name: botDisplayName('Robo', true), side: 'terrorist' }, 'M4A1', false, MESSAGE_SCALE),
    ...standard('suicide', { name: 'Me', side: 'seal' }, { name: 'Me', side: 'seal' }, 'M67', true, MESSAGE_SCALE),
    ...standard('orphan', { name: 'Gone', side: null }, { name: 'Ally', side: 'seal' }, 'M67', false, MESSAGE_SCALE),
  ]);
});

it('(b) marks the line of the teammate a dead player watches, as the standard engine\'s bound view does', () => {
  const { match, hud } = matchSetup();
  match.event(kill({ killer: 9, victim: 7, weapon: 'AK47', how: 'weapon' }), 0);
  match.key({ type: 'keyup', code: 'ArrowRight', repeat: false, preventDefault: vi.fn() } as never, false);
  expect(match.report().watching).toBe(8);
  match.event(kill({ killer: 8, victim: 9, weapon: 'M4A1', how: 'weapon' }), 0);
  expect(hud.lines().slice(1)).toEqual(standard('weapon', { name: 'Ally', side: 'seal' }, { name: 'Enemy', side: 'terrorist' }, 'M4A1', true, MESSAGE_SCALE));
});

it('(b) a room kill reaches the fork\'s HUD through the walking runtime', () => {
  const { hud, server } = mount(null);
  server(kill({ killer: 8, victim: 9, weapon: 'M4A1', how: 'weapon' }));
  expect(hud.lines()).toEqual(standard('weapon', { name: 'Ally', side: 'seal' }, { name: 'Enemy', side: 'terrorist' }, 'M4A1', false, MESSAGE_SCALE));
});
