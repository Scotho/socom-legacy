import { mapDisplayName } from '@s2u/archive/mapNames';
import { NARROW_PX } from '../../console/fit';
import { ico as cxIco, P as CX_MARKS, type IconName as CxIconName } from '../../console/icons';
import { loadKindOf, REPLAY_NEWER_VERSION, type ReplayLoadKind } from '../../replay/refusalKind';
import type { IconName } from '../icons';
import { durationText, type ReplayEntry, type ReplayListFailure, type ReplayResult } from './data';
import { mountReplayHud, type ReplayHud } from './hud';
import { mountKeysList, type KeysList } from './keysList';
import type { ReplayStage, ReplayStageContext, ReplayStageHandle, SpectatorPress } from './stage';
import { HELD_STATUS, mountTransport, type Transport, type TransportClient } from './transport';
import {
  REPLAY_BOOST_DOUBLE_TAP_MS_ADAPTATION, rowOf, sameSteer, STEER_CODES, steerOf, VIEWER_CAMERA_KEYS, VIEWER_LOOK_KEYS, VIEWER_STEER_KEYS, viewerCode,
  type SteerPart, type ViewerCamera,
} from './viewerKeys';
import { REPLAY_STEER_IDLE, type ReplaySteerHeld } from './worldHost';
import { worldStage } from './worldStage';

/**
 * The replay viewer (MU-10 of `docs/plans/2026-10-09-modern-ui-parallel.md`; MU.R9; the dialogue's D2.9 the viewer, D7's
 * "the viewer full-bleed with a bottom transport bar ... and a camera-mode switch top right"). A browser adaptation
 * (MU.R1, REPLAY_ADAPTATION), labelled as one: SOCOM II records no match and plays none back; the test room's replay
 * mode stays as it is for the developers.
 *
 * **The viewer** (`./stage`, `./worldStage`, `./transport`): `mountReplayViewer` opens the replay on the existing
 * client through the stage -- by default the match's world drawn by the game page's own room, framed here (MU-11) -- the
 * transport bar under it driving the client's own API; the client's roster (its last `players` record, restored on a
 * seek) beside it; the spectator's camera modes as icon buttons when the stage offers them. A redraw for the same state
 * keeps the viewer's element, so its focus and its keys survive. RV-3 (W39.R3; research 276 §2): once the recording is
 * open the focus goes from the viewer's box to the seek bar, so the keys, the D-pad's jump and the walk start in the
 * transport; Back, by Escape or its button, asks the caller's `onClose`.
 *
 * **Its caller** (RV-12, web sprint 39; the console plan's CX-15; research 276 §13): the console launcher's Watch, which
 * opens it over its page (`../../console/adapters/replays`) and decides what Circle is, where the focus goes back and
 * when the disc's absence locks it. The modern Replays section that opened it in its own body (`mountReplays`: the
 * list, its paging and room filter, Square's Refresh, the disc's lock and a sign-out followed) was retired by CX-26 (the
 * console plan), reached by no page since CX-25; the console's Replays category is the list now. This module also keeps
 * the words that category says from here: the list's failures (`REPLAY_LIST_FAILURE_WORDS`), a record's result
 * (`resultWords`) and Watch under a running round (`REPLAY_ROUND_WORDS`, `../../console/grammar`).
 *
 * **RV2-04 (the replay viewer redesign, RV2.R4; `docs/plans/2026-11-02-replay-viewer-redesign.md` §2): the chrome is the
 * console's.** The viewer is drawn in the console's classes on the design system's tokens (`../../console/replay.css`):
 * the screen head (`.cx-screenhead`: the crumb -- Back to Replays, the one return control, LR.R19 -- then the map and its
 * chips, the facts line and the record's score; RB-32 below); the world full-bleed with the camera
 * strip over its corner (`.cx-kinds`, the console's icons) and the loading lamp while the client is held (RV2.R2); the
 * roster in the right aside (`.cx-player` tiles); the transport's mount point under the world (`data-transport`, the
 * bar RV2-05's); the refusals and the disc's lock as the console's empty blocks (`.cx-empty`). The viewer's own Back
 * button and the transport's hint row are gone: Back is the crumb and the console's Circle and Escape, and the console's
 * legend names the focused control. The `data-*` hooks are the contract (RV2.R7): `data-viewer`, `data-status`,
 * `data-camera`, `data-roster`, `data-team`, `data-world`, `data-field`, `data-locked`, `data-refusal*`. A browser
 * adaptation (OT.R53, product track): nothing of the game is drawn here but what the stage frames.
 *
 * **RV2-08 (the RV2 plan §2 "Phone"): the phone and the short landscape.** At the console's phone rule (`NARROW_PX`,
 * its sheets' `(width > 760px)` and below) and its short landscape (`PHONE_SHORT_PX`, `(max-height: 550px) and
 * (orientation: landscape)`), read each frame as the sheets read them (`phoneLayout`): the head is one line, and at its
 * end two chips of the console's kind (`.cx-kind`) -- Players with the count (`data-roster-toggle`, `data-roster-count`),
 * whose `.cx-dropup` is the roster, and the camera (`data-camera-toggle`, the current mode's mark and word), whose
 * dropup is the camera strip; one dropup open at a time, a mode pressed closes its dropup and gives the chip the focus;
 * the transport in three lines with the snapshot steps not drawn (`Transport.layout`). A closed dropup and a chip not
 * drawn are `hidden`, so the console's pad walk passes them. The root says which layout it is in (`data-layout`:
 * `phone`, `wide`). The sheets draw it (`../../console/replay.css`, `../../console/replay-transport.css`).
 *
 * **RB-32 (the replay batch, `docs/plans/2026-11-08-replay-batch.md`; the owner's S2 Launcher v2 export, RB.R3, its
 * viewer head `D:248-274`): the head is the design's.** The crumb "‹ Replays / Replay" (its chevron, the word, the
 * page; no mark between); the map in the label face at `clamp(32px, 5.2vh, 48px)`; beside it the mode chip, drawn only
 * when the entry names a mode (`ReplayEntry.mode`), and the Partial recording chip (`data-field="partial"`), moved here
 * from the transport and shown once the open recording is partial (`client.partial()`, read each frame); the facts line
 * "date · length · {rules} rules · n players" (`data-field="facts"`, each part its own field); at the head's end, when
 * the record holds a result, its label (`resultLabel`) over the big score "SEALs x – y Terrorists" (`data-field=
 * "score"`, named by `resultWords`). The head enters once, from -28px, at its first drawing only (`data-enter`; the
 * sheet's animation, none under reduced motion). A browser adaptation (OT.R53, product track): nothing of the game.
 *
 * **RB-34 (the export's world HUD `D:284-320`): the HUD over the world** (`./hud`): mounted in the world box with the
 * stage's client, drawn each frame with the rest, taken away with the stage; the transport hands it the seek note
 * (`onSeekNote`), its toast the one note. The persona is the session's player name while a ticket is held.
 *
 * **RVK-B: the keyboard and the mouse, every camera, every build** (LATER 966, V21.R7; the owner, 2026-11-12: "The replay
 * mode should be fully navigable with keyboard and mouse. Every view."; a browser adaptation with no original). The
 * viewer's one table (`./viewerKeys`) is read on the viewer's own element -- never the window, since the viewer also opens
 * in the overlay over a game page -- wherever the caller's `keys` says (both callers' default: true):
 * - *The keys*: the transport's (`./transport`); 1 / 2 / 3 the strip's cameras; X, the arrows and C the spectator's own
 *   controls (`SpectatorControls.press`), acted on at their release as the spectator's own keys are
 *   (SPECTATOR_RELEASE_READING, `../../spectatorView`); W A S D E Q and the Shift arrows held on the world's camera
 *   (`SpectatorControls.steer`, `steerOf`: FREE flies, SCENIC zooms and looks, PLAYER takes them and does nothing); `?`
 *   the keys list (`./keysList`); Escape Back, the open keys list first. Never with Ctrl, Alt or Meta; a typed field keeps
 *   its keys; the focused seek bar keeps its arrows (`SEEK_BAR_KEYS`); Enter and Space on a focused control are its own.
 * - *The world surface* (`data-surface`): a parent element over the framed world, under the HUD and the strip, which
 *   takes the mouse's press, drag and wheel and keeps the keyboard's focus in this page, so the keys and Escape always
 *   work after a click on the picture; its drag looks and its wheel trims FREE's speed or zooms SCENIC
 *   (`SpectatorControls.look`, `notch`); in PLAYER they do nothing and the wheel scrolls the page. **Touch as before**: on
 *   a device whose primary pointer is coarse (`(pointer: coarse)`, read as the viewport changes) the surface is not drawn
 *   (`hidden`), so a finger reaches the framed world's own touch layer and drag look as it did.
 * - *Something to click for each action*: the strip's context buttons (`data-press`) -- in PLAYER the previous / next
 *   player and the player in view, in SCENIC the previous / next view -- real buttons, so the pad's walk reaches them;
 *   the strip's and the transport's buttons take no focus from a mouse press (Space stays play / pause), Tab reaches each.
 * - *Let go*: a held key released, the viewer's focus lost, the window's blur or the page hidden zero the lane.
 *
 * Every server string -- a name, a map, the rules, a mode, a refusal -- is set as text, never as markup.
 */

