import { describe, expect, it } from 'vitest';
import { noInput, type Input } from '../src/gamepad';
import type { ScenicView } from '../src/mapMeta';
import type { Rules, Team } from '../src/net/protocol';
import { nextFollow } from '../src/net/rules';
import * as spectatorModule from '../src/spectatorView';
import {
  bindRemembered, cameraEye, deadCycleRuns, FOLLOW_AFTER_DELETE_PLACEHOLDER, FOLLOW_DELETE_QUEUE_PLACEHOLDER, FOLLOW_RETIRED_BODY_PLACEHOLDER, followPose, jumpToVisible, SCENIC_LOOK, SCENIC_LOOK_AXES_READING, SCENIC_ZOOM, scenicLook, scenicMagnification, scenicViews,
  segmentDistance, SPECTATOR_ENTRY_POSE_PLACEHOLDER, SPECTATOR_HOSTAGE_READING, SPECTATOR_START_READING, spectatorToggle, SpectatorView,
  type SpectatorBody, type SpectatorKey, type SpectatorMode, type SpectatorPose, type SpectatorSeat,
} from '../src/spectatorView';

/**
 * PF-31 (ruling PF.R51; research 179 §9.6, 91 §12, 232 §5): the spectator's and the benched dead player's controls as
 * the game has them -- `FUN_00295260` (D:L139463-139590) and the cycle latch (D:L451683-451694) test every pad byte
 * `== 3`, just released -- with Space kept as the PC convenience (the owner).
 */

const ALIVE = 64;
const body = (id: number, feet: [number, number, number], alive = true, yaw = 0): SpectatorBody => ({ id, feet, yaw, flags: alive ? ALIVE : 0 });

function rig(o: { inverted?: boolean; role?: 'player' | 'spectator'; self?: number | null; team?: Team | null; teams?: [number, Team][]; rules?: Rules; ghost?: boolean; bodies?: SpectatorBody[]; views?: readonly ScenicView[]; escortees?: number[] } = {}) {
  const poses: (SpectatorPose | null)[] = [];
  const mags: number[] = [];
  let left = 0;
  let returned = 0;
  const state = { bodies: o.bodies ?? [] };
  const seat = (): SpectatorSeat => ({
    role: o.role ?? 'spectator', self: o.self ?? null, team: o.team ?? null, teams: new Map(o.teams ?? []), rules: o.rules ?? 'classic', ghost: o.ghost ?? false,
  });
  const view = new SpectatorView({
    bodies: () => state.bodies, seat, spectate: (p) => poses.push(p), leaveSelf: () => { left++; }, returnSelf: () => { returned++; },
    escortee: (id) => (o.escortees ?? []).includes(id), views: () => o.views ?? [], magnify: (m) => mags.push(m),
    pitchSign: () => (o.inverted ? -1 : 1),
  });
  /** One pad frame with these flags held. */
  const pad = (held: Partial<Input> = {}): void => view.pad({ ...noInput(), ...held });
  /** A press and its release: the release is the edge that acts. */
  const tap = (flag: keyof Input): void => { pad({ [flag]: true }); pad(); };
  return { view, poses, pad, tap, state, left: () => left, returned: () => returned, mags, seat: o };
}

const key = (type: 'keydown' | 'keyup', code: string, repeat = false): SpectatorKey & { prevented: boolean } => {
  const e = { type, code, repeat, prevented: false, preventDefault() { e.prevented = true; } };
  return e;
};

const VIEWS: ScenicView[] = [
  { name: 'SEAL Start', at: [979, 236, 689], pitch: -26, yaw: 53, roll: 0 },
  { name: 'Middle Passage', at: [749, 206, 647], pitch: -16, yaw: 155, roll: 0 },
  { name: 'Eastern Overlook', at: [1199, 255, 1073], pitch: -37, yaw: 54, roll: 0 },
];

