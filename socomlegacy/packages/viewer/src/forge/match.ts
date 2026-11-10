import type { ForgeLightingOptions } from './lighting';
import { Group, type Object3D } from 'three';
import type { AssetSource } from '@s2u/archive';
import type { UiSoundCues } from '@s2u/ui';
import type { ArmoryData } from '../armoryData';
import { GameAudio, WebAudioOut } from '../audio';
import { pinnedMatchSocket, type PinnedSocketUrl } from '../connectHost';
import type { EffectData } from '../effectData';
import type { GameLobbyHandOff } from '../gameLobbyHost';
import type { LoadedMap } from '../loadMap';
import { mountMatch, type MatchAssets, type MountedMatch } from '../matchMount';
import { NetClient, type NetWalk } from '../net/client';
import { LoopbackMatch, simClipsOfPlay, simMapOfLoaded, type LoopbackOptions } from '../net/loopback';
import type { ServerEvent } from '../net/protocol';
import type { PlayClips } from '../play';
import { assetSourceFor, type SourceRequest } from '../discSource';
import type { SoundData } from '../soundData';
import { frontEndSoundData, makeUiSoundHost, readUiSoundFiles } from '../uiSoundHost';
import type { ViewerRequest, ViewerResponse } from '../worker';
import { DEFAULT_SETTINGS, type NpcBehaviour, type NpcMarker } from './layout';
import type { ContentPlacement } from './matchMap';
import type { ForgeLobbyHandOff } from './lobbyClient';
import { matchHandOff } from './lobbyPage';
import { forgeMatchSounds, setForgeMatchSounds } from './matchState';
import { ForgeNpcs, soloSideOption } from './npcs';
import type { ForgePlayPort } from './agent/play';
import { brainFor, fetchNpcNavigation, type NpcBrain } from './npcBrain';
import type { RuleHost, RuleLayout } from '../../../match/src/creator/rules';
import { forgeRuleHost, ruleMapNames } from './matchRules';
import type { RulesCueAudio } from './rulesCues';
import { pageMatchDeps, type PageMatchDeps } from '../playerSettings';

/**
 * FORGE (the owner, 2026-10-13: "Instead of just walk around, play starts an actual match with our testroom style local
 * match in the forge. The whole game engine and all it's sounds etc."): Play as a match. A browser adaptation with no
 * original; it changes nothing of the match -- it mounts the front end's own (`../matchMount` `mountMatch`: the world,
 * the walk and bodies, the HUD, the firearm and its effects, the sound, the throwables, the doors, the actions, the round)
 * on the test room's in-page room (`../net/loopback` `LoopbackMatch`, "solo": the room runs in the page), over the map
 * the forge composed (`./matchMap`). The client the match adopts is the one a lobby would hand it, opened here on the
 * loopback's socket and welcomed before the mount, as `../gameLobbyHost` welcomes its own.
 */

/** The lobby's walk-less client stand-in (`../gameLobbyHost`'s `idleWalk`): the match rebinds its walk at the adoption. */
const IDLE_WALK: NetWalk = { setNetTap: () => {}, respawn: () => false, nudge: () => {}, setLocked: () => {}, grounded: () => false };   // LATER 498: no ground, so its refusal holds no spawn
/** How long the room's welcome may take before the Play is given up (the room is in the page: it answers at once). */
const WELCOME_MS = 5000;

export interface ForgeMatch {
  /** The match's own end (its seat ended for good): the forge goes back to building. */
  ended(): boolean;
  close(): void;
}

/**
 * The map's effect data and sound, read off the same source as the test room reads them (`../worker`'s `effects`,
 * `sound` and `soundLoops`): what the match's firearm, marks and sound draw on. Null each where the source has none.
 */
