import type { AssetSource } from '@s2u/archive';
import { Libmc, PersonaCard, UI_VAR_MODULE, type CardSlots } from '@s2u/card';
import { initSystemTuners, OptionGlobals, SCREEN_ORIGIN_VALVE_DEFAULT, UiVarManager, ValveStore } from '@s2u/ui';
import { gameAudio, type TunerVars } from './audio';
import { brightnessOfVars, setBrightness } from './brightness';
import { cardTunerVars, pageCardPlayOptions, pageCardTunerVars, storeCardControllerConfig, storeCardVoiceModulation } from './matchOptions';
import type { MatchMountOptions } from './matchMount';
import { MESSAGE_VARS } from './messageSettings';
import { applyCommittedTuner, observeOptionCommits } from './nativeOptionsContext';
import { lookStickOf } from './look';
import type { NativeOptionsState } from './nativeOptionsHost';
import { pageNativeOptionsState } from './nativeOptionsState';
import { NativeSettings, readNativeOptionsAssets } from './nativeSettings';
import { playOptionsOf, restoreValveModule, VALVE_MODULE, type PlayOptions } from './originalOptions';
import { pageCard } from './pageStore';
import { pagePicture, type PictureKeeper } from './picture';
import { localStartMenuOptions, playOptionsGlobals, sessionStartMenuOptions, type StartMenuOptions } from './startMenu';
import { cardTauntTexts, TAUNT_VARS } from './tauntSettings';
import { makeUiSoundHost, readUiSoundFiles, type UiSoundAudio } from './uiSoundHost';

/**
 * RB-3 (PS-1; the replay batch, product track -- the port's own wiring moved, no behaviour of the game changed): the
 * player's settings as a page with no front end reads them -- today `/testroom` (`./main`), which keeps the card's
 * fives itself (pinned where they stand: `startMenu.test.ts`); here the parts of its wiring that had no home of their
 * own, as they were inline in `main.ts` (`5855d575c`, `:627-653`, `:2029`), and since RB-16 its card reads (`:1239-1245`,
 * `:2423`: `pageCardReads`, pinned by `matchOptions.test.ts` and `brightness.test.ts`). The census of what each surface
 * honours is `test/playerSettingsCoverage.test.ts`; the Forge's Play takes these in RB-10.
 */

type LocalMenuOptions = ReturnType<typeof localStartMenuOptions>;

/**
 * MLS.R7: a successful Home write heard before the page's native Options state exists -- a valve into the local START
 * store, a tuner onto the card's manager (or, the page holding none, the card read again: a first tuner save can create
 * a manager the card lacked). Nothing once `live()` holds: the native state hears its own. Answers the stop.
 * PR #765 (Chris's unified controller settings; a browser adaptation's wiring): a staged slider step is committed before
 * its card write (`./modern/settings/store` `stageTuner`), so on a fresh card the card read again holds no manager either:
 * the step lands on a new one, laid first as the boot's `InitSystemTuners` (FUN_0038a7a0) lays the front end's, and handed
 * to `adopt` -- the page's from then on, so the step is heard at once, not after the save.
 */
export function pageEarlyCommits(card: CardSlots, o: {
  live(): boolean;
  local: Pick<LocalMenuOptions, 'committed'>;
  tuners(): TunerVars | null;
  reread(): void;
  adopt(tuners: UiVarManager): void;
}): () => void {
  return observeOptionCommits(card, ({ field, name, value }) => {
    if (o.live()) return;
    if (field === 'valve') { o.local.committed(name, value); return; }
    const managerOf = (): UiVarManager | null => { const t = o.tuners(); return t instanceof UiVarManager ? t : null; };
    let tuners = managerOf();
    if (!tuners) { o.reread(); tuners = managerOf(); }
    if (!tuners) { tuners = new UiVarManager(); initSystemTuners(tuners); o.adopt(tuners); }
    applyCommittedTuner(tuners, name, value);
  });
}

/** MATCH-01: the START menu's options over whichever store `live()` answers at each call (the native state's, else the local one). */
export function liveStartMenuOptions(live: () => StartMenuOptions): StartMenuOptions {
  return {
    value: (name) => live().value(name),
    setGlobal: (name, value) => live().setGlobal(name, value),
    writeValve: (name, value, how) => live().writeValve(name, value, how),
  };
}

/** PR #765: the stick preset as `valves` store it (`StoreOptions`' `stick_preset` global, OT.R72), RECRUIT (0) without one. */
function stickPresetOf(valves: Pick<ValveStore, 'find'> | null | undefined): number {
  if (!valves) return 0;
  const globals = new OptionGlobals();
  globals.store(valves);
  return globals.value('stick_preset') ?? 0;
}