describe('SpectatorView: the spectator camera and the dead cycle (PF-31, PF.R51)', () => {
  it("the spectator's pad acts on release, never on press (FUN_00295260 D:L139463-139590: every test == 3): Right/Left the next/previous followed player, Up/Down the next/previous scenic view entering scenic mode, X follow or scenic -> free -> back, remembering the mode (PT-19b), Triangle the visible player nearest the view's centre (FUN_00294f40 L139348)", () => {
    const r = rig({ bodies: [body(9, [0, 0, 0]), body(3, [0, 0, 0]), body(5, [0, 0, 0])], views: VIEWS });
    // Right (the d-pad's right, `leanRight`): held, nothing; released, the first living player in seat order.
    r.pad({ leanRight: true });
    expect(r.view.target).toBeNull();
    r.pad({ leanRight: true });
    expect(r.view.target).toBeNull();
    r.pad();
    expect(r.view.target).toBe(3);
    r.tap('leanRight');
    expect(r.view.target).toBe(5);
    r.tap('leanLeft');
    expect(r.view.target).toBe(3);
    r.tap('leanLeft');
    expect(r.view.target).toBe(9);           // previous wraps
    expect(r.view.mode).toBe('follow');
    // Up (`zoom`): the scenic view +1 from none (FUN_002ab260: (-1 + 1) mod n = the first), scenic mode; Down -1, wrapping.
    r.pad({ zoom: true });
    expect(r.view.mode).toBe('follow');
    r.pad();
    expect([r.view.mode, r.view.scenic]).toEqual(['scenic', 0]);
    r.tap('zoom');
    expect(r.view.scenic).toBe(1);
    r.tap('zoomOut');
    r.tap('zoomOut');
    expect([r.view.mode, r.view.scenic]).toEqual(['scenic', 2]);
    // X (Cross, `action`): scenic -> free, remembering scenic; again: back to scenic at the same view (PT-19b: free the
    // hub, `FUN_00295260` D:L139482-139484, D:L139518-139523).
    r.pad({ action: true });
    expect(r.view.mode).toBe('scenic');
    r.pad();
    expect([r.view.mode, r.view.remembered]).toEqual(['free', 'scenic']);
    r.tap('action');
    expect([r.view.mode, r.view.scenic]).toEqual(['scenic', 2]);
    // Triangle (`stance`): the non-spectator nearest the view's centre line; within 10 % of the best, the nearer wins.
    // (The start is free, SPECTATOR_START_READING: Right follows the first living player, 3 here.)
    const t = rig({ bodies: [body(3, [10, 0, -100]), body(5, [10.5, 0, -50]), body(9, [20, 0, -30])] });
    t.view.frame({ position: [0, 0, 0], forward: [0, 0, -1], far: 1000 });
    expect(t.view.target).toBeNull();
    t.tap('leanRight');
    expect(t.view.target).toBe(3);
    t.pad({ stance: true });
    expect(t.view.target).toBe(3);
    t.pad();
    expect([t.view.target, t.view.mode]).toEqual([5, 'follow']);   // 5 % off 3's line distance and half its range
    // Nearer the eye but 15 % farther from the line than the best: not taken (the line test first, rel >= 0.1).
    const u = rig({ bodies: [body(2, [50, 0, -10]), body(3, [10, 0, -100]), body(5, [11.5, 0, -10])] });
    u.view.frame({ position: [0, 0, 0], forward: [0, 0, -1], far: 1000 });
    u.tap('leanRight');
    expect(u.view.target).toBe(2);
    u.tap('stance');
    expect(u.view.target).toBe(3);
  });

  it('a dead player cycles its living teammates and its own body, escortees and hostages excluded (D:L412604-412609; the own actor alive or dead, D:L412605, D:L412658); a spectator cycles every living non-spectator (FUN_00547170 argument 0 / 1); the dead cycle does not run in a respawn game unless the player is a ghost (D:L451681-451682, DEAD_CYCLE_RESPAWN_READING)', () => {
    const bodies = [body(1, [0, 0, 0], false), body(2, [0, 0, 0]), body(3, [0, 0, 0]), body(4, [0, 0, 0]), body(6, [0, 0, 0], false), body(7, [0, 0, 0])];
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [3, 'terrorist'], [4, 'seal'], [6, 'seal'], [7, 'seal']];
    const dead = rig({ role: 'player', self: 1, team: 'seal', teams, bodies, escortees: [4] });
    dead.view.bench();
    dead.tap('leanRight');
    expect(dead.view.watching).toBe(2);
    expect(dead.left()).toBe(1);             // the first cycle leaves the own body for the fly camera
    dead.tap('leanRight');
    expect(dead.view.watching).toBe(7);      // 3 a Terrorist, 4 an escortee, 6 dead: passed
    dead.tap('leanRight');
    // DEAD-CYCLE (LATER 78): past 7 the walk wraps to slot 1, the own actor, a candidate alive or dead (D:L412658): back
    // on the own body (was: 2, the own seat left out).
    expect([dead.view.watching, dead.returned()]).toEqual([null, 1]);
    dead.tap('leanLeft');
    expect(dead.view.watching).toBe(7);      // from the own slot down, wrapping: 7
    expect(dead.left()).toBe(2);
    // A dead player has no spectator camera: Up, X and Triangle do nothing.
    dead.tap('zoom'); dead.tap('action'); dead.tap('stance');
    expect([dead.view.mode, dead.view.watching]).toEqual(['free', 7]);   // the spectator camera's mode untouched: the start's
    // Not benched: the pad and the keys leave the player alone.
    const alive = rig({ role: 'player', self: 1, team: 'seal', teams, bodies });
    alive.tap('leanRight');
    expect(alive.view.key(key('keyup', 'Space'))).toBe(false);
    expect([alive.view.watching, alive.view.target, alive.left()]).toEqual([null, null, 0]);
    // A spectator: every living body, either side, the escortee too (argument 0 has no team or 0x20000 test).
    const spec = rig({ role: 'spectator', teams, bodies, escortees: [4] });
    const seen: (number | null)[] = [];
    for (let i = 0; i < 5; i++) { spec.tap('leanRight'); seen.push(spec.view.target); }
    expect(seen).toEqual([2, 3, 4, 7, 2]);
    // Respawn on: the dead do not cycle; a ghost does; a spectator does.
    const respawn = rig({ role: 'player', self: 1, team: 'seal', teams, bodies, rules: 'respawn' });
    respawn.view.bench();
    respawn.tap('leanRight');
    expect(respawn.view.watching).toBeNull();
    const ghost = rig({ role: 'player', self: 1, team: 'seal', teams, bodies, rules: 'respawn', ghost: true });
    ghost.view.bench();
    ghost.tap('leanRight');
    expect(ghost.view.watching).toBe(2);
    expect(deadCycleRuns({ role: 'player', rules: 'respawn', ghost: false })).toBe(false);
    expect(deadCycleRuns({ role: 'player', rules: 'respawn', ghost: true })).toBe(true);
    expect(deadCycleRuns({ role: 'player', rules: 'classic', ghost: false })).toBe(true);
    expect(deadCycleRuns({ role: 'spectator', rules: 'respawn', ghost: false })).toBe(true);
    // Blocked (the menu open, DEAD_CYCLE_WHILE_MENU_READING): the release is taken, nothing acts, and none fires later.
    const menu = rig({ role: 'player', self: 1, team: 'seal', teams, bodies });
    menu.view.bench();
    menu.view.pad({ ...noInput(), leanRight: true }, true);
    menu.view.pad(noInput(), true);
    menu.pad();
    expect(menu.view.watching).toBeNull();
    // reset (a spawn, a new round): the bench and its camera left.
    dead.view.reset();
    expect([dead.view.benched, dead.view.watching]).toEqual([false, null]);
  });

  // NU-11 (research 314 §4.3; the owner's question, NU.R4): a classic late joiner's ghost watches as a classic dead player
  // does -- its own actor spawned straight into the death state (`FUN_002b7d60` D:L158634-158638 -> `FUN_00543d50`
  // D:L410437), the cycle latch run for a ghost (`FUN_00592560` D:L451681-451694), its lines "Use the ... directional
  // buttons to cycle through living teammates." (`FUN_001f97b0` D:L57059-57060) -- its living teammates only (argument 1,
  // D:L412604-412609), and none of the spectator's camera (`FUN_00295260` acts for a spectator only, D:L139465). A pin: the
  // port's bench already reads so (`deadCycleRuns`, PAR-48b); green at once.
  it('NU-11: a classic ghost cycles its living teammates as the dead do, no spectator camera, until the next round', () => {
    const bodies = [body(1, [0, 0, 0], false), body(2, [0, 0, 0]), body(3, [0, 0, 0]), body(5, [0, 0, 0], false), body(7, [0, 0, 0])];
    const teams: [number, Team][] = [[1, 'terrorist'], [2, 'terrorist'], [3, 'seal'], [5, 'terrorist'], [7, 'terrorist']];
    const ghost = rig({ role: 'player', self: 1, team: 'terrorist', teams, bodies, rules: 'classic', ghost: true, views: VIEWS });
    ghost.view.bench();                                                 // the page's `seatGhost` at the welcome or the promotion
    ghost.tap('zoom'); ghost.tap('action'); ghost.tap('stance');        // Up, X, Triangle: the spectator's alone
    expect([ghost.view.mode, ghost.view.scenic, ghost.view.target, ghost.view.watching, ghost.left()]).toEqual(['free', -1, null, null, 0]);
    const seen: (number | null)[] = [];
    for (let i = 0; i < 3; i++) { ghost.tap('leanRight'); seen.push(ghost.view.watching); }
    // 3 a SEAL, 5 dead: passed; past 7 the own (unseen) body, a stop of the walk (DEAD-CYCLE, LATER 78; D:L412658).
    expect(seen).toEqual([2, 7, null]);
    expect([ghost.left(), ghost.returned()]).toEqual([1, 1]);          // the own body left once, for the teammate, and back
    ghost.tap('leanLeft');
    expect(ghost.view.watching).toBe(7);
    ghost.view.reset();                                                 // the next round's spawn: back in play
    expect([ghost.view.benched, ghost.view.watching]).toEqual([false, null]);
  });

  it("Space keeps following the next target (the owner's PC convenience) beside ArrowRight; the keys act on keyup, a repeat is ignored", () => {
    const r = rig({ bodies: [body(3, [0, 0, 0]), body(5, [0, 0, 0]), body(9, [0, 0, 0])], views: VIEWS });
    const down = key('keydown', 'Space');
    expect(r.view.key(down)).toBe(false);
    expect(r.view.target).toBeNull();
    const up = key('keyup', 'Space');
    expect(r.view.key(up)).toBe(true);
    expect([r.view.target, up.prevented]).toEqual([3, true]);
    r.view.key(key('keyup', 'ArrowRight'));
    expect(r.view.target).toBe(5);
    r.view.key(key('keyup', 'ArrowRight', true));
    expect(r.view.target).toBe(5);
    r.view.key(key('keyup', 'ArrowLeft'));
    expect(r.view.target).toBe(3);
    r.view.key(key('keyup', 'ArrowUp'));
    expect([r.view.mode, r.view.scenic]).toEqual(['scenic', 0]);
    r.view.key(key('keyup', 'ArrowDown'));
    expect(r.view.scenic).toBe(2);
    r.view.key(key('keyup', 'KeyX'));
    expect(r.view.mode).toBe('free');            // scenic -> free (PT-19b, D:L139482-139484)
    r.view.key(key('keyup', 'KeyV'));          // V, the page's old free-camera key, is X's alias
    expect(r.view.mode).toBe('scenic');
    expect(r.view.key(key('keyup', 'Space'), true)).toBe(false);   // blocked: the menu's keys alone
    // The dead: Space and ArrowRight the next living teammate.
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [7, 'seal']];
    const dead = rig({ role: 'player', self: 1, team: 'seal', teams, bodies: [body(1, [0, 0, 0], false), body(2, [0, 0, 0]), body(7, [0, 0, 0])] });
    dead.view.bench();
    dead.view.key(key('keydown', 'Space'));
    expect(dead.view.watching).toBeNull();
    dead.view.key(key('keyup', 'Space'));
    expect(dead.view.watching).toBe(2);
    dead.view.key(key('keyup', 'ArrowRight'));
    expect(dead.view.watching).toBe(7);
  });

  it('the follow pose is 24.906 behind and 25.709 over the followed body at pitch -9.167 (the third-person rest, research 83), and stays on the followed body when it dies (AD-8, research 314 §5.4)', () => {
    const r = rig({ bodies: [body(5, [100, 10, 200], true, 90), body(9, [0, 0, 0])] });
    r.tap('leanRight');
    expect(r.view.target).toBe(5);
    r.view.frame();
    const p = r.poses.at(-1)!;
    expect(p.x).toBeCloseTo(100 + 24.906, 6);
    expect(p.y).toBeCloseTo(10 + 25.709, 6);
    expect(p.z).toBeCloseTo(200, 6);
    expect([p.yaw, p.pitch]).toEqual([90, -9.167]);
    r.state.bodies = [body(5, [100, 10, 200], false, 90), body(9, [0, 0, 0])];
    r.view.frame();
    expect(r.view.target).toBe(5);                                    // AD-8: the dead body kept (was: 9, the first living)
    expect(r.poses.at(-1)).toMatchObject({ x: 100 + 24.906, y: 10 + 25.709 });
    // The dead's teammate (LATER 69, research 314 §5.6): kept on the watched one's body when it dies (was: on to 7).
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [7, 'seal']];
    const d = rig({ role: 'player', self: 1, team: 'seal', teams, bodies: [body(1, [0, 0, 0], false), body(2, [3, 0, 4]), body(7, [5, 0, 5])] });
    d.view.bench();
    d.tap('leanRight');
    d.state.bodies = [body(1, [0, 0, 0], false), body(2, [3, 0, 4], false), body(7, [5, 0, 5])];
    d.view.frame();
    expect(d.view.watching).toBe(2);
    expect(d.poses.at(-1)).toMatchObject({ x: 3, z: 4 + 24.906 });
    // The free camera stands nowhere: one null, then the frames leave the fly camera alone.
    r.tap('action');
    expect([r.view.mode, r.poses.at(-1)]).toEqual(['free', null]);
    const n = r.poses.length;
    r.view.frame();
    expect(r.poses.length).toBe(n);
  });

  it("scenic views come from mission.rdr's Scenic_Views (SCENIC_VIEWS_READING); a map without them makes Up/Down no-ops and X toggles free only (from the start, nothing)", () => {
    const r = rig({ views: scenicViews({ scenicViews: VIEWS }) });
    r.tap('zoom');
    r.view.frame();
    expect(r.poses.at(-1)).toEqual({ x: 979, y: 236, z: 689, yaw: 53, pitch: -26 });
    r.tap('zoomOut');
    expect(r.poses.at(-1)).toEqual({ x: 1199, y: 255, z: 1073, yaw: 54, pitch: -37 });
    expect(scenicViews({})).toEqual([]);
    const none = rig({ views: scenicViews({}) });
    none.tap('zoom');
    none.tap('zoomOut');
    expect([none.view.mode, none.view.scenic, none.poses]).toEqual(['free', -1, []]);
    // From the start (free, remembered free) X does nothing (D:L139519); once a player is followed, X toggles free only.
    none.tap('action');
    expect([none.view.mode, none.poses]).toEqual(['free', []]);
    none.state.bodies = [body(3, [0, 0, 0])];
    none.tap('leanRight');
    expect(none.view.mode).toBe('follow');
    none.tap('action');
    expect(none.view.mode).toBe('free');
    none.tap('action');
    expect(none.view.mode).toBe('follow');
  });

  it("the Triangle jump's eye is the camera's world position and -z axis, and its distance FUN_00308800's to a segment (the nearer end past either)", () => {
    // An identity camera at (1, 2, 3) looks down -z (column-major matrixWorld, translation in 12-14).
    const eye = cameraEye({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1] }, far: 500 });
    expect(cameraEye({})).toBeUndefined();
    expect(eye).toEqual({ position: [1, 2, 3], forward: [-0, -0, -1], far: 500 });
    expect(segmentDistance([3, 0, -5], [0, 0, 0], [0, 0, -10])).toBeCloseTo(3, 9);
    expect(segmentDistance([0, 4, 3], [0, 0, 0], [0, 0, -10])).toBeCloseTo(5, 9);     // behind the eye: to the eye
    expect(segmentDistance([0, 3, -14], [0, 0, 0], [0, 0, -10])).toBeCloseTo(5, 9);   // past the far end: to it
  });
});