export async function matchExtras(source: SourceRequest, map: Pick<LoadedMap, 'path' | 'archive'>): Promise<{ effects: EffectData | null; sound: MatchAssets['sound'] }> {
  const worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
  let ids = 0;
  const waiting = new Map<number, (r: ViewerResponse | null) => void>();
  const sounds = new Map<number, SoundData>();
  worker.addEventListener('message', (e: MessageEvent<ViewerResponse>) => {
    const m = e.data;
    if (m.kind === 'progress' || m.kind === 'loading') return;
    if (m.kind === 'sound') { sounds.set(m.id, m.data); return; }   // the data, then its loops answer the request
    const done = waiting.get(m.id);
    if (done) { waiting.delete(m.id); done(m.kind === 'error' ? null : m); }
  });
  const ask = (make: (id: number) => ViewerRequest): Promise<ViewerResponse | null> => new Promise((res) => {
    const id = ++ids;
    waiting.set(id, res);
    worker.postMessage(make(id));
  });
  try {
    const [e, s] = await Promise.all([
      ask((id) => ({ kind: 'effects', id, source, path: map.path, archive: map.archive })),
      ask((id) => ({ kind: 'sound', id, source, path: map.path, archive: map.archive })),
    ]);
    const data = s?.kind === 'soundLoops' ? [...sounds.values()][0] ?? null : null;
    return { effects: e?.kind === 'effects' ? e.data : null, sound: data && s?.kind === 'soundLoops' ? { data, loops: s.loops } : null };
  } finally {
    worker.terminate();
  }
}

/**
 * F7 (a) of OVERLAY-CONSOLE (MISSION OT.R60 (e), the owner: "ensure we add a sound effect for the transition. pick one
 * from the base game that seems appropriate"; a browser adaptation, OT.R28: nothing of the match changes): the menus'
 * cues for the overlay's open and close over a forge match. The front end's match is heard beside the menus' own audio,
 * whose HUDUI stays loaded; the forge loads no menu bank, so the match builds the cues itself, as the front end does
 * (`../uiSoundHost` `pageUiSounds`'s steps): the disc's `RUN/SOUNDRDR.ZAR`, `HUDUI.bnk` and `RUN/UI/READERC.ZAR` read from
 * the page's `source` (`readUiSoundFiles`), HUDUI into a `GameAudio` (`frontEndSoundData`), the cues over it
 * (`makeUiSoundHost`) -- held for the overlay (`./matchState` `setForgeMatchSounds`) once read, while the match runs.
 *
 * Kept apart as `../frontEnd` keeps HUDUI apart from the match's banks (`frontEndMatchSound`): a `GameAudio` of the cues'
 * own over an output on the match's context (`new WebAudioOut(out)`: one context, the match's, running already, with no
 * gesture asked; a master of its own). Not a second `GameAudio` on the match's very `WebAudioOut`: a `GameAudio` drives
 * its output's shared state -- `setData` stops its transient voices (`stopTransient`), its reverb load sets the
 * output's response (null for HUDUI's), its constructor its gain -- so the cues' data would have cut the match's
 * one-shots and cleared its reverb. Nor `pageUiSounds` itself: its `unlockOn` would make this output the page's own
 * (`../audio` `pageAudioOutput`, the voice's), which outlives no match. The forge's match is never `unlockOn`'d either.
 *
 * No source, or one without the files: no cues and no error (the overlay's open and close silent, as today).
 * `release` (with the match's audio: its close and every throw before the mount) lets the cues and their output go,
 * and a read that lands after it holds nothing. FUI-23: `audio` is the cues' `GameAudio` once HUDUI is in it (null
 * before, without it, and after the release), which a rules pack's `cue.play` may name too (`forgeRulesCueAudio`).
 */
export function forgeMatchCues(source: AssetSource | null, out: WebAudioOut): { release(): void; audio(): GameAudio | null } {
  const none = { release: () => {}, audio: () => null };
  if (!source) return none;
  // Never a throw into the match's start (its FG-48 F2 rule closes the handed client on one): no audio, no cues.
  let output: WebAudioOut;
  try { output = new WebAudioOut(out); } catch { return none; }
  let audio: GameAudio;
  try { audio = new GameAudio(output, undefined, { inline: false }); } catch { output.dispose(); return none; }
  let gone = false;
  let held: UiSoundCues | null = null;
  let hudui = false;
  void readUiSoundFiles(source).then(({ files, huduiBytes }) => {
    if (gone || !files) return;
    if (huduiBytes) { audio.setData(frontEndSoundData(huduiBytes)); hudui = true; }
    held = makeUiSoundHost(files, audio).cues;
    setForgeMatchSounds(held);
  }).catch((e: unknown) => { console.warn('forge: the menus\' cues:', e instanceof Error ? e.message : String(e)); });
  return {
    audio: () => (hudui && !gone ? audio : null),
    release: () => {
      if (gone) return;
      gone = true;
      if (held && forgeMatchSounds() === held) setForgeMatchSounds(null);   // a later match's own are left
      held = null;
      audio.setData(null);
      output.dispose();
    },
  };
}