/** RB-48 (`./audio` `SOUND_MODE_ADAPTATION`): SOUND MODE as `valves` store it -- `STEREO_CONTROLLER`, Stereo (1) without one (`./frontEnd`'s `?? 1`). */
export function soundModeOf(valves: Pick<ValveStore, 'find'> | null | undefined): number {
  if (!valves) return 1;
  const globals = new OptionGlobals();
  globals.store(valves);
  return globals.value('STEREO_CONTROLLER') ?? 1;
}

/**
 * MLS.R1/R7: the page's first native Options state -- the local START writes applied over it, handed to the page
 * (`set`), then the early Home observer stopped -- in that order, as `main.ts` did inline. Answers the state.
 * RB-48 (`./audio` `SOUND_MODE_ADAPTATION`, a browser adaptation): its SOUND MODE laid on `sound` -- the page's
 * `gameAudio` (`/testroom`'s audio) unless given -- now and at each StoreOptions of its globals, as the front end's
 * session's (`./frontEnd`, `s.options.observe`).
 */
export function adoptPageOptions(state: NativeOptionsState, local: Pick<LocalMenuOptions, 'applyTo'>, set: (state: NativeOptionsState) => void, stopEarly: () => void,
                                 sound: { setSoundMode?(mode: number): void } = gameAudio): NativeOptionsState {
  local.applyTo(state.globals, state.valves);
  set(state);
  stopEarly();
  // `?.`: a state whose globals answer `store` alone (`playerSettings.test.ts`' order case) lays Stereo and observes nothing
  const laySound = (): void => { sound.setSoundMode?.(state.globals.value?.('STEREO_CONTROLLER') ?? 1); };
  laySound();
  state.globals.observe?.(laySound);
  return state;
}

/**
 * LATER 671, SS-2 (H422 (a)): TEAMMATE NAMES as `/testroom` reads it each frame -- the valve of the store it is handed,
 * else 1 (on). RB-16 (PS-4): `/testroom` hands the live native Options' valves, else the card's own (`cardValves`, kept
 * by `pageCardReads`), so a stored 0 holds there as on the front end's match.
 */
export function teammateNamesValue(valves: Pick<ValveStore, 'find'> | null | undefined): number {
  return valves?.find('DISPLAY_MP_TEAM_NAMES')?.value ?? 1;
}

/**
 * RB-16 (PS-4; a browser adaptation -- the test room's wiring, nothing of the game): SCREEN POSITION as a store of valves
 * lays it -- `ScreenOriginX` / `ScreenOriginY` each less 128 (`SCREEN_ORIGIN_VALVE_DEFAULT`), an absent one 128, as
 * `@s2u/ui` `OptionsCommands`' `SetScreenOrigin` (FUN_0027bf10) computes it -- for `./screenOrigin` `screenOriginKeeper`.
 */
export function screenOriginOf(valves: Pick<ValveStore, 'find'> | null | undefined): { x: number; y: number } {
  const x = valves?.find('ScreenOriginX')?.value ?? SCREEN_ORIGIN_VALVE_DEFAULT;
  const y = valves?.find('ScreenOriginY')?.value ?? SCREEN_ORIGIN_VALVE_DEFAULT;
  return { x: x - SCREEN_ORIGIN_VALVE_DEFAULT, y: y - SCREEN_ORIGIN_VALVE_DEFAULT };
}

/**
 * RB-16 (PS-4): the page's hooks laid on its native Options state before its first open, as the front end's session has
 * them (`./nativeOptionsHost` `NativeOptionsState`, #481's plumbing): SCREEN POSITION's origin at each StoreOptions and
 * VIDEO MODE's picture (`./picture` `pagePicture`). Answers the same state.
 */
export function withPageHooks(state: NativeOptionsState, hooks: Pick<NativeOptionsState, 'screenOrigin' | 'picture'>): NativeOptionsState {
  if (hooks.screenOrigin) state.screenOrigin = hooks.screenOrigin;
  if (hooks.picture) state.picture = hooks.picture;
  return state;
}

/** RB-16: the card's valves -- the persona file's `CValveSaveManager` module (`cardParts`) -- or null with none. */
export function cardValves(card: CardSlots = pageCard): ValveStore | null {
  const parts = cardParts(card);
  const store = new ValveStore();
  return parts && restoreValveModule(store, parts.valves) ? store : null;
}

