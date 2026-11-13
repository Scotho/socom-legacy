import type { UiCue } from './sounds';
import { controllerStanceMode } from '../startupSettings';
import type { StanceMode } from '../stanceButton';
import type { PadBinding } from '../padBinding';
import type { IconName } from './icons';
import type { PadLike } from './input';
import type { ExtractAct, ExtractView } from './render/extract';
import type { ExtractBackend } from '../discExtractStore';
import type { DiscShareAdapter, HostView } from '../discShareView';
import { SEND_WORDS, type SendWhy } from '../discShareWords';
import { gamePingBand } from '../gamePing';
import { GRAPHICS_BACKEND_APPLY_NOTE } from '../graphicsBackend';

/**
 * The console launcher's state (the S2U Briefing design system's "Console launcher" prototype, its `S` and the
 * derived `startReady` / `selectedRoom` / `startLabel` / `visibleRooms` / `totals` / `homeItems`), typed. What the
 * prototype held as sample values -- the disc, the pad, the microphone, the memory card, the session, the rooms, the
 * options, the replays, the server -- is read through `Adapters`: `./sampleAdapters` carries the prototype's sample
 * data (labelled `SAMPLE_DATA`), the real adapters (the server's and the emulator's reports) come in slice 2. A browser
 * adaptation with no original (the project's own launcher page, OT.R28): the launched game's flow is not touched.
 */

export type Button = 'up' | 'down' | 'left' | 'right' | 'cross' | 'circle' | 'square' | 'triangle' | 'l1' | 'r1' | 'l2' | 'r2' | 'options';
/** `error`: an image the reader refused (slice 2; the prototype has no such state). */
export type DiscState = 'ready' | 'reading' | 'empty' | 'error';
/**
 * CX-16 (CX.R9): the disc's one active source -- an image (`.iso`) or a folder (a drive, a mounted image or a copy of the
 * disc's files; CX-10a's) -- chosen in the dropdown behind the settings icon beside Home's Disc action.
 */
export type DiscSource = 'image' | 'folder';
/** The dropdown's two options, in order, in the plan's words (CX-16). */
export const DISC_SOURCES: readonly { id: DiscSource; label: string }[] = [
  { id: 'image', label: 'DISC ISO' },        // the owner's words, 2026-10-20 (DISC-LABELS)
  { id: 'folder', label: 'RETAIL DISC' },
];
/**
 * DSH-11 (the disc share plan, DSH.R17, the owner, 2026-11-10: "i once requested it to be in the bottom left disc area (and
 * it still should be)"): the disc mark's menu's trailing "SEND DISC" row, after the two sources -- never one of
 * `DISC_SOURCES`, which the Disc row's source choice reads. Drawn on the launcher page where it has a disc share adapter
 * (`sendInMenu`); `sourceMenuRows` is the menu's pad bound.
 */
export const SEND_MENU_ROW = DISC_SOURCES.length;
/** A ping band as the lobby reports one (0-3), when it gives no milliseconds. */
export type PingBand = 0 | 1 | 2 | 3;

/** A room as the lobby reports it. The prototype's sample rooms fill name, map, mode, n/cap, ping in ms and the sides. */
export interface Room {
  id: string;
  name: string;
  /** The map's name (the disc's, when the lobby gives only `MP<n>`). */
  map: string;
  /** The mode; absent where it needs the disc's mission list. */
  mode?: string;
  n: number;
  /** The seats; null where the lobby reports none (the anonymous `/rooms` counts). */
  cap: number | null;
  /** B138: of `n`, the CPU seats a joining player may take (a game's `replaceable`); `n` stays the count drawn. */
  replaceable?: number;
  /** Round trip in milliseconds, when the lobby gives one (the prototype's `ping`). */
  pingMs?: number;
  /** The lobby's band, when it gives no milliseconds. */
  pingBand?: PingBand;
  /**
   * GAME-PING (a browser adaptation, `../gamePing`): a game's measured round trip to its room's host door, in ms, banded by
   * the original's bounds (under 300 / under 600 / else); null, its door has not answered (drawn `--`, not Poor); absent, the
   * lobby's band stands (a game with no players is never probed).
   */
  pingMeasured?: number | null;
  /** The two sides' counts (the prototype's `seals` / `terr`); absent where the lobby gives only `n/cap`. */
  sides?: { seals: number; terr: number };
  spectators?: { n: number; cap: number | null };
  locked?: boolean;
  private?: boolean;
  clan?: string;
  ranks?: readonly string[];
  /** The map's picture from the player's disc (never one shipped with the page; RoomDrawer README). */
  art?: string;
  /** The drawer's facts, in order (the live lobby's: GAME DETAILS); absent, the prototype's Map, Mode, Ping. */
  facts?: readonly [string, string][];
  /** The drawer's tiles (the live lobby's players and spectators); absent, the prototype's two sides. */
  tiles?: readonly [string, string][];
  /** A password or private room's lock word, said beside its name. */
  lock?: string;
  /**
   * CX-LOBBIES: the live lobby's kind of row -- a briefing room (Cross opens its games and players) or a game no listed
   * room holds (Cross opens its players); absent, a row with nothing to open (the anonymous counts, the sample's).
   */
  kind?: 'room' | 'game';
  /** CX-LOBBIES: a briefing room's games in the list (its Games cell). */
  games?: number;
  /** CX-LOBBIES: a game's round under way, said beside its name (`MU_LOBBY_IN_PROGRESS_ADAPTATION`). */
  progress?: string;
}

/** Whether a room is full (a room with no cap reported never is): to a joining player, a CPU's seat is free (B138). */
export const roomFull = (r: Pick<Room, 'n' | 'cap' | 'replaceable'>): boolean => r.cap !== null && r.n - (r.replaceable ?? 0) >= r.cap;
/** A count and its noun, singular at one ("1 room", "2 rooms", "0 players"): the launcher's own lines (OT.R28). */
export const countOf = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

/** A filter on the rooms screen (L2 / R2 cycle them). */
export interface RoomFilter { label: string; keep(room: Room): boolean }

/** An option row: a roller of `values` (an index, `def` its default) or an `action` button. */
export interface OptRow {
  id: string;
  label: string;
  values?: readonly string[];
  def?: number;
  action?: string;
  about: string;
  note: string;
  needsSignIn?: boolean;
  /** Why the row cannot change now ("Insert disc"), when it is locked for another reason than sign-in. */
  locked?: string;
  /** LR-5: an action's tone in the artifact's drawing (`./render/rows` `ActionTone`): the primary verb or a destructive one. */
  tone?: 'primary' | 'danger';
  /** LR-5: a read-only row (the version): its value and tone, drawn as LR-1's info row; no values, no action. */
  info?: { value: string; tone?: 'good' | 'warn' | 'bad' };
  /** LR-5: one choice of a group (Appearance's theme, its picture), drawn as LR-1's pick row; its action picks it. */
  pick?: { group: string; picked: boolean; hint?: string; swatch?: readonly [string, string, string]; thumb?: string };
  /** LR-5: the section header drawn above this row (the artifact's header rows); drawn only, never a stop of the pad. */
  section?: string;
  /** LR-13 (LR.R16 (2)): an action row drawn as the artifact's link (`›`), its action word the hint: it pushes a panel. */
  link?: boolean;
  /**
   * LR-20 (the LR.R11 side-by-side's P12): an action row's line under its label where the verb alone would repeat the
   * label or say nothing more (the artifact's action hints: what it does, or when); the verb stays the legend's Cross.
   */
  hint?: string;
  /**
   * VS-2 (VS.R4, a browser adaptation): a row whose choice applies when the next match starts (the video schema's
   * `nextMatch` rows: Antialias, Graphics, Power preference) -- drawn locked in the overlay while a round runs (`optCategories`).
   */
  nextMatch?: boolean;
  /**
   * VS-2 review F2 (the spec §4.2's surfaces, a browser adaptation): a row the launcher draws and the overlay leaves out
   * (Detected, "Not right?", Restore defaults; a video schema row without the `overlay` surface) -- `optCategories`.
   */
  launcherOnly?: boolean;
  /**
   * SEP-ROWS (a browser adaptation): a line the row's aside always carries under its `about` -- the row's tooltip, shown
   * while it is focused or hovered (Options > Controller's Stance mode: what SEPARATE needs).
   */
  tip?: string;
  /** SEP-ROWS (a browser adaptation): the row's warning now -- the alert mark drawn on the row, these its words. */
  warn?: string;
}
/** Which Settings door a tab belongs to. Absent, the tab sits in the one strip (the sample adapters). */
export type OptFamily = 'game' | 'launcher';
export interface OptCat { id: string; label: string; icon: IconName; rows: readonly OptRow[]; family?: OptFamily }

/**
 * LR-13 (LR.R16 (1), (6)): an Off / On choice is the artifact's toggle (`./render/options` draws it so), and Cross or a
 * click flips it; Left / Right still step it.
 */
export const isToggleRow = (row: Pick<OptRow, 'values' | 'action'> | undefined): boolean =>
  !!row && !row.action && row.values?.length === 2 && row.values.includes('Off') && row.values.includes('On');

/**
 * LR-22 (the side-by-side's pass 3, R8): a row the D-pad (and Cross, on a toggle) can change now: it has values, is not
 * locked ("Needs disc", "Chosen on the sign-in") and is signed in where it asks for it. The one rule the grammar's steps
 * and the legend's Toggle / Change share, as `canResetRow` is the Square's.
 */
export const canChangeRow = <R extends Pick<OptRow, 'values' | 'locked' | 'needsSignIn'>>(row: R | undefined, signedIn: boolean): row is R & { values: readonly string[] } =>
  !!row?.values && !row.locked && !(row.needsSignIn && !signedIn);

/**
 * Square's "Reset to default" on an Options row (LR-20's Q13; 03_SETTINGS_CATALOG: Reset "unavailable where there is
 * none"): a row with values and a default to go back to, that can change now (not locked, and signed in where it asks
 * for it). The one rule: the grammar's Square resets by it and the legend names Square by it (the batch review's F3).
 */
export function canResetRow<R extends Pick<OptRow, 'values' | 'def' | 'locked' | 'needsSignIn'>>(row: R | undefined, signedIn: boolean): row is R & { values: readonly string[]; def: number } {
  return canChangeRow(row, signedIn) && row.def !== undefined;
}

/**
 * LR-13 (LR.R16 (2), the artifact's `sys-look` -> `app-theme`): Appearance's link row, whose action pushes the "Theme &
 * background" panel (the options adapter's `panel('theme')`: the seven themes and the two pictures, as picks).
 */
export const THEME_PANEL_ROW = 'theme-panel';

/** The rows the Settings screen shows now: the pushed panel's when one is open (LR-13), else the current tab's. */
export function optRowsNow(s: ConsoleState, a: Adapters): readonly OptRow[] {
  if (s.opt.panel) return a.options.panel?.(s.opt.panel)?.rows ?? [];
  return optCategories(s, a)[s.opt.cat]?.rows ?? [];
}

/** LR-13: the theme picks (the panel's `theme` group): their labels, swatches and which is picked; none without a panel. */
export function themePicks(a: Adapters): OptRow[] {
  return (a.options.panel?.('theme')?.rows ?? []).filter((r) => r.pick?.group === 'theme');
}

/**
 * DX-3: App's "Remove downloaded content" row (`./adapters/options`): its action asks the console's confirm first (the
 * grammar's `optAction`), then the adapter's `action` deletes it.
 */
export const KEPT_DISC_ROW = 'disc-kept';
/** PWA-6: Options → App → Install app. The row opens a dialog; it does not call `prompt()` itself. */
export const INSTALL_APP_ROW = 'install-app';
/**
 * DSH-4 (the disc share plan, DSH.R12 leaves the sender's entry without the QR to us): Options → App → "Send game files to
 * another device", the row opening the sender's dialog in its code entry (`./render/discShare`). Drawn only where the page
 * has a disc share adapter (the launcher page's). A browser adaptation.
 */
export const SHARE_SEND_ROW = 'share-send';

/**
 * CX-14 (CX.R13, OT.R60): Options > Controller's "Button mapping" row: its action pushes the console's button mapping
 * screen (`./render/remap`, the grammar's `openRemap`) when the page has a remap adapter (`Adapters.remap`).
 */
export const REMAP_ROW = 'remap';

/** A row the Server screen lists from the server adapter (Report a problem, when the overlay has it). */
export interface ServerPage {
  name: string;
  sub: string;
  icon: IconName;
  verb: string;
  /** The item's act; absent, `page:<name>` (the page in a new tab). The live News is the server's news dialog. */
  act?: string;
}

/** A sign-in's answer: `next: 'agreement'` when the account must accept the USER AGREEMENT first (the live session). */
/**
 * One recorded match as the replays list draws it (the record's own fields). `result`: RV-4's result when the record holds
 * one, in the Replays section's words (`../modern/replays/view` `resultWords`), and how the record ended (`end`, the
 * card's `data-end`); absent, none (the RV-12 review).
 */
export interface ReplayRow {
  id: string; map: string; rules: string; when: string; length: string; players: number; names: string;
  result?: string; end?: 'match-over' | 'cut-short';
}
/**
 * RV-4 on the release path (the sprint 39 close review's item 1): the page after the rows read, while the server's last
 * answer carried a next cursor (`../modern/replays/data` `nextCursor`): not asked yet, being read, or failed in the
 * section's words (`title`, `words`; the rows read are kept). Absent from an `ok` view, the list is whole.
 */
export type ReplaysMore = { kind: 'idle' } | { kind: 'loading' } | { kind: 'failed'; title: string; words: string };
/** The replays list's state (the live match server's): signed out, being read, read, or failed in the section's words. */
export type ReplaysView =
  | { kind: 'signed-out' } | { kind: 'loading' } | { kind: 'ok'; entries: readonly ReplayRow[]; more?: ReplaysMore }
  | { kind: 'failed'; title: string; words: string };

/**
 * CX-15 (RV-12): the replay viewer open over the console page (`./adapters/replays` `watch`): while it is open the
 * console's pad goes to it -- the D-pad walks its controls in their order (the seek bar's left and right jump), Cross
 * presses the focused one -- and the legend names what Cross does there; Close is the console's (Circle, or the viewer's
 * own Back, which calls the `onClose` the console gave). A browser adaptation with no original (OT.R28).
 */
export interface ReplayWatch {
  /** The row's id the viewer was opened from. */
  readonly id: string;
  /** A pad press the viewer reads: the D-pad and Cross (Circle is the console's Close). */
  press(b: Button): void;
  /** What the focus is on in the viewer: a control (its name, the viewer's own words), the seek bar (its jump), or none. */
  focused(): { kind: 'control' | 'seek'; label: string } | null;
  /** The disc left: the viewer's stage closed and its lock said. */
  lock(): void;
  locked(): boolean;
  /** Takes the viewer away (its stage closed); the console's `onClose` is not called again. */
  close(): void;
}

