import { VALVE_TYPE, type OptionGlobals, type ValveStore } from '@s2u/ui';
import { controllerConfigs, storedControllerConfig, type ControllerConfigs } from './controllerConfigs';
import { ExchangeInput } from './exchangeInput';
import type { Input, PadButton } from './gamepad';
import { WHITE, type Hud, type HudQuad, type HudTri } from './hud';
import { FONT_SPECIAL_01, FONT_TEXT_01, layoutText, textWidth } from './hudFont';
import type { PlayOptions } from './originalOptions';
import { externalWhispers } from './roundChat';

/**
 * MATCH-01 (web research 266 §8; roadmap 07 MATCH-01): the in-round START menu, the original's `CZPauseTest` (S:0x3e3ad8)
 * -- `CHUD+0x18900`, built by `FUN_00205800` (D:L62324), filled by `FUN_00202520` (D:L61116-61617) at the HUD's init
 * (`FUN_001fa360` D:L57454), ticked by `FUN_00201690` (D:L60726-61025, called from the HUD's frame D:L56697), opened by
 * `FUN_00204a40` (D:L61922-62142), its rows acted on by `FUN_002041e0` (D:L61644-61918), closed by `FUN_00205200`
 * (D:L62146-62212). Code-drawn: no `.rdr`; the rows' labels are code literals (S:0x3e3b20-0x3e3ca0) or HudCLOC strings by
 * id (`FUN_00361b40`, 60512-60520). Not the viewer's own pause and settings UI (`./ui`).
 *
 * One part for both matches (OT.R43): the front end's (`./matchMount`) and `/testroom`'s (`./main`), each mounting it
 * with a line (the hunks are the seat's: research 266 §8.7). Pure but for its deps: the options' globals and valves
 * (`StartMenuOptions`), the page's own globals (`StartMenuPage`), the HUD's two setters, the sounds, the voice's mask,
 * and the abort (`StartMenuDeps.abort`, `./matchAbort`'s).
 *
 * MATCH-02 (research 266 §8.10): ABORT's confirm -- "Are you sure you want" / "to abort the game?", YES / NO, NO the
 * default -- is the menu's own state (+0xbdc, +0xbe0, +0xbe4: `FUN_002041e0` D:L61689-61698 and D:L61877-61915,
 * `FUN_00201690` D:L60750-60996), drawn by the same builder (`FUN_00202520` D:L61448-61589); its YES leaves the round
 * through `StartMenuDeps.abort` (the `mission_abort` valve's 1) and closes the menu.
 *
 * **No pause online** (`FUN_00204a40` D:L61948-61951 and D:L61978-61995: the sound pause `FUN_00346740`, the sound tick
 * at 0, the game's speed `FUN_001efa50(2)` only when `DAT_0045a0c1`, the multiplayer flag, is 0): the round runs on
 * under the menu. Offline the `pause` seam is told (T7's variant, which no page mounts).
 */

/** The row types `FUN_002041e0` switches on (+0x9c), each row's index its type (`FUN_00202520`: entry i is type i). */
export const START_MENU_TYPE = {
  resume: 0, replay: 1, abort: 2, invertPitch: 3, voiceModulation: 4, runAndTalk: 5, help: 6, aimAssist: 7,
  vibration: 8, fireMode: 9, spectatorHud: 10, textMessages: 11,
} as const;

/** MLS.R1: browser adaptation; the original shortcuts keep their original indices and effects. */
export const START_SETTINGS_TYPE = 12;

/**
 * cq41E0VR: **browser adaptations** (product track; the controller 5d's call, option (a), logged for the owner): FULLSCREEN
 * (the document into and out of fullscreen, `./mobileFullscreen` `documentFullscreen`) and SHOW FPS (a read-only
 * frame-rate readout, `./matchFps`), placed after the original rows. The original has neither; neither changes a game
 * value, and without `StartMenuDeps.adaptations` the menu places only its own rows.
 */
export const START_FULLSCREEN_TYPE = 13;
export const START_SHOW_FPS_TYPE = 14;

/** The two adaptation rows' labels, in the menu's style (its toggles' "NAME: ON / OFF"). */
export const START_MENU_ADAPTATION_TEXT = {
  fullscreenOn: 'FULLSCREEN: ON', fullscreenOff: 'FULLSCREEN: OFF', showFpsOn: 'SHOW FPS: ON', showFpsOff: 'SHOW FPS: OFF',
} as const;

/**
 * The menu's one-line notice when FULLSCREEN's request is refused (cq41E0VR fold, the controller's call logged for the
 * owner: players are on a controller, so the row never fails silently). A **browser adaptation**: a browser grants
 * fullscreen only on a key or a tap (user activation), never on a pad's button; the exit needs none and never shows it.
 */
export const START_MENU_FULLSCREEN_NOTICE_ADAPTATION = 'FULLSCREEN needs a key or a tap: press F11 or tap the screen';

/** The notice's line on the 640x448 frame: centred under the rows' box (grown with it), the prompts' scale and colour. */
export const START_MENU_NOTICE_LAYOUT_ADAPTATION = { x: 320, below: 21, scale: 0.8 } as const;

/**
 * The adaptation rows' parts: each row is placed where its part is handed, FULLSCREEN always (never hidden; a refusal
 * is the notice). `toggle` calls `refused` when the request could not be made or was refused.
 */
export interface StartMenuAdaptations {
  fullscreen?: { active(): boolean; toggle(refused: () => void): void };
  fps?: { shown(): boolean; toggle(): void };
}

export interface StartMenuSettings {
  open(): void;
  isOpen(): boolean;
  /** Browser adaptation: a cold read keeps START visible while the editor owns input. */
  loading?(): boolean;
  notice?(): string | null;
  retryable?(): boolean;
}

/** The HudCLOC strings the rows name by id (`FUN_00361b40`; `HudCLOC.rdr`, `RUN/READERC.ZAR`). */
export const START_MENU_HUDCLOC = {
  RESUME: 0xec60, ABORT: 0xec61, REPLAY_MISSION: 0xec62, AIM_ASSIST_ON: 0xec63, AIM_ASSIST_OFF: 0xec64,
  HELP_ON: 0xec65, HELP_OFF: 0xec66, INVERT_PITCH_ON: 0xec67, INVERT_PITCH_OFF: 0xec68,
} as const;

/** The literals of the game's ELF the menu draws (S:0x3e3b20-0x3e3d40, S:0x3e3e00; checked on the disc by the test). */
export const START_MENU_TEXT = {
  spectatorHudOn: 'SPECTATOR HUD: ON', spectatorHudOff: 'SPECTATOR HUD: OFF',
  voiceModulationOn: 'VOICE MODULATION: ON', voiceModulationOff: 'VOICE MODULATION: OFF',
  fireModeScoreboardAlternate: 'FIREMODE/SCOREBOARD: ALTERNATE', fireModeScoreboardDefault: 'FIREMODE/SCOREBOARD: DEFAULT',
  fireModeTacmapAlternate: 'FIREMODE/TACMAP: ALTERNATE', fireModeTacmapDefault: 'FIREMODE/TACMAP: DEFAULT',
  runAndTalkOn: 'RUN AND TALK: ON', runAndTalkOff: 'RUN AND TALK: OFF',
  vibrationOn: 'VIBRATION: ON', vibrationOff: 'VIBRATION OFF',
  textMessagesOn: 'IN-GAME TEXT MESSAGES : ON', textMessagesOff: 'IN-GAME TEXT MESSAGES : OFF',
  /** 0xa6, the cross glyph (`FONT_SPECIAL_01`), then " ACCEPT" (S:0x3e3cc0). */
  accept: '¦ ACCEPT',
  /** 0xac, the triangle glyph, then " BACK" (S:0x3e3cd0). */
  back: '¬ BACK',
  /** The label of a code-labelled row of no case (`FUN_00204a40` D:L62113-62114). */
  missing: 'DYNAMIC TEXT: MISSING',
} as const;

/** The menu's two sounds (`FUN_00344f30`, D:L61336-61341): +0xbd0 the select, +0xbd4 / +0xbd8 (up, down) the slide. */
export const START_MENU_SOUNDS = { select: '.TCM_SELECT', slide: '.TCM_SLIDE' } as const;

/** One entry of the table at +0x18 (0xa4 bytes; `FUN_00205970` makes it type 12, flags 0). */
export interface StartMenuRow {
  index: number;
  /** +0x9c: the case `FUN_002041e0` runs. */
  type: number;
  /** +0x98: the HudCLOC id of its label, or null (0xffffffff: a code label). */
  hudcloc: number | null;
  /** +0x9d bit 0: offered offline; bit 1: offered in multiplayer (`FUN_00205a70`). */
  offline: boolean; online: boolean;
  /** +0x9d bit 2: its label set by code (`FUN_00204a40` D:L62017), else the id's string. */
  codeLabel: boolean;
  /** +0x9d bit 3: a press starts the selected row's blink (`DAT_003dc418 = 0`, D:L61869-61870). */
  blink: boolean;
  /** +0x9d bit 4: a press closes the menu (D:L61872-61873). */
  closes: boolean;
}

const row = (index: number, hudcloc: number | null, offline: boolean, online: boolean, codeLabel: boolean, closes = false): StartMenuRow =>
  ({ index, type: index, hudcloc, offline, online, codeLabel, blink: true, closes });