/**
 * PT-19b (web sprint 35; research 244 §3): the camera's state byte (+0xf4, `FUN_0029b0c0` D:L142660 hands `FUN_00295260`
 * the camera's +0xf4) is 0 free (`FUN_002964f0` D:L140442), 1 follow (`FUN_00297410` D:L140957-140960), 2 scenic; X
 * (`FUN_00295260` D:L139480-139530) goes scenic -> free -> scenic and follow -> free -> follow: free is the hub.
 * `FUN_002956e0` (the bind, the end of the Triangle jump D:L139442) writes the remembered byte from the mode it leaves
 * (D:L139680-139686) and enters follow for another actor (D:L139698-139704).
 */
describe('PT-19b: the mode byte as the original -- 0 free, 1 follow, 2 scenic; free the X hub', () => {
  it("X, as FUN_00295260 D:L139480-139530: from scenic remember scenic and go free; from follow remember follow and go free; from free go to the remembered mode -- a remembered free does nothing", () => {
    const all: SpectatorMode[] = ['free', 'follow', 'scenic'];
    const got = all.flatMap((mode) => all.map((remembered) => [mode, remembered, spectatorToggle(mode, remembered)]));
    expect(got).toEqual([
      ['free', 'free', { mode: 'free', remembered: 'free' }],          // D:L139519: mode = remembered, neither branch
      ['free', 'follow', { mode: 'follow', remembered: 'follow' }],    // D:L139525-139527: FUN_002956e0 on +0x18
      ['free', 'scenic', { mode: 'scenic', remembered: 'scenic' }],    // D:L139520-139523: FUN_002ab260 step 0
      ['follow', 'free', { mode: 'free', remembered: 'follow' }],      // D:L139500-139508
      ['follow', 'follow', { mode: 'free', remembered: 'follow' }],
      ['follow', 'scenic', { mode: 'free', remembered: 'follow' }],
      ['scenic', 'free', { mode: 'free', remembered: 'scenic' }],      // D:L139482-139484
      ['scenic', 'follow', { mode: 'free', remembered: 'scenic' }],
      ['scenic', 'scenic', { mode: 'free', remembered: 'scenic' }],
    ]);
    // FUN_002956e0 D:L139680-139686: the remembered byte takes the mode left, 0 -> 0 and 1 -> 1; from 2 it is kept.
    expect(all.flatMap((mode) => all.map((remembered) => bindRemembered(mode, remembered)))).toEqual([
      'free', 'free', 'free', 'follow', 'follow', 'follow', 'free', 'follow', 'scenic',
    ]);
  });

  it("the start is free, remembered free, the scenic index -1: the camera's init (FUN_00299150 D:L141664-141666) and the online set-up's bind of the local object (FUN_00599b60 D:L455701 -> CAppCamera's +0xc FUN_0029b3c0 -> FUN_002956e0 D:L142768, D:L139699-139700); the camera stands where the page has it (SPECTATOR_ENTRY_POSE_PLACEHOLDER); X does nothing until Right, Left or Triangle follows", () => {
    expect(SPECTATOR_START_READING).toEqual({ mode: 'free', remembered: 'free', scenic: -1 });
    expect(SPECTATOR_ENTRY_POSE_PLACEHOLDER).toBe('the page camera as it stands');
    const r = rig({ bodies: [body(3, [0, 0, 0]), body(5, [10, 0, 0])], views: VIEWS });
    expect([r.view.mode, r.view.remembered, r.view.scenic, r.view.target]).toEqual(['free', 'free', -1, null]);
    r.view.frame();
    expect(r.poses).toEqual([]);                          // no pose at entry: the fly camera where the page has it
    r.tap('action');
    expect([r.view.mode, r.view.remembered, r.poses]).toEqual(['free', 'free', []]);
    r.tap('leanRight');
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'free', 3]);
    r.view.frame();
    expect(r.poses.at(-1)).toMatchObject({ x: 0, y: 25.709, z: 24.906 });
  });

  it("the cycle binds through the camera's +0xc as the jump does (D:L412618, D:L412675 -> FUN_0029b3c0 -> FUN_002956e0): the remembered byte from the mode it left (D:L139680-139686)", () => {
    const r = rig({ bodies: [body(3, [0, 0, 0]), body(5, [10, 0, 0])], views: VIEWS });
    r.tap('zoom');
    r.tap('action');
    expect([r.view.mode, r.view.remembered]).toEqual(['free', 'scenic']);
    r.tap('leanRight');                                   // from free: remembered free
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'free', 3]);
    r.tap('leanRight');                                   // from follow: remembered follow
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'follow', 5]);
    r.tap('zoom');
    expect(r.view.mode).toBe('scenic');
    r.tap('leanLeft');                                    // from scenic: kept
    // DEAD-CYCLE (LATER 79): Up onto a view bound the own object (D:L139552-139555), so Left walks from its slot -- the
    // last living (SPECTATOR_OWN_SLOT_PLACEHOLDER), 5; was 3, the one before the kept target.
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'follow', 5]);
  });

  it('the cycle binds only when the walk finds someone (D:L412617, D:L412674): with nobody alive Right changes nothing, and a later spawn is not followed until Right', () => {
    const r = rig({ bodies: [body(3, [0, 0, 0], false)], views: VIEWS });
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['free', 'free', null]);
    r.tap('leanRight');
    r.tap('leanLeft');
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['free', 'free', null]);
    r.state.bodies = [body(3, [0, 0, 0], false), body(5, [10, 0, 0])];
    r.view.frame();
    expect([r.view.mode, r.view.target, r.poses]).toEqual(['free', null, []]);
    r.tap('leanRight');
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'free', 5]);
  });

  it('follow -> free -> follow, the followed player kept; scenic -> free -> scenic at the same view; the free camera stands nowhere', () => {
    const r = rig({ bodies: [body(3, [0, 0, 0]), body(5, [10, 0, 0])], views: VIEWS });
    r.tap('leanRight');
    r.tap('leanRight');
    expect([r.view.mode, r.view.target]).toEqual(['follow', 5]);
    r.tap('action');
    expect([r.view.mode, r.view.remembered, r.poses.at(-1)]).toEqual(['free', 'follow', null]);
    r.tap('action');
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'follow', 5]);
    r.view.frame();
    expect(r.poses.at(-1)).toMatchObject({ x: 10, y: 25.709, z: 24.906 });
    // Up: scenic at view 0 (D:L139531-139558); X: free remembering scenic, the camera left where the view stood it.
    r.tap('zoom');
    r.tap('zoom');
    expect([r.view.mode, r.view.scenic]).toEqual(['scenic', 1]);
    r.tap('action');
    expect([r.view.mode, r.view.remembered, r.poses.at(-1)]).toEqual(['free', 'scenic', null]);
    const n = r.poses.length;
    r.view.frame();
    expect(r.poses.length).toBe(n);                       // free: no frame moves the camera
    r.tap('action');
    expect([r.view.mode, r.view.remembered, r.view.scenic]).toEqual(['scenic', 'scenic', 1]);
    expect(r.poses.at(-1)).toEqual({ x: 749, y: 206, z: 647, yaw: 155, pitch: -16 });
    // Free is the hub: X from scenic never reaches follow, X from follow never reaches scenic.
    r.tap('action');
    r.tap('leanRight');                                   // the cycle from free enters follow
    expect(r.view.mode).toBe('follow');
    r.tap('action');
    r.tap('action');
    expect([r.view.mode, r.view.remembered]).toEqual(['follow', 'follow']);
  });

  it('the Triangle jump enters follow through FUN_002956e0 (D:L139442): the remembered byte from the mode it left -- free from free, follow from follow, kept from scenic (D:L139680-139686)', () => {
    const eye = { position: [0, 0, 0], forward: [0, 0, -1], far: 1000 };
    const bodies = [body(3, [10, 0, -100]), body(5, [10.5, 0, -50])];
    // From free: follow, remembering free; X then goes to free remembering follow (the follow branch).
    const f = rig({ bodies, views: VIEWS });
    f.tap('action');
    expect(f.view.mode).toBe('free');
    f.view.frame(eye);
    f.tap('stance');
    expect([f.view.mode, f.view.remembered, f.view.target]).toEqual(['follow', 'free', 5]);
    f.tap('action');
    expect([f.view.mode, f.view.remembered]).toEqual(['free', 'follow']);
    // From scenic: follow, the remembered byte kept.
    const s = rig({ bodies, views: VIEWS });
    s.tap('zoom');
    s.tap('action');
    s.tap('action');
    expect([s.view.mode, s.view.remembered]).toEqual(['scenic', 'scenic']);
    s.view.frame(eye);
    s.tap('stance');
    expect([s.view.mode, s.view.remembered, s.view.target]).toEqual(['follow', 'scenic', 5]);
  });
});