/**
 * LATER 456 (a forge adaptation, no original -- the original has no content props; H336, behind `./page`'s
 * FORGE_PLAY_CONTENT_PROPS_ADAPTATION): the group Play's match draws the layout's content props in (`startForgeMatch`'s
 * `extraWorld`) -- one object per composed placement (`./matchMap` `composeMatchMap`'s `content`, the pieces whose hull is
 * in the match's ground), each made by `piece` (the page's own content-prop draw) and set at its placement's matrix, as the
 * editor sets its pieces. A piece that answers none or throws is left out and counted in `failed`, never a throw. The
 * group's `userData.dispose` frees every piece's own (`startForgeMatch`'s close calls it).
 */
export async function contentPropsGroup(content: readonly ContentPlacement[], piece: (p: ContentPlacement) => Promise<Object3D | null>):
  Promise<{ group: Group; failed: number }> {
  const group = new Group();
  group.name = 'forge play content props';
  const made = await Promise.all(content.map((p) => Promise.resolve().then(() => piece(p)).catch(() => null)));
  let failed = 0;
  made.forEach((r, i) => {
    if (!r) { failed++; return; }
    r.matrix.fromArray(content[i]!.m);
    r.matrix.decompose(r.position, r.quaternion, r.scale);
    group.add(r);
  });
  group.userData['dispose'] = () => { for (const r of group.children) (r.userData['dispose'] as (() => void) | undefined)?.(); };
  return { group, failed };
}

/**
 * FUI-23 (FUI.R24; `./rulesCues` FORGE_RULES_CUES_ADAPTATION, a browser adaptation with no original): what a rules pack's
 * `cue.play` plays on -- the match's own `GameAudio` (the map's banks) and, for a name the map lacks, the menus' HUDUI
 * beside it (`forgeMatchCues`' `audio`, on the match's context); never a fetch or a pack file. Each played without a
 * place at volume 1 (`GameAudio.play`: the bank's own volume group, so the Options volume and mute apply). The lock is
 * the match's output's (`WebAudioOut.unlocked`: its context running; the menus' share it); `unlock` is a page gesture's
 * resume (`WebAudioOut.unlock`), or a pad's (`resumeIfAllowed`: asked only once the page has had an activation, as the
 * match's output is never `unlockOn`'d -- that would make it the page's one output). `loaded`: the map's sound is in the
 * match's audio (`setData`, from the mount's assets), or the map has none (`mapSound` false: every name then missing).
 */
export function forgeRulesCueAudio(match: GameAudio, out: Pick<WebAudioOut, 'unlocked' | 'unlock' | 'resumeIfAllowed'>,
  menus: () => GameAudio | null, mapSound: boolean): RulesCueAudio {
  const holder = (name: string): GameAudio | null => {
    if (match.has(name)) return match;
    const m = menus();
    return m?.has(name) ? m : null;
  };
  return {
    loaded: () => !mapSound || match.stats().map !== null,
    has: (name) => holder(name) !== null,
    play: (name) => holder(name)?.play(name, null, 'play', 1) ?? false,
    unlocked: () => out.unlocked,
    unlock: (fromPad) => { if (fromPad) out.resumeIfAllowed(); else out.unlock(); },
  };
}

/** The page's source as the cues read it (`forgeMatchCues`), or none. */
const cueSourceOf = (source: SourceRequest | null | undefined): AssetSource | null => {
  if (!source) return null;
  try { return assetSourceFor(source); } catch { return null; }
};