/**
 * The table as `FUN_00202520` fills it (D:L61191-61335): RESUME (60512; offline, online; closes), REPLAY MISSION (60514;
 * offline), ABORT (60513; offline, online), INVERT PITCH (60519, its label by code; offline, online), VOICE MODULATION,
 * RUN AND TALK (online), HELP, AIM ASSIST (offline), VIBRATION, FIREMODE (offline, online), SPECTATOR HUD and IN-GAME
 * TEXT MESSAGES (online). Every row blinks. Note the ids: row 1 (type 1) carries 60514 REPLAY MISSION and row 2 (type 2)
 * 60513 ABORT -- type 1 shows the confirm's "to replay the mission?" lines and type 2 "to abort the game?" (D:L61679-61698,
 * with +0x1c the show and +0x18 the hide: research 266 §8.3).
 */
export const START_MENU_ROWS: readonly StartMenuRow[] = [
  row(0, START_MENU_HUDCLOC.RESUME, true, true, false, true),
  row(1, START_MENU_HUDCLOC.REPLAY_MISSION, true, false, false),
  row(2, START_MENU_HUDCLOC.ABORT, true, true, false),
  row(3, START_MENU_HUDCLOC.INVERT_PITCH_ON, true, true, true),
  row(4, null, false, true, true),
  row(5, null, false, true, true),
  row(6, START_MENU_HUDCLOC.HELP_ON, true, false, true),
  row(7, START_MENU_HUDCLOC.AIM_ASSIST_ON, true, false, true),
  row(8, null, true, true, true),
  row(9, null, true, true, true),
  row(10, null, false, true, true),
  row(11, null, false, true, true),
];

/** The seat `FUN_00205a70` reads. */
export interface StartMenuSeat {
  /** `DAT_0045a0c1`, the multiplayer flag. Both pages' rounds are multiplayer (the port has no campaign). */
  multiplayer: boolean;
  /** `FUN_002c2fa0`: the local player is a spectator (research 179). */
  spectator: boolean;
  /** `FUN_003045b0(0x44fe10)`: the `ComeFromLan` valve (S:0x3f6328) non-zero -- a LAN game. */
  comeFromLan: boolean;
  /** The `NoAutoAim` valve (S:0x3e3e48), offline's AIM ASSIST row; absent, not held. */
  noAutoAim?: number;
}

/**
 * Whether row `index` is offered (`FUN_00205a70` D:L62407-62452): offline, its bit 0 (AIM ASSIST also needs `NoAutoAim`
 * 0 where it is held); in multiplayer, its bit 1 -- SPECTATOR HUD only for a spectator, VOICE MODULATION and RUN AND TALK
 * never for one -- and IN-GAME TEXT MESSAGES not in a LAN game.
 */
export function rowSelectable(index: number, seat: StartMenuSeat): boolean {
  const r = START_MENU_ROWS[index];
  if (!r) return false;
  if (!seat.multiplayer) {
    if (index === START_MENU_TYPE.aimAssist) return r.offline && (seat.noAutoAim === undefined || seat.noAutoAim === 0);
    return r.offline;
  }
  let ok: boolean;
  if (!seat.spectator) ok = index !== START_MENU_TYPE.spectatorHud && r.online;
  else ok = index !== START_MENU_TYPE.voiceModulation && index !== START_MENU_TYPE.runAndTalk && r.online;
  if (index === START_MENU_TYPE.textMessages && seat.comeFromLan) ok = false;
  return ok;
}

/** The rows placed, in order (`FUN_00202520` D:L61343-61363): each offered row on the next line, the others hidden. */
export function startMenuLayout(seat: StartMenuSeat): number[] {
  return START_MENU_ROWS.map((r) => r.index).filter((i) => rowSelectable(i, seat));
}

/** The rows' state as the labels and the effects read it. */
export interface StartMenuValues {
  /** `DAT_003df198` < 0 (`INVERT_PITCH_CONTROLLER` as stored, else 0). */
  invertPitch: boolean;
  /** `DAT_003df1a8` (the page's; r0004's .bss 0 at r4 0x450890 and `VoiceMask` read back by the store: R4B-02). */
  voiceModulation: boolean;
  /** `DAT_0044d4f8` (the page's; .bss 0). */
  runAndTalk: boolean;
  /** `DAT_003df1a0`, AIM ASSIST (`AutoAim` as stored, else 1 in the ELF's data). Offline's. */
  aimAssist: boolean;
  /** `FUN_00592bd0` (`DAT_00650698`; `VIBRATION_CONTROLLER` as stored, D:L125188-125193, else 1 in the ELF's data). */
  vibration: boolean;
  /** `DAT_0044d500` (`FIREMODESWAP_CONTROLLER` as stored, `playOptionsOf`'s rule, else 0). */
  fireModeSwap: boolean;
  /** `DAT_003dc3e0` (the menu's; 1 in the ELF's data, 1 again at the HUD's teardown D:L57799). */
  spectatorHud: boolean;
  /** `DAT_003de620`, EXTERNAL WHISPERS (`EnableExternalWhispers` as stored, else 1: `./roundChat`). */
  textMessages: boolean;
}

/**
 * The options' globals and valves the rows read and write -- `StoreOptions`' globals (`OptionGlobals`) and the
 * registry (`ValveStore`) on the front end (`sessionStartMenuOptions`).
 */
export interface StartMenuOptions {
  /** A global as the last store left it, or as the menu set it; undefined, never stored. */
  value(name: string): number | undefined;
  /** A global written in place (`DAT_003df198`, `DAT_0044d500`, `DAT_003de620`). */
  setGlobal(name: string, value: number): void;
  /**
   * A valve written through its watchers (`FUN_003519f0`): `find` only where it is held (`FUN_00351ef0`), `temp` /
   * `perm` found or made at that type (`FUN_00351ff0(name, 2)` / `(name, 1)`).
   */
  writeValve(name: string, value: number, how: 'find' | 'temp' | 'perm'): void;
}

/** The front end's: the session's `OptionGlobals` and its valve registry (`opener.valves`), each read at the call. */
export function sessionStartMenuOptions(globals: () => Pick<OptionGlobals, 'value' | 'set'>, valves: () => Pick<ValveStore, 'find' | 'set'>): StartMenuOptions {
  return {
    value: (name) => globals().value(name),
    setGlobal: (name, value) => { globals().set(name, value); },
    writeValve: (name, value, how) => {
      const store = valves();
      if (how === 'find') { const v = store.find(name); if (v) store.set(name, value, v.type); return; }
      store.set(name, value, how === 'temp' ? 2 : 1);   // VALVE_TYPE.TEMP, VALVE_TYPE.PERM
    },
  };
}

/**
 * `/testroom`'s options (it runs no front end, so it has no session's globals or valve registry): the menu's writes
 * kept here over `base` -- the page's stored options as globals (`playOptionsGlobals`) -- and no valve kept. Read through
 * `playOptionsOf` it is the page's `matchOptions` source, so INVERT PITCH and FIREMODE reach the camera and the pad as
 * the front end's session carries them. `clear` forgets the menu's writes: the page calls it when it reads the card
 * again (a map change), so the card wins, as the original's next options store copies its valves over the globals.
 * MLS.R7: successful Home writes join these applied writes before native Options exists. The first native handoff
 * transfers only those writes over its fresh card read; the cached base never replaces newer persisted values.
 */
export function localStartMenuOptions(base: (name: string) => number | undefined = () => undefined): StartMenuOptions & {
  clear(): void;
  /** Apply only actual session writes to a newly loaded native state, never the cached base defaults. */
  applyTo(globals: Pick<OptionGlobals, 'store'>, valves: Pick<ValveStore, 'find' | 'set'>): void;
  /** A later successful Home write replaces this field's earlier START write, while other writes stay applied. */
  committed(name: string, value: number, configs?: Pick<ControllerConfigs, 'fireModeSwap' | 'toggleFireModeSwap' | 'select'>): void;
} {
  const written = new Map<string, number>();
  return {
    value: (name) => written.get(name) ?? base(name),
    setGlobal: (name, value) => { written.set(name, value); },
    writeValve: () => {},
    clear: () => { written.clear(); },
    applyTo: (globals, valves) => {
      for (const [name, value] of written) valves.set(name, value, valves.find(name)?.type ?? VALVE_TYPE.TEMP);
      globals.store(valves);
    },
    committed: (name, value, configs = controllerConfigs) => {
      written.set(name, value);
      // Existing controller plumbing, as the START shortcut uses it: keep the selected layout while updating its flag.
      if (name === 'FIREMODESWAP_CONTROLLER' && configs.fireModeSwap !== (value !== 0)) configs.toggleFireModeSwap();
      if (name === 'SelectedControllerConfig') configs.select(storedControllerConfig(value));
    },
  };
}

/** A page's stored options (`PlayOptions`) as the globals `playOptionsOf` reads them from (and VIBRATION's, CTL-2). */
export function playOptionsGlobals(options: () => PlayOptions): (name: string) => number | undefined {
  return (name) => {
    const p = options();
    if (name === 'INVERT_PITCH_CONTROLLER') return p.invertPitch ? 1 : 0;
    if (name === 'BOBBING_1ST_PERSON') return p.headBob ? 1 : 0;
    if (name === 'FIREMODESWAP_CONTROLLER') return p.fireModeSwap ? 1 : 0;
    if (name === 'VIBRATION_CONTROLLER') return p.vibration === false ? 0 : 1;   // CTL-2 (the review's F4): the card's, on /testroom too
    return undefined;
  };
}

/** The globals that live as long as the console's boot, the page's: VOICE MODULATION and RUN AND TALK. */
export interface StartMenuPage { voiceModulation: boolean; runAndTalk: boolean }