/** Where `pageCardReads` reads the card: the page card's OPTIONS, four masters and valves unless given. */
export interface PageCardReaders { options(): PlayOptions; tuners(): TunerVars | null; valves(): ValveStore | null }
const PAGE_CARD_READERS: PageCardReaders = { options: pageCardPlayOptions, tuners: pageCardTunerVars, valves: () => cardValves(pageCard) };

/**
 * RB-16 (RB-3's inline `main.ts:1239-1245, 2423` moved, PS-1; then PS-4): the page card as `/testroom` holds it -- its
 * OPTIONS (`./matchOptions` `pageCardPlayOptions`: the controller config and VOICE MODULATION stored with it), its four
 * masters and BRIGHTNESS (`pageCardTunerVars`, OPT-11), and its valves (TEAMMATE NAMES, SCREEN POSITION). Read at the
 * page's start, BRIGHTNESS laid then; read again at each map change -- or, under the native Options manager, its live
 * globals and tuners taken (MLS.R2: applied live Options survives a map change) -- and BRIGHTNESS laid again. A valve's
 * successful card write (the launcher's Settings over the test room) reads the valves again and tells `valvesChanged`.
 */
export interface PageCardReads {
  options(): PlayOptions;
  tuners(): TunerVars | null;
  valves(): ValveStore | null;
  /** The card's masters alone again: a first tuner save can create a manager the card lacked (`pageEarlyCommits`' `reread`). */
  rereadTuners(): void;
  /** PR #765: a manager made for a fresh card's first staged step (`pageEarlyCommits`' `adopt`), the page's from now. */
  adoptTuners(tuners: UiVarManager): void;
  /** A map change: the card read again, or `live`'s globals and tuners taken; BRIGHTNESS laid. */
  reread(live: Pick<NativeOptionsState, 'globals' | 'uiVars'> | null): void;
  stop(): void;
}

export function pageCardReads(read: PageCardReaders = PAGE_CARD_READERS, card: CardSlots = pageCard,
                              o: { valvesChanged?(): void; sound?: { setSoundMode?(mode: number): void } } = {}): PageCardReads {
  // RB-48 (`./audio` `SOUND_MODE_ADAPTATION`, a browser adaptation): the card's SOUND MODE on the page's audio, at the
  // start, at each valve's card write and at each map change -- live native Options' own at a map change (MLS.R2).
  const sound = o.sound ?? gameAudio;
  let options = read.options(), tuners = read.tuners(), valves = read.valves();
  // PR #765 (Chris's unified controller settings): the look stick follows the launcher's writes as they are heard -- the
  // card's `stick_preset` (its valves read again at a valve's write) and CUSTOM's sliders on the page's manager (a tuner's
  // commit, laid by `pageEarlyCommits`) -- as OT.R72's `lookStickOf` reads them; made again at the next read after any
  // commit, so the manager's update, the next observer's, is in it. Under live native Options (a map change's `reread`)
  // its own stick stands.
  let liveRead = false, composed: PlayOptions | null = null;
  const stale = (): void => { composed = null; };
  setBrightness(brightnessOfVars(tuners));   // OPT-11 (research 358): the card's stored BRIGHTNESS; the live Options manager's after
  sound.setSoundMode?.(soundModeOf(valves));
  const off = observeOptionCommits(card, ({ field }) => {
    stale();
    if (field !== 'valve') return;
    valves = read.valves();                  // the valve's save came before its commit
    sound.setSoundMode?.(soundModeOf(valves));
    o.valvesChanged?.();
  });
  return {
    options: () => {
      if (liveRead) return options;
      return composed ??= { ...options, stick: lookStickOf(stickPresetOf(valves), stickVars(tuners)) };
    },
    tuners: () => tuners,
    valves: () => valves,
    rereadTuners: () => { tuners = read.tuners(); stale(); },
    adoptTuners: (made) => { tuners = made; stale(); },
    reread: (live) => {
      liveRead = !!live;
      stale();
      options = live ? playOptionsOf(live.globals, live.uiVars) : read.options();
      tuners = live?.uiVars ?? read.tuners();
      valves = read.valves();
      setBrightness(brightnessOfVars(tuners));   // Shared live state survives map replacement; reuse the landed brightness path.
      sound.setSoundMode?.(live ? live.globals.value('STEREO_CONTROLLER') ?? 1 : soundModeOf(valves));
    },
    stop: off,
  };
}

