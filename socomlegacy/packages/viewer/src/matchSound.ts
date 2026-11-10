import { SEAL_TUNING, type Side } from '@s2u/scene';
import { soundFor, type RenderedSound } from '@s2u/sound';
import { Matrix4, Vector3 } from 'three';
import type { AudioOut, GameAudio } from './audio';
import type { FlyCamera } from './camera';
import type { Hud } from './hud';
import type { PlayerLoadout } from './loadout';
import type { FirearmSound } from './matchFirearm';
import type { PART_DEPS } from './matchNet';
import type { NetPageDeps } from './netPage';
import type { PlayEvent } from './play';
import type { RemotePlayers, RemoteStepHook } from './remotePlayers';
import { grenadeWarningFor } from './gameplayAudio';
import { commandLine, commandText } from './matchChat';
import type { Team } from './net/protocol';
import { RingingEars } from './ringingEars';
import { HOSTAGE_YES_CUE_READING } from './hostagePage';
import { RoundAudioHost } from './roundAudioHost';
import type { SoundData } from './soundData';
import type { WalkMode } from './walk';
import { WalkSounds } from './walkSounds';

/**
 * MATCH-SOUND (web research 222 §7): the match's sound, written once for both pages -- `/testroom` (`./main`, on the
 * page's `gameAudio`) and the front end's match (`./matchMount`, on a `GameAudio` of its own over the menus' context,
 * `frontEnd.ts`). The sound of research 81 and its successors: the map's banks played on the walk's events
 * (`./walkSounds`: the footfalls, the jump, the landing, the rounds and reloads), the others' footfalls, the firearm's
 * (`FirearmSound`), the ringing ears (`./ringingEars`), the round's cues (`./roundAudioHost`, INT.R7), the sound part's
 * `NetPage` hooks (`./matchNet` `PART_DEPS.sound`), the listener and the beds once a frame. Every line is the one
 * `main.ts` held before; nothing here imports `./main` or reads page markup (OT.R12).
 */

/**
 * The match's own audio, as the front end hands it to the mount (`frontEnd.ts` `frontEndMatchSound`): a `GameAudio` on
 * an output over the menus' context, and the output's release -- called once, at the match's release or close.
 */
export interface MatchAudio {
  game: GameAudio;
  release(): void;
}

/** What the sound reads. */
export interface MatchSoundParts {
  audio: GameAudio;
  /** AMB-1: `gridOfGround`, the camera's floor pick in every view (`WalkSignals.sceneGrid`); absent, `grid` alone. */
  walk: Pick<WalkMode, 'mode' | 'drawnFeet' | 'posture' | 'grid'> & Partial<Pick<WalkMode, 'gridOfGround'>>;
  fly: Pick<FlyCamera, 'groundWish'>;
  loadouts: Pick<PlayerLoadout, 'type'>;
  /** The page's side (`./matchCore` `matchSide`): the page's own body's voice. */
  side(): Side;
  /**
   * Research 304: the page's seat in the match (its client), whose side hears a teammate's grenade warning; absent, none.
   * LATER 161: and the replay's clock, read off it as `NetPage` reads it (`pageClock`, RE-3: the replay mode's
   * `ReplayClient`'s); a live `NetClient` has none (`roundAudioClock`).
   */
  seat?(): { id: number; role: string; team: Team | null; pageClock?(): { now(): number } } | null;
  /**
   * Research 304: the others' sides, character types and feet (`./remotePlayers`): the thrower's voice and place; NU-7 G1,
   * their throw clips' callbacks (`takeThrowCallbacks`), played once a frame.
   */
  others?(): (Pick<RemotePlayers, 'teamOf' | 'playerType' | 'feet'> & Partial<Pick<RemotePlayers, 'takeThrowCallbacks'>>) | null;
  /** NU-7 W1 (`GRENADE_WARNING_LINE_READING`): the HUD's message window, the teammates' warning's line; absent, no line. */
  hud?: Pick<Hud, 'postMessage'>;
  /**
   * NU-7 W1: a player's name -- the page's `NetPage.nameOf` (its names, else `Player<id>`: the kill line's and the vote
   * list's), the warning's line's `%s`; absent or null (no `NetPage`), no line.
   */
  nameOf?(id: number): string | null;
  /**
   * OBF-7: whether a round screen is up (`NetPage.screenUp`: ROUND COMPLETE, FINAL ROUND, GAME COMPLETE and the last one
   * held until the next round's start); absent, never. Under them neither the page's own body nor the others' footfalls
   * are heard (`ROUND_SCREENS_SILENCE_WALK_READING`).
   */
  screenUp?(): boolean;
  /**
   * AMB-1 (`./walkSounds` `TESTROOM_FLY_AMBIENCE_ADAPTATION`): the test room's free-fly viewer, outside a match, holds
   * the beds off; absent (the front end's match), never -- the beds play in every view (research 81 §10).
   */
  ambienceOff?(): boolean;
}