/** INVITE-START (FI.R8): what the invite's auto-START reads of the page and how it presses START (`./app`). */
export interface InvitePage {
  S: Pick<ConsoleState, 'start' | 'overlay'>;
  /** START's own needs met (`startReady`). */
  ready(): boolean;
  /** Presses START (the controller's `start`). */
  start(): void;
}

/** What the hand-over asks of the console page (slice 3): stop reading its inputs, read them again, give the window up. */
export interface LaunchPage { suspend(): void; resume(): void; takeDown(): void }
/** The hand-over's answer: the front end took the window, or a refusal in words, or a cancel (Circle before the mount). */
export type LaunchResult = { ok: true } | { ok: false; cancelled: true } | { ok: false; cancelled?: false; error: string };

/**
 * `note` (PERSONA-PERSIST (a), fold A): one line the sign-in's toast says (a persona not remembered on the card, and why).
 * `accepted` (AGREEMENT-ONCE, MU.R14 amended): the agreement was accepted on this browser earlier, so none is asked; the line said.
 */
export type SignInResult = { ok: true; next?: 'agreement'; note?: string; accepted?: string } | { ok: false; error: string };
/**
 * PERSONA-PERSIST (a) (OT.R61): the load's quick sign-in -- the card's remembered persona for this server tried once.
 * Refused: its words, and `askPassword` when the cookie is gone (-978: the password asked once, the persona chosen).
 */
export type QuickSignIn = { ok: true; persona: string; next?: 'agreement'; accepted?: string } | { ok: false; persona: string; error: string; askPassword: boolean };

/** CX-LOADOUTS: the side a loadouts screen keeps records for (the ARMORY's records are per mission and side). */
export type LoadoutSide = 'seal' | 'terrorist';
/** CX-LOADOUTS: why the loadouts read nothing now -- signed out, the disc out, or a round running under the overlay. */
export type LoadoutLock = 'sign-in' | 'disc' | 'round';
/** CX-LOADOUTS: a locked screen's title and its one line (`./adapters/loadouts` `LOADOUT_LOCK_WORDS`). */
export interface LoadoutLocked { kind: 'locked'; lock: LoadoutLock; title: string; line: string }
/**
 * CX-LOADOUTS: one row of a side's mission list -- a mission the server's CREATE GAME offers (its record stored, or the
 * type's own kit), or a record kept on the account for a map this server does not offer (shown, never opened or sent).
 */
export interface LoadoutMission { mission: string; name: string; state: 'saved' | 'default' | 'unoffered' }
/** CX-LOADOUTS: a side's mission list: locked, the records being read, their read refused (in words), or the rows. */
export type LoadoutListView =
  | LoadoutLocked | { kind: 'loading' } | { kind: 'failed'; words: string }
  | { kind: 'ok'; rows: readonly LoadoutMission[]; empty: string | null };
/**
 * CX-LOADOUTS: one roller of the editor (the type, then the five slots): its values in order, the one held, and why it
 * cannot change (`fixed`, its line), else null. `open`: the values it may stop on (the type's columns the map opens).
 */
export interface LoadoutRoller { label: string; values: readonly string[]; at: number; open: readonly boolean[]; fixed: string | null }
/**
 * CX-LOADOUTS: the editor of one mission and side: locked; `gone` (its mission no longer listed); being read; its world
 * refused (in words); or the rollers -- `head` and `held` its two lines, `busy` while a save is out, `dirty` while the
 * kit differs from the record it opened on or last saved.
 */
export type LoadoutEditorView =
  | LoadoutLocked | { kind: 'gone' } | { kind: 'loading' } | { kind: 'failed'; words: string }
  | { kind: 'ok'; mission: string; name: string; head: string; held: string; rows: readonly LoadoutRoller[]; busy: boolean; dirty: boolean };
/** CX-LOADOUTS: a save's or a Defaults' outcome in words: the toast's (`ok`) or the warn line's. */
export interface LoadoutOutcome { ok: boolean; words: string }

/**
 * CX-LOADOUTS (OT.R60 (c)): the account's ARMORY records, mission by mission and side by side, as the console's Armory
 * screens read and edit them (`./adapters/loadouts` `liveLoadouts`, over `./loadoutModel`). Nothing is read until a
 * screen is opened (`open`), and nothing while it is locked.
 */
export interface LoadoutsAdapter {
  /** A side's list is opened: the records read now if they are not (signed in, the disc in, no round). */
  open(side: LoadoutSide): void;
  list(): LoadoutListView;
  /** The records' read again, and the offer with it (the failed list's Try again). */
  retry(): void;
  /** The editor opened on `mission` of the side open: its world asked of the disc. */
  edit(mission: string): void;
  editor(): LoadoutEditorView;
  /** One step of the editor's row `row` (0 the type, 1-5 the slots): to the next value it may stop on, `d` -1 or 1. */
  step(row: number, d: -1 | 1): void;
  /** The editor's record sent (`PUT /lobby/loadout`); null when nothing was sent or the answer was dropped. */
  save(): Promise<LoadoutOutcome | null> | null;
  /** The type's own kit, and the stored record cleared when one is (mode 7); null when the editor is not open. */
  defaults(): Promise<LoadoutOutcome | null> | null;
  /** The editor closed: its edits dropped. */
  close(): void;
  /** OVERLAY-CONSOLE: how the round under the overlay is read (the console's `roundRunning`); absent, never. */
  follow(round: () => boolean): void;
  /** At each draw: the round compared with the last draw's, and whether a loadouts screen is shown. */
  sync(shown: boolean): void;
}

/**
 * CX-PERSONA: why the persona's edits wait now (OT.R60's locks, `personaEditLock`): `card` over any game page (the game's
 * front end keeps and saves its own list of the card's personas, so an edit from the overlay could race it); elsewhere in
 * the overlay the game holds the account (`game`) or a round runs (`round`).
 */
export type PersonaLock = 'card' | 'game' | 'round';
/** CX-PERSONA: an edit's outcome in words: the toast's (`ok`), else the field's or the warn line's. */
export interface PersonaOutcome { ok: boolean; words: string }
/** CX-PERSONA: one persona on the card (`id` its record's key, HOST, PORT and NAME); `signedIn` the session's persona. */
export interface PersonaRow { id: string; name: string; host: string; signedIn: boolean }
/** CX-PERSONA: whether a new persona can be made: the universe it is filed under being read, refused, full, or read. */
export type PersonaCreate = { kind: 'loading' | 'failed' | 'full'; line: string } | { kind: 'ready'; host: string; port: number; line: string };
/**
 * CX-PERSONA: the Persona screen's list -- the card that cannot be read, or its personas (`slotLine` the slot they come
 * from, `empty` none), the signed-in persona's name (`held`: the card holds it), the new persona's state, and why the
 * edits wait now (`locked`, its line) else null.
 */
export type PersonaListView =
  | { kind: 'unreadable'; line: string }
  | { kind: 'ok'; slotLine: string; rows: readonly PersonaRow[]; empty: string | null; signedIn: string | null; held: boolean; create: PersonaCreate; locked: string | null };
/** CX-PERSONA: the card's two phrase lists (the five taunts, the five team messages). */
export type PhraseKind = 'taunts' | 'messages';
/**
 * CX-PERSONA: one phrase slot -- its text (`own`: the card's own typed text, which its editor opens on), or the disc's
 * caption for a slot that holds the game's text, or why that caption is not shown (`gated`: no disc, being read, none).
 */
export interface PhraseRow { kind: PhraseKind; slot: number; label: string; value: string; own: boolean; gated: 'locked' | 'reading' | 'unavailable' | null }
/** CX-PERSONA: one persona's editor: gone (deleted, or the card changed), or its fields and the card's phrases. */
export type PersonaEditorView =
  | { kind: 'gone' }
  | { kind: 'ok'; id: string; name: string; host: string; town: string; gender: 0 | 1; phrases: readonly PhraseRow[]; help: Readonly<Record<PhraseKind, string>>; locked: string | null };
/**
 * CX-PERSONA: the rank -- the medal 1-5, its name and band (PLAYER RANKING's legend), and its mark: the design's star
 * with no disc in, the disc's picture (`picture`, a data URL) once read, else none.
 */
export interface RankView { medal: number; rank: string; band: string; mark: 'star' | 'medal' | 'none'; picture: string | null }
/** CX-PERSONA: a mission's loadouts on the account, each side Set, Saved (its valid byte clear) or Not set. */
export interface RecordMission { mission: string; seal: string; terrorist: string }
/** CX-PERSONA: the Service record: signed out (its line), or the name, the rank, the record and the loadouts, each read apart. */
export type ServiceRecordView =
  | { kind: 'signed-out'; line: string }
  | {
    kind: 'signed-in'; name: string; rank: RankView | null;
    record: { kind: 'loading' } | { kind: 'failed'; words: string }
    | { kind: 'ok'; clan: string; friends: number; ignored: number; ladder: string; note: { text: string; adaptation: boolean } | null; rows: readonly { label: string; value: string }[] };
    loadouts: { kind: 'loading' } | { kind: 'failed'; words: string } | { kind: 'ok'; missions: readonly RecordMission[] };
  };

/**
 * CX-PERSONA (OT.R60 (c)): the Profile category's Persona and Service record (`./adapters/profile` `liveProfile`): the
 * card's personas and their edits, the match name, and the account's record. The record is read when its screen opens
 * (`open`), the universe a new persona is filed under when the Persona screen does; nothing at the making.
 */
export interface ProfileAdapter {
  open(screen: 'persona' | 'record'): void;
  personas(): PersonaListView;
  editor(id: string): PersonaEditorView;
  matchName(): string;
  setMatchName(raw: string): PersonaOutcome;
  setTown(id: string, town: string): PersonaOutcome;
  setGender(id: string, gender: 0 | 1): PersonaOutcome;
  setPhrase(kind: PhraseKind, slot: number, text: string): PersonaOutcome;
  /** A new persona, filed under the universe read; its `id` when it was made. */
  create(p: { name: string; town: string; gender: 0 | 1 }): PersonaOutcome & { id?: string };
  remove(id: string): PersonaOutcome;
  /** The universe read again (its refusal's Try again). */
  retryHost(): void;
  record(): ServiceRecordView;
  /** The record, the loadouts and the rank read again (a refusal's Try again). */
  retry(): void;
  /** OVERLAY-CONSOLE: how the lock is read (the console's `sessionLock`); absent, never. */
  follow(lock: () => PersonaLock | null): void;
  /** Why the edits wait now (the lock's line), else null. */
  locked(): string | null;
}

/**
 * CX-LOBBIES: one line of a room's or a game's detail -- a fact (its label and value), or a note (its line in `label`,
 * `value` empty).
 */
export interface LobbyLine { kind: 'fact' | 'note'; label: string; value: string }
/** CX-LOBBIES: a room's or a game's players -- by name, or one line saying why there are none (`private`: its lock). */
export type LobbyPlayers = { kind: 'names'; names: readonly string[] } | { kind: 'note'; line: string; private: boolean };
/** CX-LOBBIES: one game of a room's detail: its row id, its name, its line (map, mode, count, ping, lock, state). */
export interface LobbyGameRow { id: string; name: string; sub: string; locked: boolean; inProgress: boolean; full: boolean }
/** CX-LOBBIES: a briefing room's detail (gone: the list no longer holds it). */
export type LobbyRoomView =
  | { kind: 'gone' }
  | { kind: 'ok'; id: string; name: string; locked: boolean; full: boolean; facts: readonly LobbyLine[]; games: readonly LobbyGameRow[]; players: LobbyPlayers };
/** CX-LOBBIES: a game's detail: its facts, GAME DETAILS' lines, its players; `room` its room's row id when the list holds it. */
export type LobbyGameView =
  | { kind: 'gone' }
  | {
    kind: 'ok'; id: string; name: string; room: string | null; roomName: string | null; locked: boolean; full: boolean; inProgress: boolean;
    facts: readonly LobbyLine[]; details: readonly LobbyLine[]; players: LobbyPlayers;
  };
/** CX-LOBBIES (FG-46): one listed forge lobby -- its name, its map, players / seats, in match, its lock (FG-48a), JOIN's address. */
export interface CustomRow { id: string; name: string; map: string; players: number; max: number; inMatch: boolean; locked: boolean; href: string; community?: true }
/** CX-LOBBIES: the Custom matches list: not read yet, the route's refusal (its line), or the rows (`empty` the line for none). */
export type CustomView = { kind: 'waiting' } | { kind: 'unavailable'; line: string } | { kind: 'ok'; rows: readonly CustomRow[]; empty: string | null };
/**
 * CX-LOBBIES (OT.R60 (c); FG-46): the forge lobbies their hosts listed (`./adapters/lobbies` `liveCustomMatches`), read
 * only while their screen is shown and the tab visible (`sync`, at each draw).
 */
export interface CustomMatchesAdapter {
  sync(shown: boolean): void;
  view(): CustomView;
  /** Reads again now (Square); settles with the answer. */
  refresh(): Promise<void>;
  /** JOIN: the forge opened at the lobby `id` (a change of page); its address, or null when the list holds no such lobby. */
  join(id: string): string | null;
}

/** The marker the sample adapters carry; the header shows the prototype's tag only with it. */
export const SAMPLE_DATA = 'sample' as const;