/**
 * VOICE MODULATION's flag at the boot, before any options store (R4B-02, OT.R97; research 375 §1): r0004 moved it to
 * the overlay's .bss (r4 0x450890, the toggle's operands at r4 0x204770-0x20481c), so it is 0 at load -- OFF. r0001's
 * `DAT_003df1a8` is 1 in the ELF's .data (research 226 §5): r0001's, superseded by r0004 (OT.R97).
 */
export const VOICE_MODULATION_INITIAL_READING = false;

/**
 * `VoiceMask`'s value where a store finds none: `global_valves.rdr`'s row (`RUN/READERC.ZAR`, value 0, PERSIST; research
 * 375 §1), the value r0004's `UIStoreOptions` reads on a fresh card. The dev-disc case in `startMenu.test.ts` reads it.
 */
export const VOICE_MASK_VALVE_DEFAULT = 0;

/** `VOICE_MODULATION_INITIAL_READING` (r4 0x450890, .bss), `DAT_0044d4f8` 0 (.bss). */
export const createStartMenuPage = (): StartMenuPage => ({ voiceModulation: VOICE_MODULATION_INITIAL_READING, runAndTalk: false });
const PAGE = createStartMenuPage();

/** The page's own globals (one page, the console's boot): what the front end's and `/testroom`'s options stores bind. */
export const START_MENU_PAGE: StartMenuPage = PAGE;

/**
 * r0004's `UIStoreOptions` (r4 `FUN_0027cb40`, r0001's `FUN_0027b960`; research 375 §2): `VoiceMask` found or made
 * (r4 0x27cc68-0x27cc74, `FUN_0036f620(key, 2)`) and the flag set to `VoiceMask != 0` (r4 0x27cdb0-0x27cdc4: `lhu`,
 * `sltu v0,zero,v0`, `sb` to 0x450890). `value` is the store's globals (`OptionGlobals.value`); a store that holds no
 * `VoiceMask` takes `global_valves.rdr`'s 0. r0001's store never read it back (D:L125113 onward).
 */
export function storeVoiceModulation(page: StartMenuPage, value: (name: string) => number | undefined): void {
  page.voiceModulation = (value('VoiceMask') ?? VOICE_MASK_VALVE_DEFAULT) !== 0;
}

/** The values off the options, the page and the menu's own SPECTATOR HUD. */
export function startMenuValues(o: Pick<StartMenuOptions, 'value'>, page: StartMenuPage, spectatorHud: boolean): StartMenuValues {
  return {
    invertPitch: (o.value('INVERT_PITCH_CONTROLLER') ?? 0) !== 0,
    voiceModulation: page.voiceModulation,
    runAndTalk: page.runAndTalk,
    aimAssist: (o.value('AutoAim') ?? 1) !== 0,
    vibration: (o.value('VIBRATION_CONTROLLER') ?? 1) !== 0,
    fireModeSwap: (o.value('FIREMODESWAP_CONTROLLER') ?? 0) === 1,
    spectatorHud,
    textMessages: externalWhispers(o.value('EnableExternalWhispers')),
  };
}

/**
 * A row's label (`FUN_00204a40` D:L62017-62118 at the open, `FUN_002041e0`'s cases at a toggle): a row whose label is not
 * code's is its id's string; INVERT PITCH, HELP and AIM ASSIST by id from their state; the others the ELF's literals --
 * row 9's FIREMODE/TACMAP offline and FIREMODE/SCOREBOARD in multiplayer (D:L62074-62094). `caption` resolves a HudCLOC
 * id (the visitor's disc); an id it does not hold draws nothing.
 */
export function rowLabel(r: StartMenuRow, v: StartMenuValues, multiplayer: boolean, caption: (id: number) => string | null): string {
  const T = START_MENU_TEXT, H = START_MENU_HUDCLOC;
  const id = (n: number): string => caption(n) ?? '';
  if (!r.codeLabel) return r.hudcloc === null ? '' : id(r.hudcloc);
  switch (r.type) {
    case START_MENU_TYPE.invertPitch: return id(v.invertPitch ? H.INVERT_PITCH_ON : H.INVERT_PITCH_OFF);
    case START_MENU_TYPE.voiceModulation: return v.voiceModulation ? T.voiceModulationOn : T.voiceModulationOff;
    case START_MENU_TYPE.runAndTalk: return v.runAndTalk ? T.runAndTalkOn : T.runAndTalkOff;
    case START_MENU_TYPE.help: return id(H.HELP_ON);   // START_MENU_OFFLINE_ROWS_READING: HELP's state is not read
    case START_MENU_TYPE.aimAssist: return id(v.aimAssist ? H.AIM_ASSIST_ON : H.AIM_ASSIST_OFF);
    case START_MENU_TYPE.vibration: return v.vibration ? T.vibrationOn : T.vibrationOff;
    case START_MENU_TYPE.fireMode:
      return multiplayer ? (v.fireModeSwap ? T.fireModeScoreboardAlternate : T.fireModeScoreboardDefault)
        : (v.fireModeSwap ? T.fireModeTacmapAlternate : T.fireModeTacmapDefault);
    case START_MENU_TYPE.spectatorHud: return v.spectatorHud ? T.spectatorHudOn : T.spectatorHudOff;
    case START_MENU_TYPE.textMessages: return v.textMessages ? T.textMessagesOn : T.textMessagesOff;
    default: return T.missing;
  }
}

/** `DAT_003dc420`: the seconds after a round's start (and the menu's build) before START opens it (D:L60628). */
export const START_MENU_LOCKOUT_SECONDS = 2;
/** `DAT_003dc430`: the seconds the cursor's gate stays shut after a move (D:L60809-60814). */
export const START_MENU_REPEAT_SECONDS = 0.2;

/**
 * The drawn geometry on the 640x448 frame (`FUN_00202520` D:L61343-61449; `FUN_00204a40`'s alphas D:L62002-62011), the
 * x's on the screen's centre line (`DAT_004a44c4 >> 1`). The colours on the PS2's scale (untextured: 0-255, the GS's
 * vertex colour as is; a string's: 128 is 1, MODULATE; the alphas 128 is 1), from the BSS the static initialiser at
 * 0x3fdb20-0x3fdbbc writes (`DAT_00409020`.. = (11, 21, 24), `DAT_00409030`.. = (35, 51, 56), `DAT_00409040`.. =
 * (11, 45, 64), `DAT_00409050`.. = (35, 51, 56): its `lui`s, read through `tools/elfImage.ts`; the decompilation drops them).
 */
export const START_MENU_LAYOUT = {
  /** +0x30: the whole screen, black, alpha 100 at its corners 0 and 3 (top), 0 at 1 and 2 (D:L61365-61372, D:L62002-62003). */
  shade: { rgb: [0, 0, 0] as const, top: 100, bottom: 0 },
  /** +0x220 / +0x2a0: the rows' box and its inside (D:L61373-61386); +0x320 / +0x3a0: the title's (D:L61387-61401). */
  boxes: [
    { x0: 164, y0: 119, x1: 476, y1: 361, rgb: [35, 51, 56] as const, alpha: 80 },   // 0x43240000 = 164.0 (D:L61372)
    { x0: 170, y0: 125, x1: 470, y1: 355, rgb: [11, 21, 24] as const, alpha: 100 },
    { x0: 164, y0: 56, x1: 476, y1: 106, rgb: [35, 51, 56] as const, alpha: 80 },    // D:L61387
    { x0: 170, y0: 62, x1: 470, y1: 100, rgb: [11, 21, 24] as const, alpha: 100 },
  ],
  /** +0x420: the mission's name, centred (+0x69) at (320, 92), scale 1.3, (128, 128, 64), alpha 110 (D:L61405-61414). */
  title: { x: 320, y: 92, scale: 1.3, rgb: [128, 128, 64] as const, alpha: 110 },
  /** +0xa90 / +0xb28: the two prompts at (245, 345) and (337, 345), scale 0.8, not centred (D:L61428-61449). */
  prompts: { y: 345, accept: 245, back: 337, scale: 0.8, rgb: [128, 128, 64] as const, alpha: 110 },
  /** The rows: centred at x 320, line n at y 155 + 21n, scale 1.1, (100, 100, 100), alpha 128 (D:L61351-61360). */
  rows: { x: 320, y: 155, pitch: 21, scale: 1.1, rgb: [100, 100, 100] as const, alpha: 128 },
} as const;

/**
 * START_MENU_BAR_Y_READING: the selection bar +0x6b0 -- x 171, 297 x 21 (`FUN_00359310` D:L60789), its top at
 * int(the row's y + the row text's +0x80) - 21 + 2 (D:L60760, D:L61974-61976), +0x80 taken as 0: the text's
 * constructor zeroes it (`FUN_00363e70`) and only `FUN_003631f0`'s localised path writes it (a locale table's offset,
 * not read). It moves toward the selected row at 400 px a second within 31 px and jumps farther (D:L60765-60789); its
 * colour pulses from (35, 51, 56) by (17, 25.5, 28) (`DAT_004090c8` = (52, 76.5, 84) less `DAT_00409050`, D:L60936-60967),
 * at alpha 100 (D:L62006).
 */
export const START_MENU_BAR = {
  x: 171, w: 297, h: 21, offset: -19, near: 31, speed: 400, alpha: 100,
  base: [35, 51, 56] as const, peak: [52, 76.5, 84] as const,
  /** Placed line n's y (its baseline in `./hudFont`'s terms). */
  rowY: (n: number): number => START_MENU_LAYOUT.rows.y + START_MENU_LAYOUT.rows.pitch * n,
} as const;

/**
 * The selected row's pulse (`DAT_004090a0`, D:L60928-60935): 0 to 1 and back at 7 a second; its colour
 * (100 + 28p, 100 + 28p, 100 - 36p) (D:L60956-60961).
 */