/** The match on `map`, mounted into `target` (the forge's page held under it); rejects when the room will not welcome. */
export async function startForgeMatch(target: HTMLElement, o: {
  /** Browser adaptation: normal input port for this private loopback match only; never forwarded by the lobby mount. */
  normalInput?: ForgePlayPort;
  map: LoadedMap;
  clips: PlayClips | null;
  effects: EffectData | null;
  sound: MatchAssets['sound'];
  /** The player's name in the room. */
  name: string;
  /**
   * FG-21: the layout's NPCs, each a seat of the room on its side (`./npcs`, FORGE_HOSTILE_DRIVER_ADAPTATION), the
   * player on the side opposite most of them; `o.map`'s slots carry their markers (`./matchMap` `seatSlots`).
   */
  npcs?: readonly NpcMarker[];
  /**
   * NPB-6 (NPB.R6, a browser adaptation, no original): how the NPCs play -- the layout's `npcBehaviour` (`./layout`).
   * `patrol` (unset, NPB.R10): the lobby bots' brain (`./npcBrain`) where the map has its prebuilt navigation graph,
   * else sentries; `sentry`: FG-21's stationary driver.
   */
  npcBehaviour?: NpcBehaviour;
  /** FG-21: the player's side (`./npcs` `playerSideOf` of the whole layout's, as `o.map`'s slots were composed for). */
  side?: 'seal' | 'terrorist';
  /**
   * FG-24 (FG.R18; an adaptation, no original): the layout's room options (`./settings` `roomOptionsOf`) -- the room's
   * own `maxRounds`, `roundSeconds`, `allowFriendlyFire` and `maxPlayers`, passed through to the page's room unchanged.
   * `onRoundStart` is the page's (FG-50 puts the layout's slot back after round 1 has spawned).
   */
  room?: Pick<LoopbackOptions, 'maxRounds' | 'roundSeconds' | 'allowFriendlyFire' | 'maxPlayers' | 'onRoundStart'>;
  /** FG-24: the match's brighten for the layout's light (`./settings` `matchBrightenOf`); unset, the match's own. */
  brighten?: number;
  /** Saved Forge lighting adaptation, with the editor base world calibration. */
  forgeLighting?: ForgeLightingOptions | null;
  /** FG-51: the layout's mode name when it names a game type (`matchMount` `gameMode`); unset, the map's rank. */
  gameMode?: string;
  /** F7 (a): the page's source (`./archives` `sourceRequest`), the overlay's cues read from it (`forgeMatchCues`); unset, none. */
  source?: SourceRequest | null;
  /**
   * LATER 456 (H336; behind `./page`'s FORGE_PLAY_CONTENT_PROPS_ADAPTATION, on by the owner's answer): the layout's content props
   * (`contentPropsGroup`), passed to the mount (`../matchMount` `extraWorld`) and disposed at the close; unset, none.
   */
  extraWorld?: Object3D;
  /**
   * FCW-31 (RULES_ADAPTATION, no original): the layout's rules pack when the layout names a rules mode -- its `RulesSpec`,
   * the rules' seed, its configuration's parameters (the `RecordMode`'s `params`) and the layout's rules entities -- run
   * by the page's room's rule host (`match/src/creator/rules`). FCW-32 round 2 (`./matchRules`, FORGE_PLAY_RULES_ADAPTATION):
   * the Play start passes it (`forgePlayRules`), and the host is built with `o.map`'s doors and switches as the room names
   * them (`ruleMapNames`), so a pack naming one the map lacks is refused at enable, before the room is made. Unset, the
   * room has no host and plays as before. A pack the host refuses rejects the match, naming each refusal's code and field.
   */
  rules?: { spec: unknown; seed: number; params?: Readonly<Record<string, unknown>>; layout?: RuleLayout; names?: { doors: readonly string[]; switches: readonly string[] } };
  /**
   * FCW-32 round 2 (FORGE_RULES_PRESENT_ADAPTATION): each wire the room tells the page for its rules (`rulesPresent`,
   * `rulesPurchase`: `match/src/creator/rules/seam.ts` `RulesWire`), handed on as it came; the page shows it as text.
   */
  onRules?: (ev: unknown) => void;
  /**
   * FUI-23 (FUI.R24): the rules' cues' audio (`forgeRulesCueAudio`), handed once the match's audio is made, before the
   * mount, and null at the close or a throw before the mount; unset, nothing is handed.
   */
  onRulesAudio?: (audio: RulesCueAudio | null) => void;
  /** FUI-23 (review F4): the cue list's counts, for the development readout only (`__forgeMatch.cueStats`). */
  rulesCueStats?: () => unknown;
  /** RB-10 (`../playerSettings` `PageMatchDeps`; a browser adaptation): the player's settings for the match; unset, the page card's (`pageMatchDeps()`). Stopped at the close. */
  player?: PageMatchDeps;
}): Promise<ForgeMatch> {
  const markers = o.npcs ?? [];
  const ruleHost: RuleHost | null = o.rules ? forgeRuleHost({ layout: {}, params: {}, ...o.rules }, o.rules.names ?? ruleMapNames(o.map)) : null;
  const simMap = simMapOfLoaded(o.map);
  // NPB-5: the brain steps with the room (`RoomOptions.beforeStep`, the lobby's own hook), once it is ready.
  let brain: NpcBrain | null = null;
  const loop = new LoopbackMatch(simMap, simClipsOfPlay(o.clips), {
    // NPB-8: the map's own kit tables, as the test room and the lobby's rooms hold them: every seat carries its type's kit
    // and the brain issues its NPCs the lobby bots' role kits. A map without them (a mission, the blank floor) keeps the baked pair.
    kits: o.map.arsenal ?? null,
    ...(o.room ?? {}), ...soloSideOption(markers, o.side), beforeStep: () => brain?.step(),
    ...(ruleHost ? { ruleHost } : {}),
  });
  let npcs: ForgeNpcs | null = null;
  const stem = o.map.archive;
  const client = new NetClient({ url: 'loopback:', map: stem, name: o.name, socket: loop.socket }, IDLE_WALK);
  const events: ServerEvent[] = [];
  // FCW-32 round 2: the rules' wires, outside `ServerEvent` (the room's additive types), handed to the page as they come.
  const offRules = o.onRules ? client.on((ev) => { const t = (ev as { type?: unknown }).type; if (t === 'rulesPresent' || t === 'rulesPurchase') o.onRules!(ev); }) : () => {};
  let welcome: Extract<ServerEvent, { type: 'welcome' }> | null = null;
  try {
    welcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error('the forge\'s room did not welcome the player')); }, WELCOME_MS);
      const off = client.on((ev) => {
        events.push(ev);
        if (ev.type === 'welcome') { clearTimeout(timer); off(); resolve(ev); }
      });
    });
  } catch (e) {
    offRules();
    o.player?.stop();   // RB-10: a handed set of settings is the match's to stop
    client.close();
    loop.stop();
    throw e;
  }
  // The NPCs join after the player's welcome: the player holds client index 0, NPC i index i + 1 (`seatSlots`).
  if (markers.length) {
    npcs = new ForgeNpcs(loop, markers, simMap);
    // NPB-5: `patrol` NPCs play as the lobby bots do, on the map's prebuilt graph; without one (or with `sentry`) they stay
    // sentries. The graph is asked for only when it can be used, and a failure of either is the sentry's fallback.
    const behaviour = o.npcBehaviour ?? DEFAULT_SETTINGS.npcBehaviour;
    brain = await brainFor(behaviour, loop.room, npcs.npcs, behaviour === 'patrol' ? await fetchNpcNavigation(import.meta.env.BASE_URL, stem) : null);
    npcs.start();
  }
  // A development build's readout for checking a layout's match from the console (no original; never in a release):
  // each seat's side, feet, facing and health, and the room's round.
  if (import.meta.env.DEV) {
    const ids = [client.id, ...(npcs?.npcs.map((n) => n.id) ?? [])];
    (globalThis as { __forgeMatch?: unknown }).__forgeMatch = {
      seats: () => ids.map((id) => {
        const p = loop.room.player(id);
        const s = p?.sim.walker.state;
        return p && s ? { id, team: p.team, alive: p.alive, feet: [Math.round(s.x), Math.round(s.y), Math.round(s.z)], yaw: Math.round(s.yaw), kills: p.kills, deaths: p.deaths } : { id, seated: false };
      }),
      round: () => loop.room.stats(),
      cueStats: () => o.rulesCueStats?.() ?? null,                // FUI-23 (review F4): the rules' cue list's counts
      loop, map: simMap,
      // Development readout of the same options passed below; normal Settings e2e can inspect saved propagation.
      lighting: o.forgeLighting ?? null,
      npcs: () => npcs?.npcs.map((n) => ({ id: n.id, state: n.client.state, role: n.client.role, team: n.client.team, sent: n.client.lastSeq() })) ?? [],
    };
  }
  const out = new WebAudioOut();
  const game = new GameAudio(out, undefined, { inline: false });
  const cueSource = cueSourceOf(o.source);
  const cues = forgeMatchCues(cueSource, out);   // F7 (a): released with the match's audio, the cues' first
  const audio = { game, release: () => { cues.release(); game.setData(null); out.dispose(); } };
  // RB-10: the player's settings -- the card's volumes, SOUND MODE and BRIGHTNESS on this match, its deps on the mount below.
  const player = o.player ?? pageMatchDeps();
  player.applyAudio(out, game);
  player.applyBrightness();
  // FUI-23: the rules' cues on the match's own audio (the menus' HUDUI beside it); let go before the audio is.
  let rulesAudio = o.onRulesAudio !== undefined;
  const letRulesAudioGo = (): void => { if (rulesAudio) { rulesAudio = false; o.onRulesAudio!(null); } };
  if (o.onRulesAudio) o.onRulesAudio(forgeRulesCueAudio(game, out, cues.audio, o.sound !== null));
  const handOff = {
    // A campaign mission is no lobby's mission: the match names its stem only for the round's own lookups.
    mediusWorldId: 0, gameName: 'FORGE', mission: stem, lateJoiner: false,
    client, pinned: pinnedMatchSocket('', globalThis.location, import.meta.env.DEV), ticket: '', held: true as const,
    welcome, roundStart: null,
  } satisfies GameLobbyHandOff;
  let mounted: MountedMatch;
  try {
    mounted = mountMatch(target, {
      ...(o.normalInput ? { normalInput: o.normalInput } : {}),
      client, events, handOff, holds: () => {}, audio,
      ...player.mountDeps(o.map.name, cueSource, () => cues.audio() ?? game),   // RB-10 (PS-2): the player's settings
      ...(o.forgeLighting ? { forgeLighting: o.forgeLighting } : {}),
      ...(o.brighten === undefined ? {} : { brighten: o.brighten }),
      ...(o.gameMode === undefined ? {} : { gameMode: o.gameMode }),
      ...(o.extraWorld ? { extraWorld: o.extraWorld } : {}),
      assets: Promise.resolve({ map: o.map, clips: o.clips, effects: o.effects, sound: o.sound }),
    });
  } catch (e) {
    offRules();
    letRulesAudioGo();
    player.stop();
    audio.release();
    brain?.close();
    npcs?.close();
    client.close();
    loop.stop();
    throw e;
  }
  let closed = false;
  return {
    ended: () => mounted.ended() !== null,
    close: () => {
      if (closed) return;
      closed = true;
      offRules();
      letRulesAudioGo();
      mounted.close();
      player.stop();
      brain?.close();
      (o.extraWorld?.userData['dispose'] as (() => void) | undefined)?.();   // LATER 456: off the scene with the mount, freed here
      npcs?.close();
      if (import.meta.env.DEV) delete (globalThis as { __forgeMatch?: unknown }).__forgeMatch;
      loop.stop();
      audio.release();
    },
  };
}

