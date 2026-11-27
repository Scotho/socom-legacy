import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { HELD_RIFLE, SEAL_TUNING } from '@s2u/scene';
import { GameAudio, type AudioOut } from '../src/audio';
import type { FireEvent } from '../src/fire';
import { PART_DEPS } from '../src/matchNet';
import { AI_VOCAL_ENTRY_LIFETIME_READING, AI_VOCAL_HEARING_RANGE_READING, AI_VOCAL_QUEUE_AT_SCREENS_READING, AI_VOCAL_UNKNOWN_LENGTH_PLACEHOLDER, GRENADE_WARNING_LINE_READING, mountSound, silentOut } from '../src/matchSound';
import { MESSAGE_SCALE, type BannerLine } from '../src/hud';
import { RingingEars } from '../src/ringingEars';
import type { SoundData } from '../src/soundData';

/**
 * The floor probe under a step (`WalkSounds`' `probeFloor`): two stand-in grids -- the scene's (`SCENE_GRID`, material 17)
 * and the page's own walker's (`OWN_GRID`, material 9); any other grid is the real probe's.
 */
const { SCENE_GRID, OWN_GRID } = vi.hoisted(() => ({ SCENE_GRID: { stub: 'scene' }, OWN_GRID: { stub: 'own' } }));
vi.mock('@s2u/scene', async (original) => {
  const real = await original<typeof import('@s2u/scene')>();
  return {
    ...real,
    probeFloor: (grid: unknown, x: number, y: number, z: number) =>
      grid === SCENE_GRID ? { poly: { material: 17 } } : grid === OWN_GRID ? { poly: { material: 9 } }
        : real.probeFloor(grid as never, x, y, z),
  };
});

/**
 * MATCH-SOUND (web research 222 §7): the match's sound, written once (`./matchSound` `mountSound`) and mounted by both
 * pages -- `/testroom` (`./main`) on the page's `gameAudio`, the front end's match (`./matchMount`) on a `GameAudio` of
 * its own over the menus' context. What moved out of `main.ts`: the fall table, the walk's sounds (`WalkSounds`), the
 * others' footfalls, the firearm's `FirearmSound`, the ringing ears, the round's cues (`RoundAudioHost`), the sound
 * part's `NetPage` hooks (`PART_DEPS.sound`), the listener and the beds once a frame, the map's data and loops. Every
 * call is the one `main.ts` made; nothing here is a parity finding. No browser is run.
 */

const silentAudio = (): GameAudio => new GameAudio(silentOut(), () => 0.5, { inline: false });
function parts(audio = silentAudio()) {
  const walk = { mode: () => 'walk' as const, drawnFeet: (): [number, number, number] => [1, 2, 3], posture: () => 'stand' as const, grid: () => null };
  const fly = { groundWish: () => ({ forward: 0, right: 0, boost: false }) };
  const loadouts = { type: (side: string) => (side === 'seal' ? 1 : 2) };
  return { audio, walk, fly, loadouts, side: () => 'terrorist' as const };
}