/**
 * ROUND_SCREENS_SILENCE_WALK_READING (OBF-7; reading, pending review): the page's own footfalls, clip callbacks and
 * landings, its ladder slide's loop and landing, and the others' footfalls, are not heard while a round screen is up. Online, a client's mission tick `FUN_002aa490`, on the host's told
 * state +0x113 at 4 or 6 (D:L151127-151129: after the host's own 3.0 s wait, `FUN_002a9b30`, research 114 s1.4 -- the
 * page's `ENGINE_READ_S`), calls the mission's end `FUN_002aa910` (D:L151131), whose `FUN_00346b30` (D:L151220) sends
 * `SL_STOPALLSOUNDS` (`FUN_00340270`, D:L244182; research 122), and pushes `MPExitState` (0x4086c8) over CoreState
 * (`FUN_002cf380` D:L151134; research 115 s8.2). The state machine `FUN_002ce9e0` ticks only the stack's top
 * (vtable +0x14, D:L171877-171888), so CoreState -- the round, the local SEAL's walk and its sounds -- is not ticked
 * under ROUND COMPLETE, FINAL ROUND and GAME COMPLETE (MPExitState's Tick `FUN_00223680` D:L75899-75958 -- its vtable
 * 0x405780, stored by `FUN_00224110` D:L76192, holds 0x223680 at +0x14 and 0x223970 at +0x10, read off the ELF -- ticks its menu,
 * not the world, nor the others' bodies) until the host's 3 or 5 restarts the mission and pops it (`FUN_002a7d40`,
 * `FUN_002cf2f0`, D:L75935-75936). Through the engine's 3 s CoreState still ticks: every footfall is heard there. The
 * original stops the walk itself, not only its sound, and stops what sounds at the screens' start
 * (`ROUND_SCREENS_STOP_ALL_READING`, OBF-31). Settled by a capture of a round's end with the local SEAL and another moving.
 */
export const ROUND_SCREENS_SILENCE_WALK_READING = 'screens' as const;