export const START_MENU_PULSE_RATE = 7;

/**
 * START_MENU_FADE_RATE_READING (LATER 40; research 266 §8.11.2): after a close the menu is still drawn while
 * `DAT_00409080` is set (the close `FUN_00205200` sets it, D:L62208; the draw `FUN_002015a0` tests it, 0x2015c8), and
 * each closed tick `FUN_002011f0` (called only while the menu is closed, +0xbc0 0: `FUN_00201690` D:L60792-60793) takes
 * `dt` x 300 off four alphas, each floored at 0 (D:L60657-60699): the shade +0x30 (from its own); the rows' inside
 * +0x2a0, the bar +0x6b0 and the title's inside +0x3a0 (from +0x2a0's); the rows' frame +0x220 and the title's
 * +0x320 (from +0x220's); the title +0x420, the two prompts +0xa90 / +0xb28 and the twelve rows (from the title's,
 * +0x474). The flag clears on the tick all four fall below 0. From the open's values (100, 100, 80, 110: D:L62002-62011)
 * that is about 0.37 s. Reading, reviewed (LATER 40): transcribed and re-read at the source, not yet measured on a
 * capture of a close (ONL-32, H267).
 */
export const START_MENU_FADE_RATE_READING = 300;

/** The four faded alphas (`START_MENU_FADE_RATE_READING`) at the open (D:L62002-62011). */
export interface StartMenuAlphas { shade: number; inner: number; frame: number; text: number }
const openAlphas = (): StartMenuAlphas => ({
  shade: START_MENU_LAYOUT.shade.top, inner: START_MENU_LAYOUT.boxes[1]!.alpha, frame: START_MENU_LAYOUT.boxes[0]!.alpha, text: START_MENU_LAYOUT.title.alpha,
});

/**
 * The confirm's literals (S:0x3e3ce0-0x3e3d40; checked on the disc by `matchAbort.test.ts`), set by `FUN_00202370`
 * (D:L61093-61100) and the builder: the abort's three lines +0xcf0 / +0xd88 / +0xe20 (`sure`, `abort`, `blank`), the
 * replay's +0xeb8 / +0xf50 / +0xfe8 (`sure`, `replay`, `blank`; offline's, not mounted), YES +0x1080 and NO +0x1220.
 */
export const START_MENU_CONFIRM_TEXT = {
  sure: 'Are you sure you want', abort: 'to abort the game?', replay: 'to replay the mission?', blank: ' ', yes: 'YES', no: 'NO',
} as const;

/**
 * The confirm's geometry on the 640x448 frame (`FUN_00202520` D:L61448-61589; x on the centre line `DAT_004a44c4 >> 1`):
 * its frame +0xc70 and inside +0xbf0 (`FUN_00364660` takes the corners: D:L261712-261720), the colours `DAT_00409030`..
 * and `DAT_00409020`.. as the menu's boxes (`START_MENU_LAYOUT`); the three lines centred (+0x69) at y 165, 185, 205,
 * scale 1.1, (100, 100, 100), alpha 128 (the text's constructor `FUN_00363e70`: +0x54 128, D:L261476); YES centred at
 * (260, 245) and NO at (380, 245), each with an outer box 4 px round its inner one, both `DAT_00409050`.. = (35, 51, 56)
 * at alpha 128 (the box's constructor `FUN_00364c50`: +0x34(128) at D:L262047, none set after).
 */
export const START_MENU_CONFIRM_LAYOUT = {
  frame: { x0: 182, y0: 125, x1: 458, y1: 275, rgb: [35, 51, 56] as const, alpha: 80 },    // 320 -/+ 138 (D:L61448-61452)
  inside: { x0: 192, y0: 135, x1: 448, y1: 265, rgb: [11, 21, 24] as const, alpha: 100 },  // 320 -/+ 128 (D:L61453-61457)
  lines: [{ x: 320, y: 165 }, { x: 320, y: 185 }, { x: 320, y: 205 }],                     // 0xa5, 0xb9, 0xcd (D:L61462-61534)
  text: { scale: 1.1, rgb: [100, 100, 100] as const, alpha: 128 },
  buttons: [                                                                               // 320 -/+ 60 (D:L61535-61589)
    { x: 260, y: 245, outer: [216, 219, 304, 253] as const, inner: [220, 223, 300, 249] as const },
    { x: 380, y: 245, outer: [336, 219, 424, 253] as const, inner: [340, 223, 420, 249] as const },
  ],
  box: { rgb: [35, 51, 56] as const, alpha: 128 },
} as const;

/**
 * MATCH-02b (research 266 §8.11): the title -- the mission's +0xa0 (`FUN_002a42a0` D:L147716-147720), which
 * `FUN_002aab20` copies from `mission.rdr`'s `description` (S:0x3f13e0; the node `FUN_002acc10` finds, D:L152347,
 * D:L152422), this string its default when the key is absent (S:0x3f0a30, D:L151313-151317). The open sets it each time
 * (D:L62129-62131) over the builder's "MISSION NAME" (S:0x3e3d70, D:L61408).
 */
export const START_MENU_TITLE_MISSING = 'MISSION DESCRIPTION : MISSING' as const;

/**
 * The title drawn for a mission's `description` (null: none). `FUN_00361b60` (D:L260211-260221) turns a locale key into
 * its HudCLOC string, and only a key -- the lookup `FUN_003a3100` finds nothing for a string not led by `_`
 * (D:L296949) -- so the description shows as it stands. No disc map's description is a `_` key (the dev-disc case over
 * the 22), so the key's branch is not built.
 */
export function startMenuTitle(description: string | null | undefined): string {
  return description ?? START_MENU_TITLE_MISSING;
}

/**
 * START_MENU_OVER_SCREENS_READING: the original's open (`FUN_002011f0` D:L60651-60655) refuses only while the control
 * state is 3 (this menu) or 5; over the Chat menu it closes it (`FUN_00235300(0x413120, 0)`, D:L61936: the page's
 * `opened`), over WEAPON EXCHANGE and the R2 inventory it hides them (the hide-all, D:L56332-56336) and the close shows
 * them again. What their pads do under the menu is not read, so here START opens nothing while another screen holds the
 * pad (`allowed`): WEAPON EXCHANGE, the R2 inventory, the ARMORY.
 */
export const START_MENU_OVER_SCREENS_READING = 'no open while WEAPON EXCHANGE, the R2 inventory or the ARMORY holds the pad' as const;

/**
 * START_MENU_CONTROL_FLAG_READING: the open and the rows' presses run only while bit 3 of the local controller's +0x171
 * is set (D:L60639, D:L60808, D:L60891); what sets it is not read. Here it is the page's `allowed` (in a round,
 * no other screen up), for the living, the dead and a spectator alike (the menu's own rows have a spectator's case,
 * `FUN_00205a70`, so a spectator reaches it).
 */
export const START_MENU_CONTROL_FLAG_READING = 'the page\'s allowed: in a round, no other screen holding the pad' as const;

/**
 * START_MENU_OFFLINE_ROWS_READING: offline's rows (T7: REPLAY MISSION, HELP, AIM ASSIST) are transcribed and their labels
 * drawn, their presses not built -- REPLAY MISSION's opens no confirm here (its type 1, +0xbe0 1, the replay lines;
 * MATCH-02 built the confirm for ABORT's type 2, and its YES on choice 1 would write `mission_abort` 2), HELP's
 * `FUN_001fde30` / `FUN_001fdeb0` read a valve at `DAT_00408e30` not traced (its label shown ON), AIM ASSIST's
 * `DAT_003df1a0` and `AutoAim` valve are written (D:L61770-61791). No page mounts the menu offline.
 */
export const START_MENU_OFFLINE_ROWS_READING = 'offline rows transcribed; REPLAY and HELP presses not built' as const;

/**
 * The rows parked (OT.R8): their press does nothing -- no sound, no toggle, no blink -- as OPTIONS' parked rows do
 * (`@s2u/ui` `OPTIONS_PARKED_ROWS`). None since CTL-2 built VIBRATION (`FUN_00592be0`, D:L61794-61822; OT.R72, LATER 319).
 */
export const START_MENU_PARKED_TYPES: ReadonlySet<number> = new Set<number>();

/** What the menu reads and tells. */
export interface StartMenuDeps {
  options: StartMenuOptions;
  /** The page's globals; absent, the module's (one page, the console's boot). */
  page?: StartMenuPage;
  seat(): StartMenuSeat;
  /** A HudCLOC string by id (the map's `TauntData.captions`); null while it is not loaded. */
  caption(id: number): string | null;
  /**
   * The mission's `description` as the page's map holds it (`LoadedMap.name`: `mission.rdr`'s, `./loadMap`), null before
   * a map; drawn through `startMenuTitle` (MATCH-02b, research 266 §8.11).
   */
  title(): string | null;
  /** A sound by name (the match's audio, `play(name, null)`). */
  sound(name: string): void;
  /** The open's gate besides the control state (`START_MENU_CONTROL_FLAG_READING`, `START_MENU_OVER_SCREENS_READING`). */
  allowed(): boolean;
  /** VOICE MODULATION's mask on the talker's encoder (`FUN_0030e5a0(voice, off)`: `Headset.setVoiceMask`). */
  voiceMask?(on: boolean): void;
  /**
   * ABORT confirmed (the confirm's YES): the `mission_abort` valve's 1 and the controller's reset (`FUN_002041e0`
   * D:L61890-61897) -- `./matchAbort` `MatchAbort.abort`, whose 3 s end the round (research 266 §8.10).
   */
  abort?(): void;
  /** Offline only: the round paused at the open, resumed at the close; never called in multiplayer. */
  pause?(paused: boolean): void;
  /** The open: the Chat menu closed (`FUN_00235300(0x413120, 0)`, D:L61936). */
  opened?(): void;
  /** The HUD: the hide-all and its show (`setStartMenu`), SPECTATOR HUD (`setSpectatorHud`). */
  hud?: Pick<Hud, 'setStartMenu' | 'setSpectatorHud'>;
  /** MLS.R1: native Options over the live match, with an isolated navigation host. */
  settings?: StartMenuSettings;
  /** cq41E0VR: the FULLSCREEN and SHOW FPS rows (browser adaptations). */
  adaptations?: StartMenuAdaptations;
}

