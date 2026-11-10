import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { Grid } from '@s2u/scene';
import { noInput, type Input } from '../src/gamepad';
import type { Rules, Team } from '../src/net/protocol';
import type { SoundData } from '../src/soundData';
import type { SpectatorBody } from '../src/spectatorView';

/**
 * AMB-1, every view of a match (the owner's bar, 2026-11-07: "it should work everywhere the original did"). The original
 * (research 81 §10, "The beds"; reading): the common `check_camera_inside_state1` starts with the mission (activation 1)
 * and loops for the whole of it, swapping `outside_noise` / `inside_noise` on `PLAYER_INDOORS` / `CAMERA_INDOORS`; the
 * emitters and one-shot layers are activation-1 animations too; no source read stops them on a death or a change of
 * view. So here, through the page's own parts -- `SpectatorView` (the dead cycle's `leaveSelf` / `returnSelf` wired as
 * `NetPage` wires them: `walk.setMode('fly')`, `walk.resumeBody()`; `spectate(pose)` placing the drawn camera as
 * `./matchNet` does with `fly.setPose`), `mountSound` and a real `GameAudio` over an unlocked silent output -- every
 * view reads `stats().ambience.on === true` with the bed following the view's camera: alive; dead on the own body (the
 * death camera, the walk still in walk mode: `WalkMode.setDead`); a teammate (fly); back on the own body
 * (`resumeBody`); `resumeBody` refused with no walker (fly left on); a late-joining ghost with no own body; a respawn
 * round between death and respawn; the spectator. The frame's order is the pages' (`./main`, `./matchMount`): the
 * spectator's frame (inside `NetPage.frame`) places the camera before `MatchSound.frame` reads it, so the camera is never
 * the last frame's nor the own body's while a teammate is watched.
 *
 * The music (the owner's word, the same day: "make sure the music is considered as well"): the match's music is the
 * map's `objectives` script's cues alone -- the intro by `player_team`, the result line and the winner's music by which
 * side was eliminated, `mission_timer2`'s TIME EXPIRED (research 124 R124.4, §5; reading) -- chosen by the seat's side
 * and the round's result, never by the local player's life or view; in the port the slot (`GameAudio.playMusic`, one
 * voice, research 124 §7) is fed by `RoundAudio` off the room's events with `NetPage.localTeam()` (the role's side,
 * dead or alive) and stopped only at a round's start, a reset (a close, the level left, a round screen's first frame:
 * OBF-31), a map change. So each view here also reads the slot still holding the round's music, never stopped by the
 * view, and a cue played while a teammate is watched sounds. Unit tests only; no browser is run.
 */

/** The camera's floor (`cameraFloor`, `walkSoundsIndoors.test.ts` pins the pick itself): "inside" where x < 0. */
vi.mock('../src/floorPick', async (original) => ({
  ...(await original<typeof import('../src/floorPick')>()),
  cameraFloor: (_grid: Grid, x: number) => ({ y: 0, poly: { inside: x < 0 ? 1 : 0, reverbZone: 0 } }),
}));

const { GameAudio } = await import('../src/audio');
const { mountSound, silentOut } = await import('../src/matchSound');
const { SpectatorView } = await import('../src/spectatorView');
const { DEAD_VIEW_BED_SIDE_READING } = await import('../src/walkSounds');

const GRID = {} as Grid;
const ALIVE = 64;
const body = (id: number, feet: [number, number, number], alive = true): SpectatorBody => ({ id, feet, yaw: 0, flags: alive ? ALIVE : 0 });

/** A map's sound data with one bed a side and nothing else: enough for the ambience's state (`stats().ambience`). */
const DATA = {
  archive: 'MPX', banks: [], missing: [], beds: { outside: ['~OUTDOOR_AMB'], inside: ['~INDOOR_AMB'] }, emitters: [],
  reverb: { indoor: [], outdoor: [] },
  // The music slot's one stream (a round's win music, research 124 §6-§7): 30 s, so it still sounds through the views.
  streams: [{ name: 'MUS_WIN', sound: { left: new Float32Array(48_000 * 30), right: new Float32Array(48_000 * 30), sampleRate: 48_000, voices: 2, peak: 1 } }],
} as unknown as SoundData;

interface Opts { role?: 'player' | 'spectator'; self?: number | null; team?: Team | null; ghost?: boolean; rules?: Rules; walker?: boolean; teams?: [number, Team][]; bodies?: SpectatorBody[] }