/**
 * ROUND_SCREENS_STOP_ALL_READING (OBF-31, LATER 580; reading, pending review): at the screens' start the original stops
 * every sound once and starts none of the world's until the next round. The mission's end `FUN_002aa910` (D:L151203; called
 * online at D:L151131 on the host's +0x113 at 4 or 6, after the 3.0 s read -- the page's `ENGINE_READ_S`) calls
 * `FUN_00346b30` (D:L151220): `SL_STOPALLSOUNDS` (`FUN_00340270` D:L244182 -> 989snd command 0x18, D:L240585; research
 * 122 R122.6), then every handle-tracked voice released (`FUN_00346550` D:L244191) and the tracked list rebuilt
 * (`FUN_00347120(0,0)` D:L244192); then `FUN_00344f80` (D:L151221) -- `VagStreaming OFF`'s own call (D:L124485; research 122
 * row 134) -- stops the stream system (D:L243215-243233: the stream's stop through its vtable +0x14, its mode
 * `DAT_0048dd98` to 0, 989snd 0x34, `FUN_0033f5f0` closing the stream channel with 0x35 and clearing `DAT_00488fb0`, which
 * `FUN_0033f720` opens the 0xb000 VPK buffer under), so the round's line and win music -- `MUS` VPK and `^PH` VAG streams
 * (research 124 R124.1, R124.3) -- stop with it; and `FUN_00348860` (D:L151222, D:L245208-245223) stops the music slot
 * itself -- SOUND's one-voice slot `FUN_00348dc0` the `MUS_*` cues play in (research 124 R124.5, §7): its voice
 * `DAT_0048e080` stopped by 989snd 0x15 (`FUN_00347610` -> `FUN_00340330`) and released (`FUN_00347810`), its entry
 * `DAT_0048e088` stopped (`FUN_00349d30`), its pending cue `DAT_0048e0b0` and priority `DAT_0048e0b4` cleared. The win
 * music stops at the screens' start. Nothing new is started: `FUN_002ce9e0` ticks only the stack's top
 * (D:L171877-171888), MPExitState's Tick `FUN_00223680` (D:L75899-75958), never CoreState's world, nor its mission script.
 * The page: once, as a screen first comes up, `RoundAudioHost.reset` -- `GameAudio.stopTransient` (the voices, the slide,
 * the streams' voices) and the music slot stopped, the round's queued cues dropped; then, until the next round's start,
 * no shot, reload, dry click, effect, goggles, another's round or reload, voice, ring or warning plays. Through the
 * engine's 3 s every one plays as before. Open (LATER 580): the beds' and emitters' loops (`SL_STOPALLSOUNDS` stops them;
 * the page's loops run on), and a ringing ears' duck and its fade timer already running (`./ringingEars`; its tone, a
 * transient voice, stops with the reset). The taunts' vocals and the menu's send (`./matchTaunts`) and a scene program's
 * SOUND (`sceneSound`) are gated too; the world's step runs on (LATER 580). Settled by a capture of a round's end with a
 * shot, a voice and the win music sounding.
 */
export const ROUND_SCREENS_STOP_ALL_READING = 'once at the screens' as const;

/**
 * NU-7 W1 (research 325 §2.1, §4 W1; reading, pending review): a teammate's grenade warning posts its row's text, formatted
 * with the thrower's name (`FUN_005e7960` D:L498142: `FUN_001988d0` with the actor's `+0x14`), whenever that text is not
 * empty (D:L498217-498218) -- whether or not its voice resolves, which plays apart (D:L498198-498214) -- into the main
 * message window 0x4366a0 in colour 3, a command under 0x36 (D:L498223-498230): the post a tactical command's line takes
 * (`./matchChat` `commandLine`, `commandText`). Scale 0 (D:L498230's first argument, `FUN_002b6530`'s float): the
 * window's own (D:L157983-157987), as the tactical line's. Settles: capture NU7-2.
 */
export const GRENADE_WARNING_LINE_READING = Object.freeze({ window: 0x4366a0, colour: 3 } as const);

/** The sound part's `NetPage` hooks, as `PART_DEPS.sound` lists them. */
export type MatchSoundDeps = Required<Pick<NetPageDeps, (typeof PART_DEPS)['sound'][number]>>;

/** The camera, as the frame reads it (three's `Camera`). */
export interface ListenerCamera {
  matrixWorld: { elements: ArrayLike<number> };
  position: { x: number; y: number; z: number };
}