export interface Adapters {
  /** `SAMPLE_DATA` for the prototype's sample adapters, `live` for the server's and the emulator's. */
  data: typeof SAMPLE_DATA | 'live';
  disc: {
    state(): DiscState;
    title(): string;
    /** Opens the picker; answers whether the image chosen was read. */
    choose(): Promise<boolean>;
    /** In the `error` state, the reader's words (else ''). Optional: the sample adapters never fail. */
    error?(): string;
    /** From START's press until Back, no new image is taken (the live disc). */
    hold?(on: boolean): void;
    /**
     * CX-10a: opens the folder chooser -- a disc in a drive, a mounted image or a copy of the disc's files (DA-4, DA-7's
     * picker); answers whether the folder chosen was read, and rejects with the browser's words when its picker fails.
     * Since CX-16 it is reached through the folder source (`source`), never as an action of its own.
     */
    chooseFolder?(): Promise<boolean>;
    /** The kind of the disc chosen last (an image or a folder), or null before any. Absent, an image's. */
    kind?(): 'image' | 'folder' | null;
    /**
     * The disc chosen last as the page's lines say it (`../discSource` `discLabel`: `the disc image <file>`, `the disc
     * folder <name>`), else '' (none chosen, or a reader that names none: the sample image).
     */
    label?(): string;
    /**
     * CX-16 (CX.R9): the active source -- the one the Disc action, the chip and Armory's "Choose disc" open; the newest
     * disc chosen (a pick or a drop) makes its own kind the source. Absent, the image's, and Home draws no source icon.
     */
    source?(): DiscSource;
    /** CX-16: makes `src` the active source; the disc open now stays open until a new one is chosen (no silent close). */
    setSource?(src: DiscSource): void;
    /**
     * DX-3 (FI.R6, FI.R7): the extraction's popover view while one is shown (the controller opens the overlay `extract` on
     * it and closes it when it is gone), else null. Absent: the adapter extracts nothing.
     */
    extract?(): ExtractView | null;
    /** DX-3: the popover's answer to a press or a click (`./render/extract` `extractPress`). */
    extractAct?(act: ExtractAct): void;
    /** DX-3: one line about the disc kept in this browser (cleared by the browser; not needed), '' none. */
    note?(): string;
    /** INVITE-START (FI.R8 b): the disc's extraction is running, from the pick until it ends (its popover up, or about to be). */
    extracting?(): boolean;
    /**
     * DSH-10 (the disc share plan, DSH.R17): the extraction kept in this browser (`KeptDisc`: `whole` once every file of the
     * read set is in, DSH.R7) or null with none (`./adapters/disc`'s). Absent: none. Read by `sendState`.
     */
    kept?(): KeptDisc | null;
  };
  pad: {
    connected(): boolean;
    setConnected(on: boolean): void;
    /** One frame's read of the pads (the live adapter: through the setup page's saved choices); absent, `navigator`'s. */
    read?(): readonly PadLike[];
  };
  mic: {
    on(): boolean;
    toggle(): Promise<boolean>;
    /** The Microphone item's line (the live adapter: the device, or a refusal); absent, the prototype's. */
    detail?(): string;
    /** The browser refused the microphone the setting turns on. */
    refused?(): boolean;
  };
  card: {
    /** The first persona's name ('' for none). */
    persona(): string;
    slot(): number;
    personas(): number;
    /** Every persona's name, in the card's order (the sign-in tiles); absent, `persona()` alone. */
    names?(): readonly string[];
    /** Whether a card can be read at all; absent, true. */
    readable?(): boolean;
  };
  session: {
    signedIn(): boolean;
    persona(): string;
    /** `remember` (OT.R61): "Remember me" ticked -- the remember cookie asked for, the card's SAVE PASSWORD filed YES. */
    signIn(persona: string, password: string, remember?: boolean): Promise<SignInResult>;
    /** `forget` (OT.R61): "Forget this device" -- the remember cookie dropped, the card's SAVE PASSWORD filed NO. */
    signOut(forget?: boolean): Promise<void>;
    /** OT.R61 (b): "Remember me" is offered on the sign-in, ticked by default. Absent: not offered. */
    remembers?(): boolean;
    /** OT.R61 (b): the Sign out confirm offers "Forget this device". Absent: not offered. */
    forgets?(): boolean;
    /** OT.R61 (a): the launcher's load's quick sign-in, tried once (null: nothing tried). Absent: none. */
    quick?(): Promise<QuickSignIn | null>;
    /** The USER AGREEMENT after a login (the live session; the sample adapters sign in at once). */
    agreement?: {
      title: string;
      lead: string;
      /** What the text reads until it is read (the original's first line). */
      waiting: string;
      /** Decline's question (the original's #763). */
      question: string;
      text(): Promise<string>;
      accept(): void;
    };
    /** The name's and the password's caps; absent, the prototype's 24 each. */
    limits?(): { name: number; password: number };
    /** The sign-out confirm's words; absent, the prototype's. */
    words?(): { signOutTitle: string; signOutLead: string; no: string; yes: string; forget?: string };
  };
  rooms: {
    list(): readonly Room[];
    filters(): readonly RoomFilter[];
    updated(): string;
    refresh(): Promise<void>;
    /** The list's state (the live lobby's poll): reading, answered, or failed in the lobby's words. */
    status?(): { kind: 'waiting' | 'ok' | 'failed'; words: string };
    /** The rooms and players the lobby reports now, or null before an answer. */
    totals?(): { rooms: number; players: number } | null;
    /** Keeps the launch target where the launch reads it (the live lobby's `lobbySelection`), by row id. */
    select?(id: string | null): void;
    /** The launch target's row id as kept there (null: none, or dropped when its game went). */
    selected?(): string | null;
    /** Whether Triangle searches the list (the live lobby's name query). */
    search?: boolean;
    /** CX-LOBBIES: a briefing room's detail by its row id (`room:<id>`); absent, no row opens. */
    room?(id: string): LobbyRoomView;
    /** CX-LOBBIES: a game's detail by its row id (`game:<id>`). */
    game?(id: string): LobbyGameView;
    /** CX-LOBBIES: any room or game the lobby holds, as a row, by its id (the launch target's name); null when none. */
    row?(id: string): Room | null;
    /**
     * CX-LOBBIES review F2: whether Refresh can ask anything now -- false while a lost session's state holds (the poll
     * stopped until the session changes; the retired section hid its Retry there). Absent, always.
     */
    refreshable?(): boolean;
  };
  options: {
    categories(): readonly OptCat[];
    value(id: string): number;
    set(id: string, v: number): void;
    /**
     * CX-23: a press of Left (-1) or Right (+1) on a row. Absent, the grammar sets the neighbouring value's index; a live
     * tuner steps the value the card holds by its own step instead (`./adapters/options`).
     */
    step?(id: string, d: -1 | 1): void;
    reset(id: string): void;
    /**
     * SEP-SHOW: the toast a `set`, `step` or `reset` left to say (Stance mode SEPARATE binding Crouch to the touchpad), once;
     * null when none. Absent, nothing to say.
     */
    takeToast?(): string | null;
    /** Runs an action row; answers the toast to show, or null. */
    action(id: string): Promise<string | null>;
    /** PWA-6: how this browser installs, for the Install app dialog. Absent, the dialog says the browser has not offered it. */
    installSurface?(): import('../pwa/install').InstallSurface;
    /**
     * LR-13 (LR.R16 (2)): a pushed panel's rows -- `theme`, Appearance's "Theme & background": the theme and picture
     * picks, acted on by `action` as before. Absent, Appearance keeps its picks in its tab.
     */
    panel?(id: 'theme'): OptCat | null;
  };
  replays: {
    count(): number;
    refresh(): Promise<void>;
    /** The list's state and rows (the live match server's); absent, the prototype's count alone. */
    view?(): ReplaysView;
    /**
     * RV-4 (the sprint 39 close review's item 1): asks for the page after the rows read when the view's `more` says there
     * is one and it is not being read (a failed one again: its retry); it is appended, deduped by id. Absent, one page.
     */
    more?(): Promise<void>;
    /**
     * CX-15: opens the replay of the list's row `id` in the viewer over the page; `onClose` when the viewer's own Back
     * (its button, Escape) asks to close. Null when the row is not the list's. Absent, Watch opens nothing.
     */
    watch?(id: string, onClose: () => void): ReplayWatch | null;
    /** CX-15: the viewer open now, or null. */
    watching?(): ReplayWatch | null;
  };
  server: {
    /** The status item's word and line; `alert` draws the word in warn (a server that does not answer). */
    status(): { word: string; ready: boolean; line: string; alert?: boolean };
    /** The players and rooms the server reports now; null before it has (no figure is drawn then). */
    totals(): { players: number; rooms: number } | null;
    pages(): readonly ServerPage[];
    refresh(): Promise<void>;
    openPage(name: string): void;
    /** The News dialog's texts (the live server's universe and announcement). */
    news?(): {
      universe: { kind: 'waiting' } | { kind: 'ok'; name: string; users: number; max: number; description: string; news: string[] } | { kind: 'failed' };
      announcement: { kind: 'signed-out' } | { kind: 'waiting' } | { kind: 'ok'; text: string } | { kind: 'failed' };
    };
    /** Asks the news texts again (the dialog opened). */
    loadNews?(): void;
    /** The universe as the Server view's fact says it, or null before it answers. */
    universeLine?(): string | null;
    /** LR-33 (LR.R27): central's version from its `/health` (`kind` release: only the release name, a date-sha), or null before it answers and while it is unreachable. Absent, none read. */
    centralVersion?(): { kind: 'version' | 'release'; version: string } | null;
  };
  /** What START needs beyond the disc: a supported input, as the setup page's START (the live page's); absent, none. */
  controls?: {
    ready(): boolean;
    line(): string;
    reason(): string;
    /** A keyboard or a mouse has been used. It counts for START on every build. Answers whether this call newly marked it. */
    note?(device: 'keyboard' | 'pointer'): boolean;
  };
  /** START's hand-over to the original's front end (slice 3, the live page's); absent, the prototype's launch screen only. */
  launch?: {
    run(page: LaunchPage): Promise<LaunchResult>;
    /** Circle before the mount: nothing is mounted. */
    cancel(): void;
  };
  /**
   * CX-20 (CX.R12): the console's one menu-move cue, called when a press moves the focus -- between items, rows or tabs,
   * and L1 / R1's category or tab switch, the same function (`../grammar` `press`). Named after the original's menus'
   * cue for a focus move (`@s2u/ui` `UiSoundCues.selection`, played from the disc's HUDUI bank). CX-51 (CX.R19, the
   * owner, 2026-10-20): the launcher page plays it, and `play` the rest of its cues (`./sounds`); absent (the overlay over
   * a game page, the tests), the console is silent.
   */
  cue?: { selection(): void; play?(cue: UiCue): void };
  /**
   * INVITE-START (FI.R8; `./adapters/invite`): an invite address's auto-START and the invite channel's answers, bound to
   * the page by `./app` `bootConsole`; `waiting` is the Disc item's line while the invite waits for its disc. Absent (the
   * sample adapters), neither.
   */
  invite?: { waiting(): string; attach(page: InvitePage): { check(): void; detach(): void } };
  /**
   * CX-14 (CX.R13, OT.R60): the button mapping screen's binding machine (`../padBinding` `PadBinding`, the one the setup
   * page's Controller view drives): opened when the screen is pushed (one at a time: an open one is answered again), the
   * one open now, and closed when the screen is left (its listen stopped, its listeners gone). Absent (the sample
   * adapters), the Button mapping row's action is the options adapter's own.
   */
  remap?: { open(): PadBinding; current(): PadBinding | null; close(): void };
  /**
   * CX-LOADOUTS (OT.R60 (c)): the Armory's SEAL and Terrorist loadouts (`./adapters/loadouts`). Absent (the sample
   * adapters), the Armory's rows stay "Coming".
   */
  loadouts?: LoadoutsAdapter;
  /**
   * CX-PERSONA (OT.R60 (c)): the Profile category's Persona and Service record (`./adapters/profile`). Absent (the sample
   * adapters), those rows stay "Coming".
   */
  profile?: ProfileAdapter;
  /**
   * CX-LOBBIES (OT.R60 (c); FG-46): Play online's Custom matches (`./adapters/lobbies`). Absent (the sample adapters), its
   * row stays "Coming".
   */
  custom?: CustomMatchesAdapter;
  /**
   * OVERLAY-CONSOLE: the Report (FB-1's dialog, `../modern/report`), opened by the Server screen's "Report a problem"
   * row (`report`) in the overlay's console. While it is open the console reads none of its keys and none of the pad
   * (the dialog's own; the overlay's frame reads its Circle). Absent (the launcher page), no such row.
   */
  report?: { open(): void; isOpen(): boolean };
  /**
   * DSH-5 (the disc share plan, DSH.R12): the disc share's receiver and sender (`../discShareView`), read by Play's panel's
   * "Request Game Files (XBOX)" row and the sender's dialog (`./render/discShare`). Absent (the overlay over a game page,
   * the sample adapters), no row and no dialog. A browser adaptation.
   */
  discShare?: DiscShareAdapter;
  /** Ends the adapters' work (polls, listeners) when the page gives the window up. */
  dispose?(): void;
  /** The prototype's "Prototype states" panel: sample adapters only. */
  states?: { rows(): readonly [string, string][]; flip(i: number): void };
  /** B206 ML-2: the MODS screen's packs, through the one registry (`./adapters/mods`). Absent: the screen says so. */
  mods?: ModsAdapter;
  /** Calls `cb` whenever an adapter's state changes on its own (a poll, a pad); answers the unsubscribe. */
  onChange?(cb: () => void): () => void;
}

/**
 * `remap`: CX-14's button mapping, pushed from Settings > Controller (`./render/remap`). `loadouts` and `loadout`:
 * CX-LOADOUTS' mission list of a side and its editor, pushed from the Profile's loadout rows (`./render/loadouts`).
 * `persona`, `personaEdit`, `personaNew` and `record`: CX-PERSONA's persona list, one persona's editor, the new
 * persona's form and the Service record, pushed from the Profile's rows (`./render/profile`). `room`, `game` and
 * `custom`: CX-LOBBIES' room detail and game detail, pushed from Browse rooms, and the Custom matches list, pushed
 * from Play online (`./render/lobbies`). `server`: CX-28's Server screen, pushed from Play online (`./render/server`).
 */
/**
 * B206 ML-2 (ML.R5, ML.R6, ML.R8): what the MODS screen draws -- one installed pack a row. `on` null: no switch (a v2
 * pack, stored and never applied). `where`: where it applies (ML.R5), in words. A browser adaptation (OT.R110).
 */