/**
 * FG-26 (FG.R20; a browser adaptation, no original): the map's ARMORY data for the forge lobby's window (FG.R22) -- the
 * screen's layout, scripts, strings, fonts, models and bitmaps off the same source as the test room reads them (`../worker`'s
 * `armory`), and its world from the map the forge holds (`LoadedMap.arsenal`: the arsenal and the `mission.rdr` valves, as
 * `../matchArmory` `world` takes them). A map without an arsenal (a campaign mission, the blank floor's library) has no
 * world: the window's ARMORY then does not open.
 */
export async function lobbyArmoryData(source: SourceRequest, map: Pick<LoadedMap, 'path' | 'archive' | 'arsenal'>): Promise<ArmoryData> {
  const worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
  try {
    const data = await new Promise<ArmoryData>((resolve, reject) => {
      worker.addEventListener('message', (e: MessageEvent<ViewerResponse>) => {
        const m = e.data;
        if (m.kind === 'armory') resolve(m.data);
        else if (m.kind === 'error') reject(new Error(m.message));
      });
      worker.postMessage({ kind: 'armory', id: 1, source, path: map.path, archive: map.archive } satisfies ViewerRequest);
    });
    const a = map.arsenal;
    return { ...data, world: a ? { arsenal: a.table.arsenal, valves: new Map(a.map?.valves ?? []) } : null };
  } finally {
    worker.terminate();
  }
}