/**
 * RV2-04: the camera strip's words for the stage's modes (§2: PLAYER · FREE · SCENIC), each in its mode's accessible
 * name (`./worldStage` `CAMERA_MODES`); a mode not named here shows its label. The viewer's own words (no original).
 * PV-8 (PV.R6): the player's view's, "Player's View" (the strip's styling does the capitals); its refusal's sentence is
 * the stage's (`./worldStage` REPLAY_POV_REFUSED_ADAPTATION, answered through `SpectatorControls.refused`).
 */
const CAMERA_WORDS: Readonly<Record<string, string>> = { follow: 'Player', pov: "Player's View", free: 'Free', scenic: 'Scenic' };

/**
 * ROSTER_DEAD_ADAPTATION, ROSTER_ABSENT_ADAPTATION (RVK-A, LATER 966): why a player's name in the roster cannot put the
 * camera on that player now -- the body dead at the playhead, or not in the match there. The viewer's own words, a
 * browser adaptation with no original (the replay viewer has none).
 */
export const ROSTER_DEAD_ADAPTATION = 'Dead at this point in the recording.';
export const ROSTER_ABSENT_ADAPTATION = 'Not in the match at this point.';

/**
 * RV2-08: the short landscape's greatest height (`../../console/console.css` `(max-height: 550px) and (orientation:
 * landscape)`), beside the console's phone width (`../../console/fit` `NARROW_PX`). A browser adaptation's measure.
 */
export const PHONE_SHORT_PX = 550;

/**
 * RV2-08: whether a `w` x `h` viewport takes the viewer's phone layout -- the console's phone rule (`w <= NARROW_PX`) or
 * its short landscape (`h <= PHONE_SHORT_PX`, wider than tall), as the sheets' media queries read the same viewport.
 */
export function phoneLayout(w: number, h: number): boolean {
  return w <= NARROW_PX || (h <= PHONE_SHORT_PX && w > h);
}

/** RV2-08: each viewer's own ids (the chips' `aria-controls`). */
let viewerSerial = 0;

/** RV2-08: the open view's parts the phone layout moves or shows: the head, the aside, the world, the chips and their rows. */
interface ViewerParts {
  head: HTMLElement; aside: HTMLElement; world: HTMLElement; chips: HTMLElement;
  rosterRow: HTMLElement; rosterToggle: HTMLButtonElement; rosterCount: HTMLElement;
  strip: HTMLElement | null; cameraRow: HTMLElement | null; cameraToggle: HTMLButtonElement | null;
}

/** RV2-04 (RV2.R2): whether the stage's client is held; a client with no hold (a test's, a stage without a world) is not. */
const heldOf = (c: TransportClient): boolean => {
  const held = (c as Partial<{ held(): boolean }>).held;
  return typeof held === 'function' && held.call(c) === true;
};

/**
 * MU2-10: the words for Watch under a running round. The modern UI's own (no original; the design has no "needs ..."
 * line for a round): the default of an H-next row, for the owner's word.
 */
export const REPLAY_ROUND_WORDS = 'Watching a replay needs the round to end';

/**
 * MU2-13: why a replay opened in the viewer does not play -- `version` (its file of another network protocol or file
 * format than this build plays: an older protocol's record, refused never misdecoded), `corrupt` (its file does not
 * parse), `missing` (the match server's 404: not found, or not yours to watch -- W36.R2 tells them apart for nobody),
 * `unavailable` (any other: no answer, the world did not open). A browser adaptation's state (MU.R1). MU2-14: the
 * loader's own kind (`../../replay/refusalKind`), which a `ReplayLoadError` carries as data.
 */
export type ReplayRefusalKind = ReplayLoadKind;

/**
 * MU2-13: each refusal's title and line, drawn above the loader's own sentence (kept verbatim: it names the versions).
 * The modern UI's own words -- the design names no such state (the Briefing export's Replays: the list, Refresh,
 * "Needs disc"; the console design's "No replays yet" and "Watching a replay needs your disc") -- the plan's H-next row
 * for the owner's word.
 */
export const REPLAY_REFUSAL_WORDS: Readonly<Record<ReplayRefusalKind, readonly [string, string]>> = {
  version: ['Recorded by another version', 'This replay was recorded by a version of the game server this page does not play.'],
  corrupt: ['This replay cannot be played', 'Its file is damaged or incomplete.'],
  missing: ['Replay not found', 'It is no longer kept on the match server, or it is not yours to watch.'],
  unavailable: ['The replay did not open', 'Go back and watch it again.'],
};

/**
 * MU2-13: the refusal's kind, read from the existing loader's sentence for the player (`../../replay/load`
 * `ReplayLoadError`, `refusal`, `decodeSegment`, `REPLAY_NOT_FOUND_OR_NOT_YOURS`), which the client's `refused` event and
 * a stage's rejection carry as text only. Read by its words, not imported: this module keeps the loader (and the
 * format's decoders) out of the list's chunk until a replay is opened (`./stage`). `./states.test.ts` makes each
 * sentence with the loader itself, so a sentence changed there fails there.
 *
 * MU2-14: the fallback only. The viewer reads the kind as data first -- the client's `refusedKind` at its `refused`
 * event, a stage's rejection's `ReplayLoadError.kind` (`loadKindOf`) -- and sorts the words only for a reason that has
 * none. The reasons that remain text-only: the world stage's own (`./worldStage`: the test room's failure, "The match's
 * world could not open: ...", and its timeout, "... did not open within ... seconds"), a client's map `check`
 * ("This recording is of map ..."), a stage that fails with an error not the loader's, a response body cut after its
 * headers (`../../replay/load` `loadSegment`'s `res.arrayBuffer()` rejects with the platform's `TypeError`, not a
 * `ReplayLoadError`, so the real `ReplayClient` refuses with no kind), and a client that keeps no kind (a test's fake).
 * Each of those sorts as `unavailable` today, unless its words match a sentence below.
 */