export interface ModsRowView {
  /** `custom-map` (FP-5, FP.R12): a forge-map bundle kept read-only for the Forge and the test room; never switched. */
  id: string; name: string; kind: 'hd' | 'texture' | 'mod' | 'model' | 'pack' | 'custom-map';
  detail: string; where: string; on: boolean | null;
  /** The pack's author, credited on its row ("HD texture pack by ..."): the HD kind's, `HD_PACK_AUTHOR` (the owner, 2026-11-09). */
  credit?: string;
  /** A data mod's place in the order (the lower wins a conflict): whether it can move up or down. */
  up?: boolean; down?: boolean;
}
export interface ModsView {
  /** The list has been read once. */
  ready: boolean;
  rows: readonly ModsRowView[];
  /** The texture pack selector's choices, Original (`id` null) first (ML.R8). */
  textures: readonly { id: string | null; label: string }[];
  texture: string | null;
  /** An import or a removal running: its words and, while reading or storing, its share done. */
  busy: { words: string; progress: number | null } | null;
  /** The last import's or change's outcome in words. */
  message: { words: string; tone: 'good' | 'bad' } | null;
  /** The HD pack's store page (`HD_PACK_STORE_PAGE_PLACEHOLDER`): null, no link drawn. */
  storePage: string | null;
  /** TEST_HD_PACK_BUTTON_ADAPTATION (B206 ML-12, removed by ML-13): the temporary "Add test HD texture pack" row is drawn, last. */
  testHdPack?: boolean;
}
/** A dropped or picked file: a `File`, or a folder's file carrying its path in the folder. */
export type ModsFile = Pick<File, 'name' | 'size' | 'arrayBuffer' | 'slice'> & { readonly webkitRelativePath?: string };
export interface ModsAdapter {
  /** Reads the list and the state again (the screen's open). */
  open(): void;
  view(): ModsView;
  /** The file picker (the drop zone's Cross: a pad cannot drop). */
  choose(): void;
  /** Files dropped on the screen (a zip, a folder's files or loose files). */
  drop(files: readonly ModsFile[]): void;
  /** A pack's switch: a texture pack is chosen or set back to Original; a mod or a model slot on or off. */
  toggle(id: string): void;
  remove(id: string): void;
  move(id: string, d: -1 | 1): void;
  setTexture(id: string | null): void;
  /** TEST_HD_PACK_BUTTON_ADAPTATION (ML-12): the served HD pack installed and chosen; removed by ML-13. */
  addTestHdPack?(): void;
}
/** The MODS screen's rows: the drop zone, the texture selector, then one a pack. */
export const MODS_DROP_ROW = 0;
export const MODS_TEXTURE_ROW = 1;
export const MODS_FIRST_PACK_ROW = 2;
/** TEST_HD_PACK_BUTTON_ADAPTATION (ML-12): the temporary button's row, after the packs; -1 when it is not drawn. */
export const modsTestHdRow = (v: ModsView | undefined): number => (v?.testHdPack ? MODS_FIRST_PACK_ROW + v.rows.length : -1);
export const modsRowCount = (a: Adapters): number => {
  const v = a.mods?.view();
  return MODS_FIRST_PACK_ROW + (v?.rows.length ?? 0) + (modsTestHdRow(v) >= 0 ? 1 : 0);   // TEST_HD_PACK_BUTTON_ADAPTATION
};

export type Screen = 'home' | 'rooms' | 'options' | 'replays' | 'remap' | 'loadoutSides' | 'loadouts' | 'loadout' | 'persona' | 'personaEdit' | 'personaNew' | 'record'
  | 'room' | 'game' | 'custom' | 'server' | 'mods';
/**
 * `viewer`: the replay viewer over the page (CX-15, `ReplayWatch`). `extract`: the extraction's popover (DX-2, FI.R7;
 * `./render/extract`), drawn from `ConsoleState.extract`. `field`: CX-PERSONA's text field over the on-screen keyboard
 * (the sign-in dialog's parts, `./render/overlay`), drawn from `ConsoleState.fd`.
 */
export type Overlay = null | 'signin' | 'states' | 'confirm' | 'launch' | 'agreement' | 'search' | 'news' | 'viewer' | 'extract' | 'field' | 'install'
  | 'signedout'    // LR-12: the Signed out resting screen (`./render/signedOut`)
  | 'share';       // DSH-5 (DSH.R12): the sender's dialog the pairing link opens (`./render/discShare`)

/** CX-PERSONA: what the text field edits -- the match name, the persona's home town, a phrase, the new persona's two. */
export type FieldTarget =
  | { kind: 'match-name' } | { kind: 'town' } | { kind: 'phrase'; phrase: PhraseKind; slot: number } | { kind: 'new-name' } | { kind: 'new-town' }
  /** DSH-4: the sender's code entry's typed code (the receiver's 6 characters). */
  | { kind: 'share-code' };

export interface SignInState {
  zone: 'keys' | 'personas';
  /** The persona tile: the card's personas in order, then Add new (index = their count). */
  persona: number;
  /** The field the keys type into: the persona's name (Add new only) or the password. */
  target: 'name' | 'password';
  /** Add new's typed name. */
  name: string;
  kr: number;
  kc: number;
  text: string;
  shift: boolean;
  busy: boolean;
  error: string;
  /**
   * Typing on a real keyboard (the prototype's `typing`): the real password field has the focus and keeps it until a
   * pad press; Space then types, Enter signs in (the field's form).
   */
  typing: boolean;
  /** PERSONA-PERSIST (a) (OT.R61 (b)): "Remember me", ticked by default (read only where the session offers it). */
  remember: boolean;
}

/**
 * OVERLAY-CONSOLE (CX.R13, MISSION's OT.R60): the console as the launcher page (`page`, the base path's page) or as the
 * overlay over a game page (`overlay`, `../modern/overlay`): START, the launch target and the launch screen hidden there,
 * the disc and the session's locks read from the page (`ConsolePageReads`), Circle at the top the host's close.
 */
export type ConsoleMode = 'page' | 'overlay';

/**
 * What overlay mode is told of the page under it (`../modern/overlay/page` `overlayPageReads`, through the overlay's
 * session): read at each draw, so a change is followed at the next one.
 */
export interface ConsolePageReads {
  /** The game's own account holds the persona (`../modern/overlay/session` `OverlaySession.gameHolds`). */
  gameHolds(): boolean;
  /** A round runs under the overlay (`overlayPageReads.roundRunning`). */
  roundRunning(): boolean;
  /** The page is a game page -- it runs on the disc and the server (every page the overlay mounts on). */
  gamePage(): boolean;
  /** The overlay's opening button by its name ("Home (PS / Xbox Guide)"), for its close control's label; absent, none named. */
  toggleName?(): string;
  /** The seat's frames' F-A: the opening button's short cap ("Home", "L3") on the compact close control; absent, none drawn. */
  toggleCap?(): string;
  /**
   * Batch B's review F2: the page under the overlay is where the disc is chosen -- the disc page before its image, where
   * no game runs yet -- so an empty disc store means none chosen, not a disc the page does not name. Absent, never.
   */
  discOnPage?(): boolean;
  /**
   * CX-25's review F2: the game itself runs under the overlay -- its front end, whose menus hold ONLINE -- not only a
   * game page (`gamePage`: every page the overlay mounts on). The sign-in's account line reads it. Absent, never.
   */
  frontEndRuns?(): boolean;
}

/**
 * OVERLAY-CONSOLE: the locked rows' lines (the console's disabled row with its sub saying why, as the Armory's "Needs
 * disc"). Over any game page the disc, its source and the kept disc are the game's (it opened the disc at its boot); sign
 * out and the persona switch wait while the game holds the account or a round runs. The words are the console's own
 * (the product track's taste, for the owner's eye).
 */
export const OVERLAY_LOCK_WORDS = {
  disc: 'The game running under the overlay reads this disc',
  keptDisc: 'In use by the game',
  signOutGame: 'Signed in by the game: sign out from its own menus',
  signOutRound: 'Sign out waits for the round to end',
  personaGame: 'The game holds your persona: switch it from its own menus',
  personaRound: 'Switching persona waits for the round to end',
  /**
   * CX-PERSONA: the persona's edits (the match name, the card's personas and phrases): over any game page the card is the
   * game's (the seat's call, 2026-10-17, after OT.R60's lock refinement for the disc and the server); elsewhere in the
   * overlay, the same two locks as the persona switch.
   */
  editCard: 'The game under the overlay holds the memory card',
  editGame: 'The game holds your persona: change it from its own menus',
  editRound: 'Changing your persona waits for the round to end',
  /**
   * CX-LOBBIES: a Custom match's JOIN over a game page -- it opens the forge, a change of page, which would take the window
   * from the game running under the overlay.
   */
  join: 'Joining opens the forge in place of the game under the overlay',
  /** VS-2 (VS.R4): a next-match video row in the overlay while a round runs -- the running match keeps its renderer. */
  nextMatch: `Change it between rounds. ${GRAPHICS_BACKEND_APPLY_NOTE}`,
} as const;

/**
 * Batch B's review F2 and the seat's frames F-B (the owner's playtest over the served tree's test room: "NEEDED" and "No
 * disc in" over a running game): the game under the overlay is running, so it has a disc -- an opened image or folder,
 * the kept read set, or the served tree -- and the Disc row and Home's readout say it is in use, never that one is
 * needed. The chips and lines are the console's own words (the product track's taste, for the owner's eye).
 */
export const OVERLAY_DISC_WORDS = {
  inUse: 'IN USE',
  served: 'SERVED',
  /** The disc page before its image: no game runs yet, the disc is chosen on the page under the overlay. */
  waiting: 'WAITING',
  /** The Disc row's line, before the disc's own words (`the disc image socom2.iso`, `the disc kept in this browser`). */
  reads: 'The game running under the overlay reads',
  servedRow: 'The game running under the overlay reads the served tree',
  onPage: 'Choose your disc on the page under the overlay',
  /** Home's readout: the disc in by its words, a disc the page does not name, none chosen yet on the disc page. */
  inUseLine: 'In use:',
  gameLine: 'In use by the game',
  onPageLine: 'No disc yet: choose it on the page',
} as const;

/**
 * What the Disc row and Home's readout say over a game page (`overGame`): the disc store's state as the overlay's disc
 * adapter reads it (`./adapters/overlayDisc`: `ready` for the game's `in-game`; its `label` the disc's words, or the
 * served tree's where the page reads it with no disc published). Reading and a refusal as the console says them.
 */
export interface OverlayDiscUse {
  /** `data-disc-line`: in (a disc named), served, game (in use, unnamed), reading, error, none (the disc page before its image). */
  state: 'in' | 'served' | 'game' | 'reading' | 'error' | 'none';
  chip: [string, string];
  sub: string;
  line: string;
  /** In use (the check and the ready style). */
  ok: boolean;
}

export function overlayDiscUse(s: ConsoleState, a: Adapters): OverlayDiscUse {
  const d = a.disc.state();
  const named = a.disc.label?.() ?? '';
  const W = OVERLAY_DISC_WORDS;
  if (d === 'reading') {
    const line = named ? `Reading ${named}…` : 'Reading your disc…';
    return { state: 'reading', chip: ['READING', ''], sub: line, line, ok: false };
  }
  if (d === 'error') {
    const line = a.disc.error?.() || 'That image could not be read';
    return { state: 'error', chip: ['CHECK DISC', 'alert'], sub: line, line, ok: false };
  }
  if (d === 'ready') return { state: 'in', chip: [W.inUse, 'ready'], sub: named ? `${W.reads} ${named}` : OVERLAY_LOCK_WORDS.disc, line: named ? `${W.inUseLine} ${named}` : W.gameLine, ok: true };
  if (named) return { state: 'served', chip: [W.served, 'ready'], sub: W.servedRow, line: named, ok: true };
  if (s.page?.discOnPage?.()) return { state: 'none', chip: [W.waiting, ''], sub: W.onPage, line: W.onPageLine, ok: false };
  return { state: 'game', chip: [W.inUse, 'ready'], sub: OVERLAY_LOCK_WORDS.disc, line: W.gameLine, ok: true };
}

/** OVERLAY-CONSOLE: the state word a `todo:` act's item shows (OT.R60 (c): a screen with no console equivalent yet). */
export const COMING_WORD = 'COMING';