/**
 * HX-1's fix round (the review of 288f2752, finding 3; research 237 s4): the room's hostages (bodies from 240, named by
 * the page's `escortee` hook) in a spectator's cycle and jump. Read at the decomp: neither the spectator's arm of the
 * cycle (`FUN_00546fa0` D:L412598-412609, argument 0) nor the jump (`FUN_00294f40` D:L139404-139408) tests the escortee
 * bit -- only the dead player's arm does -- so they are included (SPECTATOR_HOSTAGE_READING, a reading with a step).
 */
describe('HX-1: a spectator and the hostages', () => {
  it("a spectator's cycle and Triangle jump take a living hostage as the original's argument-0 walk and FUN_00294f40 do (no 0x20000 test, D:L412598-412609, D:L139404-139408; SPECTATOR_HOSTAGE_READING); a dead player's cycle never does (D:L412604-412609)", () => {
    expect(SPECTATOR_HOSTAGE_READING).toBe('included');
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [3, 'terrorist']];
    const bodies = [body(1, [0, 0, 0], false), body(2, [0, 0, 0]), body(3, [0, 0, 0]), body(240, [0, 0, 0]), body(241, [0, 0, 0], false)];
    const spec = rig({ role: 'spectator', teams, bodies, escortees: [240, 241] });
    const seen: (number | null)[] = [];
    for (let i = 0; i < 4; i++) { spec.tap('leanRight'); seen.push(spec.view.target); }
    expect(seen).toEqual([2, 3, 240, 2]);                              // 241 dead: passed
    // The jump: the hostage nearest the view's centre is taken.
    const far = rig({ role: 'spectator', teams, bodies: [body(2, [30, 0, -100]), body(240, [5, 0, -100])], escortees: [240] });
    far.view.frame({ position: [0, 0, 0], forward: [0, 0, -1], far: 1000 });
    far.tap('leanRight');
    expect(far.view.target).toBe(2);                                    // the start is free: Right follows the first living body
    far.tap('stance');
    expect(far.view.target).toBe(240);
    // The dead player: its teammates only, the hostage never (it has no seat on a side, and it is an escortee).
    const dead = rig({ role: 'player', self: 1, team: 'seal', teams: [...teams, [240, 'seal']], bodies, escortees: [240, 241] });
    dead.view.bench();
    const watched: (number | null)[] = [];
    for (let i = 0; i < 3; i++) { dead.tap('leanRight'); watched.push(dead.view.watching); }
    expect(watched).toEqual([2, null, 2]);                              // 2, the own body (DEAD-CYCLE, LATER 78), 2
  });
});

/**
 * SPECTATOR-VIEW (web sprint 19's second half, W19.R8; research 314 §7 W5, W6; research 248 F3, F5): the jump with no
 * alive test, and the scenic view's live look and zoom -- `FUN_002964f0` runs for camera kind 6 in modes 0 and 2 alike:
 * the look (D:L140414-140415, D:L140425-140439) in both, the magnification in mode 2 only (D:L140512-140528).
 */
describe('SPECTATOR-VIEW W5: the jump as the original walks it (research 248 F3)', () => {
  it('FUN_00294f40 has no alive test (D:L139398-139408): a dead body on the centre segment is taken over a living one off it', () => {
    const eye = { position: [0, 0, 0], forward: [0, 0, -1], far: 1000 };
    const bodies = [body(5, [30, 0, -50]), body(3, [0, 0, -100], false)];
    expect(jumpToVisible(eye, bodies)).toBe(3);
    const r = rig({ bodies });
    r.view.frame(eye);
    r.tap('stance');
    expect([r.view.target, r.view.mode, r.view.remembered]).toEqual([3, 'follow', 'free']);
    // The list's order (the seat ids standing in, SPECTATOR_CYCLE_ORDER_READING): two bodies on the line at the same
    // range, the first in that order kept (a later one replaces only when strictly nearer, D:L139415-139424).
    expect(jumpToVisible(eye, [body(9, [0, 0, -100]), body(2, [0, 0, -100], false)])).toBe(2);
  });
});