describe('mountSound: the match\'s sound, once for both pages', () => {
  it('the fall table at the mount: the SEAL tuning\'s gravity and falling distances (main.ts\'s line)', () => {
    const audio = silentAudio();
    const fall = vi.spyOn(audio, 'setFallTable');
    mountSound(parts(audio));
    expect(fall).toHaveBeenCalledWith(SEAL_TUNING.gravity, SEAL_TUNING.fallingDamage);
  });

  it('another player\'s footfall at its feet, with its stance and stick (REMOTE_STEP_STICK_READING)', () => {
    const p = parts();
    const step = vi.spyOn(p.audio, 'onFootstep');
    const s = mountSound(p);
    s.remoteStep(4, { at: [5, 6, 7], stance: 1, stick: 0.5 } as never, [5, 6, 7]);
    expect(step).toHaveBeenCalledWith(0, [5, 6, 7], { stance: 1, stick: 0.5 });   // no grid: material 0
  });

  // The step's sound is the material at the STEPPING actor's own floor (`FUN_005a39b0` D:L460385-460434, the actor's
  // +0x20c; research 81 §4 "Which"; byte 0 the map's DefaultMaterial, §7): another body's step and the ladder's landing
  // are probed on the scene's grid whoever listens -- a dead or spectating page (fly mode, no walker grid) too (the
  // owner's report on v0.4.22, 2026-11-14: a teammate's steps heard on the map's DefaultMaterial).
  const offBody = () => {
    const p = parts();
    return { ...p, walk: { ...p.walk, mode: () => 'fly' as const, drawnFeet: () => null, grid: () => null, gridOfGround: () => SCENE_GRID as never } };
  };
  it("a dead or spectating page: another player's step is the material of its own floor on the scene's grid, not 0", () => {
    const p = offBody();
    const step = vi.spyOn(p.audio, 'onFootstep');
    mountSound(p).remoteStep(4, { at: [5, 6, 7], stance: 0, stick: 1 } as never, [5, 6, 7]);
    expect(step).toHaveBeenCalledWith(17, [5, 6, 7], { stance: 0, stick: 1 });
  });

  it("a dead or spectating page: the ladder's landing is the material of its floor on the scene's grid, not 0", () => {
    const p = offBody();
    const land = vi.spyOn(p.audio, 'onLand');
    mountSound(p).ladderLand(3, [5, 6, 7]);
    expect(land).toHaveBeenCalledWith(3, 17, [5, 6, 7]);
  });

  it("a walking page: the walker's own grid still decides another's step and the ladder's landing (unchanged)", () => {
    const p = parts();
    const q = { ...p, walk: { ...p.walk, grid: () => OWN_GRID as never, gridOfGround: () => SCENE_GRID as never } };
    const step = vi.spyOn(q.audio, 'onFootstep'), land = vi.spyOn(q.audio, 'onLand');
    const s = mountSound(q);
    s.remoteStep(4, { at: [5, 6, 7], stance: 0, stick: 1 } as never, [5, 6, 7]);
    s.ladderLand(3, [5, 6, 7]);
    expect(step).toHaveBeenCalledWith(9, [5, 6, 7], { stance: 0, stick: 1 });
    expect(land).toHaveBeenCalledWith(3, 9, [5, 6, 7]);
    s.playEvent({ kind: 'footfall', foot: 'right' } as never);          // the page's own step: its walker's grid
    expect(step).toHaveBeenLastCalledWith(9, [1, 2, 3], { stance: 0, stick: 0 });
  });

  it('the firearm\'s sound: the rounds to the walk\'s sounds, the effects through soundFor, the goggles\' cues, another\'s report', () => {
    const p = parts();
    const play = vi.spyOn(p.audio, 'play'), fire = vi.spyOn(p.audio, 'onFire');
    const s = mountSound(p);
    const fired = vi.spyOn(s.walkSounds, 'fireEvent');
    const e = { type: 'round', weapon: { name: 'M4A1 SD' }, from: [1, 1, 1] } as unknown as Extract<FireEvent, { type: 'round' }>;
    s.firearm.fireEvent(e);
    expect(fired).toHaveBeenCalledWith(e);
    s.firearm.goggles(true);
    s.firearm.goggles(false);
    expect(play).toHaveBeenCalledWith('.NV_GOGGLES_ON', null);
    expect(play).toHaveBeenCalledWith('.NV_GOGGLES_OFF', null);
    s.firearm.effect('.CASING', [0, 0, 0], 0.5);
    expect(play).toHaveBeenLastCalledWith(expect.any(String), [0, 0, 0], 'play', 0.5);
    s.firearm.roundFired(e);
    expect(fire).toHaveBeenCalledWith('M4A1 SD', [1, 1, 1]);
  });

  // LATER 644 (research 81 "A round passing", `FUN_00598000` D:L454629-454637): another's round past the page's player
  // is `GameAudio.onRoundPast` -- its path against the feet, `.BUL_PASSING` within 20 -- and, as every world sound,
  // none while a round screen is up (OBF-31, ROUND_SCREENS_STOP_ALL_READING).
  it('LATER 644: another player round past the feet goes to GameAudio.onRoundPast, none under a round screen', () => {
    let up = false;
    const p = { ...parts(), screenUp: () => up };
    const past = vi.spyOn(p.audio, 'onRoundPast');
    const s = mountSound(p);
    s.firearm.roundPast?.([-300, 15, 0], [300, 15, 0], [0, 0, 0]);
    expect(past).toHaveBeenCalledWith([-300, 15, 0], [300, 15, 0], [0, 0, 0]);
    up = true;
    s.firearm.roundPast?.([-300, 15, 0], [300, 15, 0], [0, 0, 0]);
    expect(past).toHaveBeenCalledTimes(1);
  });

  it('the sound part\'s NetPage hooks: exactly PART_DEPS.sound, each to its GameAudio call', () => {
    const p = parts();
    const reload = vi.spyOn(p.audio, 'onReload'), death = vi.spyOn(p.audio, 'onDeath'), hurt = vi.spyOn(p.audio, 'onHurt');
    const ring = vi.spyOn(RingingEars.prototype, 'start');
    const s = mountSound(p);
    const deps = s.netDeps();
    expect(Object.keys(deps).sort()).toEqual([...PART_DEPS.sound].sort());
    deps.reloadSound(HELD_RIFLE, [1, 2, 3]);
    expect(reload).toHaveBeenCalledWith(HELD_RIFLE.name, [1, 2, 3]);
    deps.deathVoice(3, null, null, [0, 0, 0]);                           // the page's own: the side's, the type it holds
    expect(death).toHaveBeenCalledWith(3, 'terrorist', 2, [0, 0, 0]);
    deps.deathVoice(3, 'seal', 4, [0, 0, 0]);
    expect(death).toHaveBeenLastCalledWith(3, 'seal', 4, [0, 0, 0]);
    deps.hurtVoice(null, null, [0, 0, 0]);
    expect(hurt).toHaveBeenCalledWith('terrorist', 2, [0, 0, 0]);
    deps.ring(2, 0.35);
    expect(ring).toHaveBeenCalledWith(2, 0.35);
    expect(deps.roundAudio).toBe(s.roundAudio);
    expect(deps.objective()).toBeNull();                                 // no map's cues yet
    const play = vi.spyOn(p.audio, 'play'), stream = vi.spyOn(p.audio, 'playStream');
    deps.escorteeVoice(9, 'yes', null, 'mp_fem1');                       // HX-4a: no body to hear it at -- none
    deps.escorteeVoice(9, 'yes', [4, 5, 6], 'mp_fem1');                  // R4P-254: no map's data, no escortee names a YES: none
    expect(play).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    s.dispose();
    ring.mockRestore();
  });

  it('once a frame: the camera is the listener (0x48dd40), the walk\'s beds and reverb at its place', () => {
    const p = parts();
    const listen = vi.spyOn(p.audio, 'setListener');
    const s = mountSound(p);
    const beds = vi.spyOn(s.walkSounds, 'frame');
    const elements = Array.from({ length: 16 }, (_, i) => i);
    s.frame({ matrixWorld: { elements }, position: { x: 7, y: 8, z: 9 } });
    expect(listen).toHaveBeenCalledWith(elements);
    expect(beds).toHaveBeenCalledWith([7, 8, 9]);
  });

  it('#479\'s re-review F2: where the drawn camera stands off the game\'s, the listener and the beds are the game\'s', () => {
    const p = parts();
    const listen = vi.spyOn(p.audio, 'setListener');
    const s = mountSound(p);
    const beds = vi.spyOn(s.walkSounds, 'frame');
    const camera = new PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.lookAt(1, 2, -10);
    camera.updateMatrixWorld();
    // The same look from the game's eye gives the drawn camera's own matrix, three's `lookAt` with y up.
    s.frame({ matrixWorld: { elements: [] }, position: { x: 99, y: 99, z: 99 } }, { eye: [1, 2, 3], target: [1, 2, -10] });
    const heard = Array.from(listen.mock.calls[0]![0] as ArrayLike<number>);
    camera.matrixWorld.elements.forEach((v, i) => expect(heard[i]).toBeCloseTo(v, 9));
    expect(beds).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('the map\'s data then its loops; the round\'s cues taken up as the data lands (INT.R7)', () => {
    const p = parts();
    const set = vi.spyOn(p.audio, 'setData'), loops = vi.spyOn(p.audio, 'setLoops');
    const s = mountSound(p);
    const changed = vi.spyOn(s.roundAudio, 'dataChanged');
    const data = { archive: 'MP2', banks: [], missing: [] } as unknown as SoundData;
    s.setData(data);
    expect(set).toHaveBeenCalledWith(data);
    expect(changed).toHaveBeenCalledTimes(1);
    s.setLoops([]);
    expect(loops).toHaveBeenCalledWith([]);
  });

  it('dispose: the ears let go, the map\'s banks, beds and slot gone', () => {
    const p = parts();
    const set = vi.spyOn(p.audio, 'setData');
    const s = mountSound(p);
    const ears = vi.spyOn(s.ears, 'stop');
    s.dispose();
    expect(ears).toHaveBeenCalled();
    expect(set).toHaveBeenLastCalledWith(null);
  });

  it('silentOut: an output that plays nothing and is never unlocked (a match with no audio given)', () => {
    const out: AudioOut = silentOut();
    expect(out.unlocked).toBe(false);
    expect(out.loop({} as never)).toBeNull();
  });
});

describe('both pages mount it: no copy of the sound\'s wiring in either', () => {
  const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf-8');
  it("NU-7 W1: both pages hand mountSound the HUD and NetPage's trusted displayNameOf (the warning's line)", () => {
    // BOTPERSONA product adaptation: the warning keeps the trusted bot name's presentation, as the other HUD lines do.
    for (const f of ['main.ts', 'matchMount.ts']) expect(src(f), f).toMatch(/mountSound\(\{[^;]*?\bhud, nameOf: \(id\) => net\?\.displayNameOf\(id\) \?\? null,/);
  });

  it('main.ts and matchMount.ts call mountSound; the walk\'s sounds, the ears, the cues and the sound\'s hooks live in matchSound.ts alone', () => {
    for (const f of ['main.ts', 'matchMount.ts']) {
      expect(src(f), f).toMatch(/mountSound\(/);
      expect(src(f), f).not.toMatch(/new (WalkSounds|RingingEars|RoundAudioHost)\(/);
      expect(src(f), f).not.toMatch(/reloadSound: |deathVoice: |hurtVoice: |NV_GOGGLES_ON|setFallTable\(/);
    }
    expect(src('matchSound.ts')).toMatch(/new WalkSounds\(/);
    expect(src('matchSound.ts')).not.toMatch(/from '\.\/main'|import\('\.\/main'\)|document\./);
  });
});

/**
 * Research 304: a teammate's spoken warning at another's grenade release (`FUN_005c5340` D:L479233-479246): the
 * thrower's character's `CMD_MP_GRENADE_THROWN` stream at its body, for the listener of the thrower's side alone.
 */
describe('mountSound: the grenade warning (research 304)', () => {
  const vocal = (sound: string) => ({ sound, text: '%s', character: 'c' });
  const data = { taunts: { vocals: { seal: [], terrorist: [] }, grenadeWarnings: { seal: [[vocal('^PS_0016')], [vocal('^PS_0094')]], terrorist: [[vocal('^PT_0450')]] } } } as unknown as SoundData;
  function warn(seat: { id: number; role: string; team: 'seal' | 'terrorist' | null }) {
    const p = parts();
    const streams: [string, unknown][] = [];
    vi.spyOn(p.audio, 'playStream').mockImplementation((n: string, at?: unknown) => { streams.push([n, at]); return 'played' as never; });
    vi.spyOn(p.audio, 'setData').mockImplementation(() => {});
    const others = { teamOf: (id: number) => (id === 7 ? 'seal' : 'terrorist'), playerType: () => 1, feet: (): [number, number, number] => [9, 8, 7] };
    const s = mountSound({ ...p, seat: () => seat, others: () => others as never });
    s.setData(data);
    return { s, streams };
  }
  it("a teammate's: the thrower's character's stream at its feet", () => {
    const { s, streams } = warn({ id: 1, role: 'player', team: 'seal' });
    expect(s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] })).toBe('^PS_0094');
    expect(streams).toEqual([['^PS_0094', [9, 8, 7]]]);
  });
  it("none for an enemy's, a spectator, the page's own, or a weapon outside the six", () => {
    expect(warn({ id: 1, role: 'player', team: 'terrorist' }).s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] })).toBeNull();
    expect(warn({ id: 1, role: 'spectator', team: null }).s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] })).toBeNull();
    expect(warn({ id: 7, role: 'player', team: 'seal' }).s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] })).toBeNull();
    expect(warn({ id: 1, role: 'player', team: 'seal' }).s.grenadeWarning({ id: 0x9a, owner: 7, from: [0, 0, 0] })).toBeNull();
    expect(warn({ id: 1, role: 'player', team: 'seal' }).s.grenadeWarning({ id: 0x79, from: [0, 0, 0] })).toBeNull();
  });
});