export interface MatchSound {
  readonly audio: GameAudio;
  readonly walkSounds: WalkSounds;
  readonly roundAudio: RoundAudioHost;
  readonly ears: RingingEars;
  /** The firearm's sound (`./matchFirearm` `mountFirearm`'s `sound`). */
  readonly firearm: FirearmSound;
  /** The others' footfalls heard at the foot (`RemotePlayers`' step hook; FUN_005a3570/FUN_005a39b0; REMOTE_STEP_STICK_READING). */
  readonly remoteStep: RemoteStepHook;
  /** The body's footfalls, clip callbacks and landings (`Play.onEvent`). */
  playEvent(e: PlayEvent): void;
  /**
   * The ladder's slide loop held at a place, or let go (null) -- `TraversalPage`'s `slide`, as both pages lend it
   * (`GameAudio.setLadderSlide`, PAR-89); let go under the round screens (OBF-7, `ROUND_SCREENS_SILENCE_WALK_READING`).
   */
  ladderSlide(at: [number, number, number] | null): void;
  /** The slide's landing (`TraversalPage`'s `land`, `GameAudio.onLand` on the floor's material); none under the round screens (OBF-7). */
  ladderLand(speed: number, at: [number, number, number]): void;
  /**
   * Research 304: another's accepted throw (`./matchThrow`'s `remoteRelease`): a teammate's spoken warning -- the
   * thrower's character's `CMD_MP_GRENADE_THROWN` stream at its body (`./gameplayAudio` `grenadeWarningFor`) -- and,
   * NU-7 W1, its line on the HUD (`GRENADE_WARNING_LINE_READING`). The name played, or null (an enemy's, a spectator's,
   * the page's own, a weapon outside the six, no recording).
   */
  grenadeWarning(release: { id: number; owner?: number; from: readonly [number, number, number] }): string | null;
  /**
   * A scene program's SOUND (`./worldState`'s `sound` hook, SUP-02) at its place, through the map's banks -- none under the
   * round screens (OBF-31, `ROUND_SCREENS_STOP_ALL_READING`). The world's step itself runs on there (LATER 580).
   */
  sceneSound(name: string, at: [number, number, number] | null, volume: number): void;
  /** The sound part's `NetPage` hooks. */
  netDeps(): MatchSoundDeps;
  /**
   * Once a frame, after the camera's matrix and the others' bodies (`NetPage.frame`): the listener (0x48dd40), the others'
   * throw clips' callbacks at their feet (NU-7 G1, `REMOTE_THROW_GRUNT_READING`), and the reverb and beds at the camera.
   * `game` is the game's camera where the drawn one stands off it (`WalkMode.gameCamera`, #479's re-review F2): the
   * listener and the reverb follow it, never the drawn-only push.
   */
  frame(camera: ListenerCamera, game?: { eye: readonly [number, number, number]; target: readonly [number, number, number] } | null): void;
  /** The map's sound data (`./soundData`); the round's cues taken up as it lands (INT.R7). */
  setData(data: SoundData | null): void;
  /** The beds' and emitters' loops the worker rendered. */
  setLoops(loops: readonly { name: string; sound: RenderedSound }[]): void;
  /** The match's end: the ears let go, the map's banks, beds and slot gone. */
  dispose(): void;
}

/**
 * LATER 161 (REPLAY_ADAPTATION: SOCOM II plays no recording back; the live page unchanged): the round audio's clock, in
 * seconds -- the replay's time when the page's client carries one (`pageClock`: `ReplayClient`'s, RE-3, research 249 §4 --
 * standing still paused, scaled by the speed, at a told record's own tick), as `NetPage.now` reads it; else
 * `performance.now`, read as `RoundAudioHost`'s default reads it. So on the replay page `RoundAudio`'s schedule -- the
 * intro's, a result's and a hold's lines and streams at the script's waits, the unlock retry -- runs on the replay: a
 * pause holds what is queued, 2x halves the wall wait. The choice for a voice already sounding when the replay pauses
 * or changes speed: it plays on to its end, on the audio's own time, as the replay's other sounds already sounding do
 * (what plays is the live page's; the replay's clock decides only when a queued one starts). A seek's jump is LATER
 * 160's reset (`./matchActions`), which clears the queue and stops the voices. And on the replay page: a line queued past
 * the recording's end never plays (the clock stops there); a step forward plays what fell due in the step at once; while
 * paused, a locked cue's retry and its window (`UNLOCK_RETRY_PLACEHOLDER`, 5 s) wait, now in replay seconds (20 s of wall
 * at 0.25x).
 */
export function roundAudioClock(client: () => { pageClock?(): { now(): number } } | null): () => number {
  return () => {
    const replay = client()?.pageClock?.();
    return (replay ? replay.now() : performance.now()) / 1000;
  };
}

/** The game's listener matrix, built once a frame where the drawn camera stands off the game's (`MatchSound.frame`). */
const ear = new Matrix4(), earEye = new Vector3(), earAt = new Vector3(), EAR_UP = new Vector3(0, 1, 0);