describe("SPECTATOR-VIEW W6: the scenic view's live look and zoom (research 248 F5; FUN_002964f0)", () => {
  it('the magnification: m + dt x input x m x 1.3, held to [1, 30] (D:L140408, D:L140513-140521)', () => {
    expect(SCENIC_ZOOM).toEqual({ rate: 1.3, min: 1, max: 30, reset: 0.01 });
    expect(scenicMagnification(1, 1 / 30, 1)).toBeCloseTo(1 + 1.3 / 30, 9);
    expect(scenicMagnification(10, 0.1, -1)).toBeCloseTo(8.7, 9);
    expect(scenicMagnification(1, 1 / 30, -1)).toBe(1);                // the lower bound
    expect(scenicMagnification(29, 1, 1)).toBe(30);                    // the upper
    let m = 1;
    for (let i = 0; i < 90; i++) m = scenicMagnification(m, 1 / 30, 1);  // three seconds held: x 1.0433 a frame, past 30
    expect(m).toBe(30);
    for (let i = 0; i < 300; i++) m = scenicMagnification(m, 1 / 30, -1);
    expect(m).toBe(1);
  });

  it('the look: 1.8849558 rad/s, the pitch held to +-1.5 rad, the yaw wrapped over a turn (D:L140414-140415, D:L140425-140439); the stick right turns right, up looks up (SCENIC_LOOK_AXES_READING)', () => {
    expect(SCENIC_LOOK).toEqual({ rate: 1.8849558, pitchLimit: 1.5 });
    expect(SCENIC_LOOK_AXES_READING).toEqual({ zoom: 'moveY', yaw: '-lookX', pitch: 'lookY' });
    const turned = scenicLook({ yaw: 53, pitch: -26 }, 0.5, 1, 1);     // 0.94248 rad = 54 degrees in half a second
    expect(turned.yaw).toBeCloseTo(359, 4);                            // 53 - 54, wrapped (D:L140434-140436)
    expect(turned.pitch).toBeCloseTo(28, 4);
    expect(scenicLook({ yaw: 340, pitch: 0 }, 0.5, -1, 0).yaw).toBeCloseTo(34, 4);   // left: up, past 360 (D:L140437-140439)
    expect(scenicLook({ yaw: 0, pitch: 80 }, 1, 0, 1).pitch).toBeCloseTo((1.5 * 180) / Math.PI, 9);
    expect(scenicLook({ yaw: 0, pitch: -80 }, 1, 0, -1).pitch).toBeCloseTo((-1.5 * 180) / Math.PI, 9);
    expect(scenicLook({ yaw: 53, pitch: -26 }, 0.5, 0, 0)).toEqual({ yaw: 53, pitch: -26 });
  });

  it('in scenic the look turns the view from its authored start, the position stands, and the zoom scales the magnification; the menu holds both (D:L140400)', () => {
    const r = rig({ views: VIEWS });
    r.tap('zoom');                                                     // view 0, SEAL Start
    expect(r.view.magnification).toBe(1);
    r.pad({ moveY: 1, lookX: 1 });
    r.view.frame(undefined, 0.5);
    expect(r.view.magnification).toBeCloseTo(1 + 0.5 * 1.3, 9);
    expect(r.mags.at(-1)).toBeCloseTo(1.65, 9);                        // the page's projection told
    const p = r.poses.at(-1)!;
    expect([p.x, p.y, p.z, p.pitch]).toEqual([979, 236, 689, -26]);
    expect(p.yaw).toBeCloseTo(359, 4);
    r.pad({ lookY: 1 });
    r.view.frame(undefined, 0.5);
    expect(r.poses.at(-1)!.pitch).toBeCloseTo(28, 4);
    expect(r.poses.at(-1)!.yaw).toBeCloseTo(359, 4);                   // the turn kept, not the start again
    // Held: the upper bound.
    r.pad({ moveY: 1 });
    for (let i = 0; i < 120; i++) r.view.frame(undefined, 1 / 30);
    expect(r.view.magnification).toBe(30);
    // No clock (a frame with no dt): nothing turns or zooms.
    r.view.frame();
    expect(r.view.magnification).toBe(30);
    // The menu open (the control-state byte not 0, D:L140400): the sticks read as zero.
    r.view.pad({ ...noInput(), moveY: -1 }, true);
    r.view.frame(undefined, 1);
    expect(r.view.magnification).toBe(30);
  });

  it("reset to 1 at X out of scenic (D:L139485-139498) and at Up / Down onto a view (D:L139536-139550, D:L139564-139578), and the look back at the view's start; only when more than 0.01 from 1", () => {
    const r = rig({ views: VIEWS });
    const zoomIn = (dt = 0.5): void => { r.pad({ moveY: 1, lookX: 1 }); r.view.frame(undefined, dt); r.pad(); };
    r.tap('zoom');
    zoomIn();
    expect(r.view.magnification).toBeGreaterThan(1);
    r.tap('action');                                                   // X: scenic -> free
    expect([r.view.mode, r.view.magnification, r.mags.at(-1)]).toEqual(['free', 1, 1]);
    r.pad({ moveY: 1 });
    r.view.frame(undefined, 0.5);                                      // free: the zoom does not run (mode 0)
    r.pad();
    expect(r.view.magnification).toBe(1);
    r.tap('action');                                                   // X: free -> scenic, the view reloaded (D:L139521)
    expect(r.view.mode).toBe('scenic');
    expect(r.poses.at(-1)).toEqual({ x: 979, y: 236, z: 689, yaw: 53, pitch: -26 });
    zoomIn();
    r.tap('zoom');                                                     // Up: view 1
    expect([r.view.scenic, r.view.magnification, r.mags.at(-1)]).toEqual([1, 1, 1]);
    expect(r.poses.at(-1)).toEqual({ x: 749, y: 206, z: 647, yaw: 155, pitch: -16 });
    zoomIn();
    r.tap('zoomOut');                                                  // Down: view 0
    expect([r.view.scenic, r.view.magnification]).toEqual([0, 1]);
    expect(r.poses.at(-1)).toEqual({ x: 979, y: 236, z: 689, yaw: 53, pitch: -26 });
    // Within 0.01 of 1: X leaves it (D:L139486), and the projection with it.
    r.pad({ moveY: 1 });
    r.view.frame(undefined, 0.005 / 1.3);
    r.pad();
    expect(r.view.magnification).toBeCloseTo(1.005, 9);
    r.tap('action');
    expect([r.view.mode, r.view.magnification]).toEqual(['free', r.mags.at(-1)]);
    expect(r.view.magnification).toBeCloseTo(1.005, 9);
  });

  it('a bind out of scenic -- the cycle and the Triangle jump, through FUN_002956e0 -- resets it to 1 (D:L139687-139697); a seat no longer a spectator stands at 1', () => {
    const eye = { position: [0, 0, 0], forward: [0, 0, -1], far: 1000 };
    const r = rig({ bodies: [body(3, [0, 0, -100]), body(5, [10, 0, 0])], views: VIEWS });
    r.view.frame(eye);
    r.tap('zoom');
    r.pad({ moveY: 1 });
    r.view.frame(undefined, 0.5);
    r.pad();
    r.tap('leanRight');                                                // the cycle binds
    expect([r.view.mode, r.view.remembered, r.view.magnification, r.mags.at(-1)]).toEqual(['follow', 'free', 1, 1]);   // scenic keeps the remembered byte (D:L139680-139686)
    r.tap('zoom');
    r.pad({ moveY: 1 });
    r.view.frame(undefined, 0.5);
    r.pad();
    expect(r.view.magnification).toBeGreaterThan(1);
    r.view.frame(eye);
    r.tap('stance');                                                   // the jump binds
    expect([r.view.mode, r.view.target, r.view.magnification, r.mags.at(-1)]).toEqual(['follow', 3, 1, 1]);
    // The port's promotion (a spectator seated as a player: no original counterpart) leaves no magnified projection.
    r.tap('zoom');
    r.pad({ moveY: 1 });
    r.view.frame(undefined, 0.5);
    r.pad();
    expect(r.view.magnification).toBeGreaterThan(1);
    r.seat.role = 'player';
    r.view.frame(undefined, 0.5);
    expect([r.view.magnification, r.mags.at(-1)]).toEqual([1, 1]);
  });
});

describe("SPECTATOR-VIEW W6, the gameplay seat's condition: the page's one camera is never left magnified for a player", () => {
  it('a new view tells the page 1 at its first frame (a camera an earlier page left magnified); a spawn or a promotion (reset, the seat a player) puts it back at 1 at once; a spectator\'s reset is the turnover\'s, back to 1 (AD-9)', () => {
    const r = rig({ views: VIEWS });
    r.view.frame();
    expect(r.mags).toEqual([1]);
    r.tap('zoom');
    r.pad({ moveY: 1 });
    r.view.frame(undefined, 0.5);
    r.pad();
    expect(r.view.magnification).toBeCloseTo(1.65, 9);
    r.view.reset();                                                    // AD-9: a spectator's turnover, `FUN_00299150` D:L141671
    expect([r.view.magnification, r.mags.at(-1)]).toEqual([1, 1]);
    r.seat.role = 'player';                                            // promoted: the client's role first, then the page's unbench
    r.view.reset();
    expect([r.view.magnification, r.mags.at(-1)]).toEqual([1, 1]);
  });
});

describe('SPECTATOR-VIEW review B1: the scenic pitch takes INVERT PITCH, DAT_003df198 (D:L140426)', () => {
  it('the pitch step is x the sign the START menu flips (D:L61699-61721) and the stored option sets to +-1 (D:L125167-125171): inverted, the stick up looks down', () => {
    expect(scenicLook({ yaw: 53, pitch: -26 }, 0.5, 0, 1, 1).pitch).toBeCloseTo(28, 4);
    expect(scenicLook({ yaw: 53, pitch: -26 }, 0.5, 0, 1, -1).pitch).toBeCloseTo(-80, 4);
    expect(scenicLook({ yaw: 53, pitch: -26 }, 0.5, 1, 0, -1).yaw).toBeCloseTo(359, 4);   // the yaw takes no sign (D:L140425)
    expect(scenicLook({ yaw: 0, pitch: -80 }, 1, 0, 1, -1).pitch).toBeCloseTo((-1.5 * 180) / Math.PI, 9);
    for (const inverted of [false, true]) {
      const r = rig({ views: VIEWS, inverted });
      r.tap('zoom');
      r.pad({ lookY: 1 });
      r.view.frame(undefined, 0.5);
      expect([inverted, r.poses.at(-1)!.pitch]).toEqual([inverted, expect.closeTo(inverted ? -80 : 28, 4)]);
    }
  });
});