export interface ConsoleState {
  /** OVERLAY-CONSOLE: the launcher page or the overlay over a game page. */
  mode: ConsoleMode;
  /** OVERLAY-CONSOLE: the page's reads in overlay mode; null in page mode. */
  page: ConsolePageReads | null;
  screen: Screen;
  overlay: Overlay;
  /** LR-12: the persona the Signed out screen signs in as (the one signed out of); null with none remembered. */
  signedOutAs?: string | null;
  input: 'pointer' | 'pad';
  /** Ephemeral browser account disclosure, never persisted in route history. */
  accountOpen: boolean;
  cat: number;
  item: number[];
  /**
   * The filter, the focused row, the launch target's row id, the name query (Search); LR-37 (9) `kind`, the merged
   * list's ALL / CLASSIC / CUSTOM (`BROWSE_KINDS`), ALL at every open.
   */
  rooms: { filter: number; row: number; selected: string | null; query: string; kind: number };
  /** The replays list's focused row (slice 2's pushed screen); the row's id the viewer was opened from (CX-15). */
  rp: { row: number; watching: string | null };
  /** The Search dialog: the query typed, the on-screen key focused, Shift, field typing. */
  q: { text: string; kr: number; kc: number; shift: boolean; typing: boolean };
  /** `panel` (LR-13): a panel pushed from a tab's link row (Appearance's "Theme & background"), its rows `optRowsNow`'s. */
  opt: { cat: number; row: number; zone: 'rows' | 'cats'; panel?: 'theme'; flip?: string };
  /* `flip` (LR-13, review F4): the id of the toggle row that just flipped, for the one draw that follows -- the knob's motion is keyed to it. */
  /** CX-28: the Server screen pushed from Play online, and its focused row. */
  sv: { row: number };
  /** B206 ML-2: the MODS screen pushed from Experiments, and its focused row (`modsRowCount`). */
  md: { row: number };
  /** CX-14: the button mapping screen's focused row (the Stance mode, the dead zone, the sixteen actions, then the binds). */
  /** CX-14's focused row; LATER 380: `teachDeclined`, Not now chosen (or the pass let go), so no press begins it again. */
  /** SEP-ROWS: `mode`, the Stance mode the rows were last drawn in (a change under the screen moves `row` with its row). */
  rm: { row: number; teachDeclined?: boolean; mode?: StanceMode };
  /**
   * CX-LOADOUTS: the Armory's loadouts screens -- the side open, the mission list's focused row, and the editor's focused
   * row (0 the type, 1-5 the slots, `LOADOUT_SAVE_ROW` Save). `slot` is the `/profile/armory/<side>/<slot>` segment a
   * deep link opened on, kept until the editor's mission id is known so the path is not rewritten to the row index.
   */
  lo: { side: LoadoutSide; row: number; edit: number; slot?: string };
  /**
   * CX-PERSONA: the Profile's screens -- the persona list's focused row, the persona open in the editor (its record's key)
   * and the editor's focused row, the Service record's focused row, and the new persona's form (its fields and its row).
   */
  pf: { row: number; id: string | null; edit: number; rec: number; nw: { name: string; town: string; gender: 0 | 1; row: number } };
  /**
   * CX-LOBBIES: the lobby's screens -- the room open (its row id) and its list's focused row, the game open and its list's
   * focused row, where the game was opened from (a room's list, or Browse rooms), and the Custom matches' focused row.
   */
  lb: { room: string | null; row: number; game: string | null; grow: number; from: 'room' | 'rooms'; crow: number };
  /** CX-PERSONA: the text field over the on-screen keyboard: its target, its text, the key focused, Shift, field typing, a refusal. */
  fd: { target: FieldTarget; text: string; kr: number; kc: number; shift: boolean; typing: boolean; error: string };
  /** CX-16: the disc source dropdown beside Home's Disc action -- open or not, and its focused option (`DISC_SOURCES`). */
  src: { open: boolean; row: number };
  /** LR-13 (LR.R16 (2)): Settings' theme drop-up over its Theme item -- open or not, and its focused theme. */
  thm: { open: boolean; row: number };
  /**
   * LR-36 (LR.R30): Play's "Before you deploy" panel over the launcher page's Home -- open or not, its focused row
   * (`LAUNCH_DISC_ROW` .. `LAUNCH_SHARE_ROW`), and whether the cursor has already moved to Deploy once the launch was ready
   * (the mockup's `autoF`). DSH-5 (DSH.R12): `share`, the "Request Game Files (XBOX)" row's larger area expanded (the QR,
   * the code, the steps, the receiver's phases); absent, shut. DSH-10 (DSH.R17): `send`, the "Send Game Files" row's send
   * area (the host's link, the copy, the requests; RB-27) -- open, the share open (`openHost`); `at` its focused target
   * (`sendTargets`: `link`, `active`, `req:<id>`, kept by id as the list reorders) and `ix` where it was (the fallback when
   * its request goes); `copy`, how Copy link last ended (a refusal shows the note).
   */
  chk: { open: boolean; row: number; auto: boolean; share?: boolean; send?: boolean; at?: string; ix?: number; copy?: 'copied' | 'refused' };
  /**
   * DSH-5 (DSH.R12): the sender's dialog the pairing link opens (the overlay `share`, `./render/discShare`) -- its focused
   * button, and whether the player has closed it (it is not drawn back over the page then).
   */
  snd: { row: number; shut: boolean };
  si: SignInState;
  states: { row: number };
  confirmRow: number;
  /**
   * What the confirm asks: sign out (#793), Decline's question over the agreement (#763), (DX-3) Options' "Delete the
   * kept disc", or (CX-14) on the button mapping screen a conflict's Swap / Replace / Cancel and Restore defaults, or
   * (CX-LOADOUTS) on the loadout editor leaving with unsaved changes and its Defaults, or (CX-PERSONA) a persona's Delete,
   * or (DSH-10, RB-26's Q11) Deploy while the send area's share is busy (`SHARE_DEPLOY_CONFIRM`), or (the DSH-10 review's
   * F2) closing the send area while a copy runs (`SHARE_CLOSE_CONFIRM`).
   */
  confirmKind: 'signout' | 'decline' | 'kept' | 'conflict' | 'restore' | 'loadout-leave' | 'loadout-defaults' | 'persona-delete' | 'share-deploy' | 'share-close';
  /** The USER AGREEMENT: Accept (0) or Decline (1) focused, the text's scroll in CSS pixels, its text. */
  ag: { row: number; scroll: number; text: string };
  start: 'idle' | 'arming' | 'launching';
  /** The hand-over: the target named when START was pressed (the launch screen's seam), and a refusal's one line. */
  launch: { target: string | null; error: string };
  /**
   * DX-2 (FI.R7): the extraction's popover, folded from DX-1's hooks by `./render/extract` `extractView`; null when no
   * extraction is shown. The page (DX-3) sets it with the overlay `extract`.
   */
  extract: ExtractView | null;
  legendError: string;
  toast: string;
}

/**
 * The launcher's fixed browsing order, independent of history's stable category identities: LR.R2 (the owner,
 * 2026-10-26) amends LP.R18's order to Profile / Settings / Home / Online / Experiments, Home the default and centred.
 */
export const CATS: readonly { id: string; label: string; icon: IconName }[] = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'options', label: 'Settings', icon: 'cog' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'online', label: 'Online', icon: 'globe' },
  { id: 'experiments', label: 'Experiments', icon: 'flask' },
];
export const HOME_CATEGORY = CATS.findIndex((c) => c.id === 'home');

export const signInFresh = (): SignInState =>
  ({ zone: 'keys', persona: 0, target: 'password', name: '', kr: 1, kc: 4, text: '', shift: false, busy: false, error: '', typing: false, remember: true });

/** The prototype's opening state: Home current, the rooms screen opening on its second row. */
export function createState(a: Adapters, mode: ConsoleMode = 'page', page: ConsolePageReads | null = null): ConsoleState {
  return {
    mode, page: mode === 'overlay' ? page : null,
    screen: 'home', overlay: null, input: 'pointer', accountOpen: false,
    cat: HOME_CATEGORY, item: CATS.map(() => 0),
    // The prototype opens Browse rooms on its second sample row (Bravo); the live list on its first (initial focus is
    // the first thing to act on, "Controller UI" 3).
    rooms: { filter: 0, row: a.data === SAMPLE_DATA ? 1 : 0, selected: null, query: '', kind: 0 },
    q: { text: '', kr: 1, kc: 0, shift: false, typing: false },
    rp: { row: 0, watching: null },
    opt: { cat: 0, row: 0, zone: 'rows' },
    sv: { row: 0 },
    md: { row: 0 },
    rm: { row: 0 },
    lo: { side: 'seal', row: 0, edit: 0 },
    pf: { row: 0, id: null, edit: 0, rec: 0, nw: { name: '', town: '', gender: 0, row: 0 } },
    lb: { room: null, row: 0, game: null, grow: 0, from: 'rooms', crow: 0 },
    fd: { target: { kind: 'match-name' }, text: '', kr: 1, kc: 0, shift: false, typing: false, error: '' },
    src: { open: false, row: 0 },
    thm: { open: false, row: 0 },
    chk: { open: false, row: 0, auto: false },
    snd: { row: 0, shut: false },
    si: signInFresh(),
    states: { row: 0 },
    confirmRow: 0,
    confirmKind: 'signout',
    ag: { row: 0, scroll: 0, text: '' },
    start: 'idle', launch: { target: null, error: '' }, extract: null, legendError: '', toast: '',
  };
}

/* ---------- derived ---------- */

/** OVERLAY-CONSOLE: there is no START in overlay mode, so it is never ready there. */
export const startReady = (s: ConsoleState, a: Adapters): boolean => s.mode !== 'overlay' && a.disc.state() === 'ready' && (a.controls?.ready() ?? true);

/**
 * LR-35 (LR.R29, the owner, 2026-10-27: "Play" becomes "Play Socom II", then "SOCOM II": the disc's own branding): Home's
 * Play row, its accessible text (the row's title) and the legend's Cross label where it names the item, from this one
 * constant so the three cannot drift. A launcher adaptation, nothing of the game.
 */
export const PLAY_LABEL = 'Play SOCOM II';

/**
 * LR-39 (LR.R32, the owner, 2026-10-31: "the guide button should be the same as the launcher just with the agreed
 * resume"): over a game the overlay's Home is the page's, its Play row this one -- "Resume game" -- whose Cross or click
 * closes the overlay (the host's `close`, `./grammar` `doAct`), and the legend's Cross label on it. A browser adaptation.
 */
export const RESUME_LABEL = 'Resume game';

/**
 * LR-23 (LR.R22, the owner: "Start game, gone. The Play caution icon? not great. Find another way to express that"): what
 * Play still needs before it launches, the first check not ready in the launch steps' order -- the disc being read, the
 * disc not in (empty, or refused by the reader), the input START counts (the controls adapter) -- or null when Cross on
 * Play launches (`startReady`). The microphone is optional and never blocks. Over a game there is no Play.
 */
export type PlayNeed = 'reading' | 'disc' | 'controller';
export function playNeed(s: ConsoleState, a: Adapters): PlayNeed | null {
  if (startReady(s, a)) return null;
  const disc = a.disc.state();
  if (disc === 'reading') return 'reading';
  if (disc !== 'ready') return 'disc';
  return 'controller';
}

/** LR-23: the legend's Cross on Play -- "Play" when it launches, else what it still needs (the mockup's play line's sense). */
export const PLAY_NEED_WORDS: Record<PlayNeed, string> = { reading: `${PLAY_LABEL}: disc being read`, disc: `${PLAY_LABEL}: disc needed`, controller: `${PLAY_LABEL}: controller needed` };

/** LR-23: Play's own line (not drawn on the page's Home: a reader's), the mockup's `sub('play')` in the launcher's words. */
const PLAY_LINES: Record<PlayNeed, string> = { reading: 'Reading your disc…', disc: 'Disc needed', controller: 'Controller needed' };

/**
 * LR-36 (LR.R30, the owner, 2026-10-28: "pressing PLAY SOCOM 2 while controller is not connected was meant to bring up the
 * right aligned pre-launch UI that the mockup contained, not take them directly to controller setttings"): the rows of
 * Play's "Before you deploy" panel, the mockup's (S2 Launcher v2.dc.html, `case 'launch'`): the disc check, the controller
 * check, a spacer (drawn, never focused), Deploy, the "Controller settings" link. The cursor's rows, in its order. A
 * browser adaptation: the launcher's flow, nothing of the game.
 */
export const LAUNCH_DISC_ROW = 0;
export const LAUNCH_PAD_ROW = 1;
export const LAUNCH_DEPLOY_ROW = 2;
/**
 * SKIP-MENU (LR.R33, the owner, 2026-10-31: "a \"skip menu\" checkbox in the theme of it just above controller settings"):
 * the toggle row between Deploy and "Controller settings" (`./skipMenu`). A browser adaptation.
 */
export const LAUNCH_SKIP_ROW = 3;
export const LAUNCH_PADSET_ROW = 4;
/**
 * DSH-10 (the disc share plan, DSH.R17, the owner, 2026-11-10: "please also add it to the deploy screen above request
 * files, enabled when you have a disc added already"): "Send Game Files", below "Controller settings" and directly above
 * "Request Game Files (XBOX)", drawn where the page has a disc share adapter, enabled by `sendState`.
 */
export const LAUNCH_SEND_ROW = 5;
/**
 * DSH-5 (the disc share plan, DSH.R12, the owner, 2026-10-29: "the ui for it should be placed in the right aligned pre
 * launch window at the bottom below controller settings with a new component. \"Request Game Files (XBOX)\""): the
 * panel's last row, drawn where the page has a disc share adapter (`Adapters.discShare`; the launcher page's, never the
 * overlay's or the sample's). `LAUNCH_CHECK_ROWS` counts it and DSH-10's; `launchCheckRows` is the rows drawn now.
 */
export const LAUNCH_SHARE_ROW = 6;
export const LAUNCH_CHECK_ROWS = 7;

/** DSH-5, DSH-10: the panel's rows drawn now -- the send and share rows only with a disc share adapter. */
export const launchCheckRows = (a: Adapters): number => (a.discShare ? LAUNCH_CHECK_ROWS : LAUNCH_SEND_ROW);

/**
 * The extraction kept in this browser as the disc adapter reports it (`./adapters/disc` `kept`) and Settings' "Remove
 * downloaded content" row reads it (`./adapters/options` `kept.info`): its bytes, its store, and whether it is whole
 * (DSH.R7). One shape for every reader (DSH-10's `sendState` too).
 */
export interface KeptDisc { bytes: number; backend: ExtractBackend; whole: boolean }

/** DSH-10: whether the page can send its disc now, why (`SendWhy`), and the row's line and tooltip (`SEND_WORDS`). */
export interface SendState { ok: boolean; why: SendWhy; line: string; tip: string }

/**
 * DSH-10 and DSH-11 (DSH.R17; DSH.R7): the one rule for "Send Game Files" and the disc mark's "SEND DISC" -- enabled only
 * when the share adapter's `complete()` answers true (a complete extraction kept in this browser); else the reason: the
 * extraction saving now, an extraction kept but not whole, or none. A browser adaptation.
 */
export function sendState(a: Adapters): SendState {
  const why: SendWhy = a.discShare?.complete?.() === true ? 'ready'
    : a.disc.extracting?.() === true ? 'saving'
      : a.disc.kept?.() ? 'part' : 'none';
  return { ok: why === 'ready', why, ...SEND_WORDS[why] };
}

/**
 * DSH-10 (RB-27's pad map): the send area's targets, in the pad's order -- the link (Copy link) once the share is open,
 * the copy under way (Stop), then each request by id (Yes, No).
 */
export function sendTargets(v: HostView): string[] {
  return [...(v.phase === 'open' && v.link ? ['link'] : []), ...(v.active ? ['active'] : []), ...v.pending.map((r) => `req:${r.id}`)];
}

/**
 * DSH-10: the send area's focused target now -- `chk.at` while it stands (a request kept by its id as the list reorders),
 * else the one now at `chk.ix` (its request gone: the next in its place), clamped; null with none.
 */
export function sendAt(s: ConsoleState, v: HostView): string | null {
  const t = sendTargets(v);
  if (!t.length) return null;
  if (s.chk.at && t.includes(s.chk.at)) return s.chk.at;
  return t[Math.max(0, Math.min(t.length - 1, s.chk.ix ?? 0))]!;
}

/** DSH-10: L2 / R2 in the send area move this many targets (RB-27: "L2/R2 page a long list"). */
export const SEND_PAGE = 5;

/** DSH-11: whether the disc mark's menu draws "SEND DISC" -- the launcher page's, with a disc share adapter. */
export const sendInMenu = (s: ConsoleState, a: Adapters): boolean => !!a.discShare && s.mode !== 'overlay';
/** DSH-11: the disc mark's menu's rows (its pad bound): the two sources, and "SEND DISC" where it is drawn. */
export const sourceMenuRows = (s: ConsoleState, a: Adapters): number => DISC_SOURCES.length + (sendInMenu(s, a) ? 1 : 0);

/** LR-36: the panel's title, the mockup's `checkTitle`: "Ready to deploy" once Play launches, else "Before you deploy". */
export const launchCheckTitle = (s: ConsoleState, a: Adapters): string => (startReady(s, a) ? 'Ready to deploy' : 'Before you deploy');

/** LR-36: the input START counts (the controls adapter, LR-31: a pad or a touch screen; none: ready, as `startReady` reads it). */
export const inputReady = (a: Adapters): boolean => a.controls?.ready() ?? true;

/** LR-36: the row the panel opens on, the mockup's `openCheck`: the first check not ready (the disc, then the controller), else Deploy. */
export function launchCheckStart(a: Adapters): number {
  if (a.disc.state() !== 'ready') return LAUNCH_DISC_ROW;
  return inputReady(a) ? LAUNCH_DEPLOY_ROW : LAUNCH_PAD_ROW;
}