function page(o: Opts = {}) {
  let mode: 'walk' | 'fly' = o.walker === false ? 'fly' : 'walk';
  const walker = o.walker !== false;
  /** The game's camera while walking (alive or the death camera): x < 0 indoors. */
  let eye: [number, number, number] = [10, 5, 0];
  const camera = new PerspectiveCamera();
  const walk = {
    mode: () => mode, setMode: (m: 'walk' | 'fly') => { mode = m; return true; },
    resumeBody: () => { if (!walker) return false; mode = 'walk'; return true; },   // `WalkMode.resumeBody`: false with no walker
    gameCamera: () => (mode === 'walk' && walker ? { eye: [...eye] as [number, number, number], target: [eye[0], eye[1], eye[2] + 1] as [number, number, number] } : null),
    drawnFeet: (): [number, number, number] => [0, 0, 0], posture: () => 'stand' as const,
    grid: () => (mode === 'walk' && walker ? GRID : null), gridOfGround: () => GRID,
  };
  const out = { ...silentOut(), unlocked: true, state: 'running' as const, playMusic: () => {}, stopMusic: () => {} };
  const audio = new GameAudio(out, () => 0.5, { inline: false });
  const off = vi.spyOn(audio, 'setAmbience'), stopMusic = vi.spyOn(audio, 'stopMusic');
  const sound = mountSound({
    audio, walk, fly: { groundWish: () => ({ forward: 0, right: 0, boost: false }) }, loadouts: { type: () => 1 }, side: () => 'seal',
  });
  sound.setData(DATA);
  stopMusic.mockClear();                                               // the map's own stop at `setData` (a new map)
  // The round's music in the slot, as `RoundAudio`'s output plays it (`RoundAudioHost`: `music` -> `GameAudio.playMusic`).
  expect(audio.playMusic('MUS_WIN')).toBe('played');
  const state = { bodies: o.bodies ?? [] };
  const view = new SpectatorView({
    bodies: () => state.bodies,
    seat: () => ({ role: o.role ?? 'player', self: o.self ?? 1, team: o.team ?? 'seal', teams: new Map(o.teams ?? []), rules: o.rules ?? 'classic', ghost: o.ghost ?? false }),
    spectate: (p) => { if (p) camera.position.set(p.x, p.y, p.z); },   // `./matchNet`: `fly.setPose(pose)`
    leaveSelf: () => { walk.setMode('fly'); },                          // `NetPage`: DEAD-CYCLE's leave of the own body
    returnSelf: () => { walk.resumeBody(); },                           // `NetPage`: DEAD_CYCLE_OWN_VIEW_READING
    escortee: () => false, views: () => [],
  });
  /** One page frame in the pages' order: the spectator's (in `NetPage.frame`), then the sound's. */
  const frame = (): void => { view.frame(); camera.updateMatrixWorld(); sound.frame(camera, walk.gameCamera()); };
  const tap = (flag: keyof Input): void => { view.pad({ ...noInput(), [flag]: true }); view.pad(noInput()); };
  const amb = () => audio.stats().ambience;
  return {
    view, frame, tap, amb, state, mode: () => mode, setEye: (e: [number, number, number]) => { eye = e; },
    /** The walk's respawn (`NetClient`'s spawn -> `WalkMode`): walking again, the game camera at the new spawn. */
    respawn: (e: [number, number, number]) => { mode = 'walk'; eye = e; },
    neverOff: () => off.mock.calls.every((c) => c[0] === true),
    /** The music slot: what it holds (`stats().streams.music`) and that no view change stopped it. */
    music: () => [audio.stats().streams.music, stopMusic.mock.calls.length] as const,
    playMusic: () => audio.playMusic('MUS_WIN'),
  };
}

const TEAMS: [number, Team][] = [[1, 'seal'], [2, 'seal'], [7, 'terrorist']];
/** Self 1 dead; teammate 2 indoors at x -40; a Terrorist outdoors. */
const DEAD_BODIES = [body(1, [0, 0, 0], false), body(2, [-40, 0, 0]), body(7, [40, 0, 0])];