/**
 * AD-8 (web sprint 40, the reconciliation's C83; research 314 §5.4): the followed player's death, departure and deletion.
 * The original keeps the dead bound actor (`FUN_002998f0` -> `FUN_00296f10` -> `FUN_00297410`, D:L141991-141999,
 * D:L140893-140918), and a spectator's follow is never rebound: the death camera starts only for a local bound actor
 * (D:L140896-140910) and its killer / saved-actor rebinds (D:L141484, D:L141529, D:L141616) sit in the offline arm's
 * states 2 and 4 (D:L141363-141376). A leaver is retired to state 8, the camera untouched (`FUN_005998b0`
 * D:L455516-455525); one queued removal is deleted a run (`FUN_0029f510` D:L145118-145123). Manual cycling unchanged.
 */
describe('AD-8: the followed player dies, leaves and is deleted (C83; research 314 §5.4)', () => {
  const eye = { position: [0, 0, 0], forward: [0, 0, -1], far: 1000 };

  it('the followed player dies: the view stays on the dead body, frame after frame -- no jump to the first living seat', () => {
    const r = rig({ bodies: [body(2, [0, 0, 0]), body(5, [100, 10, 200], true, 90), body(9, [0, 0, 0])] });
    r.tap('leanRight'); r.tap('leanRight');
    expect(r.view.target).toBe(5);
    r.view.frame();
    const dead = body(5, [104, 8, 200], false, 120);                  // fallen: moved and turned as the room tells it
    r.state.bodies = [body(2, [0, 0, 0]), dead, body(9, [0, 0, 0])];
    for (let i = 0; i < 5; i++) r.view.frame();
    expect([r.view.mode, r.view.target]).toEqual(['follow', 5]);
    expect(r.poses.slice(-5)).toEqual(Array(5).fill(followPose(dead)));
  });

  it('the negative rebind: no frame binds the killer, or anyone -- the online death camera rebinds no one for a spectator (D:L141363-141376)', () => {
    const r = rig({ bodies: [body(3, [0, 0, -40]), body(5, [0, 0, -100]), body(8, [10, 0, -90])] });
    r.tap('leanRight'); r.tap('leanRight');
    expect(r.view.target).toBe(5);
    const remembered = r.view.remembered;
    r.state.bodies = [body(3, [0, 0, -40]), body(5, [0, 0, -100], false), body(8, [10, 0, -90])];   // 8 the killer
    const seen: (number | null)[] = [];
    for (let i = 0; i < 10; i++) { r.view.frame(eye, 0.1); seen.push(r.view.target); }
    expect(seen).toEqual(Array(10).fill(5));
    expect([r.view.mode, r.view.remembered]).toEqual(['follow', remembered]);
    expect(r.poses.every((p) => p !== null && p.x === 0 && p.z === -100 + 24.906)).toBe(true);
  });

  it('a Triangle jump onto a corpse follows the corpse (was: one frame, then the first living body)', () => {
    const r = rig({ bodies: [body(2, [30, 0, -50]), body(3, [0, 0, -100], false), body(7, [40, 0, -60])] });
    r.view.frame(eye);
    r.tap('stance');
    expect(r.view.target).toBe(3);
    for (let i = 0; i < 3; i++) r.view.frame(eye);
    expect(r.view.target).toBe(3);
    expect(r.poses.at(-1)).toEqual(followPose(body(3, [0, 0, -100], false)));
  });

  it('manual cycling from the dead followed body steps from its slot (DEAD-CYCLE, LATER 79; FUN_0029f180 on the camera\'s +0xbc, D:L412584, D:L412637): Right takes the next living after it, Left the one before', () => {
    for (const [flag, expected] of [['leanRight', 9], ['leanLeft', 2]] as const) {
      const r = rig({ bodies: [body(2, [0, 0, 0]), body(5, [0, 0, 0]), body(9, [0, 0, 0])] });
      r.tap('leanRight'); r.tap('leanRight');
      r.state.bodies = [body(2, [0, 0, 0]), body(5, [0, 0, 0], false), body(9, [0, 0, 0])];
      r.view.frame();
      expect(r.view.target).toBe(5);
      r.tap(flag);
      // The walk from 5's slot, one slot at a time (D:L412663 up, D:L412611 down): was 2 for Right and 9 for Left, the
      // first / last living by id when the bound one was no candidate.
      expect([flag, r.view.target]).toEqual([flag, expected]);
    }
  });

  it('a departing followed player is retired as read: the last body seen, not alive, kept and followed (FOLLOW_RETIRED_BODY_PLACEHOLDER)', () => {
    expect(FOLLOW_RETIRED_BODY_PLACEHOLDER).toBe('the last body the page saw, not alive, kept');
    const r = rig({ bodies: [body(5, [50, 2, 60], true, 30), body(9, [0, 0, 0])] });
    r.tap('leanRight');
    r.view.frame();
    r.state.bodies = [body(9, [0, 0, 0])];                            // the room's next snapshot after 5's `left`
    r.view.frame();
    expect(r.view.retired.map((b) => [b.id, b.flags & ALIVE])).toEqual([[5, 0]]);
    expect([r.view.mode, r.view.target]).toEqual(['follow', 5]);
    expect(r.poses.at(-1)).toEqual(followPose(body(5, [50, 2, 60], false, 30)));
    // A retired body is no candidate: Right walks the living as before.
    r.tap('leanRight');
    expect(r.view.target).toBe(9);
  });

  it('two queued removals take two invocations, the first queued first (FOLLOW_DELETE_QUEUE_PLACEHOLDER; FUN_0029f510 D:L145118-145123)', () => {
    expect(FOLLOW_DELETE_QUEUE_PLACEHOLDER).toBe('queued at the departure; one deleted a frame');
    const r = rig({ bodies: [body(5, [0, 0, 0]), body(7, [0, 0, 0]), body(9, [0, 0, 0])] });
    r.tap('leanRight');
    r.view.frame();
    r.state.bodies = [body(9, [0, 0, 0])];                            // 5 and 7 leave together
    r.view.frame();
    expect(r.view.retired.map((b) => b.id)).toEqual([5, 7]);          // queued at the departure, none deleted yet
    r.view.frame();
    expect(r.view.retired.map((b) => b.id)).toEqual([7]);             // one a frame
    r.view.frame();
    expect(r.view.retired.map((b) => b.id)).toEqual([]);
  });

  it('after the followed body is deleted the camera stays where it stood, the mode and the target kept (FOLLOW_AFTER_DELETE_PLACEHOLDER)', () => {
    expect(FOLLOW_AFTER_DELETE_PLACEHOLDER).toBe('the camera left where it stands');
    const r = rig({ bodies: [body(5, [20, 0, 20]), body(9, [0, 0, 0])] });
    r.tap('leanRight');
    r.view.frame();
    r.state.bodies = [body(9, [0, 0, 0])];
    r.view.frame();                                                   // retired, still followed
    const posed = r.poses.length;
    r.view.frame();                                                   // deleted
    r.view.frame();
    expect(r.view.retired).toEqual([]);
    expect(r.poses.length).toBe(posed);                               // no pose handed: the fly camera where it stood
    expect([r.view.mode, r.view.target]).toEqual(['follow', 5]);
    r.tap('leanRight');                                               // the cycle as before
    expect(r.view.target).toBe(9);
  });

  it('FOLLOW_OFF_DEAD_READING retired: the module no longer names the first-living-seat rule', () => {
    expect('FOLLOW_OFF_DEAD_READING' in spectatorModule).toBe(false);
  });

  it("LATER 69 (research 314 §5.6): NU-11's ghost and the benched dead keep the watched teammate's body when it dies -- no move until a cycle (FUN_00547350 D:L412733-412750 on a release only; FUN_002980d0 online binds nothing, +0x144 7 D:L141378-141389); a body gone hands no pose", () => {
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [7, 'seal'], [9, 'seal']];
    for (const ghost of [true, false]) {
      const g = rig({ role: 'player', self: 1, team: 'seal', teams, rules: 'classic', ghost, bodies: [body(1, [0, 0, 0], false), body(2, [10, 0, 20]), body(7, [5, 0, 5]), body(9, [7, 0, 7])] });
      g.view.bench();
      g.tap('leanRight');
      expect(g.view.watching).toBe(2);
      // 2 dies where it stood: the view stays on its body, frame after frame, at the follow camera's distances.
      g.state.bodies = [body(1, [0, 0, 0], false), body(2, [10, 0, 20], false), body(7, [5, 0, 5]), body(9, [7, 0, 7])];
      for (let i = 0; i < 3; i++) {
        g.view.frame();
        expect(g.view.watching).toBe(2);
        expect(g.poses.at(-1)).toMatchObject({ x: 10, y: 25.709, z: 20 + 24.906, yaw: 0 });
      }
      // The body gone from the room's list: watching kept, no pose handed (the fly camera where the last pose stood it;
      // FOLLOW_RETIRED_BODY_PLACEHOLDER / FOLLOW_AFTER_DELETE_PLACEHOLDER's stand-in, §5.4 items 2-3).
      g.state.bodies = [body(1, [0, 0, 0], false), body(7, [5, 0, 5]), body(9, [7, 0, 7])];
      const n = g.poses.length;
      g.view.frame();
      expect([g.view.watching, g.poses.length]).toEqual([2, n]);
      // Right from the dead (or gone) watched teammate: the walk from its slot (LATER 79, D:L412637), the next living, 7.
      g.state.bodies = [body(1, [0, 0, 0], false), body(2, [10, 0, 20], false), body(7, [5, 0, 5]), body(9, [7, 0, 7])];
      g.tap('leanRight');
      expect(g.view.watching).toBe(7);
      g.tap('leanLeft');
      // DEAD-CYCLE (LATER 78; research 314 §5.6): the walk takes the page's own actor alive or dead (`FUN_00546fa0`
      // D:L412605), so Left from 7 passes 2 (dead) and stops on the own body, seat 1 -- watching back to null. (Was 9: the
      // port's cycle left the own seat out, the pin DEAD-WATCH kept for this row.)
      expect([g.view.watching, g.returned()]).toEqual([null, 1]);
      // The turnover's reset unchanged (AD-9): the bench and the watched teammate left.
      g.view.reset();
      expect([g.view.benched, g.view.watching]).toEqual([false, null]);
    }
  });
});