/** The menu's state, for the tests and a spec. */
export interface StartMenuState {
  open: boolean;
  /** +0x1c: the selected row's index. */
  cursor: number;
  /** The bar's top, frame pixels (+0x784). */
  barY: number;
  /** Each row's alpha (128 drawn, 0 hidden by the blink; the text's alpha while the close fades). */
  rowAlpha: number[];
  /** `DAT_00409080`: the close's fade under way (LATER 40), and its four alphas. */
  fading: boolean;
  alphas: StartMenuAlphas;
  /** `DAT_004090a0`, the pulse, 0..1. */
  pulse: number;
  /** The rows placed at the open, in order. */
  placed: number[];
  /** +0xbdc / +0xbe0 / +0xbe4: the confirm up, its choice (1 REPLAY, 2 ABORT; null once BACK cleared it), YES selected. */
  confirm: { choice: 1 | 2 | null; yes: boolean } | null;
  /** `DAT_00409070`: an ABORT (or REPLAY) confirmed; the open refused until the HUD's reset. */
  aborted: boolean;
}

/** The pad's byte per button (`ParseButtonAnim` D:L262766-262784, research 117): 0 up, 1 falling, 2 down, 3 rising. */
type Edge = 0 | 1 | 2 | 3;
const BUTTONS = ['Start', 'Triangle', 'Cross', 'Up', 'Down', 'Left', 'Right'] as const;

/** The menu: one `frame` a tick, before the game's lanes. */
export class StartMenu {
  private open_ = false;
  private cursor = 0;
  private barY: number = START_MENU_BAR.rowY(0) + START_MENU_BAR.offset;
  private placed: number[] = [];
  private rowAlpha = Array<number>(15).fill(START_MENU_LAYOUT.rows.alpha);   // the twelve, SETTINGS and the two cq41E0VR rows
  /** `DAT_00409088`: seconds since the round's start (the lockout). */
  private lockout = 0;
  /** `DAT_00409098` / `DAT_00409090`: the cursor's gate and its time. */
  private gate = false;
  private gateTime = 0;
  /** `DAT_004090a0` and `DAT_003dc438` (1 in the ELF's data). */
  private pulse = 0;
  private pulseDir = 1;
  /** `DAT_003dc418`: the blink's time, -1 when none (the ELF's data). */
  private blink = -1;
  /** `DAT_00409080`: the close's fade under way (LATER 40, `START_MENU_FADE_RATE_READING`). */
  private fading = false;
  /** The four faded alphas (LATER 40): the open's, then each closed tick's while `fading`. */
  private alphas: StartMenuAlphas = openAlphas();
  /** +0xbc1: the HUD's show owed at the next closed tick. */
  private showOwed = false;
  /** `DAT_003dc3e0`, SPECTATOR HUD. */
  private spectatorHud = true;
  /** +0xbdc, +0xbe0, +0xbe4 (`FUN_00205800` D:L62371-62373: none, -1, 0 -- NO). */
  private confirm: { choice: 1 | 2 | null; yes: boolean } | null = null;
  /** `DAT_00409070` (`FUN_00202210` D:L61041: 0). */
  private aborted_ = false;
  /** The bar's colour (+0x6b0), set each open frame outside the confirm (D:L60955-60967). */
  private barRgb: [number, number, number] = [...START_MENU_BAR.base];
  private last = new Set<PadButton>();
  private readonly page: StartMenuPage;
  private readonly consume = new ExchangeInput();
  private settingsHeld = false;
  /** cq41E0VR: the refused FULLSCREEN's notice, until the next press, the open or the close. */
  private notice: string | null = null;

  constructor(private readonly d: StartMenuDeps) { this.page = d.page ?? PAGE; }

  isOpen(): boolean { return this.open_; }

  /** RUN AND TALK as the menu leaves it (`DAT_0044d4f8`): the talk input's and the lanes' (`./matchTaunts`, `./matchLanes`). */
  runAndTalk(): boolean { return this.page.runAndTalk; }

  /** VOICE MODULATION as the menu and the store leave it (`DAT_003df1a8`, r4 0x450890): the round start's mask (D:L55851-55854). */
  voiceModulation(): boolean { return this.page.voiceModulation; }

  state(): StartMenuState {
    return {
      open: this.open_, cursor: this.cursor, barY: this.barY, rowAlpha: [...this.rowAlpha], pulse: this.pulse, placed: [...this.placed],
      fading: this.fading, alphas: { ...this.alphas },
      confirm: this.confirm ? { ...this.confirm } : null, aborted: this.aborted_,
    };
  }

  /** `DAT_00409070`: an ABORT confirmed, the open refused until the HUD's reset (D:L60653, D:L61904). */
  aborted(): boolean { return this.aborted_; }

  /**
   * The confirm's three lines as shown: the abort's for choice 2 (D:L61690-61695), the replay's otherwise (D:L61680-61685);
   * none without a confirm.
   */
  confirmLines(): string[] {
    if (!this.confirm) return [];
    const T = START_MENU_CONFIRM_TEXT;
    return [T.sure, this.confirm.choice === 1 ? T.replay : T.abort, T.blank];
  }

  /** The values the rows show now. */
  values(): StartMenuValues { return startMenuValues(this.d.options, this.page, this.spectatorHud); }

  /** The placed rows' labels, in order. */
  labels(): string[] {
    const v = this.values(), mp = this.d.seat().multiplayer;
    const A = START_MENU_ADAPTATION_TEXT, a = this.d.adaptations;
    return this.placed.map((i) => {
      if (i === START_SETTINGS_TYPE) return 'SETTINGS';
      if (i === START_FULLSCREEN_TYPE) return a?.fullscreen?.active() ? A.fullscreenOn : A.fullscreenOff;
      if (i === START_SHOW_FPS_TYPE) return a?.fps?.shown() ? A.showFpsOn : A.showFpsOff;
      return rowLabel(START_MENU_ROWS[i]!, v, mp, (n) => this.d.caption(n));
    });
  }

  /**
   * A round's start (`FUN_001fb420` -> `FUN_00202370` D:L61068-61104): the cursor on the first offered row, the HUD's
   * show no longer owed (+0xbc1 0: the round's start shows its HUD itself, so the page lifts the menu's hides here), the
   * lockout from 0; the voice's mask set from the menu's global for a player (`FUN_001f6660` D:L55851-55854). Online,
   * r0004's round reset then sets it again with no spectator test (R4B-02, OT.R97; research 375 §3): in r4
   * `FUN_002a94f0` (r0001's `FUN_002a7d40`), the online branch's two calls (r0001 D:L149755-149758, `FUN_001fb790` and
   * `FUN_001fb420`) are followed by `FUN_0030e5a0(voice, flag == 0)` at r4 0x2a98c8-0x2a98e0 (the setter at r4 0x32bb20).
   * The room's round start is that reset here; `multiplayer` is its online test (`DAT_0045a0c1`).
   */
  roundStart(): void {
    if (!this.d.settings?.isOpen()) this.cursor = this.next(-1, 1);
    else this.d.hud?.setStartMenu(true);                        // MLS.R2: the round's HUD reset must leave its active editor's shade/ownership intact
    if (this.showOwed) { this.showOwed = false; this.d.hud?.setStartMenu(false); }
    this.lockout = 0;
    const seat = this.d.seat();
    if (!seat.spectator) this.d.voiceMask?.(this.page.voiceModulation);
    if (seat.multiplayer) this.d.voiceMask?.(this.page.voiceModulation);   // R4B-02: r4 0x2a98c8-0x2a98e0, no spectator test
  }

  /**
   * The page's own level load (R4B-02 review P2, OT.R97; research 375 §3): its console's level start runs the round
   * start's mask site (r0001 `FUN_001f6660` D:L55851-55854, r4 0x1f6850) after the game lobby masked the encoder off (r4
   * 0x27dc30, r0001 D:L125570) -- the flag told for a player, nothing for a spectator. A late joiner seated dead at his
   * load (the room's RC4) and a classic ghost of the next round respawn with no room `roundStart` before them, so this is
   * where their encoder learns the flag. Both pages call it at their load: the front end's match at its mount
   * (`./matchMount`), `/testroom` at each map's (`./main` `load`).
   */
  levelStart(): void {
    if (!this.d.seat().spectator) this.d.voiceMask?.(this.page.voiceModulation);
  }

  /** The HUD's reset (`FUN_001fb790` -> `FUN_00205200` D:L57716, `FUN_00202210` D:L57717): closed, the abort's lock lifted (D:L61041). */
  reset(): void { if (!this.d.settings?.isOpen()) this.close(); this.aborted_ = false; this.fading = false; }   // FUN_00202210 (D:L61039, D:L61041); MLS.R2 keeps the Options editor through a respawn