const REFUSAL_SENTENCES: readonly (readonly [RegExp, ReplayRefusalKind])[] = [
  [/^This recording was made with network protocol \d+;/, 'version'],
  [/^This recording's file format is version \d+;/, 'version'],
  [/^This replay is from a newer version: reload the page\.$/, 'version'],      // FL-2b: REPLAY_NEWER_VERSION
  [/^This recording was not found on the match server, or it is not yours to watch\.$/, 'missing'],
  [/^(This recording is damaged|The recording is not a readable gzip file|This file is not a replay recording|The recording is empty|The recording holds no whole record yet)/, 'corrupt'],
];
export function replayRefusalKind(reason: string): ReplayRefusalKind {
  for (const [sentence, kind] of REFUSAL_SENTENCES) if (sentence.test(reason)) return kind;
  return 'unavailable';
}

/**
 * FL-2b: a refusal's title and line -- its kind's (`REPLAY_REFUSAL_WORDS`), but a recording newer than this build reads
 * (`REPLAY_NEWER_VERSION`, the loader's sentence) has its own title and no line: the sentence, drawn as the alert under
 * the title, says what to do (reload the page), and the kind's line ("a version ... this page does not play") would
 * contradict it. The modern UI's own words (MU2-13's).
 */
export function refusalWords(kind: ReplayRefusalKind, why: string): readonly [string, string | null] {
  if (kind === 'version' && why === REPLAY_NEWER_VERSION) return ['Recorded by a newer version', null];
  return REPLAY_REFUSAL_WORDS[kind];
}

/**
 * The list's three failures: their mark, title and line. MU2-13: exported so the console's Replays category says them
 * from this one table (`../../console/adapters/replays`), not a copy.
 */
export const REPLAY_LIST_FAILURE_WORDS: Readonly<Record<ReplayListFailure, readonly [IconName, string, string]>> = {
  unreachable: ['offline', 'Server unreachable', 'The match server did not answer. Check the connection and try again.'],
  'not-kept': ['replay', 'No replays on this server', 'This match server does not keep recordings.'],
  refused: ['alert', 'The list could not be read', 'The match server refused the request. Try again.'],
};

/** RV-4: the sides as research 91 names them (`aiteam_00` SEALs, `aiteam_08` Terrorists; the roster's words below). */
const SIDE_WORDS = { seal: 'SEALs', terrorist: 'Terrorists' } as const;

/**
 * RV-4: a result's words -- the match's winner when the room ended the match (GAME COMPLETE's rule: the side with more
 * rounds won; on equal rounds no winner, its caption " " on both sides; `CallRoundATie`, research 91 §18, 2.2 and 3;
 * `../../roundScreens.ts` GAME COMPLETE), the rounds each side won, and how the record ended.
 */
export function resultWords(r: ReplayResult): string {
  const parts: string[] = [];
  if (r.matchOver) {
    const won = r.wins.seal > r.wins.terrorist ? 'seal' : r.wins.terrorist > r.wins.seal ? 'terrorist' : null;
    if (won) parts.push(`${SIDE_WORDS[won]} won`);
  }
  parts.push(`${SIDE_WORDS.seal} ${r.wins.seal} – ${r.wins.terrorist} ${SIDE_WORDS.terrorist}`);
  parts.push(r.matchOver ? 'Match over' : 'Cut short');
  return parts.join(' · ');
}

/**
 * RB-32: the result's label over the head's score (the export's `D:263`, its words ours): the match's winner by
 * `resultWords`' rule (only when the room ended the match, on unequal rounds), then how the record ended.
 */
export function resultLabel(r: ReplayResult): string {
  const won = !r.matchOver ? null : r.wins.seal > r.wins.terrorist ? 'seal' : r.wins.terrorist > r.wins.seal ? 'terrorist' : null;
  return [...(won ? [`${SIDE_WORDS[won]} won`] : []), r.matchOver ? 'Match over' : 'Cut short'].join(' · ');
}

const localDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** The viewer's element makers over `doc` (an element with its class and text, a mark of the console's set). */
function makers(doc: Document) {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  /**
   * RV2-04: a mark of the console's set (`../../console/icons`, LR.R9), parsed from the set's own constant markup -- never
   * a server string; a name the set lacks draws its screen.
   */
  const ico = (name: string, cls = ''): SVGSVGElement => {
    const t = doc.createElement('template');
    t.innerHTML = cxIco((Object.hasOwn(CX_MARKS, name) ? name : 'display') as CxIconName, cls);
    return t.content.firstElementChild as SVGSVGElement;
  };
  /**
   * RV2-04: the disc's lock when it leaves an open replay -- the console's "Needs disc" (its Replays rows' and drawer's
   * words), the line under it: being read, else "Insert your disc to watch" (MU2-13's fold, the controller's call for
   * the owner to overturn, kept) -- as the console's empty block.
   */
  const lockBlock = (reading: boolean): HTMLElement => {
    const n = el('div', 'cx-empty cx-replay__state');
    n.dataset['locked'] = '';
    const title = el('span', 'cx-item__title', 'Needs disc');
    title.dataset['lockTitle'] = '';
    const line = el('span', 'cx-item__sub', reading ? 'Your disc is being read' : 'Insert your disc to watch');
    line.dataset['lockLine'] = '';
    n.append(ico('lock', 'cx-replay__state-icon'), title, line);
    return n;
  };
  return { el, ico, lockBlock };
}

export interface ReplayViewerOptions {
  /** Where the replay opens; absent, the match's world on the existing client (`./worldStage`, MU-11). */
  stage?: ReplayStage;
  /** What the stage opens it with: the account requests' base, the session's ticket, the watcher's name, a `fetch`. */
  context: ReplayStageContext;
  /** The frame scheduler; absent, `requestAnimationFrame`. */
  frame?: (run: () => void) => void;
  /** A record's start as words; absent, the browser's locale. */
  formatDate?: (iso: string) => string;
  /**
   * The viewer's lock's words (`lock`): whether the disc is being read now, else "Insert your disc to watch" (the
   * console's Replays rows say the design's "Needs disc"). Absent, never.
   */
  discReading?: () => boolean;
  /**
   * RV-12 review (OT.R29, CX.R6): whether a key reaches the viewer. False and it takes no key (no Escape for Back, no
   * transport or camera key, no keys list) and names none (`../replays/transport` `keys`) -- but Back's Escape, named in
   * every build since OT.R62 (the console's own Escape closes the viewer, `../../console/input`). Absent, true. RVK-B: in
   * every build (the module's doc).
   */
  keys?: boolean;
  /**
   * Back -- its button, or Escape on the viewer -- asked: the caller takes the viewer away (`dispose`) and puts the focus
   * where the replay was opened from (the console's row).
   */
  onClose: () => void;
  /**
   * LCM-RP's render fold (`../../console/render/replayPublic`): the word Back says -- where `onClose` goes. Absent,
   * "Replays" (the launcher's Watch). A browser adaptation.
   */
  backLabel?: string;
}

export interface ReplayViewer {
  readonly entry: ReplayEntry;
  /** The viewer's element now (rebuilt when the stage opens, the disc leaves or a failure is said); null once disposed. */
  root(): HTMLElement | null;
  /** Draws it into its host: a redraw for the same state keeps the element (its focus, its keys, its bar). */
  draw(): void;
  /** The disc taken out: the stage closed, the lock said in its place. */
  lock(): void;
  locked(): boolean;
  /** Back, as its button asks it: `onClose`. */
  close(): void;
  /**
   * RVK-B (the controller's ruling B): the console's Circle -- and so its Escape -- asks this first: an inner layer of the
   * viewer (the open keys list) takes the press and closes, true; nothing open, false, and the console closes the viewer.
   */
  back(): boolean;
  /** Closes the stage and takes the viewer's element away; `onClose` is not called. */
  dispose(): void;
}

/**
 * The viewer (MU-10, MU-11, RV-2, RV-3) on its own, in `host` (RV-12, web sprint 39; the console plan's CX-15): the
 * replay `entry` opened through the stage -- by default the match's world framed here -- the transport bar under it
 * driving the client's own API, the client's roster beside it, the spectator's camera modes when the stage offers them,
 * and Back. The console launcher opens it over its page (`../../console/adapters/replays`): the focus on the viewer's
 * box and, once the recording is open, handed once to the seek bar (RV-3); Escape on the viewer and Back's button ask
 * `onClose`; the caller decides what Circle is (the console's own). A browser adaptation (MU.R1, REPLAY_ADAPTATION):
 * SOCOM II plays no recording back.
 */