describe("AD-9: the spectator's mode and zoom reset at a round's turnover (C82; research 314 §5.5)", () => {
  const START = { mode: 'free', remembered: 'free', target: null, scenic: -1, magnification: 1 };
  const state = (v: SpectatorView) => ({ mode: v.mode, remembered: v.remembered, target: v.target, scenic: v.scenic, magnification: v.magnification });
  /** A scenic view zoomed to `m` in one frame: m' = 1 + dt x 1 x 1 x 1.3 from 1 (D:L140513). */
  const zoomTo = (r: ReturnType<typeof rig>, m: number): void => {
    r.pad({ moveY: 1 });
    r.view.frame(undefined, (m - 1) / 1.3);
    r.pad();
  };

  it('names the event and the pose: the room\'s roundStart stands for the MP exit state\'s tick; the fly camera left where it stands', () => {
    expect(spectatorModule.SPECTATOR_TURNOVER_EVENT_READING).toBe('roundStart');
    expect(spectatorModule.SPECTATOR_TURNOVER_POSE_PLACEHOLDER).toBe('the fly camera where it stands');
  });

  it('a spectator following a player comes back free, remembered free, no target, scenic -1, magnification 1 (FUN_00299150 D:L141664-141671)', () => {
    const r = rig({ views: VIEWS, bodies: [body(2, [0, 0, 0]), body(5, [100, 10, 200])] });
    r.tap('zoom');                                                     // scenic, view 0
    r.tap('leanRight'); r.tap('action'); r.tap('action');              // follow 2; X free remembering follow; X follow again
    r.view.frame();
    expect([r.view.mode, r.view.remembered, r.view.target, r.view.scenic]).toEqual(['follow', 'follow', 2, 0]);
    const poses = r.poses.length;
    r.view.reset();
    expect(state(r.view)).toEqual(START);
    expect(r.poses.slice(poses)).toEqual([null]);                      // SPECTATOR_TURNOVER_POSE_PLACEHOLDER: no pose handed
    r.view.frame();
    expect(r.poses.length).toBe(poses + 1);                           // free: no frame stands the camera anywhere
  });

  it('a spectator in scenic zoomed to 4 comes back free, remembered free, scenic -1, magnification 1, the page told 1 (D:L141671; the projection, D:L53354)', () => {
    const r = rig({ views: VIEWS, bodies: [body(2, [0, 0, 0])] });
    r.tap('leanRight'); r.tap('action');                               // follow 2, then free remembering follow
    r.tap('zoom'); r.tap('zoom');                                      // view 1; the remembered follow kept
    zoomTo(r, 4);
    expect([r.view.mode, r.view.remembered, r.view.scenic]).toEqual(['scenic', 'follow', 1]);
    expect(r.view.magnification).toBeCloseTo(4, 9);
    r.view.reset();
    expect(state(r.view)).toEqual(START);
    expect(r.mags.at(-1)).toBe(1);
  });

  it('after the turnover X does nothing (free, remembered free: D:L139518-139528) until a cycle, the jump or a scenic view', () => {
    const r = rig({ views: VIEWS, bodies: [body(2, [0, 0, -50]), body(5, [0, 0, -100])] });
    r.tap('leanRight');
    r.view.reset();
    const poses = r.poses.length;
    r.tap('action'); r.view.frame(); r.tap('action'); r.view.frame();
    expect(state(r.view)).toEqual(START);
    expect(r.poses.length).toBe(poses);
    r.tap('zoom');                                                     // Up: the first view, stepped from -1
    expect([r.view.mode, r.view.scenic]).toEqual(['scenic', 0]);
    r.view.reset();
    r.view.frame({ position: [0, 0, 0], forward: [0, 0, -1], far: 1000 });
    r.tap('stance');                                                   // Triangle: the jump binds the body on the centre line
    expect([r.view.mode, r.view.target, r.view.remembered]).toEqual(['follow', 2, 'free']);
  });

  it('manual cycling after the turnover works: Right binds the first living body, Left steps back, X goes free remembering follow', () => {
    const r = rig({ bodies: [body(2, [0, 0, 0]), body(5, [0, 0, 0]), body(9, [0, 0, 0])] });
    r.tap('leanRight'); r.tap('leanRight');
    expect(r.view.target).toBe(5);
    r.view.reset();
    r.tap('leanRight');
    expect([r.view.mode, r.view.target, r.view.remembered]).toEqual(['follow', 2, 'free']);
    r.tap('leanLeft');
    expect(r.view.target).toBe(9);
    r.tap('action');
    expect([r.view.mode, r.view.remembered]).toEqual(['free', 'follow']);
    r.tap('action');
    expect([r.view.mode, r.view.target]).toEqual(['follow', 9]);
  });

  it('mid-round nothing resets: a dead followed body stays followed and a benched player keeps its watched teammate until the turnover; the reset leaves the retired queue (AD-8)', () => {
    const r = rig({ bodies: [body(2, [0, 0, 0]), body(5, [10, 0, 10]), body(9, [0, 0, 0])] });
    r.tap('leanRight'); r.tap('leanRight');
    r.view.frame();
    r.state.bodies = [body(2, [0, 0, 0]), body(5, [10, 0, 10], false), body(9, [0, 0, 0])];   // 5 dies
    for (let i = 0; i < 4; i++) r.view.frame();
    expect([r.view.mode, r.view.target]).toEqual(['follow', 5]);
    r.state.bodies = [body(2, [0, 0, 0]), body(5, [10, 0, 10], false)];                       // 9 leaves
    r.view.frame();
    expect(r.view.retired.map((b) => b.id)).toEqual([9]);
    r.view.reset();
    expect(r.view.retired.map((b) => b.id)).toEqual([9]);             // the actor list is not the camera's
    expect(state(r.view)).toEqual(START);
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [7, 'seal']];
    const dead = rig({ role: 'player', self: 1, team: 'seal', teams, bodies: [body(1, [0, 0, 0], false), body(2, [5, 0, 5]), body(7, [0, 0, 0])] });
    dead.view.bench();
    dead.tap('leanRight');
    for (let i = 0; i < 3; i++) dead.view.frame();
    expect([dead.view.benched, dead.view.watching, dead.view.mode]).toEqual([true, 2, 'free']);
    dead.view.reset();                                                 // NU-11's: the bench and its camera left, as before
    expect([dead.view.benched, dead.view.watching, dead.view.magnification]).toEqual([false, null, 1]);
  });
});

/**
 * DEAD-CYCLE (LATER 78 + 79; research 314 §5.6): the walk `FUN_00547170` (next, D:L412637-412672) / `FUN_00546fa0`
 * (previous, D:L412584-412615) starts at the slot of the camera's bound actor (`FUN_0029f180`, the object's +8, on the
 * camera's +0xbc: D:L412584, D:L412637; D:L145045-145048), steps one slot at a time (D:L412663 up, D:L412611 down),
 * wraps (D:L412646-412648, D:L412664-412667 to slot 0; D:L412592-412594 to the last), never tests its start (the loop
 * ends on coming back to it, D:L412615, D:L412672) and binds the first candidate (D:L412617-412618, D:L412674-412675).
 * For a dead player (argument 1) a candidate is a living actor of its side, no escortee, **or the page's own actor, alive
 * or dead** (`DAT_00440c38`, D:L412605, D:L412658); for a spectator (argument 0) every living non-spectator -- its own
 * object a spectator, refused first (`FUN_002c2fd0`, D:L412601-412603, D:L412654-412656). The slots are the seat ids in
 * order (SPECTATOR_CYCLE_ORDER_READING).
 */