/** The parts of the match's mount the player's settings answer (`./matchMount` `MatchMountOptions`). */
export type PageMatchMountDeps = Pick<MatchMountOptions, 'options' | 'taunts' | 'messages' | 'externalWhispers' | 'startMenuOptions' | 'gameVars' | 'picture' | 'settings'>;

/**
 * RB-10 (PS-2, PS-3; the replay batch, OT.R114's "unify a players settings ... to apply to forge/test room"; product
 * track, a browser adaptation -- the player's own stored settings on a match the Forge mounts, nothing of the game
 * changed): what a page with no front end hands the front end's match (`./matchMount` `mountMatch`) -- today the Forge's
 * Play and lobby match (`./forge/match`) -- read off the page card as `/testroom` reads it (`./main`'s card reads): the
 * OPTIONS each frame (`options`: the START menu's writes kept over the card's, the look stick off the card's preset and
 * sliders), the five taunts and messages, EXTERNAL WHISPERS, the START menu's store, the card's valves (TEAMMATE NAMES),
 * native Options over the match (`settings`, `./nativeSettings`), the page's VIDEO picture (`./picture` `pagePicture`);
 * and, applied to the match's audio and screens, the four volumes, SOUND MODE and BRIGHTNESS (`applyAudio`,
 * `applyBrightness`).
 *
 * Live: a successful card write heard while the match runs (`./nativeOptionsContext` `optionCommitted`: the launcher's
 * Settings, Home's rows) reaches it -- a valve into the START store (`pageEarlyCommits`, as `/testroom`) and the card's
 * valves read again (a valve's commit follows its save), a tuner onto the card's manager -- and SOUND MODE and
 * BRIGHTNESS are applied again; once native Options is open over the match its state answers, as on `/testroom`. `stop`
 * lets every observer, the frame follow and native Options go (the match's close, and each throw before its mount).
 *
 * GAME DETAILS (`gameVars`): the session's `ComeFromLan` and `GAMENAMEVAR` have no card of their own. The Forge's match
 * drew the LAN fill (`./scoreboard`'s absent details: "LAN game", the map's name), so `gameVars` answers those two the
 * same (`ComeFromLan` 1, `GAMENAMEVAR` the name given) and nothing changes on its scoreboard.
 */
export interface PageMatchDeps {
  /** The mount's deps: `game` the map's name (GAME DETAILS' line 2); `source` native Options' assets, null for none; `audio` its cues' audio. */
  mountDeps(game: string, source: AssetSource | null, audio: () => UiSoundAudio | null): PageMatchMountDeps;
  /** The four volumes (read at each play) and SOUND MODE on the match's audio; SOUND MODE told again at each card write. */
  applyAudio(out: { setSoundMode?(mode: number): void }, game: { setTunerVars?(vars: () => TunerVars | null | undefined): void }): void;
  /** BRIGHTNESS on the game's screens (`./brightness` `setBrightness`): now, at each card write, and each frame while native Options is up. */
  applyBrightness(): void;
  stop(): void;
}

/** The persona file `/testroom` reads (slot 1's, else slot 2's: `PERSONA_LOAD_ADAPTATION`): its two option modules; null with none. */
function cardParts(slots: CardSlots): { valves: unknown; vars: unknown } | null {
  const libmc = new Libmc(slots, { log: () => {} });   // a missing file's FAILED line is no news here
  for (const port of [0, 1] as const) {
    const card = new PersonaCard(libmc, port);
    if (card.load().result >= 0) return { valves: card.part(VALVE_MODULE), vars: card.part(UI_VAR_MODULE) };
  }
  return null;
}

/** `f` each frame until stopped (`requestAnimationFrame`); nothing where the page has no frames. */
function eachFrame(f: () => void): () => void {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf !== 'function') return () => {};
  let id = 0, on = true;
  const tick = (): void => { if (!on) return; f(); id = raf(tick); };
  id = raf(tick);
  return () => { on = false; globalThis.cancelAnimationFrame?.(id); };
}

const stickVars = (vars: TunerVars | null): Parameters<typeof playOptionsOf>[1] => vars as Parameters<typeof playOptionsOf>[1];