export function mountSound(p: MatchSoundParts): MatchSound {
  const { audio, walk, fly, loadouts } = p;
  /**
   * INT.R7 (research 124 §6, §12): the round's cues -- intro, result line, win music -- on the page's audio; the match's
   * page drives it. LATER 161 (REPLAY_ADAPTATION): on the page's clock -- the replay's on the replay page
   * (`roundAudioClock`: a pause holds what is queued, the speed scales the waits), else `performance.now` as before.
   */
  const roundAudio = new RoundAudioHost(audio, roundAudioClock(() => p.seat?.() ?? null));
  audio.setFallTable(SEAL_TUNING.gravity, SEAL_TUNING.fallingDamage);
  const walkSounds = new WalkSounds(audio, {
    walking: () => walk.mode() === 'walk',
    feet: () => walk.drawnFeet(),
    stance: () => walk.posture(),
    wish: () => fly.groundWish(),
    grid: () => walk.grid(),
    sceneGrid: () => walk.grid() ?? walk.gridOfGround?.() ?? null,   // AMB-1: the dead and spectator cameras pick the beds too
    ...(p.ambienceOff ? { ambienceOff: p.ambienceOff } : {}),
  });
  /** The blast's ring above selected ducked sound groups: a 5 s hold, then 5 s master recovery (`./ringingEars`). */
  const ears = new RingingEars(audio);
  /** The map's sound data (`setData`): the warnings' character tables (research 304). */
  let data: SoundData | null = null;
  /** OBF-31 (`ROUND_SCREENS_STOP_ALL_READING`): a round screen up -- no world sound starts. */
  const screens = (): boolean => p.screenUp?.() ?? false;
  /** OBF-31: whether a screen was up at the last frame -- its first frame stops every sound, once. */
  let screensWere = false;
  const firearm: FirearmSound = {
    fireEvent: (e) => { if (!screens()) walkSounds.fireEvent(e); },   // OBF-31: the rounds, reloads and dry clicks
    // The effects' sounds through the map's banks: the data's slips mended and a stand-in for a casing sound a map lacks
    // (`@s2u/sound`'s `soundFor`, the one name table: research 90 items 4 and 12).
    effect: (name, at, volume) => { if (!screens()) audio.play(soundFor(name, (n) => audio.has(n)), at, 'play', volume); },
    goggles: (on) => { if (!screens()) audio.play(on ? '.NV_GOGGLES_ON' : '.NV_GOGGLES_OFF', null); },   // DAT_0044ce30/38
    roundFired: (e) => { if (!screens()) audio.onFire(e.weapon.name, e.from); },   // OBF-31: another's round
    // LATER 644: another's round past the page's feet (`FUN_00598000`, research 81); OBF-31: none under the screens.
    roundPast: (from, to, actor) => { if (!screens()) audio.onRoundPast(from, to, actor); },
  };
  return {
    audio, walkSounds, roundAudio, ears, firearm,
    remoteStep: (_id, step, feet) => {
      if (p.screenUp?.()) return;                     // OBF-7: ROUND_SCREENS_SILENCE_WALK_READING -- the round is not ticked under the screens
      audio.onFootstep(walkSounds.material(feet), step.at, { stance: step.stance, stick: step.stick });
    },
    playEvent: (e) => { if (!p.screenUp?.()) walkSounds.playEvent(e); },   // OBF-7: ROUND_SCREENS_SILENCE_WALK_READING
    ladderSlide: (at) => { audio.setLadderSlide(p.screenUp?.() ? null : at); },   // OBF-7: the loop let go under the screens
    ladderLand: (speed, at) => { if (!p.screenUp?.()) audio.onLand(speed, walkSounds.material(at), at); },
    sceneSound: (name, at, volume) => { if (!screens()) audio.play(name, at, 'play', volume); },   // OBF-31
    grenadeWarning: (r) => {
      if (screens()) return null;                      // OBF-31: no thrower's voice nor its line under the screens
      const seat = p.seat?.() ?? null, others = p.others?.() ?? null;
      if (!seat || !others || r.owner === undefined) return null;
      const vocal = grenadeWarningFor(data?.taunts?.grenadeWarnings, r.id, r.owner, seat.id, seat.role === 'player' ? seat.team : null,
        others.teamOf(r.owner), others.playerType(r.owner));
      if (!vocal) return null;
      const at = others.feet(r.owner) ?? [r.from[0], r.from[1], r.from[2]];
      audio.playStream(vocal.sound, [at[0], at[1], at[2]]);   // placed at the thrower (0x5e7e30: positional, volume 1.0)
      // NU-7 W1 (GRENADE_WARNING_LINE_READING): the row's text with the thrower's name, posted when not empty, whether or
      // not the voice played (D:L498217-498230)
      const name = p.hud ? p.nameOf?.(r.owner) ?? null : null;
      const line = name !== null ? commandText(vocal.text, name) : '';
      if (line) p.hud!.postMessage([commandLine(line)]);
      return vocal.sound;
    },
    netDeps: () => ({
      // OBF-31 (`ROUND_SCREENS_STOP_ALL_READING`): none of these under the round screens
      reloadSound: (w, at) => { if (!screens()) audio.onReload(w.name, at); },   // another player's reload (REMOTE_RELOAD_SOUND_READING)
      // PF-10: a death's voice at the body, the victim character's by the cause (FUN_005979a0); the page's own body is the
      // seat's side and the type the page holds.
      deathVoice: (cause, side, type, at) => {
        if (screens()) return;
        const s = side ?? p.side();
        audio.onDeath(cause, s, type ?? loadouts.type(s), at);
      },
      // PF-10 fix round: a body's hurt voice (FUN_00597b00), the room's gate passed.
      hurtVoice: (side, type, at) => {
        if (screens()) return;
        const s = side ?? p.side();
        audio.onHurt(s, type ?? loadouts.type(s), at);
      },
      ring: (seconds, volume) => { if (!screens()) ears.start(seconds, volume); },
      roundAudio,                                     // INT.R7: the round's cues (`./roundAudioHost`), run by the page's frame
      objective: () => audio.roundCues()?.objective ?? null,   // PF-12: the map's objective lines, read with the cues
      // HX-4a: an escortee's YES at its body (CHRSND 0x37, mp_fem1-3's ^CO_0343; HOSTAGE_YES_AUDIENCE_PLACEHOLDER).
      escorteeVoice: (_id, cue, at) => { if (cue === 'yes' && at && !screens()) audio.play(HOSTAGE_YES_CUE_READING.sound, at, 'voice'); },
    }),
    frame: (camera, game = null) => {
      // OBF-31 (`ROUND_SCREENS_STOP_ALL_READING`, `FUN_00346b30` + `FUN_00344f80`, D:L151220-151221): a screen's first frame
      // stops every sound once -- the voices, the streams, the music slot, the round's queued cues; a round's start hears again
      const up = screens();
      if (up && !screensWere) roundAudio.reset();
      screensWere = up;
      // The game's listener is the camera (0x48dd40): the game's, three's `lookAt` with y up as the drawn one is placed.
      if (game) ear.lookAt(earEye.fromArray(game.eye), earAt.fromArray(game.target), EAR_UP).setPosition(earEye);
      audio.setListener(game ? ear.elements : camera.matrixWorld.elements);
      // NU-7 G1 (REMOTE_THROW_GRUNT_READING): another's standing throw's `throw_whoosh` from its body's clip, as the page's own
      for (const c of p.others?.()?.takeThrowCallbacks?.() ?? []) if (!up) audio.onAnimCallback(c.name, c.at);   // OBF-31: taken, none heard
      walkSounds.frame(game ? [game.eye[0], game.eye[1], game.eye[2]] : [camera.position.x, camera.position.y, camera.position.z]);   // the reverb, the beds
    },
    setData: (next) => { data = next; audio.setData(next); if (next) roundAudio.dataChanged(); },
    setLoops: (loops) => { audio.setLoops(loops); },
    dispose: () => { ears.stop(); roundAudio.reset(); audio.setData(null); },
  };
}

/** An output that plays nothing and is never unlocked: a match mounted with no audio (the tests'). */
export function silentOut(): AudioOut {
  return {
    unlocked: false, state: 'locked', unlock: () => {}, setGain: () => {}, play: () => {},
    setReverb: () => {}, rampReverb: () => {}, loop: () => null,
  };
}