/**
 * FG-26 (FG.R20; the owner, 2026-10-14: "A new create lobby button should be added that creates a match with the
 * current map"): the real match over the forge lobby's client -- `../matchMount` `mountMatch`, as Play mounts it on the
 * loopback (`startForgeMatch`), here on the lobby's socket handed on at the launch (`./lobbyClient` `handOff`) with the
 * hand-off the front end's game lobby would give (`./lobbyPage` `matchHandOff`), on the map the page composed from the
 * lobby's layout (the server composed its room from the same, `forgeSimMap.ts`). Nothing of the match is the forge's.
 *
 * The limit, said: a drop in the match reconnects as `../netPage` reconnects a game's seat (its hello names the game, not
 * the forge lobby, and `../net/**` and `../matchMount` are read-only here), so a dropped seat does not rejoin the lobby's
 * room; the match ends at the lobby's close (4007, a final close) and the pad's exit chord, as Play's does.
 */
export function startForgeLobbyMatch(target: HTMLElement, o: {
  map: LoadedMap;
  clips: PlayClips | null;
  effects: EffectData | null;
  sound: MatchAssets['sound'];
  handOff: ForgeLobbyHandOff;
  /** The socket's pinned URL (the one the lobby's client was opened on). */
  pinned: PinnedSocketUrl;
  /** The lobby's name: the game's. */
  gameName: string;
  lateJoiner: boolean;
  /** FG-24: the layout's light (`./settings` `matchBrightenOf`); unset, the match's own. */
  brighten?: number;
  /** Saved Forge lighting adaptation, with the editor base world calibration. */
  forgeLighting?: ForgeLightingOptions | null;
  /** FG-51: the layout's mode name when it names a game type (`matchMount` `gameMode`); unset, the map's rank. */
  gameMode?: string;
  /** F7 (a): the page's source, the overlay's cues read from it (`forgeMatchCues`); unset, none. */
  source?: SourceRequest | null;
  /** RB-10 (`../playerSettings` `PageMatchDeps`; a browser adaptation): the player's settings for the match; unset, the page card's (`pageMatchDeps()`). Stopped at the close. */
  player?: PageMatchDeps;
}): ForgeMatch {
  // Every throw before the mount -- the audio's, the hand-off's own, the mount's -- closes the handed client: the page
  // gave its socket up at the hand-off (`leaveLobby` then has none to close), so one left open would keep the seat and
  // its host on the server, owned by none (the FG-48 re-review's F2).
  let audio: { game: GameAudio; release: () => void } | null = null;
  let player: PageMatchDeps | null = null;
  let mounted: MountedMatch;
  try {
    const out = new WebAudioOut();
    const game = new GameAudio(out, undefined, { inline: false });
    const cueSource = cueSourceOf(o.source);
    const cues = forgeMatchCues(cueSource, out);   // F7 (a): released with the match's audio (F2's every throw too)
    audio = { game, release: () => { cues.release(); game.setData(null); out.dispose(); } };
    player = o.player ?? pageMatchDeps();          // RB-10: the player's settings, as Play's match takes them
    player.applyAudio(out, game);
    player.applyBrightness();
    const handOff = matchHandOff(o.handOff, { gameName: o.gameName, mission: o.map.archive, pinned: o.pinned, lateJoiner: o.lateJoiner });
    mounted = mountMatch(target, {
      client: o.handOff.client, events: o.handOff.events, handOff, holds: () => {}, audio,
      ...player.mountDeps(o.map.name, cueSource, () => cues.audio() ?? game),   // RB-10 (PS-2): the player's settings
      ...(o.forgeLighting ? { forgeLighting: o.forgeLighting } : {}),
      ...(o.brighten === undefined ? {} : { brighten: o.brighten }),
      ...(o.gameMode === undefined ? {} : { gameMode: o.gameMode }),
      assets: Promise.resolve({ map: o.map, clips: o.clips, effects: o.effects, sound: o.sound }),
    });
  } catch (e) {
    player?.stop();
    audio?.release();
    o.handOff.client.close();
    throw e;
  }
  const held = audio;
  const heldPlayer = player;
  // FG-40: the match is loaded here -- the page composed the map and read its clips, effects and sound before the
  // hand-off -- so its load is reported now, on the lobby's client (`loaded`, ONL-18b: the room holds round 1 until every
  // launched page's comes, else for the barrier's ceiling, `LOAD_BARRIER_TIMEOUT_PLACEHOLDER`), as `../lobbyMatch` reports
  // the game lobby's at its loading screen's release. After the mount, so round 1's events (the spawn that carries the
  // ARMORY's type and kit) reach the match's own listener. Without it the seat sat in the hold on the page's pre-spawn
  // default kit (FG-30c).
  o.handOff.client.reportLoaded();
  let closed = false;
  return {
    ended: () => mounted.ended() !== null,
    close: () => {
      if (closed) return;
      closed = true;
      mounted.close();
      heldPlayer.stop();
      held.release();
    },
  };
}