/**
 * NU-7 W1 (research 325 §2.1, §4 W1; `GRENADE_WARNING_LINE_READING`): `FUN_005e7960` formats the thrower's row's text
 * with his name (`FUN_001988d0` D:L498142, the actor's `+0x14`) and posts it whenever it is not empty
 * (D:L498217-498218) -- apart from the voice, which plays when it resolves (D:L498198-498214) -- into the main message
 * window 0x4366a0 in colour 3 (D:L498223-498230), the post a tactical command's line takes (`./matchChat`). The HUD
 * here is a stub that records each post.
 */
describe("mountSound: the grenade warning's line (NU-7 W1, research 325 §4)", () => {
  const vocal = (sound: string, text: string) => ({ sound, text, character: 'c' });
  // SEAL type 0: a row without %s; 1: the disc's own text (HudCLOC 60592, killAutoComm.test.ts); 2: no row; 3: an empty text.
  const data = {
    taunts: {
      vocals: { seal: [], terrorist: [] },
      grenadeWarnings: {
        seal: [[vocal('^PS_0016', 'FIRE IN THE HOLE!')], [vocal('^PS_0094', '%s : FIRE IN THE HOLE!')], [null], [vocal('^PS_0042', '')]],
        terrorist: [[vocal('^PT_0450', '%s : FIRE IN THE HOLE!')]],
      },
    },
  } as unknown as SoundData;
  function warn(seat: { id: number; role: string; team: 'seal' | 'terrorist' | null }, o: { type?: number; played?: string } = {}) {
    const p = parts();
    const streams: string[] = [], posted: BannerLine[][] = [];
    vi.spyOn(p.audio, 'playStream').mockImplementation((n: string) => { streams.push(n); return (o.played ?? 'played') as never; });
    vi.spyOn(p.audio, 'setData').mockImplementation(() => {});
    const others = { teamOf: (id: number) => (id === 7 ? 'seal' : 'terrorist'), playerType: () => o.type ?? 1, feet: (): [number, number, number] => [9, 8, 7] };
    const hud = { postMessage: (lines: string | BannerLine[]) => { posted.push(typeof lines === 'string' ? [{ text: lines, scale: MESSAGE_SCALE }] : lines); } };
    const s = mountSound({ ...p, seat: () => seat, others: () => others as never, hud, nameOf: (id: number) => (id === 7 ? 'Mate' : `Player${id}`) });
    s.setData(data);
    return { s, streams, posted };
  }
  const mate = { id: 1, role: 'player', team: 'seal' as const };
  /** The tactical command's post (`./matchChat` `communication`): colour 3 (64, 128, 64, alpha 100), the window's scale. */
  const line = (text: string): BannerLine[] => [{ text, scale: MESSAGE_SCALE, rgb: [0.5, 1, 0.5], opacity: 100 / 128 }];

  it("GRENADE_WARNING_LINE_READING: the main window 0x4366a0, colour 3 (a command under 0x36)", () => {
    expect(GRENADE_WARNING_LINE_READING).toEqual({ window: 0x4366a0, colour: 3 });
  });

  it("a teammate's M67 (0x79) and AN-M8 (0x7a): one line each, the row's text with the thrower's name, in colour 3", () => {
    for (const id of [0x79, 0x7a]) {
      const { s, streams, posted } = warn(mate);
      expect(s.grenadeWarning({ id, owner: 7, from: [0, 0, 0] })).toBe('^PS_0094');
      expect(streams).toEqual(['^PS_0094']);
      expect(posted, `item ${id}`).toEqual([line('Mate : FIRE IN THE HOLE!')]);
    }
  });

  it('a row whose text names no %s posts it as it is', () => {
    const { s, posted } = warn(mate, { type: 0 });
    s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] });
    expect(posted).toEqual([line('FIRE IN THE HOLE!')]);
  });

  it("a row whose voice does not resolve still posts its line (the post hangs on the text alone, D:L498217-498218)", () => {
    for (const played of ['unknown', 'locked', 'muted', 'no-output']) {
      const { s, streams, posted } = warn(mate, { played });
      s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] });
      expect(streams).toEqual(['^PS_0094']);
      expect(posted, played).toEqual([line('Mate : FIRE IN THE HOLE!')]);
    }
  });

  it("none for an enemy's, the thrower's own page, a claymore (0x99), a character with no row; an empty text plays its voice and posts none", () => {
    const none = (seat: typeof mate | { id: number; role: string; team: 'seal' | 'terrorist' | null }, id: number, type?: number): BannerLine[][] => {
      const { s, posted } = warn(seat, type === undefined ? {} : { type });
      s.grenadeWarning({ id, owner: 7, from: [0, 0, 0] });
      return posted;
    };
    expect(none({ id: 1, role: 'player', team: 'terrorist' }, 0x79)).toEqual([]);   // the enemy's
    expect(none({ id: 1, role: 'spectator', team: null }, 0x79)).toEqual([]);        // a spectator: no affiliation
    expect(none({ id: 7, role: 'player', team: 'seal' }, 0x79)).toEqual([]);        // the thrower's own page
    expect(none(mate, 0x99)).toEqual([]);                                            // a claymore: outside the six
    expect(none(mate, 0x79, 2)).toEqual([]);                                         // no row: no text, no line
    const { s, streams, posted } = warn(mate, { type: 3 });
    expect(s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] })).toBe('^PS_0042');
    expect(streams).toEqual(['^PS_0042']);
    expect(posted).toEqual([]);
  });

  it('a mount with no HUD posts nothing and plays the voice as before', () => {
    const p = parts();
    const streams: string[] = [];
    vi.spyOn(p.audio, 'playStream').mockImplementation((n: string) => { streams.push(n); return 'played' as never; });
    vi.spyOn(p.audio, 'setData').mockImplementation(() => {});
    const others = { teamOf: () => 'seal', playerType: () => 1, feet: (): [number, number, number] => [9, 8, 7] };
    const s = mountSound({ ...p, seat: () => mate, others: () => others as never });
    s.setData(data);
    expect(s.grenadeWarning({ id: 0x79, owner: 7, from: [0, 0, 0] })).toBe('^PS_0094');
    expect(streams).toEqual(['^PS_0094']);
  });
});