describe('DEAD-CYCLE (LATER 78, 79): the own body a stop of the dead player\'s cycle; the step from the bound actor\'s slot (research 314 §5.6)', () => {
  it('names the stand-ins: the spectator\'s own slot and the own body\'s view after the cycle', () => {
    const names = spectatorModule as unknown as Record<string, unknown>;
    expect(names.SPECTATOR_OWN_SLOT_PLACEHOLDER).toBe('before every player');
    expect(names.DEAD_CYCLE_OWN_VIEW_READING).toBe('the death camera as before the cycle');
  });

  it('LATER 79, the brief\'s example: self 1, teammates 2, 5, 9, watching 5 when it dies -- Right takes 9, Left 2 (the ghost and the classic dead alike)', () => {
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [5, 'seal'], [9, 'seal']];
    for (const ghost of [false, true]) {
      for (const [flag, expected] of [['leanRight', 9], ['leanLeft', 2]] as const) {
        const d = rig({ role: 'player', self: 1, team: 'seal', teams, ghost, bodies: [body(1, [0, 0, 0], false), body(2, [0, 0, 0]), body(5, [0, 0, 0]), body(9, [0, 0, 0])] });
        d.view.bench();
        d.tap('leanRight'); d.tap('leanRight');
        expect(d.view.watching).toBe(5);
        d.state.bodies = [body(1, [0, 0, 0], false), body(2, [0, 0, 0]), body(5, [0, 0, 0], false), body(9, [0, 0, 0])];
        d.view.frame();
        expect(d.view.watching).toBe(5);                               // DEAD-WATCH: kept on the body (§5.6 item 3)
        d.tap(flag);
        expect([ghost, flag, d.view.watching]).toEqual([ghost, flag, expected]);   // was Right 2, Left 9
      }
    }
  });

  it('LATER 78: the own seat is a stop in slot order -- self 5 among teammates 2 and 9: Right 9, 2, the own body (watching null), Left 2, 9, the own body', () => {
    const teams: [number, Team][] = [[2, 'seal'], [5, 'seal'], [9, 'seal'], [7, 'terrorist']];
    const d = rig({ role: 'player', self: 5, team: 'seal', teams, bodies: [body(2, [0, 0, 0]), body(5, [0, 0, 0], false), body(7, [0, 0, 0]), body(9, [0, 0, 0])] });
    d.view.bench();
    const seen: (number | null)[] = [];
    for (const flag of ['leanRight', 'leanRight', 'leanRight', 'leanLeft', 'leanLeft', 'leanLeft'] as const) { d.tap(flag); seen.push(d.view.watching); }
    expect(seen).toEqual([9, 2, null, 2, 9, null]);                     // 7 a Terrorist: passed
    expect([d.left(), d.returned()]).toEqual([2, 2]);                  // each leave of the own body, each return to it
    // Back on the own body nothing follows a teammate: no frame hands a pose.
    const n = d.poses.length;
    d.view.frame();
    expect(d.poses.length).toBe(n);
  });

  it('the walk never re-takes its start: alone on its side, a dead player\'s Right and Left do nothing; with one teammate, they go to it and back', () => {
    const alone = rig({ role: 'player', self: 1, team: 'seal', teams: [[1, 'seal'], [3, 'terrorist']], bodies: [body(1, [0, 0, 0], false), body(3, [0, 0, 0])] });
    alone.view.bench();
    alone.tap('leanRight'); alone.tap('leanLeft');
    expect([alone.view.watching, alone.left(), alone.returned()]).toEqual([null, 0, 0]);
    const pair = rig({ role: 'player', self: 1, team: 'seal', teams: [[1, 'seal'], [4, 'seal']], bodies: [body(1, [0, 0, 0], false), body(4, [0, 0, 0])] });
    pair.view.bench();
    const seen: (number | null)[] = [];
    for (const flag of ['leanRight', 'leanRight', 'leanLeft', 'leanLeft'] as const) { pair.tap(flag); seen.push(pair.view.watching); }
    expect(seen).toEqual([4, null, 4, null]);
  });

  it('AD-9\'s reset and DEAD-WATCH\'s kept body unchanged: a dead watched teammate is kept frame after frame, and the turnover leaves the bench whatever the cycle stopped on', () => {
    const teams: [number, Team][] = [[1, 'seal'], [2, 'seal'], [7, 'seal']];
    const d = rig({ role: 'player', self: 1, team: 'seal', teams, bodies: [body(1, [0, 0, 0], false), body(2, [3, 0, 4]), body(7, [0, 0, 0])] });
    d.view.bench();
    d.tap('leanRight');
    d.state.bodies = [body(1, [0, 0, 0], false), body(2, [3, 0, 4], false), body(7, [0, 0, 0])];
    for (let i = 0; i < 3; i++) d.view.frame();
    expect(d.view.watching).toBe(2);
    expect(d.poses.at(-1)).toMatchObject({ x: 3, z: 4 + 24.906 });
    d.tap('leanLeft');                                                 // from 2's slot down: the own body
    expect(d.view.watching).toBeNull();
    d.view.reset();
    expect([d.view.benched, d.view.watching]).toEqual([false, null]);
  });

  it('the spectator\'s follow steps from the dead followed body\'s slot (LATER 79, argument 0): Right 9, Left 2', () => {
    for (const [flag, expected] of [['leanRight', 9], ['leanLeft', 2]] as const) {
      const r = rig({ bodies: [body(2, [0, 0, 0]), body(5, [0, 0, 0]), body(9, [0, 0, 0])] });
      r.tap('leanRight'); r.tap('leanRight');
      r.state.bodies = [body(2, [0, 0, 0]), body(5, [0, 0, 0], false), body(9, [0, 0, 0])];
      r.view.frame();
      r.tap(flag);
      expect([flag, r.view.mode, r.view.target]).toEqual([flag, 'follow', expected]);
    }
  });

  it('the spectator in free or scenic walks from its own object (X from follow and Up / Down onto a view bind it, D:L139501-139504, D:L139552-139555, D:L139580-139583): Right the first living, Left the last (SPECTATOR_OWN_SLOT_PLACEHOLDER)', () => {
    const r = rig({ bodies: [body(2, [0, 0, 0]), body(5, [0, 0, 0]), body(9, [0, 0, 0])], views: VIEWS });
    r.tap('leanRight'); r.tap('leanRight');
    expect([r.view.mode, r.view.target]).toEqual(['follow', 5]);
    r.tap('action');                                                   // free: the camera on the own object
    r.tap('leanRight');
    expect([r.view.mode, r.view.target]).toEqual(['follow', 2]);       // was 9, the next after the kept target 5
    r.tap('leanRight');
    r.tap('zoom');                                                     // scenic onto view 0: the own object bound
    r.tap('leanLeft');
    expect([r.view.mode, r.view.target]).toEqual(['follow', 9]);       // was 2, the one before the target 5
  });

  it('the spectator\'s walk never re-takes its start: following the one living body, Right binds nothing -- the remembered byte stays (D:L412674: no bind)', () => {
    const r = rig({ bodies: [body(3, [0, 0, 0]), body(6, [0, 0, 0], false)] });
    r.tap('leanRight');
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'free', 3]);
    r.tap('leanRight');
    r.tap('leanLeft');
    expect([r.view.mode, r.view.remembered, r.view.target]).toEqual(['follow', 'free', 3]);   // was remembered 'follow', a re-bind
  });

  it('nextFollow / previousFollow: from the start\'s place in id order, a candidate or not, never the start itself; from none, the first / the last', () => {
    expect(nextFollow(5, [2, 9, 1])).toBe(9);
    expect(spectatorModule.previousFollow(5, [2, 9, 1])).toBe(2);
    expect(nextFollow(9, [2, 9, 1])).toBe(1);                                // wraps past the last
    expect(spectatorModule.previousFollow(1, [2, 9, 1])).toBe(9);      // wraps below the first
    expect(nextFollow(3, [3])).toBeNull();                                   // the start alone: nothing (D:L412672, D:L412674)
    expect(spectatorModule.previousFollow(3, [3])).toBeNull();
    expect([nextFollow(null, [7, 3]), spectatorModule.previousFollow(null, [7, 3])]).toEqual([3, 7]);
    expect([nextFollow(4, []), spectatorModule.previousFollow(4, [])]).toEqual([null, null]);
  });
});