/**
 * LR-36: Deploy's line while it cannot launch (the mockup's "Disc required"; LR.R30, the dispatcher's reading: no "Deploy
 * with keyboard" -- with no controller it says to connect one) and the legend's Cross on it then (`./render/legend`).
 */
export const DEPLOY_NEED_LINES: Record<PlayNeed, string> = { reading: 'Your disc is still being read', disc: 'Disc required', controller: 'Connect a controller' };
export const DEPLOY_NEED_WORDS: Record<PlayNeed, string> = { reading: 'Deploy: disc being read', disc: 'Deploy: disc needed', controller: 'Deploy: controller needed' };

/** OVERLAY-CONSOLE: the console is over a game page (overlay mode; every page the overlay mounts on is one). */
export const overGame = (s: ConsoleState): boolean => s.mode === 'overlay' && (s.page?.gamePage() ?? true);

/** OVERLAY-CONSOLE: why sign out and the persona switch wait now (the game holds the account, a round runs), else null. */
export function sessionLock(s: ConsoleState): 'game' | 'round' | null {
  if (s.mode !== 'overlay' || !s.page) return null;
  if (s.page.gameHolds()) return 'game';
  return s.page.roundRunning() ? 'round' : null;
}

/**
 * CX-PERSONA: why the persona's edits wait now -- over any game page the card is the game's (`card`); else `sessionLock`'s.
 * The Service record and the persona screens stay readable under it.
 */
export const personaEditLock = (s: ConsoleState): PersonaLock | null => (overGame(s) ? 'card' : sessionLock(s));

/** OVERLAY-CONSOLE: a round runs under the overlay (Replays' Watch waits for its end). */
export const roundRunning = (s: ConsoleState): boolean => s.mode === 'overlay' && (s.page?.roundRunning() ?? false);

/**
 * Options' categories as the console draws them and acts on them: the adapter's, with the overlay's locks on its rows in
 * overlay mode (the kept disc's delete over a game page; Sign out while the game holds the account or a round runs; VS-2,
 * the next-match video rows while a round runs, and the launcher-only rows left out).
 * The adapter's own rows are not changed.
 */
export function optCategories(s: ConsoleState, a: Adapters): readonly OptCat[] {
  const cats = a.options.categories();
  if (s.mode !== 'overlay') return cats;
  const lock = sessionLock(s);
  const game = overGame(s);
  const round = roundRunning(s);
  return cats.map((c) => ({
    ...c,
    rows: c.rows.filter((r) => !r.launcherOnly).map((r) => {
      if (r.id === KEPT_DISC_ROW && game) return { ...r, locked: OVERLAY_LOCK_WORDS.keptDisc };
      if (r.id === 'signout' && lock) return { ...r, locked: lock === 'game' ? OVERLAY_LOCK_WORDS.signOutGame : OVERLAY_LOCK_WORDS.signOutRound };
      if (r.nextMatch && round && !r.locked) return { ...r, locked: OVERLAY_LOCK_WORDS.nextMatch };   // VS-2: the in-match overlay
      return r;
    }),
  }));
}

/** The tab order inside a family. Ids the adapter does not offer are skipped. */
const OPT_FAMILY_ORDER: Record<OptFamily, readonly string[]> = {
  game: ['display', 'audio', 'communication'],
  launcher: ['controller', 'appearance', 'app', 'account', 'mobile'],
};

/**
 * The tabs the Settings screen shows and L1/R1 walks: the current tab's family, in that family's order.
 * A tab with no family (the sample adapters) keeps the adapter's one strip.
 */
export function optTabs(s: ConsoleState, a: Adapters): readonly OptCat[] {
  const cats = optCategories(s, a);
  const family = cats[s.opt.cat]?.family;
  if (!family) return cats;
  const order = OPT_FAMILY_ORDER[family];
  return cats.filter((c) => c.family === family).sort((x, y) => {
    const ix = order.indexOf(x.id);
    const iy = order.indexOf(y.id);
    return (ix < 0 ? order.length : ix) - (iy < 0 ? order.length : iy);
  });
}

export function selectedRoom(s: ConsoleState, a: Adapters): Room | null {
  // OVERLAY-CONSOLE: the rooms are read only in overlay mode -- no launch target there.
  if (s.mode === 'overlay' || s.rooms.selected == null || !a.session.signedIn()) return null;
  // CX-LOBBIES: a game opened from a room's detail is no row of Browse rooms: the lobby names it by its id.
  return a.rooms.row?.(s.rooms.selected) ?? a.rooms.list().find((r) => r.id === s.rooms.selected) ?? null;
}

export const startLabel = (s: ConsoleState, a: Adapters): string => {
  const r = selectedRoom(s, a);
  return r ? 'Launch · ' + r.name : 'Start game';
};

/** The rooms the current filter keeps, each with its index in the whole list (`i`). */
export function visibleRooms(s: ConsoleState, a: Adapters): (Room & { i: number })[] {
  if (s.rooms.kind === BROWSE_CUSTOM) return [];                    // LR-37 (9): CUSTOM lists no classic room
  const f = a.rooms.filters()[s.rooms.filter];
  const q = s.rooms.query.trim().toLowerCase();
  return a.rooms.list().map((r, i) => ({ ...r, i }))
    .filter((r) => (f ? f.keep(r) : true) && (q === '' || r.name.toLowerCase().includes(q)));
}

/**
 * LR-37 (9; the owner, 2026-10-29: "Merge the custom lobby and browse room. Default is All. ... Options are ALL, CLASSIC,
 * CUSTOM."): Browse rooms' filter on its left. A browser adaptation: the classic rooms are the game's server's, the custom
 * matches the forge's (not part of the original game).
 */
export const BROWSE_KINDS = ['All', 'Classic', 'Custom'] as const;
export const BROWSE_CLASSIC = 1;
export const BROWSE_CUSTOM = 2;
/** LR-37 (9): the line under CUSTOM where the server lists no custom matches (no adapter, or its route refused). */
export const CUSTOM_UNAVAILABLE_LINE = 'Custom matches are not available from this server';

/** LR-37 (9): one custom match in the merged list -- the forge lobby's row, its JOIN locked over a game page. */
export interface BrowseCustomRow { kind: 'custom'; id: string; name: string; map: string; players: number; max: number; locked: boolean; inMatch: boolean; joinLocked: boolean; community?: true }

/** LR-37 (9): the custom matches the merged list shows under ALL and CUSTOM (none under CLASSIC, none unread). */
export function browseCustom(s: ConsoleState, a: Adapters): BrowseCustomRow[] {
  if (s.rooms.kind === BROWSE_CLASSIC) return [];
  const v = a.custom?.view();
  if (v?.kind !== 'ok') return [];
  const joinLocked = overGame(s);
  return v.rows.map((m) => ({ kind: 'custom', id: m.id, name: m.name, map: m.map, players: m.players, max: m.max, locked: m.locked, inMatch: m.inMatch, joinLocked, ...(m.community === true ? { community: true as const } : {}) }));
}

/** LR-37 (9): the merged list's rows -- the classic rooms the filter keeps, then the custom matches -- in focus order. */
export function browseRows(s: ConsoleState, a: Adapters): ((Room & { i: number }) | BrowseCustomRow)[] {
  return [...visibleRooms(s, a), ...browseCustom(s, a)];
}

/** LR-37 (9): whether the custom matches are shown now (their poll runs only then, MU_LOBBY_POLL_ADAPTATION). */
export const customShown = (s: ConsoleState): boolean => s.screen === 'custom' || (s.screen === 'rooms' && s.rooms.kind !== BROWSE_CLASSIC);

/**
 * The ping's band, word and bars. In milliseconds (the prototype's sample): under 80 Good, under 140 Fair, else Poor.
 * The lobby's band (`@s2u/ui` `gameListRow`, `FUN_002e2ce0` D:L184438-184452: 0 when the game has no players, else
 * GenericField2 under 300 1, under 600 2, else 3): 0 "No players" with no bars (the slice-1 review's F5), 1 Good, 2
 * Fair, 3 Poor. Neither reported (the anonymous `/rooms`): Unknown, no bars.
 */
export function pingBand(r: Pick<Room, 'pingMs' | 'pingBand' | 'pingMeasured'>): ['good' | 'fair' | 'poor' | 'none', string, number] {
  // GAME-PING (a browser adaptation): the measured ms under the original's bounds (`FUN_002e2ce0` D:L184438-184452, read
  // there on GenericField2, which the original fixes at 65000); a door with no answer is "--", never Poor.
  if (r.pingMeasured !== undefined) {
    if (r.pingMeasured === null) return ['none', '--', 0];
    const b = gamePingBand(r.pingMeasured);
    return b === 1 ? ['good', 'Good', 3] : b === 2 ? ['fair', 'Fair', 2] : ['poor', 'Poor', 1];
  }
  if (r.pingMs !== undefined) {
    const ms = r.pingMs;
    return ms < 80 ? ['good', 'Good', 3] : ms < 140 ? ['fair', 'Fair', 2] : ['poor', 'Poor', 1];
  }
  if (r.pingBand === undefined) return ['none', 'Unknown', 0];
  return r.pingBand === 0 ? ['none', 'No players', 0] : r.pingBand === 1 ? ['good', 'Good', 3] : r.pingBand === 2 ? ['fair', 'Fair', 2] : ['poor', 'Poor', 1];
}

export interface HomeItem {
  icon: IconName;
  title: string;
  sub: string;
  state?: [string, string];
  verb: string;
  act: string;
  disabled?: boolean;
  /** CX-16: the item carries the disc source's settings icon and dropdown (Home's Disc action, when the adapter has one). */
  source?: boolean;
}

/** The sign-in tiles' personas: the card's names (the sample: its one persona); Add new follows them. */
export function cardNames(a: Adapters): readonly string[] {
  if (a.card.names) return a.card.names();
  const p = a.card.persona();
  return p ? [p] : [];
}

/** The Replays category over the live list (slice 2): one item, as the ActionList README has a long collection. */
function replaysItems(v: ReplaysView): HomeItem[] {
  if (v.kind === 'signed-out') return [{ icon: 'replay', title: 'Sign in to see your replays', sub: 'The matches you played on this server appear here once you are signed in.', verb: 'Sign in', act: 'signin' }];
  if (v.kind === 'loading') return [{ icon: 'replay', title: 'Reading your replays…', sub: 'Matches you record in game appear here, newest first', verb: 'Refresh', act: 'refresh-replays' }];
  if (v.kind === 'failed') return [{ icon: 'alert', title: v.title, sub: v.words, verb: 'Try again', act: 'refresh-replays' }];
  if (v.entries.length === 0) return [{ icon: 'replay', title: 'No replays yet', sub: 'Matches you record in game appear here, newest first', verb: 'Refresh', act: 'refresh-replays' }];
  return [{ icon: 'replay', title: 'Browse replays', sub: `${replaysTally(v)}, newest first`, verb: 'Browse', act: 'replays' }];
}

/** Browser adaptation: the nested Profile > Replays screen keeps the live list's status and recovery action. */
export function replayStatus(a: Adapters): HomeItem | null {
  const v: ReplaysView = a.replays.view?.() ?? { kind: 'ok', entries: [] };
  return v.kind === 'ok' && v.entries.length > 0 ? null : replaysItems(v)[0]!;
}

/**
 * The sprint 39 close pass 2 (CX.R5: an unknown is said as unknown): the list's count. The server gives no total, so
 * while a next page stands (`more`) the count is the rows read, in the Replays section's own word for them, "loaded"
 * (`../modern/replays/view.ts` `filterView`: "Room · filters the loaded matches", "… loaded matches, in …"); with no
 * next page the list is whole and "saved".
 */
export function replaysTally(v: Extract<ReplaysView, { kind: 'ok' }>): string {
  return `${v.entries.length} ${replaysPaged(v) ? 'loaded' : 'saved'}`;
}

/** The close pass 3: the list read so far has a next page (`replaysTally`'s condition; the Home readout's label too). */
export const replaysPaged = (v: ReplaysView | undefined): boolean => v?.kind === 'ok' && v.more !== undefined;

/** The replays the list holds (the live view's rows; none otherwise). */
export const replayRows = (a: Adapters): readonly ReplayRow[] => {
  const v = a.replays.view?.();
  return v?.kind === 'ok' ? v.entries : [];
};

/** Home's Memory card line: what the card holds (slice 2: the prototype's one-persona text is its sample). */
export function cardLine(a: Adapters): string {
  if (a.card.readable && !a.card.readable()) return 'No memory card can be read';
  const n = a.card.personas();
  if (n === 0) return `Slot ${a.card.slot()} · no personas yet`;
  return `Slot ${a.card.slot()} · ${n} persona${n === 1 ? '' : 's'} · ${a.card.persona()}`;
}

/** The active disc source (CX-16): the adapter's, else the image's. */
export const discSource = (a: Adapters): DiscSource => a.disc.source?.() ?? 'image';

/**
 * CX-16: the folder source's line before a folder is chosen -- what a folder can be, in the disc-access lane's words for
 * it (DA-4: "a disc in a drive, a mounted image or a copy of the disc's files"). Its look is the owner's (H201).
 */
export const FOLDER_SOURCE_LINE = 'A drive, a mounted image or a copy of your disc’s files';

/**
 * Home's Disc action (the design's ActionList item; its table: "Disc (Ready / Choose disc / Reading)"). CX-16 (CX.R9,
 * the owner: "move DISC FOLDER into a DROPDOWN beside DISC buried in a SETTINGS icon. Only one needs/should be active to
 * launch."): one action for both sources -- CX-10a's second item, "Choose disc folder", is gone -- its verb the active
 * source's ("Choose disc" / "Change disc" for the image, the design's; "Choose disc folder" for the folder, CX-10a's) and
 * its state and line the disc's: READING, CHECK DISC with the reader's words (DA.R8's `SYSTEM.CNF` refusal for a
 * folder), READY with the open disc named (`discLabel`), else NEEDED with what the active source asks for. A disc of the
 * other source still open after a switch stays named and READY (nothing is closed until a new disc is chosen). The
 * source's settings icon sits beside it (`source`, `./render/home`).
 */