  /** The HUD torn down (D:L57799): SPECTATOR HUD on again, the menu closed. */
  teardown(): void {
    this.close();
    this.aborted_ = false;                                     // FUN_00202210 (D:L61041)
    this.fading = false;                                       // FUN_00202210 (D:L61039), via the destructor FUN_00205480 (D:L57827 -> D:L62227)
    this.spectatorHud = true;
    this.d.hud?.setSpectatorHud(true);
    this.d.hud?.setStartMenu(false);
    this.showOwed = false;
  }

  /** One tick (`FUN_00201690`): `held`, the pad's buttons down this frame. */
  frame(dt: number, held: ReadonlySet<PadButton>): void {
    const edge = (b: PadButton): Edge => {
      const now = held.has(b), was = this.last.has(b);
      return now ? (was ? 2 : 1) : (was ? 3 : 0);
    };
    const e = Object.fromEntries(BUTTONS.map((b) => [b, edge(b)])) as Record<(typeof BUTTONS)[number], Edge>;
    this.last = new Set(held);
    if (this.d.settings?.isOpen()) { this.settingsHeld = true; return; }   // MLS.R2: Options owns every input
    if (this.settingsHeld) { if (held.size === 0) this.settingsHeld = false; return; }   // its closing button stays there until released
    if (!this.confirm) this.moveBar(dt);                       // the bar holds under the confirm (D:L60756)
    if (!this.open_) this.closedTick(dt, e);
    else this.openTick(dt, e);
    this.blinkTick(dt);
  }

  /**
   * The pad's frame for a page: `frame` on the buttons held, then whether the menu holds the pad, the input the game's
   * lanes get (none while it does; a button it took stays its own until let go, `./exchangeInput`) and the buttons the
   * later parts see (none while it does: the Chat menu takes no CIRCLE under it). The original's own: the open marks
   * START held on the pad (`FUN_002da160(pad, 0, 2)`, D:L61945-61946: byte +1 at 2, so its press reaches nothing else)
   * and the close lets CROSS, SQUARE, CIRCLE and TRIANGLE go (`FUN_002da160(pad, 9 / 8 / 6 / 7, 0)`, D:L62165-62169: the
   * bytes at 0, so the closing press is no game press) -- the page's `./exchangeInput` holding of each button the menu
   * took until it is let go; and the open clears bit 7 of the actor's +0x5e1 (D:L61999-62000), set again at the close
   * (D:L62203-62205), which gates the look's update (D:L418390, `FUN_00550ef0`) -- the pages' camera suspended while
   * `owns` (`fly.setInputSuspended`, `menuOpen`).
   */
  pad(held: ReadonlySet<PadButton>, input: Input, dt: number): { owns: boolean; input: Input; held: ReadonlySet<PadButton> } {
    const was = this.open_;
    this.frame(dt, held);
    const owns = was || this.open_;
    return { owns, input: this.consume.frame(input, owns), held: owns ? new Set<PadButton>() : held };
  }

  /**
   * The menu on the HUD's overlay (layer 1): while it is open, or closed with its fade under way (`FUN_002015a0`: nothing
   * while +0xbc0 and `DAT_00409080` are both 0, 0x2015c8; LATER 40); nothing otherwise.
   */
  draw(frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>): { quads: HudQuad[]; tris: HudTri[] } {
    const drawn = this.drawnState();
    if (this.d.settings?.isOpen() && !this.d.settings.loading?.()) {
      const notice = this.d.settings.notice?.();
      if (notice) {
        const C = START_MENU_CONFIRM_LAYOUT;
        drawn.confirm = { lines: [notice, '', ''], buttons: [
          { text: this.d.settings.retryable?.() ? '¦ RETRY' : '', rgb: C.text.rgb, box: C.box.rgb },
          { text: '¬ BACK', rgb: C.text.rgb, box: C.box.rgb },
        ] };
      } else { drawn.alphas.inner = 0; drawn.alphas.frame = 0; drawn.alphas.text = 0; drawn.rows = []; }
    }
    return { quads: this.open_ || this.fading ? drawStartMenu(frame, sizes, drawn) : [], tris: [] };
  }

  /** Everything let go. */
  dispose(): void { this.teardown(); this.consume.blur(); this.last.clear(); }

  // -------------------------------------------------------------------------------------------------------------------

  private target(): number {
    const n = Math.max(0, this.placed.indexOf(this.cursor));
    return Math.trunc(START_MENU_BAR.rowY(n)) + START_MENU_BAR.offset;
  }

  /** D:L60745-60790: toward the selected row, 400 px/s within 31 px, else a jump; never past it. */
  private moveBar(dt: number): void {
    const to = this.target(), at = this.barY;
    if (to === at) return;
    const dir = to < at ? -1 : 1;
    const step = Math.abs(to - at) <= START_MENU_BAR.near ? dir * dt * START_MENU_BAR.speed : dir * 640;
    const y = at + step;
    this.barY = dir === -1 ? Math.max(to, y) : Math.min(to, y);
  }

  /** The next offered row from `from` by `delta`, wrapping 12 -> 0 and -1 -> 11 (D:L60824-60860). */
  private next(from: number, delta: 1 | -1): number {
    if (this.d.settings || this.d.adaptations) {
      const placed = this.layout(), at = placed.indexOf(from);
      return placed[(at + delta + placed.length) % placed.length] ?? from;
    }
    const seat = this.d.seat();
    let i = from;
    for (let k = 0; k < 12; k++) {
      i += delta;
      if (i === 12) i = 0;
      if (i === -1) i = 11;
      if (rowSelectable(i, seat)) return i;
    }
    return from;
  }

  private layout(): number[] {
    const placed = startMenuLayout(this.d.seat());
    if (this.d.settings) placed.splice(1, 0, START_SETTINGS_TYPE);
    const a = this.d.adaptations;                              // cq41E0VR: after the original rows
    if (a?.fullscreen) placed.push(START_FULLSCREEN_TYPE);
    if (a?.fps) placed.push(START_SHOW_FPS_TYPE);
    return placed;
  }

  /** `FUN_002011f0` (D:L60615-60708): the lockout, then START's press opens it; the HUD's show owed after a close. */
  private closedTick(dt: number, e: Record<(typeof BUTTONS)[number], Edge>): void {
    if (this.lockout < START_MENU_LOCKOUT_SECONDS) { this.lockout += dt; return; }
    if (e.Start === 1 && this.d.allowed() && !this.aborted_) this.openMenu();   // DAT_00409070 0 (D:L60653)
    else if (this.fading) this.fadeTick(dt);                   // LATER 40: the close's fade (D:L60657-60699)
    // LATER 245: the owed show runs after the open branch on the same tick (D:L60702-60704), the open leaving +0xbc1 as
    // it is -- so a menu reopened the tick after a close has the HUD shown under it.
    if (this.showOwed) { this.showOwed = false; this.d.hud?.setStartMenu(false); }
  }

  /**
   * `FUN_00204a40`: the open. START_MENU_OPEN_CALLS_READING: two of its calls have no part here -- `FUN_0023b190(0x414680,
   * 1)` (D:L61937: flags at +0x38 and +0x3c of the object at 0x414680, which the round's own code pairs with the Chat
   * menu's close, D:L56643-56644, D:L78532-78533; what the object is not read) and, each open frame, the sound frame at
   * 0 s (`FUN_00341a60(0, ..)`, D:L60796). The third, `FUN_00592ac0(controller)` (D:L61940: the motors' reset) with the
   * `+0x5e1` bit that stops the scope's pulse (D:L62000), is the firearm's since CTL-2 (`./matchFirearm`, `menuOpen`;
   * `./rumble` `RUMBLE_MENU_STOP_READING`).
   */
  private openMenu(): void {
    this.d.opened?.();                                          // the Chat menu closed (`FUN_00235300(0x413120, 0)`, D:L61936)
    const seat = this.d.seat();
    if (!seat.multiplayer) this.d.pause?.(true);               // offline only (D:L61948-61951, D:L61978-61995)
    this.d.hud?.setStartMenu(true);                            // the hide-all (D:L61964)
    this.placed = this.layout();                              // START_MENU_LAYOUT_TIME_READING (research 266 §8.5); MLS.R1 adds SETTINGS
    this.cursor = 0;                                           // D:L61973
    this.barY = this.target();                                 // D:L61974-61976
    this.rowAlpha.fill(START_MENU_LAYOUT.rows.alpha);          // D:L62119-62126
    this.alphas = openAlphas();                                // D:L62002-62011 (LATER 40: `DAT_00409080` left as it is)
    // LATER 245: +0xbc1 left as it is -- the open (D:L61920-62140) never writes it; `closedTick` runs the owed show after.
    this.open_ = true;
    this.notice = null;                                        // cq41E0VR
    this.barRgb = this.pulseRgb();
    this.d.sound(START_MENU_SOUNDS.select);                    // +0xbd0, as CROSS's (D:L62136-62139)
  }

  /** `FUN_00205200`: the close (silent). */
  private close(): void {
    if (!this.open_) return;
    if (!this.d.seat().multiplayer) this.d.pause?.(false);
    this.open_ = false;
    this.notice = null;                                        // cq41E0VR
    this.showOwed = true;                                      // +0xbc1 (D:L62207)
    this.fading = true;                                        // DAT_00409080 (D:L62208): LATER 40's fade
    this.confirm = null;                                       // +0xbdc 0, +0xbe4 0, +0xbe0 -1 (D:L62209-62211)
  }