/** RB-10: the page card's player settings for a match the page mounts (`PageMatchDeps`); `card` the page's unless given. */
export function pageMatchDeps(card: CardSlots = pageCard, o: { picture?: PictureKeeper; frames?: (f: () => void) => () => void } = {}): PageMatchDeps {
  let valves: ValveStore | null = null, globals: OptionGlobals | null = null, tuners: TunerVars | null = null;
  /** The card's valves, as `/testroom`'s StoreOptions at a card read (`pageCardPlayOptions`): the controller config and VOICE MODULATION stored. */
  const readValves = (parts: { valves: unknown } | null): void => {
    const store = new ValveStore();
    valves = parts && restoreValveModule(store, parts.valves) ? store : null;
    globals = null;
    if (valves) { globals = new OptionGlobals(); globals.store(valves); }
    storeCardControllerConfig(parts?.valves);
    storeCardVoiceModulation(parts?.valves);
  };
  const parts = cardParts(card);
  readValves(parts);
  tuners = parts ? cardTunerVars(parts.vars) : null;
  const taunts = cardTauntTexts(parts?.vars, TAUNT_VARS), messages = cardTauntTexts(parts?.vars, MESSAGE_VARS);
  let cardPlay: PlayOptions = playOptionsOf(globals, stickVars(tuners));

  let pageOptions: NativeOptionsState | null = null;
  const local = localStartMenuOptions(playOptionsGlobals(() => cardPlay));
  const stopEarly = pageEarlyCommits(card, {
    live: () => !!pageOptions, local, tuners: () => tuners,
    reread: () => { const p = cardParts(card); tuners = p ? cardTunerVars(p.vars) : null; },
    adopt: (made) => { tuners = made; },                                 // PR #765: a fresh card's first staged step
  });
  const startMenuOptions = liveStartMenuOptions(() => pageOptions ? sessionStartMenuOptions(() => pageOptions!.globals, () => pageOptions!.valves) : local);
  const valve = (name: string): number | null => (pageOptions ? pageOptions.valves.find(name)?.value : valves?.find(name)?.value) ?? null;
  const liveTuners = (): TunerVars | null => pageOptions?.uiVars ?? tuners;
  const soundMode = (): number => (pageOptions ? pageOptions.globals : globals)?.value('STEREO_CONTROLLER') ?? 1;   // `./frontEnd`'s `soundMode`

  let out: { setSoundMode?(mode: number): void } | null = null;
  let following: (() => void) | null = null;
  let settings: NativeSettings | undefined;
  let stopped = false;
  const brightness = (): void => { setBrightness(brightnessOfVars(liveTuners())); };
  const offLive = observeOptionCommits(card, ({ field }) => {
    if (field === 'valve') readValves(cardParts(card));                  // the valve's save came before its commit
    cardPlay = playOptionsOf(globals, stickVars(tuners));                // a stick slider's tuner, a preset's valve
    out?.setSoundMode?.(soundMode());
    if (following) brightness();
  });

  return {
    mountDeps: (game, source, audio) => {
      if (source && !settings && !stopped) {
        settings = new NativeSettings({                                  // MLS.R1/R7: as `/testroom` hosts it over its match
          ...(typeof document === 'undefined' ? {} : { doc: document }),
          load: async () => {
            const assets = await readNativeOptionsAssets(source);
            const sounds = await readUiSoundFiles(source);
            const a = audio();
            return {
              assets, sounds: sounds.files && a ? makeUiSoundHost(sounds.files, a).cues : null,
              state: () => pageOptions ?? adoptPageOptions(pageNativeOptionsState(assets.disc, card), local, (s) => { pageOptions = s; }, stopEarly,
                                                       { setSoundMode: (mode) => { out?.setSoundMode?.(mode); } }),   // RB-48: the match's own output, not the page's
            };
          },
        });
      }
      return {
        options: () => ({ ...playOptionsOf(startMenuOptions), stick: (pageOptions ? playOptionsOf(pageOptions.globals, pageOptions.uiVars) : cardPlay).stick }),
        taunts: () => taunts, messages: () => messages,
        externalWhispers: () => valve('EnableExternalWhispers') ?? undefined,
        startMenuOptions,
        gameVars: {
          uiVar: (name) => (name === 'GAMENAMEVAR' ? game : null),
          valve: (name) => (name === 'ComeFromLan' ? 1 : valve(name)),
        },
        picture: o.picture ?? pagePicture(),
        ...(settings ? { settings } : {}),
      };
    },
    applyAudio: (output, game) => {
      if (stopped) return;
      out = output;
      game.setTunerVars?.(liveTuners);
      output.setSoundMode?.(soundMode());
    },
    applyBrightness: () => {
      if (stopped) return;
      brightness();
      following ??= (o.frames ?? eachFrame)(() => { if (pageOptions) brightness(); });   // native Options' own edits, each frame
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      offLive();
      stopEarly();
      following?.();
      following = null;
      out = null;
      settings?.dispose();
      pageOptions?.dispose?.();
    },
  };
}