function discItem(disc: DiscState, a: Adapters): HomeItem {
  const folder = discSource(a) === 'folder';
  const kind = a.disc.kind?.() ?? 'image';
  const named = a.disc.label?.() ?? '';
  // DX-3: the kept disc's line (cleared by the browser, or not needed) leads where it applies.
  const note = a.disc.note?.() ?? '';
  // INVITE-START (FI.R8): an invite address waiting for its disc says so, before the ask.
  const waiting = a.invite?.waiting() ?? '';
  const base ={ icon: 'disc' as const, title: 'Disc', act: 'disc', verb: folder ? 'Choose disc folder' : disc === 'ready' ? 'Change disc' : 'Choose disc', ...(a.disc.setSource ? { source: true } : {}) };
  // Not in the prototype: a disc the reader refused says the reader's words once, in warn; Cross is the fix.
  if (disc === 'error') return { ...base, sub: a.disc.error?.() || (kind === 'folder' ? named : '') || 'That image could not be read', state: ['CHECK DISC', 'alert'] };
  if (disc === 'ready') return { ...base, sub: note || named || 'SOCOM II disc image loaded', state: ['READY', 'ready'] };
  if (disc === 'reading') return { ...base, sub: kind === 'folder' ? named || 'Reading your disc folder…' : 'Reading your disc image…', state: ['READING', ''] };
  const ask = folder ? FOLDER_SOURCE_LINE : 'Your SOCOM 2 ISO (or the retail disc)';
  const lead = [note, waiting].filter((l) => l !== '').join(' ');
  return { ...base, sub: lead ? `${lead} ${ask}` : ask, state: ['NEEDED', 'alert'] };
}

/**
 * The action list under a category (the prototype's `homeItems`), with OVERLAY-CONSOLE's two passes: a `todo:` act (a
 * screen with no console equivalent yet, OT.R60 (c)) is "Coming" in both modes and its Cross does nothing; in overlay
 * mode an act that chooses the disc (`disc`) is locked with its line (`lock:`), the source's cog gone; the Disc row itself
 * says the game's disc in use (`overlayDiscUse`; batch B's review F2), never NEEDED.
 */
export function homeItems(catId: string, s: ConsoleState, a: Adapters): HomeItem[] {
  return passes(rawItems(catId, s, a), s, a);
}

/**
 * LR-13 (LR.R17): the old launch steps -- Disc (its cog), Controller, Microphone -- their acts and words unchanged; the
 * same overlay passes as the list's. LR-23 (LR.R22: "The entire right side overlay for the selected category - gone"):
 * Play's "Before you deploy" panel that drew them is gone; they are the checks Play's Cross reads (`playNeed`) and the
 * Disc step's line is the legend's status chip's (`./render/legend`), its source the chip's cog.
 */
export function deployChecks(s: ConsoleState, a: Adapters): HomeItem[] {
  return passes(launchSteps(a), s, a);
}

/** The old launch steps (the list's first three items before LR-13; the overlay's Home list opened with them until LR-39). */
function launchSteps(a: Adapters): HomeItem[] {
  const pad = a.pad.connected();
  const mic = a.mic.on();
  return [
    discItem(a.disc.state(), a),
    { icon: 'pad', title: 'Controller', sub: pad ? 'Pad 1 connected' : 'Press any button on your controller', state: pad ? ['READY', 'ready'] : ['WAITING', ''], verb: 'Controller options', act: 'opt:controller' },
    { icon: mic ? 'mic' : 'micOff', title: 'Microphone', sub: a.mic.detail?.() ?? (mic ? 'Default microphone · for voice chat' : 'Optional · needed only for voice chat'), state: mic ? ['ON', a.mic.refused?.() ? 'alert' : 'ready'] : ['OFF', ''], verb: mic ? 'Turn off' : 'Turn on', act: 'mic' },
  ];
}

/** OVERLAY-CONSOLE's two passes over a list of items (`homeItems`). */
function passes(items: HomeItem[], s: ConsoleState, a: Adapters): HomeItem[] {
  const over = overGame(s);
  return items.map((x) => {
    if (over && x.act === 'disc') {
      const rest: HomeItem = { ...x };
      delete rest.source;
      const locked = { ...rest, disabled: true, act: 'lock:' + OVERLAY_LOCK_WORDS.disc };
      if (x.title !== 'Disc') return locked;
      const use = overlayDiscUse(s, a);
      return { ...locked, sub: use.sub, state: use.chip };
    }
    if (x.act.startsWith('todo:')) return { ...x, state: [COMING_WORD, ''] as [string, string] };
    return x;
  });
}

/** OVERLAY-CONSOLE: an item whose Cross does nothing now (a `todo:` gap, or a `lock:` with its line). */
export const inert = (x: Pick<HomeItem, 'act'> | undefined): boolean => !!x && (x.act.startsWith('todo:') || x.act.startsWith('lock:'));

/** LR-13/LR-14: Home's Server status item (opens the Server screen, CX-28), the page's and the overlay's alike. */
function serverStatus(t: ReturnType<Adapters['server']['totals']>, a: Adapters): HomeItem {
  // LR-23 (LR.R22: "Adopt it's icons too please" -- "for the rows"): the mockup's mark for its activity row, `monitoring`.
  return { icon: 'monitoring', title: 'Server status', sub: t ? `${countOf(t.players, 'player')} · ${countOf(t.rooms, 'room')}` : a.server.status().line, verb: 'Open', act: 'server' };
}

function rawItems(catId: string, s: ConsoleState, a: Adapters): HomeItem[] {
  const t = a.server.totals();
  const signedIn = a.session.signedIn();
  // LATER 291 (H290): the Discord link, after the rows above so they keep their places. The mark is Discord's
  // official symbol (`./discord`), not this icon — a stroke icon would take the focus colour (MU.R22's exception).
  const discord: HomeItem = { icon: 'globe', title: 'Discord', sub: 'Opens in a new tab', verb: 'Open', act: 'discord' };
  // The owner, 2026-11-12: "Add a github link beside the discord one with the same icon set on the launcher main menu".
  // GitHub's row right after Discord's, the last (the rows above keep their places); its mark is GitHub's (`./discord`).
  const github: HomeItem = { icon: 'globe', title: 'GitHub', sub: 'The public source of the client', verb: 'Open', act: 'github' };
  // LR-23's Memory card row (the mockup's `sd_card` mark) left the page's Home with LR-37 (4) and the overlay's with LR-39.
  switch (catId) {
    // LR-13 (LR.R17): the launcher page's Home is the artifact's (its home items `play`, `card`, `activity`): Play (LR-13's
    // panel and dot superseded by LR-23, below); the Memory card; Server status (the artifact's activity item, LR-2's name: the Server screen, CX-28); Discord. Over a
    // game there is no START (`startReady`), so the overlay's Home kept its own list, the steps first (LR-14, below).
    // LR-14 (LR.R18) gave the overlay its own list (the checks as rows, Memory card, Server status, Discord); superseded by
    // LR-39 (LR.R32, the owner, 2026-10-31: "the guide button should be the same as the launcher just with the agreed
    // resume"): over a game the overlay's Home is the page's list, Play replaced by Resume game (`RESUME_LABEL`), which
    // closes the overlay; there is still nothing to deploy from a running game (no START, no launch check there).
    // LR-23 (LR.R22): Play launches on Cross (`../grammar` `play`) -- its panel and its dot are gone -- and, while a check
    // is not ready, Cross opens that check; its line says which (read, not drawn: the page's Home draws no sub-line).
    case 'home': {
      const need = playNeed(s, a);
      // LR-37 (4; the owner, 2026-10-29: "Remove Memory Card from the modern launcher UI."): Home has no Memory card row
      // (its personas are the Profile's) -- since LR-39 (LR.R32) the overlay's Home neither.
      return [
      s.mode === 'overlay'
        ? { icon: 'play', title: RESUME_LABEL, sub: 'Back to the game', verb: 'Resume', act: 'resume' }
        : { icon: 'play', title: PLAY_LABEL, sub: need ? PLAY_LINES[need] : 'Ready to deploy', verb: 'Play', act: 'play' },
      serverStatus(t, a),
      discord,
      github,
      ];
    }
    // LR-37 (6, 7, 9; the owner, 2026-10-29: "Online tab should say Browse rooms, Custom matches, Server Information, Sign
    // In", then "Merge the custom lobby and browse room"): Browse rooms (the classic rooms and the custom matches, one
    // list), Server Information (CX-28's Server screen, which now holds the news the Server news row's dialog showed),
    // Sign In -- signed in, the account's row in its place.
    case 'online': return [
      { icon: 'globe', title: 'Browse rooms', sub: t ? `${countOf(t.rooms, 'room')} open · ${countOf(t.players, 'player')} online` : a.server.status().line, verb: 'Browse rooms', act: 'rooms' },
      { icon: 'server', title: 'Server Information', sub: t ? `${countOf(t.players, 'player')} · ${countOf(t.rooms, 'room')}` : a.server.status().line, verb: 'Open', act: 'server' },
      // OVERLAY-CONSOLE: the launch side of these rows is the launcher's; in overlay mode the rooms are read only.
      signedIn
        ? { icon: 'user', title: 'Signed in as ' + a.session.persona(), sub: s.mode === 'overlay' ? 'Your account on this server' : 'Rooms you pick become your launch target', verb: 'Account', act: 'cat:profile' }
        : { icon: 'user', title: 'Sign In', sub: s.mode === 'overlay' ? 'Sign in to see your account and your replays' : 'Sign in to pick a room and launch into it', verb: 'Sign in', act: 'signin' },
    ];
    case 'replays': if (a.replays.view) return replaysItems(a.replays.view());
      return a.replays.count() === 0 ? [
      { icon: 'replay', title: 'No replays yet', sub: 'Matches you record in game appear here, newest first', verb: 'Refresh', act: 'refresh-replays' },
    ] : [
      // Not drawn in the prototype (it shows only the empty list); ActionList README: "A long collection (rooms,
      // replays) is its own pushed screen, opened from one item." The screen is slice 2's.
      { icon: 'replay', title: 'Browse replays', sub: `${a.replays.count()} saved, newest first`, verb: 'Browse', act: 'todo:Browse replays' },
    ];
    case 'profile': return profileItems(s, a);
    // FORGE: browser adaptations with no original (labelled as such on their own pages), opened in a new tab.
    // FWIP (the owner, 2026-10-31: "please add a WIP label to the forge on the launcher"): Forge's tag reads WIP, in place
    // of EXPERIMENT, which the Experiments category already says; the existing item tag (`tag`, LR-20 P12).
    case 'experiments': return [
      { icon: 'hammer', title: 'Forge', sub: 'Build and fly: place the disc’s props on a map or a blank floor', state: ['WIP', 'tag'], verb: 'Open', act: 'page:Forge' },
      { icon: 'display', title: 'Test room', sub: 'The map viewer: fly any map, the grid, collision and spawns', verb: 'Open', act: 'page:Testroom' },
      // B206 ML-2 (ML.R6, OT.R110): the MODS screen, pushed (`./render/mods`). A browser adaptation, nothing of the game.
      { icon: 'package', title: 'Mods', sub: 'Drop mod packs and texture packs; switch them on or off, choose the texture pack', verb: 'Open', act: 'mods' },
    ];
    case 'options': return [
      // LATER 294, layout A (Dustin, 2026-10-28): Game and Launcher. The Theme drop-up stays; whether it goes is still open.
      { icon: 'cog', title: 'Game', sub: 'Display, sound and the card’s options', verb: 'Open', act: 'opt:display' },
      { icon: 'pad', title: 'Launcher', sub: 'Controller, appearance and this app', verb: 'Open', act: 'opt:controller' },
      themePicks(a).length
        ? { icon: 'palette', title: 'Theme', sub: themePicks(a).find((r) => r.pick?.picked)?.label ?? '', verb: 'Choose', act: 'themes' }
        : { icon: 'palette', title: 'Appearance', sub: 'Theme, background, clock and sounds', verb: 'Open', act: 'opt:appearance' },
    ];
  }
  return [];
}

/** Browser launcher adaptation: one account action model for Profile and its mouse disclosure. */
export function profileItems(s: ConsoleState, a: Adapters): HomeItem[] {
  const signed = a.session.signedIn();
  const lock = sessionLock(s);
  const out = lock === 'game' ? OVERLAY_LOCK_WORDS.signOutGame : OVERLAY_LOCK_WORDS.signOutRound;
  return [
    { icon: 'record', title: 'Service record', sub: signed ? 'Your career on this server' : 'Sign in to see your record', verb: signed ? 'Open' : 'Sign in', act: signed ? (a.profile ? 'record' : 'todo:Service record') : 'signin' },
    { icon: 'replay', title: 'Replays', sub: 'Your recorded matches, newest first', verb: 'Open', act: 'replays' },
    { icon: 'armory', title: 'Loadouts', sub: 'Choose a side, then a mission', verb: 'Open', act: 'loadout-sides' },
    { ...(lock && !a.profile ? { disabled: true } : {}), icon: lock ? 'lock' : 'user', title: 'Profiles', sub: lock ? (lock === 'game' ? OVERLAY_LOCK_WORDS.personaGame : OVERLAY_LOCK_WORDS.personaRound) : cardLine(a), verb: 'Open', act: a.profile ? 'persona' : lock ? 'lock:' + (lock === 'game' ? OVERLAY_LOCK_WORDS.personaGame : OVERLAY_LOCK_WORDS.personaRound) : 'todo:Profiles' },
    signed ? lock ? { icon: 'lock', title: 'Sign out', sub: out, disabled: true, verb: 'Sign out', act: 'lock:' + out }
      : { icon: 'signout', title: 'Sign out', sub: 'Your memory card is not changed', verb: 'Sign out', act: 'signout' }
      : { icon: 'user', title: 'Sign in', sub: 'Connect to your account on this server', verb: 'Sign in', act: 'signin' },
  ];
}

/** The side chooser stays navigable without a disc or session; choosing a side explains the prerequisite. */
export function loadoutSideItems(a: Adapters): HomeItem[] {
  return (['seal', 'terrorist'] as const).map((side) => ({
    icon: 'armory', title: side === 'seal' ? 'SEAL' : 'Terrorist',
    sub: a.disc.state() !== 'ready' ? 'Choose your disc to read mission loadouts' : !a.session.signedIn() ? 'Sign in to read your loadouts' : 'Mission loadouts kept with your account',
    verb: a.disc.state() !== 'ready' ? 'Choose disc' : !a.session.signedIn() ? 'Sign in' : 'Open',
    act: a.disc.state() !== 'ready' ? 'disc' : !a.session.signedIn() ? 'signin' : a.loadouts ? 'loadouts:' + side : 'todo:Loadouts',
  }));
}