  /** `FUN_00201690`'s open branch (D:L60795-60996). */
  private openTick(dt: number, e: Record<(typeof BUTTONS)[number], Edge>): void {
    if (!this.gate) {                                          // D:L60809-60814
      this.gateTime += dt;
      if (this.gateTime > START_MENU_REPEAT_SECONDS) { this.gateTime = 0; this.gate = true; }
    }
    const held = (b: Edge): boolean => b === 1 || b === 2;
    const down = held(e.Down), up = held(e.Up);
    if (!this.confirm) {
      if (this.gate && (down || up)) {                         // D:L60815-60867
        if (down) { this.d.sound(START_MENU_SOUNDS.slide); this.cursor = this.next(this.cursor, 1); this.gate = false; }
        if (up) { this.d.sound(START_MENU_SOUNDS.slide); this.cursor = this.next(this.cursor, -1); this.gate = false; }
        this.rowAlpha.fill(START_MENU_LAYOUT.rows.alpha);      // D:L60862-60866
      }
    } else if (this.gate) {                                    // the confirm's buttons (D:L60869-60886): the gate left open
      if (this.confirm.yes && held(e.Right)) { this.confirm.yes = false; this.d.sound(START_MENU_SOUNDS.slide); }        // byte +3, +0xbd4
      else if (!this.confirm.yes && held(e.Left)) { this.confirm.yes = true; this.d.sound(START_MENU_SOUNDS.slide); }    // byte +4, +0xbd8
    }
    if (this.d.allowed()) this.press(e);                       // D:L60891-60893
    this.pulse += this.pulseDir * dt * START_MENU_PULSE_RATE;  // D:L60928-60935
    if (this.pulse > 1) { this.pulse = 1; this.pulseDir = -this.pulseDir; }
    if (this.pulse < 0) { this.pulse = 0; this.pulseDir = -this.pulseDir; }
    if (this.open_ && !this.confirm) this.barRgb = this.pulseRgb();   // the bar's colour outside the confirm only (D:L60955-60967)
  }

  /** The bar's and the selected button's box colour at the pulse: `DAT_004090b0` + p (`DAT_004090c8` - `DAT_004090b0`) (D:L60936-60967). */
  private pulseRgb(): [number, number, number] {
    const B = START_MENU_BAR, p = this.pulse;
    return [B.base[0] + (B.peak[0] - B.base[0]) * p, B.base[1] + (B.peak[1] - B.base[1]) * p, B.base[2] + (B.peak[2] - B.base[2]) * p];
  }

  /** `FUN_002041e0` (D:L61644-61918): the rows (+0xbdc 0), or the confirm (MATCH-02, D:L61877-61915). */
  private press(e: Record<(typeof BUTTONS)[number], Edge>): void {
    let act = e.Cross === 3;                                   // CROSS let go (D:L61660-61662)
    if (e.Start === 1) this.close();                           // D:L61664-61666 (the confirm with it, D:L62209-62211)
    if (this.confirm) {
      if (e.Triangle === 3) { this.confirm.yes = false; this.confirm.choice = null; act = true; }   // BACK: NO (D:L61878-61882)
      if (!act) return;
      if (!this.confirm.yes) this.confirm = null;              // NO: back to the menu, the round unchanged (D:L61884-61888)
      else {
        if (this.confirm.choice === 2) this.d.abort?.();      // `mission_abort` 1, the controller's reset (D:L61890-61897)
        // choice 1 (REPLAY MISSION, `mission_abort` 2, D:L61899-61902) is offline's: START_MENU_OFFLINE_ROWS_READING
        this.aborted_ = true;                                  // DAT_00409070 (D:L61904)
        this.confirm = null;                                   // D:L61905-61907
        this.close();                                          // D:L61908
      }
      this.d.sound(START_MENU_SOUNDS.select);                  // +0xbd0 either way (D:L61910-61913)
      return;
    }
    if (e.Start !== 2 && e.Triangle === 3) this.close();       // D:L61669-61671
    if (!act) return;
    this.notice = null;                                        // cq41E0VR: any press clears the refused FULLSCREEN's notice
    if (this.cursor === START_SETTINGS_TYPE && this.d.settings) {
      this.d.sound(START_MENU_SOUNDS.select);
      this.d.settings.open();
      return;
    }
    const a = this.d.adaptations;                              // cq41E0VR: the browser adaptations' rows -- toggle and blink, the menu left open
    if ((this.cursor === START_FULLSCREEN_TYPE && a?.fullscreen) || (this.cursor === START_SHOW_FPS_TYPE && a?.fps)) {
      this.d.sound(START_MENU_SOUNDS.select);
      if (this.cursor === START_FULLSCREEN_TYPE) a?.fullscreen?.toggle(() => { if (this.open_) this.notice = START_MENU_FULLSCREEN_NOTICE_ADAPTATION; });
      else a?.fps?.toggle();
      this.blink = 0;
      return;
    }
    const r = START_MENU_ROWS[this.cursor];
    if (!r || START_MENU_PARKED_TYPES.has(r.type)) return;     // OPT-13's parked row: no sound, no change
    this.d.sound(START_MENU_SOUNDS.select);                    // D:L61672-61674
    this.effect(r.type);
    if (r.blink) this.blink = 0;                               // D:L61869-61870
    if (r.closes) this.close();                                // D:L61872-61873
  }

  /** Each case's effect (D:L61679-61867). */
  private effect(type: number): void {
    const o = this.d.options, v = this.values();
    switch (type) {
      case START_MENU_TYPE.abort: this.confirm = { choice: 2, yes: false }; return;   // +0xbdc 1, +0xbe0 2, the abort lines (D:L61689-61697)
      case START_MENU_TYPE.invertPitch: {                       // D:L61699-61721: DAT_003df198 *= -1; the valve, TEMP
        const n = v.invertPitch ? 0 : 1;
        o.setGlobal('INVERT_PITCH_CONTROLLER', n);
        o.writeValve('INVERT_PITCH_CONTROLLER', n, 'temp');
        return;
      }
      case START_MENU_TYPE.voiceModulation: {                   // D:L61722-61746
        const on = !this.page.voiceModulation;
        this.page.voiceModulation = on;
        o.writeValve('VoiceMask', on ? 1 : 0, 'find');
        this.d.voiceMask?.(on);                                // FUN_0030e5a0(voice, DAT_003df1a8 == 0), no spectator test
        return;
      }
      case START_MENU_TYPE.runAndTalk: this.page.runAndTalk = !this.page.runAndTalk; return;   // D:L61748-61757
      case START_MENU_TYPE.vibration: {                         // D:L61794-61822: FUN_00592be0(!DAT_00650698); the valve if found
        const n = v.vibration ? 0 : 1;
        o.setGlobal('VIBRATION_CONTROLLER', n);
        o.writeValve('VIBRATION_CONTROLLER', n, 'find');
        return;
      }
      case START_MENU_TYPE.aimAssist: {                         // D:L61770-61793 (offline)
        const n = v.aimAssist ? 0 : 1;
        o.setGlobal('AutoAim', n);
        o.writeValve('AutoAim', n, 'find');
        return;
      }
      case START_MENU_TYPE.fireMode:                            // D:L61823-61846: DAT_0044d500 and FUN_00592050, no valve
        o.setGlobal('FIREMODESWAP_CONTROLLER', v.fireModeSwap ? 0 : 1);
        controllerConfigs.toggleFireModeSwap();                // FUN_00592050 on the active config's table (OPT-14, research 344 §6)
        return;
      case START_MENU_TYPE.spectatorHud:                        // D:L61847-61857
        this.spectatorHud = !this.spectatorHud;
        this.d.hud?.setSpectatorHud(this.spectatorHud);
        return;
      case START_MENU_TYPE.textMessages: {                      // D:L61858-61867: FUN_002a41f0 -- the valve (PERM) and the global
        const n = v.textMessages ? 0 : 1;
        o.writeValve('EnableExternalWhispers', n, 'perm');
        o.setGlobal('EnableExternalWhispers', n);
        return;
      }
      default: return;                                          // RESUME (its close bit), REPLAY MISSION, HELP: START_MENU_OFFLINE_ROWS_READING
    }
  }

  /**
   * LATER 40: one closed tick of the close's fade (`FUN_002011f0` D:L60657-60699): each of the four alphas less `dt` x
   * `START_MENU_FADE_RATE_READING`, floored at 0; the rows take the text's (D:L60690-60694); the flag clears on the
   * tick all four fell below 0 (D:L60697-60699), so a tick of no time never ends it.
   */
  private fadeTick(dt: number): void {
    const step = dt * START_MENU_FADE_RATE_READING, a = this.alphas;
    let all = true;
    const fade = (v: number): number => { const raw = v - step; if (!(raw < 0)) all = false; return raw < 0 ? 0 : raw; };
    this.alphas = { shade: fade(a.shade), inner: fade(a.inner), frame: fade(a.frame), text: fade(a.text) };
    this.rowAlpha.fill(this.alphas.text);
    if (all) this.fading = false;
  }

  /** D:L61001-61022: the selected row hidden [0, 0.1), shown [0.1, 0.2), hidden [0.2, 0.3), then shown and done. */
  private blinkTick(dt: number): void {
    if (this.blink < 0) return;
    const t = this.blink + dt;
    const alpha = (t >= 0.1 && t < 0.2) || t >= 0.3 ? 128 : 0;
    this.blink = t;
    this.rowAlpha[this.cursor] = alpha;
    if (this.blink >= 0.3) this.blink = -1;
  }

