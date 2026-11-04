import { NARROW_PX } from '../../console/fit';
import { ico as cxIco, P as CX_MARKS, type IconName as CxIconName } from '../../console/icons';
import { loadKindOf, type ReplayLoadKind } from '../../replay/refusalKind';
import type { IconName } from '../icons';
import { durationText, type ReplayEntry, type ReplayListFailure, type ReplayResult } from './data';
import type { ReplayStage, ReplayStageContext, ReplayStageHandle } from './stage';
import { HELD_STATUS, mountTransport, type Transport, type TransportClient } from './transport';
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
 * the screen head (`.cx-screenhead`: the crumb -- Back to Replays, the one return control, LR.R19 -- then the map, the
 * rules chip, "date · length" and the result line when the record holds one); the world full-bleed with the camera
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
 * Every server string -- a name, a map, the rules, a refusal -- is set as text, never as markup.
 */

/**
 * RV2-04: the camera strip's words for the stage's modes (§2: PLAYER · FREE · SCENIC), each in its mode's accessible
 * name (`./worldStage` `CAMERA_MODES`); a mode not named here shows its label. The viewer's own words (no original).
 */
const CAMERA_WORDS: Readonly<Record<string, string>> = { follow: 'Player', free: 'Free', scenic: 'Scenic' };

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
  [/^This recording was not found on the match server, or it is not yours to watch\.$/, 'missing'],
  [/^(This recording is damaged|The recording is not a readable gzip file|This file is not a replay recording|The recording is empty|The recording holds no whole record yet)/, 'corrupt'],
];
export function replayRefusalKind(reason: string): ReplayRefusalKind {
  for (const [sentence, kind] of REFUSAL_SENTENCES) if (sentence.test(reason)) return kind;
  return 'unavailable';
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
   * RV-12 review (OT.R29, CX.R6): whether a key reaches the viewer. False -- the console launcher's release build -- and
   * it takes no key (no Escape for Back, no transport key) and names none (`../replays/transport` `keys`) -- but Back's
   * Escape, named in every build since OT.R62 (the console's own Escape closes the viewer, `../../console/input`). Absent, true.
   */
  keys?: boolean;
  /**
   * Back -- its button, or Escape on the viewer -- asked: the caller takes the viewer away (`dispose`) and puts the focus
   * where the replay was opened from (the console's row).
   */
  onClose: () => void;
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

  let handle: ReplayStageHandle | null = null;
  let transport: Transport | null = null;
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
    transport?.dispose();
    transport = null;
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
    handFocus();
    drawRoster();
    syncCameras();
    drawLamp();
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
    for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-camera]')) {
      const on = b.dataset['camera'] === now;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-current', on);
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

  const roster = el('ul', 'cx-replay__roster');
  roster.dataset['roster'] = '';
  roster.id = `cx-replay-roster-${serial}`;
  roster.setAttribute('aria-label', 'Players in the recording');
  /**
   * RV-4, RV2-04: the client's roster as the console's player tiles -- the side's dot (SEALs, Terrorists; none for a
   * spectator), the person or an eye for a spectator, the name as text, the side's word, and a bot's "Bot" chip.
   */
  function drawRoster(): void {
    const c = handle?.client;
    const players = c && c.state === 'open' ? c.roster() : [];
    const key = JSON.stringify(players.map((p) => [p.id, p.name, p.team, p.role, p.bot === true]));
    if (key === rosterShown) return;
    rosterShown = key;
    if (parts) {                                             // RV2-08: the phone's chip names the count
      parts.rosterCount.textContent = String(players.length);
      parts.rosterToggle.setAttribute('aria-label', `Players (${players.length})`);
    }
    roster.replaceChildren(...players.map((p) => {
      const li = el('li', 'cx-player cx-replay__player');
      li.dataset['team'] = p.team ?? 'none';
      const tile = el('span', 'cx-player__tile');
      tile.append(ico(p.role === 'player' ? 'user' : 'eye'));
      if (p.team === 'seal' || p.team === 'terrorist') tile.append(el('span', 'cx-player__dot'));
      const side = el('span', 'cx-replay__side', p.team === 'seal' ? SIDE_WORDS.seal : p.team === 'terrorist' ? SIDE_WORDS.terrorist : 'Spectating');
      side.dataset['side'] = '';
      li.append(tile, el('span', 'cx-player__name', p.name), side);
      if (p.bot === true) {
        const bot = el('span', 'cx-replay__bot', 'Bot');
        bot.dataset['bot'] = '';
        li.append(bot);
      }
      return li;
    }));
  }

  /**
   * RV2-04: the screen head, the console's (`../../console/render/head.ts`' drawing): the crumb -- Back to Replays, the
   * viewer's one return control (LR.R19), then the page's name -- the map as the title, the rules chip, "date · length",
   * and the record's result when it holds one (`resultWords`).
   */
  const headView = (): HTMLElement => {
    const head = el('header', 'cx-screenhead cx-replay__head');
    const text = el('div', 'cx-screenhead__text');
    const crumb = el('div', 'cx-crumb');
    const backBtn = el('button', 'cx-back');
    backBtn.type = 'button';
    // RV2.R7's hook for the crumb's Back (the RV2 batch review's F8): `data-back`, not a `data-action` -- those are the
    // transport's, whose `back` is the step back
    backBtn.dataset['back'] = '';
    backBtn.setAttribute('aria-label', 'Back to Replays');   // the visible word kept in the name
    // MODAL-CLOSE's fold (MISSION OT.R62, the owner, 2026-10-17): Escape closes the viewer in every build -- the console's
    // own Escape (`../../console/input`) when the viewer is open over it -- so Back names it whatever `keys` says. Circle
    // is the console's Close, named by its legend.
    backBtn.setAttribute('aria-keyshortcuts', 'Escape');
    backBtn.title = 'Back to Replays';
    backBtn.append(ico('left', 'cx-back__chevron'), ico('replay'), el('span', 'cx-back__label', 'Replays'));
    backBtn.addEventListener('click', back);
    const here = el('span', 'cx-crumb__here', ' / Replay');
    here.setAttribute('aria-hidden', 'true');
    crumb.append(backBtn, here);
    const line = el('div', 'cx-replay__titleline');
    const title = el('h2', 'cx-title');
    const map = el('span', 'cx-replay__map', entry.map);
    map.dataset['field'] = 'map';
    title.append(map);
    const rules = el('span', 'cx-replay__rules', entry.rules);
    rules.dataset['field'] = 'rules';
    line.append(title, rules);
    const when = el('p', 'cx-screenhead__desc', `${formatDate(entry.startedAt)} · ${durationText(entry.seconds)}`);
    when.dataset['field'] = 'when';
    text.append(crumb, line, when);
    if (entry.result) {
      const result = el('p', 'cx-replay__result', resultWords(entry.result));
      result.dataset['field'] = 'result';
      text.append(result);
    }
    head.append(text);
    return head;
  };

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
      b.title = m.label;
      b.append(ico(m.icon), el('span', 'cx-label', CAMERA_WORDS[m.id] ?? m.label));
      b.addEventListener('click', () => {
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
    // An Escape already taken (a dialog's, the fold's) is not Back's too: one press closes one thing. LATER 86 (OT.R29):
    // a development build's key alone, at the site -- a release drops it whatever its caller's `keys` says.
    if (import.meta.env.DEV && keys) {
      wrap.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        back();
      });
    }
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
      const [title, line] = REPLAY_REFUSAL_WORDS[kind];
      const p = el('div', 'cx-empty cx-replay__state is-alert');
      const t = el('h3', 'cx-item__title', title);
      t.dataset['refusalTitle'] = '';
      const l = el('p', 'cx-item__sub', line);
      l.dataset['refusalLine'] = '';
      const s = el('p', 'cx-replay__sentence', why);
      s.dataset['status'] = '';
      s.setAttribute('role', 'alert');
      p.append(ico(kind === 'missing' ? 'replay' : 'alert', 'cx-replay__state-icon'), t, l, s);
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
    if (handle.world === 'unwired') {
      const u = el('div', 'cx-empty cx-replay__unwired');
      u.append(ico('display', 'cx-replay__state-icon'),
        el('span', 'cx-item__sub', 'The match\'s world view is not wired into this page yet: the recording plays, seeks and lists its players here.'));
      world.append(u);
    }
    world.append(lamp);
    drawLamp();
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
    transport = mountTransport(wrap, handle.client, { reason: () => refusal, frame, circleBack: true, keys });
    bar.append(transport.el);
    transport.render();
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
    dispose(): void {
      if (disposed) return;
      disposed = true;
      closeStage();
      root?.remove();
      root = null;
    },
  };
}