/** CX-28 (CX.R14): the Server screen's rows -- status, then whatever `pages()` still offers (Report a problem, over a game). */
export function serverItems(a: Adapters): HomeItem[] {
  const t = a.server.totals();
  const st = a.server.status();
  return [
    { icon: 'server', title: 'Server status', sub: t ? `${st.line} · ${countOf(t.players, 'player')} · ${countOf(t.rooms, 'room')}` : st.line, state: [st.word, st.ready ? 'ready' : st.alert === false ? '' : 'alert'], verb: 'Refresh', act: 'refresh-server' },
    ...a.server.pages().map((p) => ({ icon: p.icon, title: p.name, sub: p.sub, verb: p.verb, act: p.act ?? 'page:' + p.name })),
  ];
}

/**
 * CX-14: the mapping screen's rows: the Stance mode (PP-5, OT.R67; first since STANCE-TOP, the owner, 2026-11-02: "move
 * stance mode to the top"); in SEPARATE only, the Crouch and Prone binds directly under it -- STM-1 (STM.R1, the owner,
 * 2026-10-30: "only when SEPARATE is selected should the two separate bindings show for prone and crouch"; STM.R1a: in
 * COMBINED kept, hidden), under the switch since SEP-ROWS (the owner, 2026-11-11: "please open them directly under the
 * special setting switch"); then the dead zone (DEAD-UP, the owner, 2026-11-03: "can we move stick dead zone up below
 * stance mode"), the sixteen logical buttons (`../startupSettings` `PAD_BUTTON_NAMES`, from `remapActionRow` to
 * `remapActionEnd`), then the extra rows (`remapExtras`). A row's number is its place on the screen in the mode drawn, so
 * every row under the binds' is a function of the mode; the rows a mode shows are `remapOwnRows`: the focus, the d-pad's
 * steps, a click and the extras all count from it (OBF-11's flag and its fixed 19 retired with STM.R1). A mode changed
 * under the screen keeps the focus on the same row (`normalize`, `remapRowAcrossModes`). A browser adaptation (OT.R28).
 */
export const REMAP_STANCE_ROW = 0;
/** STM.R1, SEP-ROWS: the Crouch and Prone binds' rows, directly under the Stance mode, in SEPARATE only. */
export const REMAP_CROUCH_ROW = REMAP_STANCE_ROW + 1;
export const REMAP_PRONE_ROW = REMAP_CROUCH_ROW + 1;
/** DEAD-UP, SEP-ROWS: the Pad dead zone (this browser) row -- under the Stance mode in COMBINED, under Prone in SEPARATE. */
export const remapDeadRow = (mode: StanceMode = controllerStanceMode()): number => (mode === 'separate' ? REMAP_PRONE_ROW + 1 : REMAP_STANCE_ROW + 1);
/** STANCE-TOP, DEAD-UP: the first action's row (Cross); action `i` is row `remapActionRow() + i`. The screen opens on it. */
export const remapActionRow = (mode: StanceMode = controllerStanceMode()): number => remapDeadRow(mode) + 1;
/** The row past the sixteenth action (Right): the first of the extras. */
export const remapActionEnd = (mode: StanceMode = controllerStanceMode()): number => remapActionRow(mode) + 16;
/** The action a row binds (0-15), or -1 for a row that is not an action's. */
export const remapActionOfRow = (row: number, mode: StanceMode = controllerStanceMode()): number => {
  const first = remapActionRow(mode);
  return row >= first && row < first + 16 ? row - first : -1;
};
/** The screen's own rows in `mode` (the saved one by default): 18 in COMBINED, 20 in SEPARATE (STM.R1). */
export const remapOwnRows = (mode: StanceMode = controllerStanceMode()): number => remapActionEnd(mode);
/**
 * SEP-ROWS: the row that stands for `row` once the mode has changed from `from` to `to` -- the same row (the Stance mode,
 * the dead zone, an action, an extra) at its new number; a bind's row that `to` hides gives the switch it hangs from.
 */
export function remapRowAcrossModes(row: number, from: StanceMode, to: StanceMode): number {
  if (from === to || row <= REMAP_STANCE_ROW) return row;
  const shift = remapDeadRow(to) - remapDeadRow(from);
  if (from === 'separate' && row < remapDeadRow(from)) return REMAP_STANCE_ROW;
  return row + shift;
}
/**
 * OBF-10b's review (1; players use a controller only): the rows after the screen's own, each an action the pad reaches
 * with the d-pad and Cross (and a click): Teach again, for a pad of another layout read through a layout (taught, or
 * built in -- a wrong built-in entry is undone by it). A browser adaptation (OT.R28).
 */
export type RemapExtra = 'extras' | 'addDouble' | 'addCombo' | `bind:${number}` | 'teach' | 'pressureConnect' | 'finish';
export function remapExtras(b: PadBinding | null): RemapExtra[] {
  if (!b) return [];
  // h59U9CLb (a browser adaptation, off by default): Extra binds, with a pad the screen can bind -- one row, folded; open,
  // its two Add rows and a row per extra kept (`PadBinding.extraList`), before Teach again, Connect and Finish.
  const extras: RemapExtra[] = !b.usable() ? [] : [
    'extras', ...(b.extrasOpen ? ['addDouble' as const, 'addCombo' as const, ...b.extraList().map((_, i) => `bind:${i}` as const)] : []),
  ];
  // OBF-13 (the owner: "Add a finish button to controller binding UI for people"): Finish, always the last row. PS2P: the
  // WebHID Connect only on Chromium with a 054c:0268 pad (`PadBinding.pressureConnectable`); Phil's per-pad "Triangle
  // pressure" toggle is gone (shown for every pad, it sent a DualSense's every Triangle press prone).
  return [
    ...extras,
    ...(!b.teachState() && b.teachable() && b.usable() ? ['teach' as const] : []),
    ...(b.pressureConnectable() ? ['pressureConnect' as const] : []),
    'finish',
  ];
}
/** The rows on the mapping screen now: its own in the mode now (STM.R1), then the extra rows. */
export const remapRowCount = (b: PadBinding | null): number => remapOwnRows() + remapExtras(b).length;
/** The extra row at `row`, or null for one of the screen's own (STM.R1: they follow the mode's last own row). */
export function remapExtraAt(b: PadBinding | null, row: number): RemapExtra | null {
  const own = remapOwnRows();
  return row < own ? null : remapExtras(b)[row - own] ?? null;
}

/** CX-LOADOUTS: the editor's rows -- the type (0), the five slots (1-5), then Save (this one). */
export const LOADOUT_SAVE_ROW = 6;

/**
 * CX-PERSONA: the persona editor's rows -- Home town (`PERSONA_TOWN_ROW`), Gender (`PERSONA_GENDER_ROW`), the card's five
 * taunts and five team messages (2-11), Delete (`PERSONA_DELETE_ROW`): `PERSONA_EDIT_ROWS` in all.
 */
export const PERSONA_TOWN_ROW = 0;
export const PERSONA_GENDER_ROW = 1;
export const PERSONA_PHRASE_ROW = 2;
export const PERSONA_DELETE_ROW = 12;
export const PERSONA_EDIT_ROWS = 13;
/** CX-PERSONA: the new persona's rows: Name, Home town, Gender (`PERSONA_NEW_GENDER_ROW`), Create (`PERSONA_NEW_CREATE_ROW`). */
export const PERSONA_NEW_GENDER_ROW = 2;
export const PERSONA_NEW_CREATE_ROW = 3;
export const PERSONA_NEW_ROWS = 4;

/** CX-LOADOUTS: the mission list's rows (its missions and the records not offered), none while it is locked, read or refused. */
export const loadoutRows = (a: Adapters): readonly LoadoutMission[] => {
  const v = a.loadouts?.list();
  return v?.kind === 'ok' ? v.rows : [];
};

/**
 * DSH-5, the disc share review's N3: the share area collapsed by any path (the panel shut, another category, a Home item
 * clicked behind it, an overlay) withdraws a request no device has answered -- requesting or waiting -- as Circle does
 * (`grammar.ts` `closeShare`); a copy under way goes on. Collapsed first, so the adapter's change notice finds it shut.
 */
function dropShare(s: ConsoleState, a: Adapters): void {
  if (!s.chk.share) return;
  s.chk.share = false;
  const phase = a.discShare?.receiver().phase;
  if (phase === 'requesting' || phase === 'waiting') a.discShare!.cancel();
}

/**
 * DSH-10 (RB-26's Q10 default; DSH.R9: no standing listener): the send area shut by any path (the panel shut, another
 * category, a Home item clicked behind it, the launch arming) ends the share as Circle does (`closeHost`). Shut first,
 * so the adapter's change notice finds it shut.
 */
function dropSend(s: ConsoleState, a: Adapters): void {
  if (!s.chk.send) return;
  s.chk.send = false;
  s.chk.copy = undefined;
  a.discShare?.closeHost?.();
}

/** Clamps the focus indices to what is on screen (the prototype did this inside `renderHome` / `renderRooms`). */
export function normalize(s: ConsoleState, a: Adapters): void {
  if (!CATS[s.cat]) s.cat = HOME_CATEGORY;
  const cat = CATS[s.cat];
  if (cat) {
    const items = homeItems(cat.id, s, a);
    s.item[s.cat] = Math.max(0, Math.min(s.item[s.cat] ?? 0, items.length - 1));
    // LR-13: a pushed Settings panel stands only on the Settings screen.
    if (s.opt.panel && s.screen !== 'options') delete s.opt.panel;
    // LR-13: the theme drop-up stands only over Settings' Theme item, on the home screen, with nothing over the page.
    if (s.thm.open && !(s.screen === 'home' && !s.overlay && cat.id === 'options' && items[s.item[s.cat] ?? 0]?.act === 'themes')) s.thm.open = false;
    s.thm.row = Math.max(0, Math.min(Math.max(0, themePicks(a).length - 1), s.thm.row));
    // CX-16: the source dropdown is open only on Home, with nothing over the page: LR-23 (LR.R22) on the launcher page
    // from the legend's disc mark (LR-24; LR-23's chip and its cog), whatever the category (the disc step has a source); over a game page's overlay over
    // the Disc item it belongs to, focused.
    const cog = s.mode !== 'overlay' ? !!deployChecks(s, a)[0]?.source : !!items[s.item[s.cat] ?? 0]?.source;
    if (s.src.open && !(s.screen === 'home' && !s.overlay && cog)) s.src.open = false;
    // LR-36 (LR.R30): Play's "Before you deploy" panel stands only over the launcher page's Home, on its Home category,
    // with nothing over the page; its cursor on one of its rows. Once the launch is ready while it is open (a pad woke),
    // the cursor moves to Deploy, once (the mockup's `autoF`, S2 Launcher v2.dc.html `componentDidUpdate`).
    // DSH-10 (Q11): the question Deploy asks while the send area's share is busy stands over the panel, which stays; so
    // does the one Circle asks while a copy runs (the review's F2).
    const asking = s.overlay === 'confirm' && (s.confirmKind === 'share-deploy' || s.confirmKind === 'share-close');
    if (s.chk.open && !(s.screen === 'home' && (!s.overlay || asking) && s.mode !== 'overlay' && cat.id === 'home')) s.chk.open = false;
    if (!s.chk.open) { dropShare(s, a); dropSend(s, a); }
    if (s.chk.open) {
      s.chk.row = Math.max(0, Math.min(launchCheckRows(a) - 1, s.chk.row));
      // DSH-5: the share area stands only on its row, with an adapter to read.
      if (s.chk.share && !(a.discShare && s.chk.row === LAUNCH_SHARE_ROW)) dropShare(s, a);
      // DSH-10: the send area likewise on its own row; its focus kept on its target (by id), else on the place it held.
      if (s.chk.send && !(a.discShare?.host && s.chk.row === LAUNCH_SEND_ROW)) dropSend(s, a);
      if (s.chk.send && a.discShare?.host) {
        const v = a.discShare.host();
        const at = sendAt(s, v);
        if (at !== null) { s.chk.at = at; s.chk.ix = sendTargets(v).indexOf(at); }
      }
      if (!s.chk.auto && startReady(s, a)) { s.chk.auto = true; s.chk.row = LAUNCH_DEPLOY_ROW; }
    }
  }
  // OVERLAY-CONSOLE fold 2: while the list is read again (a refresh: the view `loading`, no rows) the row waits for it,
  // rather than fall to the first row on every route (the pad's Square and the keyboard's F alike); then it is clamped.
  if (s.screen === 'replays' && a.replays.view?.()?.kind !== 'loading') s.rp.row = Math.max(0, Math.min(s.rp.row, replayRows(a).length - 1));
  // CX-14: the mapping screen stands only over an open binding machine; its focus on one of its rows.
  if (s.screen === 'remap' && !a.remap?.current()) s.screen = 'options';
  if (s.screen === 'remap') {
    // SEP-ROWS: the rows under the switch move with the mode, so a mode changed under the screen (its own switch, the
    // pressure default, Restore) keeps the focus on the row it was on, never on whatever row took that number.
    const mode = controllerStanceMode();
    if (s.rm.mode && s.rm.mode !== mode) s.rm.row = remapRowAcrossModes(s.rm.row, s.rm.mode, mode);
    s.rm.mode = mode;
    s.rm.row = Math.max(0, Math.min(s.rm.row, remapRowCount(a.remap?.current() ?? null) - 1));
  }
  // CX-LOADOUTS: the loadouts screens stand only over a loadouts adapter; an editor whose mission the list no longer holds
  // (a new offer relisted it) goes back to the list; each screen's focus on one of its rows.
  const lo = a.loadouts;
  if ((s.screen === 'loadouts' || s.screen === 'loadout') && !lo) s.screen = 'home';
  if (s.screen === 'loadout' && lo && lo.editor().kind === 'gone') { lo.close(); s.screen = 'loadouts'; }
  if (s.screen === 'loadouts') s.lo.row = Math.max(0, Math.min(s.lo.row, loadoutRows(a).length - 1));
  if (s.screen === 'loadout') s.lo.edit = Math.max(0, Math.min(s.lo.edit, LOADOUT_SAVE_ROW));
  if (s.screen === 'rooms') {
    s.rooms.kind = Math.max(0, Math.min(BROWSE_KINDS.length - 1, s.rooms.kind));
    const n = browseRows(s, a).length;                                // LR-37 (9): the merged list
    if (s.rooms.row >= n) s.rooms.row = Math.max(0, n - 1);
  }
  // The live lobby keeps the launch target (and drops it when its game goes): the page reads it from there.
  if (a.rooms.selected) s.rooms.selected = a.rooms.selected();
  // CX-28: the Server screen's focus on one of its rows.
  if (s.screen === 'server') s.sv.row = Math.max(0, Math.min(s.sv.row, Math.max(0, serverItems(a).length - 1)));
  // B206 ML-2: the MODS screen's focus on one of its rows.
  if (s.screen === 'mods') s.md.row = Math.max(0, Math.min(s.md.row, modsRowCount(a) - 1));
}