  /** What `drawStartMenu` draws now. */
  drawnState(): StartMenuDrawn {
    const labels = this.labels(), p = this.pulse, c = this.confirm;
    const B = START_MENU_BAR, R = START_MENU_LAYOUT.rows;
    const lit = [100 + 28 * p, 100 + 28 * p, 100 - 36 * p] as const;   // D:L60956-60961, D:L60968-60990
    const base = [...START_MENU_BAR.base] as [number, number, number];
    return {
      alphas: { ...this.alphas },
      title: startMenuTitle(this.d.title()),
      notice: this.notice,
      barY: this.barY,
      bar: [...this.barRgb],
      rows: this.placed.map((i, n) => ({
        text: labels[n]!, y: B.rowY(n), alpha: this.rowAlpha[i]!,
        rgb: i === this.cursor && !c ? lit : R.rgb,                    // under the confirm no row pulses (D:L60955)
      })),
      confirm: c ? {
        lines: this.confirmLines(),
        buttons: [
          { text: START_MENU_CONFIRM_TEXT.yes, rgb: c.yes ? lit : START_MENU_CONFIRM_LAYOUT.text.rgb, box: c.yes ? this.pulseRgb() : base },
          { text: START_MENU_CONFIRM_TEXT.no, rgb: c.yes ? START_MENU_CONFIRM_LAYOUT.text.rgb : lit, box: c.yes ? base : this.pulseRgb() },
        ],
      } : null,
    };
  }
}

/** One open frame's drawn state. */
export interface StartMenuDrawn {
  /** The four faded alphas (LATER 40): the open's while it is open, falling while the close fades. */
  alphas: StartMenuAlphas;
  title: string;
  /** cq41E0VR: the one-line notice under the rows' box (`START_MENU_FULLSCREEN_NOTICE_ADAPTATION`), or null. */
  notice: string | null;
  barY: number;
  bar: readonly [number, number, number];
  rows: { text: string; y: number; alpha: number; rgb: readonly [number, number, number] }[];
  /** The confirm (MATCH-02): its lines, then YES and NO -- each one's text colour and its inner box's. */
  confirm: { lines: string[]; buttons: { text: string; rgb: readonly [number, number, number]; box: readonly [number, number, number] }[] } | null;
}

/**
 * The menu's quads on a frame (layer 1, element `startMenu`): scaled by height / 448 and centred on the frame's centre
 * line, as the HUD's centred widgets are (`./hud` `hudLayout`'s `C`); the shade over the whole frame. What is drawn is
 * the menu's own draw, `FUN_002015a0` (its vtable 0x405320's +0xc, called by the HUD's frame `FUN_001ebed0`
 * D:L50876-50877; raw MIPS, not in the decompilation, read off the ELF: the dev-disc case): the shade +0x30, then --
 * while the confirm is up (+0xbdc) -- the confirm's frame +0xc70 and its tree **alone**, else the rows' box +0x220 and
 * its tree, then the twelve rows (MATCH-02b, research 266 §8.11). So under the confirm no row, title, bar or prompt is
 * drawn, and BACK or NO (+0xbdc 0) draws them again. The order within each tree is the build's (`FUN_001feae0`'s adds,
 * D:L61364-61449, D:L61448-61589): the rows' box and its inside, the title's two, the title, the bar, the prompts; the
 * confirm's frame, its inside, the three lines, YES's and NO's boxes, the two words. A string is `font_text_01` with its drop shadow (`./hudFont`), the pad glyphs
 * from `font_special_01` in their own colour; a box is untextured (`WHITE`).
 */
/**
 * cq41E0VR: the rows the rows' box holds above its prompts (line n at y 155 + 21n under the prompts' 345: nine, the
 * original's eight and SETTINGS). A **browser adaptation**: each row past it (only the adaptation rows go past it) grows
 * the box and its inside down a pitch and moves the two prompts with it; at nine rows or fewer the geometry is the
 * original's.
 */
export const START_MENU_ROWS_ROOM_ADAPTATION = 9;

export function drawStartMenu(frame: { width: number; height: number }, sizes: Record<string, { width: number; height: number }>, m: StartMenuDrawn): HudQuad[] {
  const s = frame.height / 448;
  const X = (x: number): number => frame.width / 2 + (x - 320) * s, Y = (y: number): number => y * s;
  const quads: HudQuad[] = [];
  const quad = (texture: string, x0: number, y0: number, x1: number, y1: number, rgba: [number, number, number, number], uv: [number, number, number, number] = [0, 0, 1, 1]): void => {
    if (rgba[3] <= 0 || !sizes[texture]) return;
    quads.push({ element: 'startMenu', texture, x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, turn: 0, u0: uv[0], v0: uv[1], u1: uv[2], v1: uv[3], rgba, layer: 1 });
  };
  const L = START_MENU_LAYOUT;
  // The shade: a quad turned a quarter clockwise, its left edge (alpha 100) the frame's top, its right (0) the bottom.
  const A = m.alphas;
  if (sizes[WHITE] && A.shade > 0) {
    quads.push({ element: 'startMenu', texture: WHITE, x: frame.width / 2, y: frame.height / 2, w: frame.height, h: frame.width, turn: Math.PI / 2,
      u0: 0, v0: 0, u1: 1, v1: 1, rgba: [0, 0, 0, A.shade / 128], alphaRight: L.shade.bottom / 128, layer: 1 });
  }
  const c = m.confirm;
  // The frames (+0x220, +0x320) at the frame alpha, the insides (+0x2a0, +0x3a0) at the inner one (LATER 40).
  const grow = Math.max(0, m.rows.length - START_MENU_ROWS_ROOM_ADAPTATION) * L.rows.pitch;   // cq41E0VR (0 without its rows)
  if (!c) L.boxes.forEach((b, i) => quad(WHITE, X(b.x0), Y(b.y0), X(b.x1), Y(b.y1 + (i < 2 ? grow : 0)), [b.rgb[0] / 255, b.rgb[1] / 255, b.rgb[2] / 255, (i % 2 === 0 ? A.frame : A.inner) / 128]));
  const text = (line: string, x: number, y: number, scale: number, rgb: readonly number[], alpha: number, centre: boolean): void => {
    if (!sizes[FONT_TEXT_01.texture] || !line.trim() || alpha <= 0) return;
    const opts = { special: true };
    const pen = centre ? x - textWidth(line, scale, opts) / 2 : x;
    const { glyphs } = layoutText(line, pen, y, scale, opts);
    const [dx, dy] = FONT_TEXT_01.dropShadow.pixels;
    const shadow = Math.min(alpha, Math.trunc(FONT_TEXT_01.dropShadow.opacity * 128)) / 128;
    for (const g of glyphs) {
      const uv: [number, number, number, number] = [g.u0, g.v0, g.u1, g.v1];
      if (g.texture) {
        const col = g.rgb ?? FONT_SPECIAL_01.rgb;
        quad(g.texture, X(g.x), Y(g.y), X(g.x + g.w), Y(g.y + g.h), [col[0] / 128, col[1] / 128, col[2] / 128, alpha / 128], uv);
        continue;
      }
      const sx = g.x + dx * scale, sy = g.y + dy * scale;
      quad(FONT_TEXT_01.texture, X(sx), Y(sy), X(sx + g.w), Y(sy + g.h), [0, 0, 0, shadow], uv);
      quad(FONT_TEXT_01.texture, X(g.x), Y(g.y), X(g.x + g.w), Y(g.y + g.h), [rgb[0]! / 128, rgb[1]! / 128, rgb[2]! / 128, alpha / 128], uv);
    }
  };
  if (!c) {
    text(m.title, L.title.x, L.title.y, L.title.scale, L.title.rgb, A.text, true);
    const B = START_MENU_BAR;
    quad(WHITE, X(B.x), Y(m.barY), X(B.x + B.w), Y(m.barY + B.h), [m.bar[0] / 255, m.bar[1] / 255, m.bar[2] / 255, A.inner / 128]);
    const P = L.prompts;
    text(START_MENU_TEXT.accept, P.accept, P.y + grow, P.scale, P.rgb, A.text, false);
    text(START_MENU_TEXT.back, P.back, P.y + grow, P.scale, P.rgb, A.text, false);
    for (const r of m.rows) text(r.text, L.rows.x, r.y, L.rows.scale, r.rgb, r.alpha, true);
    const N = START_MENU_NOTICE_LAYOUT_ADAPTATION;              // cq41E0VR: the refused FULLSCREEN's line
    if (m.notice) text(m.notice, N.x, L.boxes[0].y1 + grow + N.below, N.scale, P.rgb, A.text, true);
    return quads;
  }
  // MATCH-02: the confirm, in the build's order (D:L61448-61589): the frame, the inside, the three lines, YES's outer and
  // inner boxes, NO's, then the two words -- the menu's own widgets not drawn under it (`FUN_002015a0`, above).
  const C = START_MENU_CONFIRM_LAYOUT;
  const box = (r: readonly [number, number, number, number], rgb: readonly number[], alpha: number): void => {
    quad(WHITE, X(r[0]), Y(r[1]), X(r[2]), Y(r[3]), [rgb[0]! / 255, rgb[1]! / 255, rgb[2]! / 255, alpha / 128]);
  };
  box([C.frame.x0, C.frame.y0, C.frame.x1, C.frame.y1], C.frame.rgb, C.frame.alpha);
  box([C.inside.x0, C.inside.y0, C.inside.x1, C.inside.y1], C.inside.rgb, C.inside.alpha);
  c.lines.forEach((line, i) => { const at = C.lines[i]; if (at) text(line, at.x, at.y, C.text.scale, C.text.rgb, C.text.alpha, true); });
  C.buttons.forEach((b, i) => { box(b.outer, C.box.rgb, C.box.alpha); box(b.inner, c.buttons[i]?.box ?? C.box.rgb, C.box.alpha); });
  C.buttons.forEach((b, i) => { const w = c.buttons[i]; if (w) text(w.text, b.x, b.y, C.text.scale, w.rgb, C.text.alpha, true); });
  return quads;
}