/**
 * R4P-254 ESCORTEE-YES (atlas r0004 queue row 68): the escortee's YES is its PLACED character's own `CHRSND_YES` (0x37,
 * OnCommand `FUN_0058fbe0` D:L450379, D:L450531, D:L450537) -- `^CO_0284` for MP82's `mp_vip1-3` -- through the global
 * one-voice AI vocal queue (`FUN_003428f0` -> `FUN_0034ced0` appends; `FUN_0034c650` drops an entry out of hearing,
 * `FUN_0034d0b0` -> `FUN_00342670`'s RANGE volume 0, and plays the next). No entry for the character: silent, the null
 * handle's nothing (`FUN_0053b710` D:L405264-405266).
 */
describe('R4P-254: the escortee YES, its own group through the one-voice AI vocal queue', () => {
  const voices = (character: string, yes: string | null) =>
    ({ character, damage: null, death: null, quiet: null, yes, no: null });
  const data = {
    escorteeVoices: [voices('mp_vip1', '^CO_0284'), voices('mp_fem1', '^CO_0343'), voices('mp_quiet', null)],
    tacticalGroups: [{ name: '^CO_0284', dynamic: 0.05, members: [{ name: '^*CO_0284A', weight: 0 }] }],
    params: [['^*CO_0284A', { range: [40, 200] }]],
  } as unknown as SoundData;
  const ORIGIN = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, position: { x: 0, y: 0, z: 0 } };
  /** A mounted sound on `data`, its clock `t` (ms), each voice `seconds` long, the listener at the origin. */
  function rig(seconds = 2) {
    const clock = { t: 1_000, up: false };
    vi.spyOn(performance, 'now').mockImplementation(() => clock.t);
    const p = { ...parts(), screenUp: () => clock.up };
    vi.spyOn(p.audio, 'setData').mockImplementation(() => undefined);
    vi.spyOn(p.audio, 'hasStream').mockReturnValue(true);
    const stream = vi.spyOn(p.audio, 'playStream').mockReturnValue('played');
    vi.spyOn(p.audio, 'stats').mockReturnValue({ recent: [{ seconds }] } as never);
    const s = mountSound(p);
    s.setData(data);
    const frame = (ms: number) => { clock.t = ms; s.frame(ORIGIN); };
    frame(1_000);
    return { deps: s.netDeps(), stream, frame, clock, s };
  }
  afterEach(() => { vi.restoreAllMocks(); });

  it('MP82: a FOLLOW or HOLD YES for mp_vip1 requests its own ^CO_0284 at the body, not the fixed ^CO_0343', () => {
    const { deps, stream, frame } = rig();
    deps.escorteeVoice(240, 'yes', [10, 0, 0], 'mp_vip1');                // FOLLOW
    expect(stream).toHaveBeenLastCalledWith('^CO_0284', [10, 0, 0]);
    frame(3_100);
    deps.escorteeVoice(240, 'yes', [10, 0, 0], 'mp_vip1');                // HOLD
    expect(stream).toHaveBeenCalledTimes(2);
    expect(stream).toHaveBeenLastCalledWith('^CO_0284', [10, 0, 0]);
  });

  it('a map whose escortee carries another group plays that group; an escortee naming no YES, or no character, is silent', () => {
    const { deps, stream, frame } = rig();
    deps.escorteeVoice(240, 'yes', [0, 0, 5], 'mp_fem1');
    expect(stream).toHaveBeenLastCalledWith('^CO_0343', [0, 0, 5]);
    frame(3_100);
    deps.escorteeVoice(241, 'yes', [0, 0, 5], 'mp_quiet');
    deps.escorteeVoice(242, 'yes', [0, 0, 5], null);
    deps.escorteeVoice(243, 'yes', [0, 0, 5], 'mp_nobody');
    frame(9_000);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('two AI voices requested together play one after the other: the second when the first ends', () => {
    const { deps, stream, frame } = rig();
    deps.escorteeVoice(240, 'yes', [10, 0, 0], 'mp_vip1');
    deps.escorteeVoice(241, 'yes', [0, 0, 5], 'mp_fem1');
    expect(stream).toHaveBeenCalledTimes(1);
    frame(2_900);                                                         // the first's 2 s not over
    expect(stream).toHaveBeenCalledTimes(1);
    frame(3_000);                                                         // it ends: the next starts
    expect(stream).toHaveBeenCalledTimes(2);
    expect(stream).toHaveBeenLastCalledWith('^CO_0343', [0, 0, 5]);
  });

  // Review F2: a group's handle is the plain constructor's (FUN_00345620: 160-430, D:L243411-243425) -- the queue hears a
  // group by 160-430; the member's own 40-200 is the play's falloff only (FUN_00342b20).
  it('an entry out of hearing when its turn comes is dropped (a group handle 160-430, AI_VOCAL_HEARING_RANGE_READING), and the next plays', () => {
    expect(AI_VOCAL_HEARING_RANGE_READING).toBe('a group: 160-430; a sound: its own RANGE');
    const { deps, stream, frame } = rig();
    deps.escorteeVoice(240, 'yes', [0, 0, 5], 'mp_fem1');                 // plays at once
    deps.escorteeVoice(241, 'yes', [500, 0, 0], 'mp_vip1');               // beyond 430 at its turn: dropped
    deps.escorteeVoice(242, 'yes', [250, 0, 0], 'mp_vip1');               // past the member's 200, within the group's 430: heard
    frame(3_000);
    expect(stream.mock.calls).toEqual([['^CO_0343', [0, 0, 5]], ['^CO_0284', [250, 0, 0]]]);
  });

  // Review F1: PlayAt hands the queue 3.0 s (D:L405300) at the entry's +4; the tick takes the frame's time off every
  // waiting entry, clamped at 0 (FUN_0034c920 D:L247548-247555); FUN_0034c650 drops a head entry at 0 before hearing.
  it('an entry that has waited 3.0 s (AI_VOCAL_ENTRY_LIFETIME_READING) is dropped unplayed; one that waited less plays', () => {
    expect(AI_VOCAL_ENTRY_LIFETIME_READING).toBe(3);
    const { deps, stream, frame } = rig(3.5);                             // each voice 3.5 s: the waiting ones outlive 3.0
    deps.escorteeVoice(240, 'yes', [0, 0, 5], 'mp_fem1');                 // plays at once
    deps.escorteeVoice(241, 'yes', [10, 0, 0], 'mp_vip1');
    deps.escorteeVoice(242, 'yes', [0, 0, 5], 'mp_fem1');
    frame(2_000); frame(4_000);                                           // 3.0 s waited by t = 4.0
    frame(4_600);                                                         // the first voice over: both are spent
    expect(stream).toHaveBeenCalledTimes(1);
    const late = rig(2.5);
    late.deps.escorteeVoice(240, 'yes', [0, 0, 5], 'mp_fem1');
    late.deps.escorteeVoice(241, 'yes', [10, 0, 0], 'mp_vip1');
    late.frame(2_000); late.frame(3_600);                                 // 2.6 s waited: still in its life
    expect(late.stream).toHaveBeenCalledTimes(2);
  });

  // Review F4: a replay seek resets the round's audio (`./matchActions` `followSeek` -> `roundAudio.reset`): the queue
  // is emptied with it, so the re-watched span's YES lines do not burst after a backward seek.
  it('a replay seek (roundAudio.reset) empties the queue: no burst after a backward seek, and the next YES plays at once', () => {
    const { deps, stream, frame, s } = rig(2);
    deps.escorteeVoice(240, 'yes', [0, 0, 5], 'mp_fem1');
    deps.escorteeVoice(241, 'yes', [0, 0, 5], 'mp_fem1');
    deps.escorteeVoice(242, 'yes', [0, 0, 5], 'mp_fem1');
    s.roundAudio.reset();                                                 // the seek's call
    frame(500); frame(3_100); frame(6_000);
    expect(stream).toHaveBeenCalledTimes(1);
    deps.escorteeVoice(243, 'yes', [0, 0, 5], 'mp_fem1');
    expect(stream).toHaveBeenCalledTimes(2);
  });

  it("the screens' first frame empties the queue (AI_VOCAL_QUEUE_AT_SCREENS_READING), and none is asked under them", () => {
    expect(AI_VOCAL_QUEUE_AT_SCREENS_READING).toBe('emptied');
    const { deps, stream, frame, clock } = rig();
    deps.escorteeVoice(240, 'yes', [0, 0, 5], 'mp_fem1');
    deps.escorteeVoice(241, 'yes', [0, 0, 5], 'mp_fem1');
    clock.up = true; frame(1_500);
    deps.escorteeVoice(242, 'yes', [0, 0, 5], 'mp_fem1');
    clock.up = false; frame(3_100);
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('a voice whose length the page cannot know ends at once (AI_VOCAL_UNKNOWN_LENGTH_PLACEHOLDER)', () => {
    expect(AI_VOCAL_UNKNOWN_LENGTH_PLACEHOLDER).toBe(0);
    const { deps, stream } = rig(0);
    deps.escorteeVoice(240, 'yes', [0, 0, 5], 'mp_fem1');
    deps.escorteeVoice(241, 'yes', [0, 0, 5], 'mp_fem1');
    expect(stream).toHaveBeenCalledTimes(2);
  });
});