describe('AMB-1: the beds in every view of a match (research 81 §10)', () => {
  it('alive: on, the bed by the game camera', () => {
    const p = page({ teams: TEAMS, bodies: [body(1, [0, 0, 0]), body(2, [-40, 0, 0])] });
    p.frame();
    expect(p.amb()).toMatchObject({ on: true, bed: 'outside' });
    p.setEye([-10, 5, 0]);
    p.frame();
    expect(p.amb()).toMatchObject({ on: true, bed: 'inside' });
    expect(p.neverOff()).toBe(true);
    expect(p.music()).toEqual(['MUS_WIN', 0]);   // the music slot: untouched by the view
  });

  it('dead on the own body (the death camera; the walk stays in walk mode): on, the bed by the death camera', () => {
    const p = page({ teams: TEAMS, bodies: DEAD_BODIES });
    p.frame();
    p.view.bench();
    p.setEye([-12, 8, 0]);                      // the death camera moved indoors
    p.frame();
    expect([p.mode(), p.amb().on, p.amb().bed]).toEqual(['walk', true, 'inside']);
    expect(p.neverOff()).toBe(true);
    expect(p.music()).toEqual(['MUS_WIN', 0]);   // the music slot: untouched by the view
  });

  // The side off the own body is DEAD_VIEW_BED_SIDE_READING's current choice, the view's camera -- not a proven
  // original: whether `PLAYER_INDOORS` keeps the dead body's side there is unread (research 81 §13).
  it('DEAD-CYCLE: a teammate (leaveSelf -> fly), then the own body (resumeBody): on throughout, the bed by each view\'s camera (DEAD_VIEW_BED_SIDE_READING)', () => {
    expect(DEAD_VIEW_BED_SIDE_READING).toBe('camera');
    const p = page({ teams: TEAMS, bodies: DEAD_BODIES });
    p.frame();
    p.view.bench();
    p.frame();
    expect(p.amb()).toMatchObject({ on: true, bed: 'outside' });   // the death camera outdoors
    p.tap('leanRight');                         // to teammate 2 -- its camera indoors
    p.frame();
    expect([p.view.watching, p.mode(), p.amb().on, p.amb().bed]).toEqual([2, 'fly', true, 'inside']);
    expect(p.playMusic()).toBe('played');       // a cue due while a teammate is watched sounds as on the own body
    p.frame();
    p.tap('leanRight');                         // past the Terrorist: the own body
    p.frame();
    expect([p.view.watching, p.mode(), p.amb().on, p.amb().bed]).toEqual([null, 'walk', true, 'outside']);
    expect(p.neverOff()).toBe(true);            // no stop between them, so no restart of the beds
    expect(p.music()).toEqual(['MUS_WIN', 0]);   // the music slot: untouched by the view
  });

  it('resumeBody refused (no walker: fly left on): on, the bed by the camera where the view left it', () => {
    const p = page({ teams: TEAMS, bodies: DEAD_BODIES, walker: false });
    p.view.bench();
    p.tap('leanRight');
    p.frame();
    expect(p.amb()).toMatchObject({ on: true, bed: 'inside' });
    p.tap('leanRight');                         // the own body: refused, fly stays
    p.frame();
    expect([p.view.watching, p.mode(), p.amb().on, p.amb().bed]).toEqual([null, 'fly', true, 'inside']);
    expect(p.neverOff()).toBe(true);
    expect(p.music()).toEqual(['MUS_WIN', 0]);   // the music slot: untouched by the view
  });

  it('a late-joining ghost with no own body: on, the bed by the teammate it watches', () => {
    const p = page({ teams: TEAMS, ghost: true, walker: false, bodies: [body(2, [-40, 0, 0]), body(7, [40, 0, 0])] });
    p.view.bench();
    p.frame();
    expect(p.amb().on).toBe(true);
    p.tap('leanRight');
    p.frame();
    expect([p.view.watching, p.amb().on, p.amb().bed]).toEqual([2, true, 'inside']);
    expect(p.neverOff()).toBe(true);
    expect(p.music()).toEqual(['MUS_WIN', 0]);   // the music slot: untouched by the view
  });

  it('dead in a respawn room, the death camera moving: on, the bed by the death camera', () => {
    const p = page({ teams: TEAMS, rules: 'respawn', bodies: DEAD_BODIES });
    p.frame();
    p.setEye([-3, 5, 0]);
    p.frame();
    expect([p.mode(), p.amb().on, p.amb().bed]).toEqual(['walk', true, 'inside']);
    p.setEye([30, 5, 0]);                       // the death camera turned outdoors
    p.frame();
    expect(p.amb()).toMatchObject({ on: true, bed: 'outside' });
    expect(p.neverOff()).toBe(true);
    expect(p.music()).toEqual(['MUS_WIN', 0]);   // the music slot: untouched by the view
  });

  it('a respawn room: dead (no cycle there, DEAD_CYCLE_RESPAWN_READING), then the respawn (NetPage unbench -> SpectatorView.reset, the walk at the new spawn): on throughout', () => {
    const p = page({ teams: TEAMS, rules: 'respawn', bodies: DEAD_BODIES });
    p.frame();
    p.view.bench();
    p.tap('leanRight');                         // refused in a respawn room: the death camera stays
    p.setEye([-8, 6, 0]);                       // the death camera indoors
    p.frame();
    expect([p.view.watching, p.mode(), p.amb().on, p.amb().bed]).toEqual([null, 'walk', true, 'inside']);
    p.view.reset();                             // `NetPage.unbench` at the spawn: the bench and its camera left
    p.respawn([25, 5, 0]);                      // the spawn: walking at the new spawn, outdoors
    p.state.bodies = [body(1, [25, 0, 0]), body(2, [-40, 0, 0]), body(7, [40, 0, 0])];
    p.frame();
    expect([p.view.watching, p.view.benched, p.mode(), p.amb().on, p.amb().bed]).toEqual([null, false, 'walk', true, 'outside']);
    expect(p.neverOff()).toBe(true);
    expect(p.music()).toEqual(['MUS_WIN', 0]);
  });

  it('the spectator: on, the bed by the followed player', () => {
    const p = page({ role: 'spectator', self: null, team: null, walker: false, teams: TEAMS, bodies: [body(2, [-40, 0, 0]), body(7, [40, 0, 0])] });
    p.frame();
    expect(p.amb().on).toBe(true);
    p.tap('leanRight');                         // the first living: 2, indoors
    p.frame();
    expect([p.view.target, p.amb().on, p.amb().bed]).toEqual([2, true, 'inside']);
    p.tap('leanRight');                         // 7, outdoors
    p.frame();
    expect([p.view.target, p.amb().on, p.amb().bed]).toEqual([7, true, 'outside']);
    expect(p.neverOff()).toBe(true);
    expect(p.music()).toEqual(['MUS_WIN', 0]);   // the music slot: untouched by the view
  });
});