export function mountReplayViewer(host: HTMLElement, entry: ReplayEntry, o: ReplayViewerOptions): ReplayViewer {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;
  const stage = o.stage ?? worldStage();
  const frame = o.frame ?? ((run: () => void): void => { win.requestAnimationFrame(run); });
  const formatDate = o.formatDate ?? localDate;
  const { el, ico, lockBlock: lockBlockOf } = makers(doc);
  const lockBlock = (): HTMLElement => lockBlockOf(o.discReading?.() ?? false);
  const keys = o.keys ?? true;

  /**
   * RVK-B (the module's doc): the keys held on the world's camera (by code: the letters, and the Shift arrows' look), the
   * double tap's boost and its last press, what the lane was last told, the spectator presses waiting for their release,
   * the keys list, the world surface and its drag, and whether the primary pointer is coarse.
   */
  const steerKeys = new Set<string>();
  const lookKeys = new Set<string>();
  let boost = false;
  let forwardPressed = Number.NEGATIVE_INFINITY;
  let steerSent: ReplaySteerHeld = REPLAY_STEER_IDLE;
  const pressDown = new Map<string, SpectatorPress>();
  /**
   * The RVK-B fold (finding 2): the code each physical key (`e.code`) was read as at its keydown (`viewerCode`), so its keyup
   * lets go of the same code though NumLock was toggled while it was held (a numpad key types a digit or a key by NumLock).
   */
  const downCode = new Map<string, string>();
  let keysList: KeysList | null = null;
  let surface: HTMLElement | null = null;
  let drag: { id: number; x: number; y: number } | null = null;
  const coarse = win.matchMedia?.('(pointer: coarse)') ?? null;

  let handle: ReplayStageHandle | null = null;
  let transport: Transport | null = null;
  let hud: ReplayHud | null = null;                        // RB-34
  let error: string | null = null;
  let locked = false;
  /** The viewer drawn, and what it was drawn for: a redraw for the same state keeps it (its focus, its keys, its bar). */
  let root: HTMLElement | null = null;
  let drawn = '';
  /** The client's refusal, kept here: its `refused` event fires once, and the bar may be built after it. */
  let refusal: string | null = null;
  /** MU2-13: the refusal drawn as the viewer's state (its kind and words), once the client said it. */
  let refused: string | null = null;
  /** MU2-14: the kind as data, beside `error` (the stage's rejection's) and `refused` (the client's); null: by the words. */
  let errorKind: ReplayRefusalKind | null = null;
  let refusedKind: ReplayRefusalKind | null = null;
  let off: (() => void) | null = null;
  /** RV-3: the focus has been handed from the viewer's box to the seek bar once. */
  let handed = false;
  let disposed = false;
  /**
   * RV2-08: the open view's parts the layout moves (null in a state's view), the layout applied and to which root, and
   * which dropup is open.
   */
  let parts: ViewerParts | null = null;
  let phone = false;
  let laid: HTMLElement | null = null;
  let rosterOpen = false;
  let camerasOpen = false;
  let cameraShown = '';
  const serial = ++viewerSerial;

  const closeStage = (): void => {
    letGo();                                                 // RVK-B: nothing held past the stage
    transport?.dispose();
    transport = null;
    hud?.dispose();
    hud = null;
    off?.();
    off = null;
    handle?.dispose();
    handle = null;
  };
  const back = (): void => { if (!disposed) o.onClose(); };

  let rosterShown = '';
  function loop(): void {
    if (disposed || !handle) return;
    handle.client.advance();
    transport?.render();
    hud?.render();
    handFocus();
    drawRoster();
    syncCameras();
    syncFollow();                                          // RVK-A: the roster's pressed and refused names
    syncSteer();                                           // RVK-B: the held keys on the camera the strip shows now
    syncSurface();
    syncKeysButton();                                      // RVK polish: the Keys button where a keyboard may be
    drawLamp();
    drawPartial();
    applyLayout();
    frame(() => { loop(); });
  }

  /**
   * RV-3: once, when the recording is open and the focus is still the viewer's box, it goes to the seek bar -- a walker's
   * control, where the keys still work (`./transport`) and the D-pad's left and right jump. RV2-04: found by its hook
   * (RV2.R7), the bar being RV2-05's.
   */
  function handFocus(): void {
    if (handed || !root || doc.activeElement !== root) return;
    const seek = root.querySelector<HTMLInputElement>('[data-seek] input[type="range"]');
    if (!seek || seek.disabled) return;
    handed = true;
    seek.focus({ preventScroll: true });
  }

  /**
   * MU-11: the camera buttons follow the mode, which the world's own keys may change too (RV2-04: and their lit mark;
   * RV2-08: and the phone's camera chip, the mode's mark and word).
   */
  function syncCameras(): void {
    const modes = handle?.spectator;
    if (!modes || !root) return;
    const now = modes.current();
    stripNow = now;
    if (noteAt !== null && now !== noteAt) sayNote(null);    // PV-RVK F2: the camera moved, by whatever path -- the line gone
    for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-camera]')) {
      const id = b.dataset['camera']!;
      const on = id === now;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-current', on);
      // PV-8 (PV.R6): a camera the stage refuses now -- drawn `aria-disabled` only (the review's F4: no `disabled`, so it keeps
      // its place in the tab order and its sentence stays reachable), its sentence its title and description; a camera chosen
      // but fallen back this frame -- marked (`data-camera-waiting`). Neither touches a button the stage never names.
      const why = modes.refused?.(id) ?? null;
      const refusedNow = b.getAttribute('aria-disabled') === 'true';
      if (why !== null && (!refusedNow || b.title !== why)) {
        b.setAttribute('aria-disabled', 'true');
        b.setAttribute('aria-description', why);
        b.title = why;
      } else if (why === null && refusedNow) {
        b.removeAttribute('aria-disabled');
        b.removeAttribute('aria-description');
        const m = modes.modes.find((x) => x.id === id);
        b.title = m ? cameraTitle(m) : b.title;              // PV-RVK: its rest title, its key with it (`camerasView`)
      }
      const back = on && (modes.fallback?.(id) ?? false);
      if (b.hasAttribute('data-camera-waiting') !== back) b.toggleAttribute('data-camera-waiting', back);
    }
    for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-press]')) {   // RVK-B: the camera's own context buttons
      // PV-RVK (ruling 3): the player's view is a follow -- PLAYER's buttons (previous / next player, the player in view) its own
      const show = b.dataset['for'] === now || (b.dataset['for'] === 'follow' && now === 'pov');
      if (b.hidden === show) b.hidden = !show;
    }
    const chip = parts?.cameraToggle;
    if (chip && cameraShown !== now) {
      cameraShown = now;
      const m = modes.modes.find((x) => x.id === now);
      const word = CAMERA_WORDS[now] ?? m?.label ?? now;
      chip.replaceChildren(ico(m?.icon ?? 'display'), el('span', 'cx-label', word));
      chip.setAttribute('aria-label', `Camera: ${word}`);
      chip.title = `Camera: ${word}`;
    }
  }

  /**
   * RV2-08: the layout the viewport asks for (`phoneLayout`), applied when it changes or the view is rebuilt: on a phone
   * the chips drawn, the aside not, the roster in its chip's dropup and the camera strip in its chip's, the transport's
   * snapshot steps not drawn; on a desktop all back where RV2-04 drew them, every dropup closed.
   */
  function applyLayout(): void {
    if (!root) return;
    const now = phoneLayout(win.innerWidth, win.innerHeight);
    if (laid === root && now === phone) return;
    laid = root;
    phone = now;
    root.dataset['layout'] = phone ? 'phone' : 'wide';
    if (!phone) { rosterOpen = false; camerasOpen = false; }
    if (parts) {
      parts.chips.hidden = !phone;
      parts.aside.hidden = phone;
      if (phone) parts.rosterRow.append(roster); else parts.aside.append(roster);
      roster.classList.toggle('cx-dropup', phone);
      roster.classList.toggle('is-below', phone);
      if (parts.strip && parts.cameraRow) {
        if (phone) parts.cameraRow.append(parts.strip); else parts.world.append(parts.strip);
        parts.strip.classList.toggle('cx-dropup', phone);
        parts.strip.classList.toggle('is-below', phone);
      }
    }
    transport?.layout(phone);
    applyOpen();
  }

  /** RV2-08: the dropups' state drawn: a closed one `hidden` (the pad's walk passes it), its chip's `aria-expanded`. */
  function applyOpen(): void {
    if (!parts) return;
    roster.hidden = phone && !rosterOpen;
    parts.rosterToggle.setAttribute('aria-expanded', String(phone && rosterOpen));
    if (parts.strip && parts.cameraToggle) {
      parts.strip.hidden = phone && !camerasOpen;
      parts.cameraToggle.setAttribute('aria-expanded', String(phone && camerasOpen));
    }
  }

  /**
   * PV-RVK (ruling 2; a browser adaptation): the strip's status line -- a refused camera's sentence, said when its key is
   * pressed (`chooseCamera`); hidden otherwise. The review's F2: its own class and place, directly under the camera strip
   * (`../../console/replay.css`, `.cx-replay__camera-note`), clear of the loading lamp and the kill feed; gone as soon as a
   * camera is chosen by any path -- a key, the strip's click, a roster name, a spectator's control, the world itself
   * (`syncCameras`) -- and at the viewer's end. No listener, no tab stop, no `data-status` (the transport's and the
   * lamp's hook); its text written only when it changes.
   */
  const cameraNote = el('p', 'cx-replay__camera-note');
  cameraNote.dataset['cameraNote'] = '';
  cameraNote.setAttribute('role', 'status');
  cameraNote.hidden = true;
  /** The camera the strip showed at its last sync, and the one it showed when the note was said (null: nothing said). */
  let stripNow: string | null = null;
  let noteAt: string | null = null;
  function sayNote(why: string | null): void {
    const text = why ?? '';
    if (cameraNote.textContent !== text) cameraNote.textContent = text;
    if (cameraNote.hidden !== (why === null)) cameraNote.hidden = why === null;
    noteAt = why === null ? null : stripNow ?? '';
  }

  /** RV2-04 (RV2.R2): the loading lamp over the world, shown while the stage's client is held. */
  const lamp = el('p', 'cx-replay__lamp');
  lamp.dataset['status'] = '';
  lamp.setAttribute('role', 'status');
  lamp.append(el('span', 'cx-replay__lamp-dot'), HELD_STATUS);
  lamp.hidden = true;
  function drawLamp(): void {
    const held = handle !== null && heldOf(handle.client);
    if (lamp.hidden === held) lamp.hidden = !held;
  }

  /**
   * RB-32: the head's Partial recording chip (the export's `D:257-259`), moved from the transport: one element, put in
   * each head drawn, shown while the open recording is partial (the transport's own reading of `client.partial()`).
   */
  const partialChip = el('span', 'cx-replay__chip-tag cx-replay__chippartial', 'Partial recording');
  partialChip.dataset['field'] = 'partial';
  partialChip.title = 'The recording was cut before its end';
  partialChip.hidden = true;
  function drawPartial(): void {
    const c = handle?.client;
    const on = c !== undefined && c.state === 'open' && c.partial();
    if (partialChip.hidden === on) partialChip.hidden = !on;
  }
  /** RB-32: the head enters once (`data-enter`), at its first drawing; a rebuild's head stands. */
  let entered = false;

  /**
   * RVK-B: what the held keys hold on the camera the strip shows now (`steerOf`), told to the stage's lane only when it
   * changes -- at each key, each frame (a camera changed under a held key) and at the let-go.
   */
  function syncSteer(): void {
    const modes = handle?.spectator;
    if (!modes?.steer) return;
    const camera = modes.current();
    const map = (VIEWER_STEER_KEYS as Readonly<Record<string, Readonly<Record<string, SteerPart>>>>)[camera] ?? {};
    const parts = new Set<SteerPart>();
    for (const c of steerKeys) { const p = map[c]; if (p) parts.add(p); }
    for (const c of lookKeys) { const p = VIEWER_LOOK_KEYS[c]; if (p) parts.add(p); }
    const held = steerOf(camera, parts, boost && steerKeys.has('KeyW'));
    if (sameSteer(held, steerSent)) return;
    steerSent = held;
    modes.steer(held);
  }

  /** RVK-B: every held key let go, the presses waiting dropped, the drag ended, the lane told nothing is held. */
  function letGo(): void {
    steerKeys.clear();
    lookKeys.clear();
    pressDown.clear();
    downCode.clear();
    boost = false;
    drag = null;
    if (sameSteer(steerSent, REPLAY_STEER_IDLE)) return;
    steerSent = REPLAY_STEER_IDLE;
    handle?.spectator?.steer?.(REPLAY_STEER_IDLE);
  }

  /**
   * RVK-B: a camera of the strip chosen by its key, as its button's press. PV-RVK (ruling 2): a camera the stage refuses
   * now (the player's view on a recording or a page without it) is what its button is there -- nothing pressed, nothing
   * kept -- and its key says the stage's sentence, the one the button carries (`refused`), in the strip's status line
   * (`cameraNote`) until a camera is next chosen: never a silent nothing.
   */
  function chooseCamera(id: ViewerCamera): void {
    const modes = handle?.spectator;
    if (!modes || !modes.modes.some((m) => m.id === id)) return;
    const why = modes.refused?.(id) ?? null;
    sayNote(why);
    if (why !== null) return;
    modes.set(id);
    syncCameras();
    syncSteer();
  }

  /** RVK-B: one of the spectator's own controls pressed (its key's release, a context button), then the strip drawn. */
  function pressSpectator(p: SpectatorPress): void {
    const modes = handle?.spectator;
    if (!modes?.press) return;
    sayNote(null);                                           // PV-RVK F2: a control pressed -- the refusal's line gone
    modes.press(p);
    syncCameras();
    syncFollow();
    syncSteer();
  }

  /** RVK-B: the world surface not drawn on a coarse primary pointer (touch as before); drawn again when it is fine. */
  function syncSurface(): void {
    if (!surface) return;
    const off = coarse?.matches === true;
    if (surface.hidden !== off) { surface.hidden = off; if (off) drag = null; }
  }

  /**
   * RVK polish (v0.4.21; the rendered phone view showed KEYS at the head of a phone): the keys list's button drawn only
   * where a keyboard may be. The signal is the one this viewer already trusts for its input class, the coarse primary
   * pointer the world surface reads (`coarse`, `(pointer: coarse)`, polled each frame -- no listener): a phone or a tablet
   * has no button (`hidden`: Tab and the console's pad walk pass it), a desktop, a laptop with a touch screen (a fine
   * primary pointer) and a television with a pad keep it. The `?` key opens the list wherever a key arrives (a tablet with
   * a keyboard attached loses nothing but the button). A browser adaptation.
   * The review's N1 (the controller's ruling, 2026-11-13): a pad keeps the button -- the one place that lists the
   * controller's reach is reachable by the controller (`./keysList`) -- so it hides on a coarse pointer only while no pad
   * is connected. The pads are `navigator.getGamepads()` read in this same frame's sync (no listener, and only when the
   * pointer is coarse), as the Forge reads "a pad connected" (`../../forge/page.ts` `padConnected`): the console's own pad
   * poll is not handed to the viewer, which the public replay page mounts with no console. A pad connecting brings the
   * button back on the next frame; disconnecting hides it again (the focus kept, `./keysList` `showButton`).
   */
  function syncKeysButton(): void {
    keysList?.showButton(coarse?.matches !== true || padConnected());
  }
  /** N1: whether a pad is connected now (`navigator.getGamepads()`; none without the API or on its throw). */
  function padConnected(): boolean {
    try {
      const nav = win.navigator as Navigator & { getGamepads?: () => ArrayLike<Gamepad | null> };
      return Array.from(nav.getGamepads?.() ?? []).some((g) => g?.connected === true);
    } catch { return false; }
  }

  const TYPED = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
  /** RVK-B: the camera the strip shows now, or null with no camera controls. */
  const cameraNow = (): string | null => handle?.spectator?.current() ?? null;

  /** RVK-B: the viewer's keys (the module's doc), on its own box; the transport's are its own listener's beside it. */
  function onViewerKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape') {
      // An Escape already taken (a dialog's, the fold's) is not Back's too: one press closes one thing -- the keys list first.
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (keysList?.isOpen()) keysList.close();
      else back();
      return;
    }
    const t = e.target as HTMLElement | null;
    const onBar = t?.matches?.('[data-seek] input[type="range"]') === true;
    if (t && !onBar && (TYPED.has(t.tagName) || t.isContentEditable)) return;   // a typed field keeps its keys
    if (e.key === '?') {
      e.preventDefault();
      if (!e.repeat) keysList?.toggle();
      return;
    }
    // The review's finding 3: Enter and Backspace on the viewer's box or the world surface -- no control there -- are taken
    // and do nothing, so the console's every-build menu keys (Enter as Cross, Backspace as Circle) never press a control
    // the user cannot see nor close the viewer unasked. On a control they stay that control's (its own activation).
    if ((e.key === 'Enter' || e.key === 'Backspace') && (t === e.currentTarget || t?.matches?.('[data-surface]') === true)) {
      e.preventDefault();
      return;
    }
    const modes = handle?.spectator;
    if (!modes) return;                                      // no camera: the transport's keys alone
    const code = viewerCode(e);                              // finding 6: a numpad key as what it types
    if (!downCode.has(e.code)) downCode.set(e.code, code);   // the fold's finding 2: its keyup reads this code (repeats keep it)
    const arrow = Object.hasOwn(VIEWER_LOOK_KEYS, code);
    if (arrow && onBar) return;                              // the focused bar's own arrows (`SEEK_BAR_KEYS`)
    if (arrow && e.shiftKey) {                               // Shift: the arrows look (FREE, SCENIC); taken in PLAYER
      e.preventDefault();
      lookKeys.add(code);
      syncSteer();
      return;
    }
    if (STEER_CODES.has(code)) {                             // W A S D E Q: held on the camera, taken in every camera
      e.preventDefault();
      if (code === 'KeyW' && !steerKeys.has('KeyW')) {       // the press, not the OS repeat: the double tap's boost
        const now = Date.now();
        boost = now - forwardPressed < REPLAY_BOOST_DOUBLE_TAP_MS_ADAPTATION;
        forwardPressed = now;
      }
      steerKeys.add(code);
      syncSteer();
      return;
    }
    const act = Object.hasOwn(VIEWER_CAMERA_KEYS, code) ? VIEWER_CAMERA_KEYS[code]! : null;
    if (!act) return;
    if (act.kind === 'camera') {
      e.preventDefault();
      if (!e.repeat) chooseCamera(act.camera);
    } else if (act.kind === 'press') {
      e.preventDefault();                                    // taken now; acted on at its release (the spectator's rule)
      if (modes.press && !e.repeat) pressDown.set(code, act.press);
    }
  }

  /** RVK-B: a held key let go; a spectator press acted on at its key's release. */
  function onViewerKeyUp(e: KeyboardEvent): void {
    const code = downCode.get(e.code) ?? viewerCode(e);      // the fold's finding 2: the code its keydown read
    downCode.delete(e.code);
    let changed = false;
    if (steerKeys.delete(code)) { changed = true; if (code === 'KeyW') boost = false; }
    if (lookKeys.delete(code)) changed = true;
    if (changed) { e.preventDefault(); syncSteer(); }
    const p = pressDown.get(code);
    if (p === undefined) return;
    pressDown.delete(code);
    e.preventDefault();
    pressSpectator(p);
  }

  /** RVK-B: the window's blur or the page hidden: no key up will come, so everything held is let go. */
  const onWinBlur = (): void => { letGo(); };
  const onVisibility = (): void => { if (doc.hidden) letGo(); };
  win.addEventListener('blur', onWinBlur);
  doc.addEventListener('visibilitychange', onVisibility);

  /**
   * RVK-B: the world surface over the framed world (the module's doc): a press takes the focus here (never the frame's),
   * a primary press's drag looks, the wheel trims or zooms -- in FREE and SCENIC; in PLAYER the drag does nothing and
   * the wheel is the page's.
   */
  const surfaceView = (): HTMLElement => {
    const s = el('div', 'cx-replay__surface');
    s.dataset['surface'] = '';
    s.tabIndex = -1;                                         // focusable by a press, not a Tab stop
    s.addEventListener('pointerdown', (e) => {
      if (s.hidden) return;                                  // a coarse pointer's device: not drawn, nothing taken
      s.focus({ preventScroll: true });
      if (e.button !== 0) return;
      e.preventDefault();                                    // no text selected by the drag
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { s.setPointerCapture?.(e.pointerId); } catch { /* not captured: the drag ends at the release still */ }
    });
    s.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const cam = cameraNow();
      if ((cam === 'free' || cam === 'scenic') && (dx !== 0 || dy !== 0)) handle?.spectator?.look?.(dx, dy);
    });
    const end = (e: PointerEvent): void => { if (drag?.id === e.pointerId) drag = null; };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('lostpointercapture', end);
    s.addEventListener('blur', () => { letGo(); });
    s.addEventListener('wheel', (e) => {
      const cam = cameraNow();
      const notch = handle?.spectator?.notch;
      if (s.hidden || (cam !== 'free' && cam !== 'scenic') || !notch || e.deltaY === 0) return;   // PLAYER: the page scrolls
      e.preventDefault();
      notch(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    return s;
  };

  const roster = el('ul', 'cx-replay__roster');
  roster.dataset['roster'] = '';
  roster.id = `cx-replay-roster-${serial}`;
  roster.setAttribute('aria-label', 'Players in the recording');
  /**
   * RV-4, RV2-04: the client's roster as the console's player tiles -- the side's dot (SEALs, Terrorists; none for a
   * spectator), the person or an eye for a spectator, the name as text, the side's word, and a bot's "Bot" chip.
   * RVK-A (LATER 966, V21.R7; the owner, 2026-11-12: "Clicking a name in the replays should allow you to jump to that
   * characters view"; a browser adaptation): with a stage that follows a body (`SpectatorControls.follow`), a player's
   * tile is a real button in its row (`data-follow`, the id) -- the mouse, the keyboard's focus with Enter and Space
   * (the browser's own activation; the transport takes neither on a button), the pad's walk (`button`) and its Cross --
   * that puts the camera on that player; a spectator's row stays text (no body to follow). Its pressed and refused
   * states are `syncFollow`'s, each frame, on the same nodes.
   */
  function drawRoster(): void {
    const c = handle?.client;
    const players = c && c.state === 'open' ? c.roster() : [];
    const modes = handle?.spectator;
    const follows = typeof modes?.follow === 'function';
    const key = JSON.stringify([follows, ...players.map((p) => [p.id, p.name, p.team, p.role, p.bot === true])]);
    if (key === rosterShown) return;
    rosterShown = key;
    if (parts) {                                             // RV2-08: the phone's chip names the count
      parts.rosterCount.textContent = String(players.length);
      parts.rosterToggle.setAttribute('aria-label', `Players (${players.length})`);
    }
    roster.replaceChildren(...players.map((p) => {
      const button = follows && p.role === 'player';
      const li = el('li', button ? 'cx-replay__row' : 'cx-player cx-replay__player');
      const tileRow = button ? el('button', 'cx-player cx-replay__player cx-replay__follow') : li;
      tileRow.dataset['team'] = p.team ?? 'none';
      const tile = el('span', 'cx-player__tile');
      tile.append(ico(p.role === 'player' ? 'user' : 'eye'));
      if (p.team === 'seal' || p.team === 'terrorist') tile.append(el('span', 'cx-player__dot'));
      const side = el('span', 'cx-replay__side', p.team === 'seal' ? SIDE_WORDS.seal : p.team === 'terrorist' ? SIDE_WORDS.terrorist : 'Spectating');
      side.dataset['side'] = '';
      tileRow.append(tile, el('span', 'cx-player__name', p.name), side);
      if (p.bot === true) {
        const bot = el('span', 'cx-replay__bot', 'Bot');
        bot.dataset['bot'] = '';
        tileRow.append(bot);
      }
      if (button) {
        const b = tileRow as HTMLButtonElement;
        b.type = 'button';
        b.dataset['follow'] = String(p.id);
        // RVK-B's fold of the RVK-A review (F1): its name a sentence, not its spans glued ("Follow <name>, <side>", ", Bot"),
        // which the console's legend reads (`../../console/adapters/replays` `focused`)
        b.setAttribute('aria-label', `Follow ${p.name}, ${side.textContent ?? ''}${p.bot === true ? ', Bot' : ''}`);
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('mousedown', (e) => { e.preventDefault(); });   // RVK-B: a mouse press leaves the focus where it was
        b.addEventListener('click', () => { followRow(b, p.id); });
        li.append(b);
      }
      return li;
    }));
    syncFollow();
  }

  /**
   * RVK-A: a name's press -- read at the press (the playhead may have moved since the last frame), refused rows
   * moving nothing -- then the strip and the rows drawn at once.
   */
  function followRow(b: HTMLButtonElement, id: number): void {
    const modes = handle?.spectator;
    if (!modes?.follow) return;
    syncFollow();
    if (b.getAttribute('aria-disabled') === 'true') return;
    sayNote(null);                                           // PV-RVK F2: a name pressed -- the refusal's line gone
    modes.follow(id);
    syncCameras();
    syncFollow();
  }

  /**
   * RVK-A: each player's button says, on the same node every frame (the list's DOM is not rebuilt, so a focused row or
   * a press in progress survives), whether it is the body the page follows (`aria-pressed`) and whether the page could
   * follow it now -- a dead or absent body's refused (`aria-disabled`, never `disabled`: it stays reachable, as a refused
   * camera does) with its reason as `title` and `aria-description` (`ROSTER_DEAD_ADAPTATION`, `ROSTER_ABSENT_ADAPTATION`).
   * Written only when it changes.
   */
  function syncFollow(): void {
    const modes = handle?.spectator;
    if (!modes?.follow) return;
    const followed = modes.followed?.() ?? null;
    for (const b of roster.querySelectorAll<HTMLButtonElement>('button[data-follow]')) {
      const id = Number(b.dataset['follow']);
      const pressed = String(id === followed);
      if (b.getAttribute('aria-pressed') !== pressed) b.setAttribute('aria-pressed', pressed);
      const can = modes.canFollow?.(id) ?? 'yes';
      // RVK-B (F3): 'wait' -- the world's page not attached yet -- neither refused nor followable: no reason, a press kept
      if (b.hasAttribute('data-wait') !== (can === 'wait')) b.toggleAttribute('data-wait', can === 'wait');
      const why = can === 'dead' ? ROSTER_DEAD_ADAPTATION : can === 'absent' ? ROSTER_ABSENT_ADAPTATION : null;
      if (why === null) {
        if (b.hasAttribute('aria-disabled')) { b.removeAttribute('aria-disabled'); b.removeAttribute('title'); b.removeAttribute('aria-description'); }
      } else if (b.getAttribute('aria-description') !== why) {
        b.setAttribute('aria-disabled', 'true');
        b.title = why;
        b.setAttribute('aria-description', why);
      }
    }
  }

  /**
   * RV2-04: the screen head, the console's (`../../console/render/head.ts`' drawing): the crumb -- Back to Replays, the
   * viewer's one return control (LR.R19), then the page's name. RB-32 (the export's `D:248-274`): the map as the title,
   * the mode chip when the entry names a mode, the Partial recording chip, the facts line, and the record's score under
   * its label when it holds a result.
   */
  const headView = (): HTMLElement => {
    const head = el('header', 'cx-screenhead cx-replay__head');
    if (!entered) { entered = true; head.dataset['enter'] = ''; }   // RB-32: the entrance, once
    const text = el('div', 'cx-screenhead__text');
    const crumb = el('div', 'cx-crumb');
    const backBtn = el('button', 'cx-back');
    backBtn.type = 'button';
    // RV2.R7's hook for the crumb's Back (the RV2 batch review's F8): `data-back`, not a `data-action` -- those are the
    // transport's, whose `back` is the step back
    backBtn.dataset['back'] = '';
    const backWord = o.backLabel ?? 'Replays';
    backBtn.setAttribute('aria-label', `Back to ${backWord}`);   // the visible word kept in the name
    // MODAL-CLOSE's fold (MISSION OT.R62, the owner, 2026-10-17): Escape closes the viewer in every build -- the console's
    // own Escape (`../../console/input`) when the viewer is open over it -- so Back names it whatever `keys` says. Circle
    // is the console's Close, named by its legend.
    backBtn.setAttribute('aria-keyshortcuts', 'Escape');
    backBtn.title = `Back to ${backWord}`;
    // RB-32: "‹ REPLAYS / REPLAY" (`D:251-253`): the chevron and the word, no mark between
    backBtn.append(ico('left', 'cx-back__chevron'), el('span', 'cx-back__label', backWord));
    backBtn.addEventListener('click', back);
    const here = el('span', 'cx-crumb__here', ' / Replay');
    here.setAttribute('aria-hidden', 'true');
    crumb.append(backBtn, here);
    const line = el('div', 'cx-replay__titleline');
    const title = el('h2', 'cx-title');
    const map = el('span', 'cx-replay__map', mapDisplayName(entry.map));   // MN-1 (OT.R113): the map's name, never its stem
    map.dataset['field'] = 'map';
    title.append(map);
    line.append(title);
    if (entry.mode !== undefined) {                          // RB-32: no mode chip without a mode
      const mode = el('span', 'cx-replay__chip-tag cx-replay__chipmode', entry.mode);
      mode.dataset['field'] = 'mode';
      line.append(mode);
    }
    line.append(partialChip);
    drawPartial();
    // RB-32: the facts line (`D:261-263`): "date · length · {rules} rules · n players", each part its own field
    const facts = el('p', 'cx-screenhead__desc');
    facts.dataset['field'] = 'facts';
    const part = (field: string, words: string): HTMLElement => {
      const e = el('span', 'cx-replay__fact', words);
      e.dataset['field'] = field;
      return e;
    };
    const n = entry.players.length;
    facts.append(part('when', formatDate(entry.startedAt)), ' · ', part('length', durationText(entry.seconds)), ' · ',
      part('rules', entry.rules), ' rules · ', part('players', `${n} ${n === 1 ? 'player' : 'players'}`));
    text.append(crumb, line, facts);
    head.append(text);
    if (keys && keysList) head.append(keysList.el);         // RVK-B: the keys list, at the head's end
    if (entry.result) {
      // RB-32: the result's label over the big score (`D:265-273`), the whole said once by `resultWords`
      const r = entry.result;
      const score = el('div', 'cx-replay__score');
      score.dataset['field'] = 'score';
      score.setAttribute('role', 'group');
      score.setAttribute('aria-label', resultWords(r));
      const label = el('p', 'cx-replay__result', resultLabel(r));
      label.dataset['field'] = 'result';
      label.setAttribute('aria-hidden', 'true');
      const tally = el('p', 'cx-replay__tally');
      tally.setAttribute('aria-hidden', 'true');
      const side = (team: 'seal' | 'terrorist'): HTMLElement => {
        const e = el('span', 'cx-replay__tally-side', SIDE_WORDS[team]);
        e.dataset['side'] = team;
        return e;
      };
      const count = (team: 'seal' | 'terrorist'): HTMLElement => {
        const e = el('span', 'cx-replay__tally-count', String(r.wins[team]));
        e.dataset['score'] = team;
        return e;
      };
      tally.append(side('seal'), count('seal'), el('span', 'cx-replay__tally-dash', '–'), count('terrorist'), side('terrorist'));
      score.append(label, tally);
      head.append(score);
    }
    return head;
  };

  /**
   * RVK-B: a camera button's title at rest -- its label, and its key where keys reach the viewer (`./viewerKeys`). PV-RVK: one
   * function for the strip's drawing and for a refusal's end (`syncCameras`), so a camera offered again keeps its key named.
   */
  function cameraTitle(m: { id: string; label: string }): string {
    const row = rowOf({ kind: 'camera', camera: m.id as ViewerCamera });
    return keys && row ? `${m.label} (${row.caps.join(' or ')})` : m.label;
  }

  /** RV2-04: the camera strip over the world's corner -- the console's kind buttons, its icons and the modes' words. */
  const camerasView = (modes: NonNullable<ReplayStageHandle['spectator']>): HTMLElement => {
    const strip = el('div', 'cx-kinds cx-replay__cameras');
    strip.id = `cx-replay-cameras-${serial}`;
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Camera');
    const buttons = modes.modes.map((m) => {
      const b = el('button', 'cx-kind cx-replay__camera');
      b.type = 'button';
      b.dataset['camera'] = m.id;
      b.setAttribute('aria-label', m.label);
      // RVK-B: its key (`./viewerKeys`), named where keys reach the viewer
      const row = rowOf({ kind: 'camera', camera: m.id as ViewerCamera });
      if (keys && row) b.setAttribute('aria-keyshortcuts', row.shortcut);
      b.title = cameraTitle(m);
      b.append(ico(m.icon), el('span', 'cx-label', CAMERA_WORDS[m.id] ?? m.label));
      b.addEventListener('mousedown', (e) => { e.preventDefault(); });   // RVK-B: a mouse press leaves the focus where it was
      b.addEventListener('click', () => {
        // PV-8 (the review's F4): a refused camera (`aria-disabled`) is not asked of the stage -- nothing pressed, nothing
        // kept, the focus where it is; the event itself is not prevented. PV-13 (the controller's ruling, 2026-11-13): it says
        // why, as its key does (`chooseCamera`) -- the stage's sentence in the strip's status line, cleared by the same paths --
        // since a tap has no hover to show the title (the join's ruling 2: never a silent nothing). On a phone the open dropup
        // would cover the line (the dropup sits over the world's top right, where the phone's sheet places it), so the tap
        // closes it, as a mode pressed does, the focus back on its chip.
        if (b.getAttribute('aria-disabled') === 'true') {
          sayNote(modes.refused?.(m.id) ?? null);
          if (phone && camerasOpen) {
            camerasOpen = false;
            applyOpen();
            parts?.cameraToggle?.focus({ preventScroll: true });
          }
          return;
        }
        sayNote(null);                                       // PV-RVK F2: a camera chosen by the mouse -- the line gone
        modes.set(m.id);
        syncCameras();
        // RV2-08: on a phone the dropup closes on the mode pressed, the focus back on its chip
        if (phone && camerasOpen) {
          camerasOpen = false;
          applyOpen();
          parts?.cameraToggle?.focus({ preventScroll: true });
        }
      });
      return b;
    });
    strip.append(...buttons);
    // RVK-B: the camera's own context buttons -- PLAYER's previous / next player and the player in view, SCENIC's previous /
    // next view -- each drawn in its camera alone (`syncCameras`), when the stage can press the spectator's controls.
    // PV-13c item 1: in one box at the strip's end (`data-presses`), after the cameras, in the same order: wide it takes no
    // box (`display: contents`), on a phone it is the dropup's foot, one row (`../../console/replay.css`).
    if (modes.press) {
      const foot = el('div', 'cx-replay__presses');
      foot.dataset['presses'] = '';
      // PV-13c item 2: the player in view's mark is the console's ring and hub (`disc`), read here as a target -- PLAYER's
      // person mark (`user`) stood beside it twice once the labels hide; the reticle (`armory`) is the player's view's
      const context: readonly (readonly [SpectatorPress, ViewerCamera, string, string])[] = [
        ['previous', 'follow', 'left', 'Previous player'], ['jump', 'follow', 'disc', 'The player in view'], ['next', 'follow', 'right', 'Next player'],
        ['scenicPrevious', 'scenic', 'left', 'Previous view'], ['scenicNext', 'scenic', 'right', 'Next view'],
      ];
      for (const [press, camera, mark, label] of context) {
        const b = el('button', 'cx-kind cx-replay__press');
        b.type = 'button';
        b.dataset['press'] = press;
        b.dataset['for'] = camera;
        b.setAttribute('aria-label', label);
        const row = rowOf({ kind: 'press', press });
        if (keys && row) { b.setAttribute('aria-keyshortcuts', row.shortcut); b.title = `${label} (${row.caps.join(' or ')})`; } else b.title = label;
        b.append(ico(mark));
        b.hidden = true;
        b.addEventListener('mousedown', (e) => { e.preventDefault(); });
        b.addEventListener('click', () => { pressSpectator(press); });
        foot.append(b);
      }
      strip.append(foot);
    }
    return strip;
  };

  /**
   * RV2-08: the phone's chips at the head's end -- Players with the count, whose dropup is the roster, and the camera,
   * whose dropup is the strip (when the stage offers modes) -- each the console's kind button, each its own dropup's row.
   */
  const chipsView = (strip: HTMLElement | null): Omit<ViewerParts, 'head' | 'aside' | 'world'> => {
    const chips = el('div', 'cx-replay__chips');
    chips.hidden = true;
    const chip = (hook: string, controls: string): HTMLButtonElement => {
      const b = el('button', 'cx-kind cx-replay__chip');
      b.type = 'button';
      b.setAttribute(hook, '');
      b.setAttribute('aria-controls', controls);
      b.setAttribute('aria-expanded', 'false');
      return b;
    };
    const rosterRow = el('div', 'cx-dropup-row cx-replay__chiprow');
    const rosterToggle = chip('data-roster-toggle', roster.id);
    rosterToggle.setAttribute('aria-label', 'Players');
    rosterToggle.title = 'Players';
    const rosterCount = el('span', 'cx-replay__count');
    rosterCount.dataset['rosterCount'] = '';
    rosterToggle.append(ico('user'), el('span', 'cx-label', 'Players'), rosterCount);
    rosterToggle.addEventListener('click', () => {
      rosterOpen = !rosterOpen;
      camerasOpen = false;
      applyOpen();
    });
    rosterRow.append(rosterToggle);
    chips.append(rosterRow);
    let cameraRow: HTMLElement | null = null;
    let cameraToggle: HTMLButtonElement | null = null;
    if (strip) {
      cameraRow = el('div', 'cx-dropup-row cx-replay__chiprow');
      cameraToggle = chip('data-camera-toggle', strip.id);
      cameraToggle.addEventListener('click', () => {
        camerasOpen = !camerasOpen;
        rosterOpen = false;
        applyOpen();
      });
      cameraRow.append(cameraToggle);
      chips.append(cameraRow);
    }
    return { chips, rosterRow, rosterToggle, rosterCount, strip, cameraRow, cameraToggle };
  };

  /** A state in the stage's place (the lock, a refusal, the opening), the head kept over it. */
  const stateView = (wrap: HTMLElement, state: HTMLElement): HTMLElement => {
    const body = el('div', 'cx-replay__body is-state');
    body.append(state);
    wrap.append(body);
    return wrap;
  };

  const viewerView = (): HTMLElement => {
    const wrap = el('div', 'cx-replay');
    wrap.dataset['viewer'] = entry.id;
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-label', 'Replay viewer');
    // RVK-B (LATER 966, V21.R7; the owner, 2026-11-12: "The replay mode should be fully navigable with keyboard and mouse.
    // Every view."): the viewer's own keys -- Escape for Back among them -- in every build where `keys` says, on the
    // viewer's own box, never the window (the module's doc). (Was LATER 86's development fold, Escape alone.)
    if (keys) wrap.addEventListener('keydown', onViewerKey);
    if (keys) wrap.addEventListener('keyup', onViewerKeyUp);
    // RVK-B: the focus gone from the viewer (no key up will come here): everything held let go
    wrap.addEventListener('focusout', (e) => { if (!wrap.contains(e.relatedTarget as Node | null)) letGo(); });
    keysList = keys ? mountKeysList(doc, `cx-replay-keys-${serial}`) : null;
    syncKeysButton();                                        // RVK polish: from the first drawing (a state's view has no frames)
    const head = headView();
    wrap.append(head);
    parts = null;
    if (locked) return stateView(wrap, lockBlock());
    const why = error ?? refused;
    if (why !== null) {
      // MU2-13: a stage that failed, or a recording the client refused -- its kind's title and line, the sentence as it
      // came (as text), Back: never a crash, never an empty world. MU2-14: the kind as data when it came with one, else
      // sorted by the words (`replayRefusalKind`: the text-only reasons). RV2-04: the console's empty block.
      const kind = (error !== null ? errorKind : refusedKind) ?? replayRefusalKind(why);
      wrap.dataset['refusal'] = kind;
      const [title, line] = refusalWords(kind, why);         // FL-2b: a newer recording's own title, no line
      const p = el('div', 'cx-empty cx-replay__state is-alert');
      const t = el('h3', 'cx-item__title', title);
      t.dataset['refusalTitle'] = '';
      const s = el('p', 'cx-replay__sentence', why);
      s.dataset['status'] = '';
      s.setAttribute('role', 'alert');
      p.append(ico(kind === 'missing' ? 'replay' : 'alert', 'cx-replay__state-icon'), t);
      if (line !== null) {
        const l = el('p', 'cx-item__sub', line);
        l.dataset['refusalLine'] = '';
        p.append(l);
      }
      p.append(s);
      return stateView(wrap, p);
    }
    if (!handle) {
      const s = el('p', 'cx-replay__lamp', 'Opening the recording');
      s.dataset['status'] = '';
      s.setAttribute('role', 'status');
      return stateView(wrap, s);
    }
    const body = el('div', 'cx-replay__body');
    const main = el('div', 'cx-replay__main');
    const world = el('div', 'cx-replay__world');
    world.dataset['world'] = handle.world;
    if (handle.view) world.append(handle.view);              // MU-11: the world itself, put here once
    surface = null;
    if (handle.view && handle.spectator) {                   // RVK-B: the world surface over it, under the HUD and the strip
      surface = surfaceView();
      world.append(surface);
      syncSurface();
    }
    if (handle.world === 'unwired') {
      const u = el('div', 'cx-empty cx-replay__unwired');
      u.append(ico('display', 'cx-replay__state-icon'),
        el('span', 'cx-item__sub', 'The match\'s world view is not wired into this page yet: the recording plays, seeks and lists its players here.'));
      world.append(u);
    }
    hud?.dispose();                                          // RB-34: the HUD over the world, under the lamp and the cameras
    hud = mountReplayHud(world, handle.client, {
      persona: () => (o.context.ticket() !== null ? o.context.name : null),
      ...(handle.spectator ? { spectator: handle.spectator } : {}),
      onToggle: () => { transport?.act('toggle'); },
    });
    world.append(lamp);
    drawLamp();
    if (handle.spectator) world.append(cameraNote);          // PV-RVK: a refused camera's key says why
    const strip = handle.spectator ? camerasView(handle.spectator) : null;
    if (strip) world.append(strip);
    // RV2-04: the transport's mount point, under the world; RV2-05's bar is drawn on the console's sheets.
    const bar = el('div', 'cx-replay__transport');
    bar.dataset['transport'] = '';
    main.append(world, bar);
    const aside = el('aside', 'cx-aside cx-replay__aside');
    aside.setAttribute('aria-label', 'Players');
    aside.append(el('h3', 'cx-replay__aside-head', 'Players'), roster);
    body.append(main, aside);
    wrap.append(body);
    // RV2-08: the phone's chips at the head's end, laid out by `applyLayout` once the view is in its host
    const chips = chipsView(strip);
    head.append(chips.chips);
    parts = { head, aside, world, ...chips };
    roster.hidden = false;
    roster.classList.remove('cx-dropup', 'is-below');
    rosterShown = '';
    cameraShown = '';
    transport?.dispose();
    // Its keys and focus are the viewer's box's, as before (`host` = the box); its element sits in the mount point.
    transport = mountTransport(wrap, handle.client, {
      reason: () => refusal, frame, circleBack: true, keys, onSeekNote: (at) => { hud?.note(at); },
    });
    bar.append(transport.el);
    transport.render();
    hud.render();
    drawRoster();
    syncCameras();
    return wrap;
  };

  function draw(): void {
    if (disposed) return;
    const want = `${handle !== null}|${locked}|${error ?? ''}|${errorKind ?? ''}|${refused ?? ''}|${refusedKind ?? ''}`;
    if (root && drawn === want) {
      if (root.parentNode !== host) host.replaceChildren(root);
      return;
    }
    // Rebuilt (the stage opened, the disc left, a failure): the focus follows when it was in the host.
    const active = doc.activeElement;
    const follow = active === null || active === doc.body || host.contains(active);
    root = viewerView();
    drawn = want;
    host.replaceChildren(root);
    applyLayout();                                           // RV2-08: the phone's or the desktop's, at once
    if (follow) root.focus();
  }

  draw();
  (root as HTMLElement | null)?.focus();                   // set by draw(): the cast undoes the narrowing to null
  stage.open(entry, o.context).then((h) => {
    if (locked || disposed) { h.dispose(); return; }
    handle = h;
    off = h.client.on((ev) => {
      if (ev.type !== 'refused') return;
      refusal = ev.reason;
      refused = ev.reason;                                   // MU2-13: the viewer's refusal state, its Back kept
      refusedKind = h.client.refusedKind ?? null;            // MU2-14: set by the client before its event
      closeStage();
      draw();
    });
    draw();
    loop();
  }, (e: unknown) => {
    if (disposed) return;
    error = e instanceof Error ? e.message : String(e);
    errorKind = loadKindOf(e);                               // MU2-14: a ReplayLoadError's kind, else null
    draw();
  });

  return {
    entry,
    root: () => (disposed ? null : root),
    draw,
    lock(): void {
      if (disposed || locked) return;
      closeStage();
      locked = true;
      draw();
    },
    locked: () => locked,
    close: back,
    back(): boolean {
      if (disposed || !keysList?.isOpen()) return false;
      keysList.close();
      return true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      sayNote(null);                                         // PV-RVK F2: nothing said past the viewer
      closeStage();
      win.removeEventListener('blur', onWinBlur);            // RVK-B
      doc.removeEventListener('visibilitychange', onVisibility);
      root?.remove();
      root = null;
    },
  };
}
