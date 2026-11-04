/**
 * The overlay over the active page (OV-2 of the modern-UI plan, `docs/plans/briefs/modern-ui-live-site-scope.md` 4.2;
 * MU2-10 of `docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`: MU2.R1, MU2.R3, MU2.R4). A **browser adaptation**
 * with no original (`MODERN_OVERLAY_ADAPTATION`), labelled as one where it is drawn. Since OVERLAY-CONSOLE (the console
 * launcher plan; CX.R13, MU2.R10, MISSION's OT.R60) what it draws is **the console launcher itself** (`../../console/app`
 * `bootConsole`, mode `overlay`, over `../../console/adapters` `overlayAdapters`): one design, a release feature, with
 * START, the launch target and the launch screen hidden, the disc choice and source and the kept disc locked (the game
 * opened the disc at its boot), sign out and the persona switch locked while the game holds the account or a round runs,
 * and the gaps "Coming"; the Report (FB-1's dialog, `../report`) is the Server category's "Report a problem" row.
 *
 * **Where it mounts (MU2.R4).** Over every page but the home page, in every build: the one seam is `../../pageEntry`'s
 * `bootPage`, which calls `mountPageOverlay` once after a page has booted (`./page`: the front end, the disc page, the
 * test room, the launch settings sheet, and since MU2-17 the forge, MU2.R9); the console launcher (`/`, `/console`) never
 * passes the entry, so it is never under the overlay. The game's modules (`../../main`, `../../frontEnd`,
 * `../../matchMount`) and the forge's (`../../forge/**`) mount nothing of it.
 *
 * **Closed by default**, opened and closed through `open()` / `close()` (`onChange` says each change).
 *
 * **The closed overlay is inert; it is made at its first open** (OVERLAY-CONSOLE's landing gate: the e2e run found the
 * closed overlay's frame in the front end's body, `e2e/menuflow.spec.ts`). Until the first open -- the opening button
 * (below), `open()`, or a development build's F9 -- the mount puts nothing on the page: no frame, no copied sheet, no
 * console, no adapter, no session (no request, no audio), no pad shadowing, and no listener on the page's window or
 * document but a development build's F9 key; it reads only the opening button, once a frame (a read, never a
 * shadowing). The first open makes the frame, copies the sheets, makes the session and boots the console, and its
 * transition plays as every open's does; the frame is kept after it -- at each close `hidden` and `inert` (no pointer,
 * no focus, no key), so the next open makes no frame and copies only a sheet added since. `el` is null before the first
 * open. The session, once made, is followed each frame from then on (`./session` `sync`: one persona, the game's).
 *
 * **The Home button opens it and closes it, by a press (MU2-16; MU2.R8, MISSION's OT.R51).** The opening button
 * (`OVERLAY_TOGGLE_ADAPTATION`) is the W3C standard mapping's button 16 (Home / PS / Xbox Guide; "Remapping", the centre
 * button), which the original never reads -- the PS2's pad has no such button and the game's layout stops at 15
 * (`../../gamepad` `PAD_BUTTON`, L20-23; the launcher's table, third_party/ps2recomp/ps2xShared/src/mapping.cpp:16-25,
 * maps nothing to it), and every game read of a pad goes through the player's sixteen bindings
 * (`../../controllerInput` `ControllerInput.poll`, L92: the logical pad's buttons are `config.bindings` alone) -- so a
 * press opens it on every page it mounts over, **in a running round too**: nothing of the game's is shadowed by it. A
 * press while open closes it (one press acts once: the next counts from a new press); Circle at the root closes it too.
 * **SELECT is the page's** (MU2-11's SELECT hold is retired as the opening route): in a round the original's
 * scoreboard, shown on the press and kept up while held (`FUN_0022be20` L79675, L79873), on the menu pages nothing; the
 * overlay reads nothing of SELECT.
 *
 * **The opening button is rebindable** (OT.R51: "not all controllers have it" -- on Windows the Xbox Guide button is the
 * Game Bar's and never reaches the page): a binding kept with the player's other pad bindings (`./binding`, chosen on
 * the console's Options > Controller > Overlay button, `../../console/adapters/options`; and on the retired shell's
 * Settings > This browser > Controller, retired with CX-25), default 16, followed without a remount. A bound
 * button the game never reads (16, or one beyond the standard mapping) opens and closes by a press. **A bound button the
 * game also reads** (one the player's game bindings drive, or the crouch shortcut's: `./binding` `overlayOpensBy`; over
 * the forge, one the forge's own map reads too, LATER 87: the forge reads the pad first in the frame; in the forge's
 * match, the match's exit chord's SELECT and START, LATER 92) opens
 * and closes by a hold of `SELECT_HOLD_MS_ADAPTATION`, so its tap stays the game's: the page reads it unshadowed until
 * the threshold, then the overlay takes the pad (the page reads it let go) and, after a close, the button still held
 * stays released to the page until it is let go. In a running round such a button is the game's alone, as MU2-11's
 * review found SELECT's scoreboard was: while `roundRunning()` answers true and the overlay is closed its hold never
 * counts toward opening, and a hold begun in a round stays the game's to its release, the round ending under it or not.
 * The test room's walking scoreboard while exploring (no room: `./page` `roundRunning` false) is the port's own
 * instrument, not a round of the original's. The controller's call (a matter of taste on the product track), logged for
 * the owner in the plan. While a binding capture is the overlay's (the console's button mapping screen listening for a
 * button, `ConsoleController.capturing`), the bound button is the capture's -- neither a press nor a hold acts, nor on
 * the frame the capture ends; it counts again from a new press. No hint is drawn while a hold is short of the threshold:
 * the design has no hold cue -- none is invented. START (where the player's bindings put it) stays the game's: never held
 * back from the game once the overlay closes -- unless START is the opening button, whose closing hold is held back
 * until it is let go, as every bound game button's is (MU2-16's review F1). The bound button's way (a press or a hold)
 * and START's place are read from the player's game bindings fresh at each decision, so a rebind on Settings >
 * Controller is followed without a reload (MU2-16's review F2). On a development build's
 * keyboard, `F9` -- not Escape (the game's: the mouse's release, `../../main`'s key listeners; the front end's menus pass
 * it, `../../menuInput`), not Backquote (`../../ui`'s chrome toggle), not F8 (the playtest room's Mark key,
 * `../../playtestSession` `MARK_KEY`) -- under a literal `import.meta.env.DEV` (OT.R29, CX.R6): no release keyboard path.
 *
 * **The page keeps running under it (MU2.R3).** While the overlay is open the game reads this client's pad as
 * **untouched** -- connected, the same id and index, every button released and every axis centred -- and pauses
 * nothing: the simulation, the clock, the music and the network go on, so in a networked match the other players see
 * this player's soldier as a player who has let go of the pad (what the original shows when a player puts the pad down;
 * the original itself has no overlay and no pause seam here to follow). The mechanism is the one read every game path
 * shares -- `navigator.getGamepads()` (`../../main` and `../../matchMount` `padFrame`, the menus' `GamePad` in
 * `../../menuInput`) -- shadowed on the window's navigator by an own property while the overlay is open and removed
 * after, so no game module is changed. A button held through the close stays released to the game until it is let go
 * (no press born in the overlay -- the Cross that pressed its last button, the Home that closed it -- reaches the
 * game), START excepted unless it is the opening button; then the navigator is exactly as it was. The overlay itself
 * reads the pad unshadowed. The forge (MU2-17) reads its pad through the same navigator (its edge map and, on the forge
 * lane, its lobby popup), so the same shadow holds it; it is not paused either (`./page` `overlayEnabled` says why).
 *
 * **The keyboard, the pointer and the focus.** The overlay is its own document (an `iframe` over the page, focused
 * while open; the console's markup in it, its body the modal dialog, Tab coming round inside it -- `trapTab`, over
 * `../dialog` `focusables`, not `dialogFocus`, which would retain the modern UI's on-screen keyboard over the console's
 * own fields), so a key typed or a pointer pressed in it never reaches the game's listeners, which are on the page's
 * window, document and canvas; focus leaving the page is a window blur, on which the game lets its keys go as it does
 * for any other focus loss. A key that still lands on the page while the overlay is open (the focus put back on the page
 * by hand) is stopped at the window's capture phase, after any capture listener registered before this module loaded
 * (`../../main`'s match keys) -- a development build's keyboard only (OT.R29). The pointer lock, if the game holds it,
 * is let go at the open; at the close the page's focus goes back to where it was.
 *
 * **The pad inside it** (LU-4b; MU.R18): the console's own grammar (`../../console/input`, `../../console/grammar`) --
 * the crossbar, the lists, the screens and their dialogs, Circle back one level and at the top back to the game (the
 * overlay closes; the console asks its host, `close`). It reads the real pad (`realSource`, through the console's pad
 * adapter), on the toggle's frame, and only while open; its keyboard map is the frame's window's, a development build's
 * only; its pointer is the frame's document's.
 *
 * **The persona and the requests (MU2-9's findings).** (a) Over a page whose game holds an account (the front end's
 * LOGIN), the persona is the game's own, read and never driven (`./session` `overlaySession`); else the overlay's own
 * session (`../session` `pageSession`), which on the disc page ends at the image's START (MU-F2a, `startBoundary`) and
 * on every page whose game has a lobby at the game's `LobbyConnect` (MU2-10's review F1, `./session`).
 * (b) The console's adapters build their requests from the page's address, never the frame's `about:blank`
 * (`../pageWindow` `adoptPageWindow`; the adapters read the page's window). (c) Under a running round (`roundRunning`,
 * `./page`) Replays' Watch is gated off, and the console has no loadout editor yet (its loadouts are "Coming"), so nothing
 * reads the disc's world (MU2-7's review F1).
 *
 * **The open and the close (OT.R60 (e)).** A UI cue from the disc's own menu sounds through the page's game audio
 * (`opts.sounds`, the front end's `UiSoundCues`: `popup()`, `PopUpDialog`'s `.METAL`, at the open; `back()`, `SwitchMenu
 * PREVIOUS_SCREEN`'s `.BACK`, at the close; in a round the open's at `OVERLAY_ROUND_CUE_VOLUME_ADAPTATION`), silent with
 * no disc audio loaded; and a PS3-inspired transition (`./motion`): the frame's blur and dim ramp in while the console's
 * panels rise and fade in a stagger, the reverse on the close with the blur out last. **The pad is handed over at the
 * ends of it**: the console reads the pad only once the open has completed, and the game reads it again only once the
 * close has completed (the blur gone) -- the game stays shadowed through the close, and the buttons held at its end stay
 * released to it until let go (MU2-11's rule, START excepted). A toggle mid-way reverses the transition from where it
 * is: no remount, no jump, one cue for the new way. `motion: false` (a test's) completes each at once. The whole console
 * layer (the frame's body: the header, the legend, a dialog) fades with the close, before the blur (the seat's frames'
 * F-C). The page's sheets and the console's own are copied into the frame when the frame is made, at the first open
 * (the closed overlay is inert, above), and each open copies any added since; from the console's first draw until its
 * open completes its own CSS transitions are off (`data-overlay-settling`, the frames' F-D: its first styled pass in the
 * frame ran some ninety of them, layout properties among them). What the first open costs over the next: the frame's
 * making (an `about:blank` document, synchronous), the sheets' clones, and the one request of the console's own sheet
 * (a `<link>`, fetched then; a release build's page sheets are links already in the page's cache) -- loaded under the
 * open's ramp, while the panels are still at the closed end of their fade and the console's transitions are held.
 *
 * Not here: the handoff cover on a close into a loading game (brief 2.1); a screenshot in the Report (no capture source
 * is handed in).
 */
import type { LauncherContext } from '../index';
import { swallowNextClick } from '../../touchClick';
import { launcherState, type LauncherState } from '../launcherState';
import { endForLaunch, pageSession, type ModernSession } from '../session';
import { registerBeforeLaunch } from '../launchGate';
import { mountReport, type ReportDialog } from '../report';
import { focusables } from '../dialog';
import { adoptPageWindow } from '../pageWindow';
import { overlaySession, type GameAccount, type OverlaySession } from './session';
import { overlayEnabled, overlayPageReads, videoPictureFollows, type OverlayPage, type OverlayPageKind } from './page';
import { OVERLAY_HOME_BUTTON, onOverlayButtonChange, overlayButtonCap, overlayButtonName, overlayOpensBy, readOverlayButton, saveOverlayButton } from './binding';
import { GamePad } from '../../setupPad';
import { connectedPads } from '../../controllerInput';
import { wantsTouchControls } from '../../touch';
import { PAD_BUTTON, type PadLike, type PadSource } from '../../gamepad';
import type { ControllerConfig } from '../../startupSettings';
import { keyboardSite } from '../../keyboardTesting';
import { bootConsole, type ConsolePage } from '../../console/app';
import { overlayAdapters } from '../../console/adapters';
import { claimSettingsEditor } from '../../settingsEditorOwnership';
import type { Adapters, ConsolePageReads } from '../../console/state';
import CONSOLE_SHEET from '../../console/console.css?url';
import { UI_POPUP_SOUND } from '@s2u/sound';
import type { UiSoundCues } from '@s2u/ui';
import { OVERLAY_ROUND_CUE_VOLUME_ADAPTATION, overlayRamp } from './motion';
import './overlay.css';

/**
 * The overlay's toggle, a browser adaptation (MU.R24 Q-C; brief 4.2; MU2-16, OT.R51): by default the standard mapping's
 * button 16 (Home / PS / Xbox Guide), which the original never reads -- the player may bind another (`./binding`) -- and
 * on a development build's keyboard `F9` (`KeyboardEvent.code`).
 */
export const OVERLAY_TOGGLE_ADAPTATION = { button: OVERLAY_HOME_BUTTON, key: 'F9' } as const;

/**
 * SELECT_HOLD_MS_ADAPTATION (MU2-11; MU2.R5's second branch, MU2-11's review F2; since MU2-16, OT.R51): how long a
 * rebound opening button that the game also reads is held to open or to close the overlay, in milliseconds (`./binding`
 * `overlayOpensBy`; the name kept from MU2-11, when SELECT was that button: SELECT's hold no longer opens anything).
 * A browser adaptation, not a reading: the original's SELECT has no timed hold -- in
 * a multiplayer round it holds the scoreboard, shown on the press and hidden on the release (`FUN_0022be20` L79675,
 * L79873; research 87 section 12), and the single-player tactical map toggles on the press (`FUN_00209ae0`,
 * `FUN_00209ee0`; research 87 section 9) -- and the original has no overlay. The reason for 400: it is the length of the
 * one timed hold of a button read in the repository, the fire-mode button's DEFAULT held repeat, whose held time past
 * `DAT_00650670` (.4 s) switches the fire mode (`FUN_00594b70` D:L452983; research 254, itself reading, pending review)
 * -- a repeat interval counted from the frame after the press and compared strictly, borrowed here as a length only:
 * this hold acts at 400 ms from the press's frame. What would settle it: none (an adaptation; the ledger's row, research
 * 101 section 4).
 */
export const SELECT_HOLD_MS_ADAPTATION = 400;

/**
 * OVERLAY_BLUR_PX_ADAPTATION (OT.R60 (d); OVERLAY-CONSOLE): the blur radius, CSS px, the overlay's frame gives the live
 * game behind it (`backdrop-filter`, `./overlay.css`). A browser adaptation with no original, the product track's taste
 * (the seat's starting value 12; its frames and frame rate are measured in a browser); the module writes it into the
 * frame's `--mu-overlay-blur`.
 */
export const OVERLAY_BLUR_PX_ADAPTATION = 12;

/**
 * OVERLAY_DIM_ADAPTATION (OT.R60 (d)): the slight darkening over the blurred game, the alpha of the frame's black
 * (`--mu-overlay-dim`). A browser adaptation with no original (the seat's starting value 0.35).
 */
export const OVERLAY_DIM_ADAPTATION = 0.35;

/**
 * OVERLAY_SCRIM_ADAPTATION (OT.R60 (d): "a darkened scrim without [the blur]"): the fallback's alpha where no blur is
 * drawn -- a browser without `backdrop-filter`, or the frame forced by `mu-overlay-frame--noblur` (`--mu-overlay-scrim`):
 * darker than the dim, since nothing softens the game behind it. A browser adaptation with no original (product taste).
 */
export const OVERLAY_SCRIM_ADAPTATION = 0.7;

/** MU2.R3: the overlay is a browser adaptation with no original, labelled as one where it is drawn. */
export const MODERN_OVERLAY_ADAPTATION = 'the modern UI over the active page: a browser adaptation, not part of the original; the game keeps running under it' as const;

/**
 * OVERLAY-CONSOLE: the console's markup in the overlay's document -- `index.html`'s body regions, as the console page has
 * them (`test/modern/overlayConsole.test.ts` holds the two alike): the backdrop, the app (header, stage, legend), the
 * dialogs' layer, the toast and the live region.
 */
/** OVERLAY-CONSOLE: the console's own sheet as this build serves it, linked in the overlay's document. */
export const OVERLAY_CONSOLE_SHEET: string = CONSOLE_SHEET;

export const OVERLAY_CONSOLE_BODY = `<div class="cx-backdrop" id="backdrop" aria-hidden="true"><img alt="" /><i class="cx-roll"></i></div>
<div class="cx-app">
  <header class="cx-header" id="header"></header>
  <main class="cx-stage" id="stage"></main>
  <footer class="cx-legend" id="legend"></footer>
</div>
<div id="overlay"></div>
<div id="toast" role="status" aria-live="polite"></div>
<p class="s2u-visually-hidden" id="live" aria-live="polite"></p>`;

export { overlayEnabled, overlayPageReads, type OverlayPage, type OverlayPageKind } from './page';
export * from './motion';

/** OT.R60 (e): the menus' cues the overlay plays (the front end's `UiSoundCues`, `@s2u/ui`). */
export type OverlayCues = Pick<UiSoundCues, 'popup' | 'back' | 'play'>;
export { OVERLAY_BUTTON_KEY, OVERLAY_HOME_BUTTON, readOverlayButton, saveOverlayButton } from './binding';
export type { GameAccount } from './session';

export interface OverlayOptions {
  /** The navigator the game reads its pads from (absent: the document's window's). */
  nav?: PadSource;
  /** The session (absent: the page's, `../session` `pageSession`). */
  session?: ModernSession;
  /** The disc's state (absent: the disc store's, `../launcherState`). */
  state?: LauncherState;
  /** The frame scheduler of the toggle's poll (absent: the window's `requestAnimationFrame`). */
  frame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
  /** MU2-10 (a): the game's own account on the page (`./page` `overlayPageReads`); absent, none. */
  game?: () => GameAccount | null;
  /** MU2-10 (c): whether a round runs under the overlay (MU2-7's review F1); absent, none. */
  roundRunning?: () => boolean;
  /**
   * LATER 87: the page's kind (`mountPageOverlay`'s), read by the opening button's press-or-hold rule (`./binding`
   * `overlayOpensBy`: over the forge its own map too); absent, the game's bindings alone.
   */
  pageKind?: OverlayPageKind;
  /** MU2-10: the overlay's own session ends at the page's START boundary (`../launchGate`, MU-F2a): the disc page's. */
  startBoundary?: boolean;
  /** MU2-11: the clock a rebound button's hold (MU2-16) and the pad's walk are timed on, ms (absent: the window's `performance.now()`). */
  now?: () => number;
  /** MU2-12: the page reads the served tree (`./page` `servedTree`), said on Home's disc line; absent, never. */
  servedTree?: () => boolean;
  /** CX-25's review F2: the game's front end runs under the overlay (`./page` `frontEndRuns`); absent, never. */
  frontEndRuns?: () => boolean;
  /**
   * OT.R60 (e): the page's game audio's menu cues (`./page` `overlayPageReads.sounds`: the front end's `UiSoundCues`),
   * or null while none is loaded; absent, none -- the open and the close are silent then.
   */
  sounds?: () => OverlayCues | null;
  /** OT.R60 (e): the open's and the close's transition (`./motion`); `false` completes each at once. Default true. */
  motion?: boolean;
  /**
   * OVERLAY-CONSOLE: the console's adapters over the overlay's reads (absent: `../../console/adapters` `overlayAdapters`).
   * A test's seam: it is handed the overlay's own session, disc state and real pads.
   */
  adapters?: (inner: Document, deps: OverlayAdapterReads) => Adapters & { dispose?(): void };
}

/** What the overlay hands the console's adapters (OVERLAY-CONSOLE). */
export interface OverlayAdapterReads {
  session: ModernSession;
  state: LauncherState;
  pads: PadSource;
  servedTree?: () => boolean;
  report: NonNullable<Adapters['report']>;
  /** MU2-16: the opening button (`./binding`), for the console's Options > Controller > Overlay button. */
  overlayButton: { home: number; read(): number; save(button: number): void; name(button: number): string };
  /** HD-4 review F2: whether the page's match follows the page's picture (Display's "Video" row shown). */
  videoPicture?: boolean;
}

export interface Overlay {
  /** The overlay's own document's frame over the page; null before the first open (the closed overlay is inert). */
  readonly el: HTMLIFrameElement | null;
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Calls `cb` with each open (true) and close (false); answers the unsubscribe. */
  onChange(cb: (open: boolean) => void): () => void;
  /** One frame's read of the toggle -- the opening button, 16 unless rebound (the loop calls it each frame; a test calls it by hand). */
  poll(): void;
  /** OVERLAY-CONSOLE: the console drawn in the frame while open, else null. */
  console(): ConsolePage | null;
  dispose(): void;
}

type Pads = ArrayLike<PadLike | null>;
const RELEASED = Object.freeze({ pressed: false, touched: false, value: 0 });
const down = (b: { pressed: boolean; value: number } | undefined): boolean => !!b && (b.pressed || b.value >= 0.5);

/** `pad` as the game reads it while the overlay is open: the same pad, untouched. */
function untouched(pad: PadLike): PadLike {
  const p = pad as PadLike & { timestamp?: number; vibrationActuator?: unknown };
  return {
    id: p.id, index: p.index, connected: p.connected, mapping: p.mapping, timestamp: p.timestamp,
    vibrationActuator: p.vibrationActuator, nativePressure: p.nativePressure, stanceCancelled: true,
    axes: p.axes.map(() => 0), buttons: p.buttons.map(() => RELEASED),
  } as PadLike;
}

/** `pad` with the buttons in `held` read as released. */
function withheld(pad: PadLike, held: ReadonlySet<number>): PadLike {
  const p = pad as PadLike & { timestamp?: number; vibrationActuator?: unknown };
  return {
    id: p.id, index: p.index, connected: p.connected, mapping: p.mapping, timestamp: p.timestamp,
    vibrationActuator: p.vibrationActuator, nativePressure: p.nativePressure, stanceCancelled: p.stanceCancelled,
    axes: p.axes, buttons: p.buttons.map((b, i) => (held.has(i) ? RELEASED : b)),
  } as PadLike;
}

const mounted = new WeakMap<Document, Overlay>();

/**
 * MU2-10: Tab and Shift+Tab come round inside `root` (the overlay's body): from the last control to the first and back.
 * A dialog of the console's or the Report open inside it keeps the same ring (the Report has its own, `../report`).
 * Answers the undo.
 */
function trapTab(root: HTMLElement): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    const list = focusables(root);
    if (!list.length) return;
    const first = list[0]!, last = list[list.length - 1]!;
    const at = root.ownerDocument.activeElement;
    if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  };
  root.addEventListener('keydown', onKey);
  return () => { root.removeEventListener('keydown', onKey); };
}

/**
 * MU2-10 (MU2.R4): the seam's one call (`../../pageEntry` `bootPage`, after a page has booted): the overlay mounted over
 * `doc` unless the page is the console (`./page` `overlayEnabled`), told what the page holds -- the game's account, a
 * round, the START boundary (`./page` `overlayPageReads`). Null over the console.
 */
export function mountPageOverlay(doc: Document, page: OverlayPage, extra: Omit<OverlayOptions, 'game' | 'roundRunning' | 'startBoundary' | 'servedTree' | 'sounds' | 'frontEndRuns'> = {}): Overlay | null {
  if (!overlayEnabled(page.kind)) return null;
  const reads = overlayPageReads(page, doc.defaultView);
  return mountOverlay(doc, { ...extra, pageKind: page.kind, game: reads.game, roundRunning: reads.roundRunning, startBoundary: reads.startBoundary, servedTree: reads.servedTree, sounds: reads.sounds, frontEndRuns: reads.frontEndRuns });
}

/**
 * TOUCH_MENU_BAR_GAP_ADAPTATION: px between a page's shown `#site-links` bar and the touch Menu button pushed below it
 * (the forge / front-end seat's #site-links row, 2026-10-18, from the merge controller's B61 re-read: on the test room's
 * page the button sat over the bar's links at every touch size measured). A browser adaptation, no original.
 */
export const TOUCH_MENU_BAR_GAP_ADAPTATION = 8;
/**
 * The body's class while the touch Menu button sits pushed below a page's `#site-links` bar (the merge controller's F2
 * rule, 2026-10-18): the page's `#panel`, `#controls` and `#mobile-tip` then start below the button, at the root's
 * `--mu-touch-menu-clear` (the button's bottom plus `TOUCH_MENU_BAR_GAP_ADAPTATION`; `./overlay.css`). A browser
 * adaptation.
 */
export const MENU_BELOW_BAR_CLASS = 'mu-menu-below-bar';
/**
 * The page bar the touch Menu button keeps clear of: the test room's `#site-links`, or a page's own top bar marked
 * `data-mu-top-bar` (the forge's toolbar, `../../forge/page` `header.fx-top`: B103's slot, where the forge's Save sat
 * under the button on a host whose browser reports touch points). A browser adaptation.
 */
export const TOUCH_MENU_BAR_SELECTOR = '#site-links, [data-mu-top-bar]';

/**
 * Mounts the overlay over `doc`'s page, closed; one per document -- a second call answers the first's. Its toggle is
 * read each frame from then on. Which pages take it is the seam's (`mountPageOverlay`).
 */
export function mountOverlay(doc: Document, opts: OverlayOptions): Overlay {
  const existing = mounted.get(doc);
  if (existing) return existing;
  const win = doc.defaultView;
  const nav = (opts.nav ?? win?.navigator ?? {}) as PadSource & Record<string, unknown>;
  const real = typeof nav.getGamepads === 'function' ? nav.getGamepads : null;
  const own = Object.getOwnPropertyDescriptor(nav, 'getGamepads');
  const readReal = (): Pads => connectedPads({ getGamepads: () => real?.call(nav) ?? [] });
  const realSource: PadSource = { getGamepads: readReal };
  /**
   * MU2-16: the player's game bindings as the game reads them now -- whether the opening button is a game button, and
   * where START is. Read fresh at each decision (MU2-16's review F2): a `GamePad` (`../../setupPad`) made for the read
   * takes the pad selection and the pad's profile from the store at its first poll (`../../controllerInput`
   * `ControllerInput.poll` L68-73 reads a profile only when the pad's identity changes, so one kept for the page would
   * keep the profile it first read until a reload, and a rebind on Settings > Controller would not be seen). Not by the
   * store's `storage` event: it fires in the origin's other documents, never in the window that wrote, and every module
   * of the page -- the console drawn in this overlay's frame among them -- writes through the page's own window
   * (`../../pageStore` `pageSettings`, `globalThis.localStorage`). Read only while the bound button is down and not
   * spent, and at a close: two reads of the store a call (the pad selection, the pad's profile).
   */
  const gameConfig = (): ControllerConfig => { const p = new GamePad({ waitForRest: false }); p.poll(realSource); return p.input.config; };
  /** The game's START, where the player's bindings put it: not held back at the close unless it is the opening button. */
  const startButton = (config: ControllerConfig): number => config.bindings[PAD_BUTTON.Start] ?? PAD_BUTTON.Start;
  const clock = opts.now ?? ((): number => win?.performance?.now() ?? Date.now());

  // ---- the game's pad: shadowed while open, and after it for the buttons held through the close ----
  /** The way the overlay is going (`isOpen`): true from the open's start, false from the close's. */
  let open = false;
  /**
   * OT.R60 (e): where the transition is -- `closed`, `opening` (the console mounted, the pad not yet its), `open` (the
   * console reads the pad), `closing` (the game still shadowed until the blur is gone).
   */
  let phase: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  let shadowed = false;
  const held = new Map<number, Set<number>>();                 // pad index -> the buttons held back since the close
  const restore = (): void => {
    if (!shadowed) return;
    shadowed = false;
    held.clear();
    if (own) Object.defineProperty(nav, 'getGamepads', own);
    else delete nav['getGamepads'];
  };
  /** Lets go of each held-back button the pad has let go; the navigator restored once none is left. */
  const settle = (pads: Pads): void => {
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const set = p ? held.get(p.index) : undefined;
      if (!p || !set) continue;
      for (const b of [...set]) if (!down(p.buttons[b])) set.delete(b);
      if (!set.size) held.delete(p.index);
    }
    if (phase === 'closed' && !held.size) restore();
  };
  const shadowRead = (): Pads => {
    const pads = readReal();
    const out: (PadLike | null)[] = [];
    if (phase !== 'closed') {                                         // OT.R60 (e): through the close's transition too
      for (let i = 0; i < pads.length; i++) { const p = pads[i]; out.push(p ? untouched(p) : null); }
      return out;
    }
    settle(pads);
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const set = p ? held.get(p.index) : undefined;
      out.push(p ? (set ? withheld(p, set) : p) : null);
    }
    return out;
  };
  const shadow = (): void => {
    if (shadowed || !real) return;
    shadowed = true;
    Object.defineProperty(nav, 'getGamepads', { configurable: true, enumerable: false, writable: true, value: shadowRead });
  };

  // ---- the overlay's own document: made at the first open, never before (the closed overlay is inert) ----
  let frame: HTMLIFrameElement | null = null;
  let inner: Document | null = null;
  let innerWin: Window | null = null;
  /** MU2-10 (b): the frame's requests built from the page's address -- adopted when the frame is made. */
  let unadopt = (): void => {};
  /** A development build's F9 on the frame's own window (the DEV block below), attached when the frame is made. */
  let innerKeys: ((w: Window) => () => void) | null = null;
  let offInnerKeys = (): void => {};
  const copied = new WeakSet<Node>();
  let consoleSheet: HTMLLinkElement | null = null;
  /**
   * The page's stylesheets (the design system, the modern UI's, this file's), copied into the overlay's document, and the
   * console's own sheet (OVERLAY-CONSOLE: a game page links the design system, whose cx layer draws the console, but not
   * the console page's own rules).
   */
  const copyStyles = (d: Document): void => {
    for (const n of doc.head.querySelectorAll('style, link[rel="stylesheet"]')) {
      if (copied.has(n)) continue;
      copied.add(n);
      d.head.append(d.importNode(n, true));
    }
    if (!consoleSheet) {
      consoleSheet = d.createElement('link');
      consoleSheet.rel = 'stylesheet';
      consoleSheet.href = CONSOLE_SHEET;
      consoleSheet.dataset['overlayConsoleSheet'] = '';
      d.head.append(consoleSheet);
    }
    for (const a of [...doc.documentElement.attributes]) if (a.name === 'class' || (a.name.startsWith('data-') && a.name !== 'data-console' && a.name !== 'data-input')) {
      if (a.name === 'class') d.documentElement.classList.add(...a.value.split(/\s+/).filter(Boolean));
      else d.documentElement.setAttribute(a.name, a.value);
    }
  };
  /** Out of the page's input while closed: hidden (`./overlay.css`), inert (no pointer, no focus, no key), unfocused. */
  const stowFrame = (): void => {
    if (!frame) return;
    frame.hidden = true;
    frame.toggleAttribute('inert', true);
    if (doc.activeElement === frame) frame.blur();
  };
  /**
   * The frame, made at the first open and kept (stowed at each close): its document marked, the sheets copied (the frames'
   * F-D: the console's own linked sheet loads under the first open's ramp), its body the modal dialog, the page's address
   * adopted for its requests, and a development build's F9 on its window.
   */
  const ensureFrame = (): Document => {
    if (frame && inner) return inner;
    const f = doc.createElement('iframe');
    f.className = 'mu-overlay-frame';
    // OT.R60 (d): the named constants, into the frame's custom properties (`./overlay.css` reads them).
    f.style.setProperty('--mu-overlay-blur', `${OVERLAY_BLUR_PX_ADAPTATION}px`);
    f.style.setProperty('--mu-overlay-dim', String(OVERLAY_DIM_ADAPTATION));
    f.style.setProperty('--mu-overlay-scrim', String(OVERLAY_SCRIM_ADAPTATION));
    f.title = 'Overlay (browser adaptation)';
    f.hidden = true;
    f.toggleAttribute('inert', true);
    doc.body.append(f);
    const d = f.contentDocument!;
    frame = f; inner = d; innerWin = f.contentWindow;
    d.documentElement.classList.add('mu-overlay-doc');
    // OVERLAY-CONSOLE: the console's own rules apply under its mark (`../../console/console.css`), in this document only.
    d.documentElement.setAttribute('data-console', '');
    d.documentElement.dataset['input'] = 'pointer';
    copyStyles(d);
    // The overlay's body is its modal dialog: the console's regions in it (`OVERLAY_CONSOLE_BODY`), the Report's host beside.
    d.body.setAttribute('role', 'dialog');
    d.body.setAttribute('aria-modal', 'true');
    d.body.setAttribute('aria-label', 'Overlay: SOCOM II Legacy (browser adaptation)');
    unadopt = win ? adoptPageWindow(d, win) : (): void => {};      // MU2-10 (b): never this frame's `about:blank`
    if (innerKeys && innerWin) offInnerKeys = innerKeys(innerWin);
    return d;
  };

  // ---- MU2-16: the opening button (OT.R51) -- 16 unless rebound; a press, or a hold where the game reads it ----
  let bound = readOverlayButton();
  /** The bound button was down last frame (a press is its going down). */
  let boundWas = false;
  /** Its press time while a hold counts toward the threshold; null while it is up, or once it has acted. */
  let holdSince: number | null = null;
  /** It has acted, or a binding capture or a new binding had it: nothing more until it is let go. */
  let boundSpent = false;
  /** The capture was on at the last frame (the frame a capture ends on is still the capture's). */
  let captureWas = false;
  let page: ConsolePage | null = null;
  // A new binding: followed at once, its press spent, and the open console's close control renamed (MU2-16's review F3).
  const offBinding = onOverlayButtonChange((b) => { bound = b; boundSpent = true; holdSince = null; page?.render(); });
  /** One frame of the bound button (`isDown`: held in any read this frame): whether it opens or closes the overlay now. */
  const boundActs = (isDown: boolean, now: number): boolean => {
    const capture = open && (page?.ctl.capturing() ?? false);
    const captured = capture || captureWas;
    captureWas = capture;
    const pressed = isDown && !boundWas;
    boundWas = isDown;
    if (!isDown) { holdSince = null; boundSpent = false; return false; }
    if (boundSpent) return false;
    if (captured) { holdSince = null; boundSpent = true; return false; }   // the capture's button
    // LATER 87: over the forge its own map too, but not in its Play match (the forge's round, `./page` `roundRunning`);
    // there the match's exit chord's buttons are a hold (LATER 92), so in that round they are the page's alone.
    if (overlayOpensBy(bound, gameConfig(), opts.pageKind, opts.pageKind === 'forge' && roundRunning()) === 'press') {
      if (!pressed) return false;
      boundSpent = true;
      return true;
    }
    // A game button: in a running round, closed, its hold is the game's for the whole of it (MU2-11's review F1's rule).
    if (!open && roundRunning()) { holdSince = null; boundSpent = true; return false; }
    if (holdSince === null) holdSince = now;
    if (now - holdSince < SELECT_HOLD_MS_ADAPTATION) return false;
    holdSince = null; boundSpent = true;
    return true;
  };
  /** The opening button's name (and a development build's F9), for the console's close control. */
  const toggleName = (): string => `${overlayButtonName(bound, readReal()[0]?.id)}${import.meta.env.DEV ? ' / F9' : ''}`;
  /** The seat's frames' F-A: the opening button's short cap, for the compact close control's glyph (its full name the label). */
  const toggleCap = (): string => overlayButtonCap(bound, readReal()[0]?.id);

  // ---- the console, booted in the frame at each open and taken down at each close (brief 4.1, 4.2) ----
  // MU2-10 (a): the game's persona when the page's game holds one, else the overlay's own session (`./session`) -- made at
  // the first open (the page's own session, `../session` `pageSession`, adds its `pagehide` listener when it is made).
  let persona: OverlaySession | null = null;
  const ensureSession = (): OverlaySession => {
    persona ??= overlaySession(opts.session ?? pageSession(win ?? window), opts.game ?? (() => null));
    return persona;
  };
  // MU2-10: on the disc page the overlay's own session ends at the image's START (MU-F2a), as the retired shell's did --
  // registered at the mount (the launch gate's own list, no listener), the session read at the START itself: a session
  // signed in by then (the page's own, `pageSession`, is one per page) is ended whether or not the overlay was opened.
  const offLaunch = opts.startBoundary ? registerBeforeLaunch(doc, () => endForLaunch(ensureSession().session)) : (): void => {};
  const state = opts.state ?? launcherState(doc);
  const roundRunning = opts.roundRunning ?? ((): boolean => false);
  // MU2-12 (MU2-10's review F2; MU2.R6): the round followed while open. Its readers (`./page`: the front end's match
  // phase, the test room's room) have no change event, so each frame compares the read with the last one and draws the
  // console again on a change (its locks and Watch's gate read the round at each draw); closed, nothing is drawn and
  // nothing is read (the console's mount reads it afresh).
  const readRound = (): boolean => { try { return roundRunning(); } catch { return false; } };
  let roundWas = false;
  const followRound = (): void => {
    const now = readRound();
    if (now === roundWas) return;
    roundWas = now;
    if (page) { try { page.render(); } catch (e) { console.error('overlay: the console failed to follow the round', e); } }
  };
  /** OVERLAY-CONSOLE: what the console's overlay mode reads of the page, at each draw. */
  // Batch B's review F2: on the disc page (the START boundary's page) an empty disc store is a disc not chosen yet.
  const pageReads: ConsolePageReads = { gameHolds: () => persona?.gameHolds() ?? false, roundRunning: readRound, gamePage: () => true, toggleName, toggleCap, discOnPage: () => !!opts.startBoundary, frontEndRuns: () => opts.frontEndRuns?.() ?? false };
  let adapters: (Adapters & { dispose?(): void }) | null = null;
  let report: ReportDialog | null = null;
  let trap: (() => void) | null = null;
  /** The console's pad poll, run on the toggle's frame while open (`padFrame`). */
  let consoleQueued: ((now: number) => void) | null = null;
  const reportOpen = (): boolean => !!report && !report.el.hidden;
  /** The Report (FB-1's dialog) as the console's Server > Report a problem row opens it. */
  const reportAdapter: NonNullable<Adapters['report']> = {
    open: () => { report?.open(); },
    isOpen: reportOpen,
  };
  const makeAdapters = opts.adapters ?? ((d: Document, r: OverlayAdapterReads) => overlayAdapters(d, win ?? window, r));
  const mountContent = (inner: Document): void => {
    const { session } = ensureSession();
    roundWas = readRound();
    inner.body.innerHTML = OVERLAY_CONSOLE_BODY;
    const app = inner.querySelector<HTMLElement>('.cx-app')!;
    // The Report's dialog beside the console, never inside it: the console is made inert under it (FB-1's `inertRoot`).
    // The modern UI's own mark (`../tokens.css` `[data-modern]`) on its host, as the retired shell's root carried it.
    const reportHost = inner.createElement('div');
    reportHost.className = 'mu-overlay__report-host';
    reportHost.setAttribute('data-modern', '');
    inner.body.append(reportHost);
    adapters = makeAdapters(inner, {
      session, state, pads: realSource, report: reportAdapter, ...(opts.servedTree ? { servedTree: opts.servedTree } : {}),
      overlayButton: { home: OVERLAY_HOME_BUTTON, read: readOverlayButton, save: saveOverlayButton, name: (b) => overlayButtonName(b, readReal()[0]?.id) },
      videoPicture: videoPictureFollows(opts.pageKind ?? 'viewer'),
    });
    page = bootConsole(inner, innerWin ?? window, adapters, {
      keymap: import.meta.env.DEV,                                    // OT.R29: the frame's keys, a development build's only
      mode: 'overlay', page: pageReads, close: () => { doClose(); },
      frame: { request: (cb) => { consoleQueued = cb; return 1; }, cancel: () => { consoleQueued = null; } },
    });
    const ctx: LauncherContext = { state, session, mode: 'overlay' };
    report = mountReport(reportHost, ctx, { inertRoot: app });
    trap = trapTab(inner.body);                                   // MU2-10: Tab comes round inside the overlay
  };
  const unmountContent = (): void => {
    consoleQueued = null;
    trap?.(); trap = null;
    report?.dispose(); report = null;
    page?.dispose(); page = null;
    adapters?.dispose?.(); adapters = null;
    inner?.body.replaceChildren();
  };

  /** The Report open: the console's pad stands down; Circle (the standard mapping's 1) closes the dialog, as its Escape. */
  let circleWas = false;
  /** One frame of the pad inside the open overlay: the console's poll (its grammar over the real pad), or the Report's Circle. */
  const padFrame = (now: number): void => {
    if (reportOpen()) {
      let circle = false;
      const pads = readReal();
      for (let i = 0; i < pads.length; i++) if (down(pads[i]?.buttons[1])) circle = true;
      if (circle && !circleWas) report?.close();
      circleWas = circle;
      return;
    }
    circleWas = false;
    const q = consoleQueued; consoleQueued = null; q?.(now);
  };

  // ---- OT.R60 (e): the open's and the close's cue and transition ----
  const motion = opts.motion ?? true;
  /** The menus' cue for the open or the close, through the page's game audio; silent with no disc audio loaded. */
  const cue = (way: 'open' | 'close'): void => {
    let cues: OverlayCues | null = null;
    try { cues = opts.sounds?.() ?? null; } catch { cues = null; }
    if (!cues) return;
    try {
      if (way === 'close') cues.back();
      else if (readRound()) cues.play(UI_POPUP_SOUND, { volume: OVERLAY_ROUND_CUE_VOLUME_ADAPTATION, pan: -1, pitchMod: 0, forceOneShot: true }, 'popup');
      else cues.popup();
    } catch (e) { console.error('overlay: the cue failed', e); }
  };
  const reducedMotion = (): boolean => { try { return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; } };
  /** The ramp under way: the share open at its start and its end, its start (`Date.now`) and length. */
  let ramp = { from: 0, to: 0, at: 0, ms: 0 };
  let rampTimer: ReturnType<typeof setTimeout> | null = null;
  /** The share of the way open now (0 closed, 1 open), by the ramp's time. */
  const shownShare = (): number => {
    if (ramp.ms <= 0) return ramp.to;
    const k = Math.max(0, Math.min(1, (Date.now() - ramp.at) / ramp.ms));
    return ramp.from + (ramp.to - ramp.from) * k;
  };
  /** Marks the phase on the frame (its blur and dim) and on the frame's document (the panels): `./overlay.css`. */
  const mark = (p: typeof phase): void => {
    if (frame) frame.dataset['phase'] = p;
    if (inner) inner.documentElement.dataset['overlayPhase'] = p;
  };
  /** Starts the ramp toward `to`, from where the last one had come; `done` at its end (at once without motion). */
  const startRamp = (to: 'open' | 'closed', done: () => void): void => {
    const from = shownShare();
    const r = overlayRamp(to, from, reducedMotion());
    for (const [k, v] of Object.entries(r.vars)) { frame?.style.setProperty(k, v); inner?.documentElement.style.setProperty(k, v); }
    if (rampTimer !== null) { clearTimeout(rampTimer); rampTimer = null; }
    ramp = { from, to: to === 'open' ? 1 : 0, at: Date.now(), ms: motion ? r.ms : 0 };
    mark(to === 'open' ? 'opening' : 'closing');
    if (!motion || r.ms <= 0) { done(); return; }
    rampTimer = setTimeout(() => { rampTimer = null; done(); }, r.ms);
  };

  let returnFocus: HTMLElement | null = null;
  let disposed = false;
  const editorOwner = {};
  let releaseEditor: (() => void) | null = null;
  const releaseOwnership = (): void => { releaseEditor?.(); releaseEditor = null; };
  const watchers = new Set<(open: boolean) => void>();
  const say = (): void => { for (const cb of [...watchers]) { try { cb(open); } catch (e) { console.error('overlay: a watcher failed', e); } } };
  /** F-D: the console's own transitions off (`./overlay.css`) from its first draw until the open completes. */
  const settling = (on: boolean): void => { inner?.documentElement.toggleAttribute('data-overlay-settling', on); };
  /** The open completed: the console's the pad from now on (`padFrame`), its own transitions on again. */
  const openDone = (): void => { phase = 'open'; mark('open'); settling(false); };
  const doOpen = (): void => {
    if (open || disposed) return;
    // MLS.R7: every entry path reaches this gate before making adapters or shadowing the game's input. Native
    // Settings keeps its lease while loading/unavailable; Home keeps its lease through the full close transition.
    if (!releaseEditor) {
      releaseEditor = claimSettingsEditor(doc, editorOwner);
      if (!releaseEditor) return;
    }
    open = true;
    if (phase === 'closing') {                                       // OT.R60 (e): reversed mid-way, nothing remounted
      phase = 'opening';
      startRamp('open', openDone);
      cue('open');
      say();
      return;
    }
    held.clear();
    phase = 'opening';                                               // the game's read untouched from here (`shadowRead`)
    shadow();
    returnFocus = doc.activeElement instanceof (win?.HTMLElement ?? HTMLElement) ? doc.activeElement as HTMLElement : null;
    if (doc.pointerLockElement) doc.exitPointerLock?.();
    let d!: Document;
    try {
      d = ensureFrame();                                             // the first open makes the frame (the closed overlay is inert)
      copyStyles(d);                                                 // any sheet the page added since
      settling(true);
      mountContent(d);
    } catch (e) {
      // OV-2 review 3: a failed mount undoes the open -- the pad the game's again at once, nothing left drawn.
      open = false;
      phase = 'closed';
      settling(false);
      try {
        try { unmountContent(); } catch { inner?.body.replaceChildren(); }
        restore();
        stowFrame();
        returnFocus = null;
      } finally { releaseOwnership(); }
      throw e;
    }
    const f = frame!;
    // OT.R60 (e): drawn first at the closed end of the ramp (the styles read once), then ramped in.
    phase = 'opening';
    ramp = { from: 0, to: 0, at: Date.now(), ms: 0 };
    mark('closed');
    f.removeAttribute('inert');
    f.hidden = false;
    void f.offsetWidth;
    void d.documentElement.offsetWidth;
    f.focus();
    (d.querySelector<HTMLElement>('#stage .is-focused') ?? d.querySelector<HTMLElement>('#stage button'))?.focus();
    startRamp('open', openDone);
    cue('open');
    say();
  };
  /**
   * The close completed (the blur gone): the game's the pad again -- the buttons held now stay released to it until let
   * go -- and the console taken down.
   */
  const closeDone = (): void => {
    phase = 'closed';
    mark('closed');
    // The buttons held now stay released to the game until they are let go -- START excepted (MU2-10: the game's START
    // menu under a held START), unless START is the opening button: then the closing hold is held back as any bound
    // game button's is, so the close is no fresh START press to the game (MU2-16's review F1).
    const start = startButton(gameConfig());
    const pads = readReal();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p) continue;
      const set = new Set<number>();
      p.buttons.forEach((b, j) => { if (down(b) && (j !== start || j === bound)) set.add(j); });
      if (set.size) held.set(p.index, set);
    }
    if (!held.size) restore();
    try { unmountContent(); } finally { releaseOwnership(); }
    settling(false);
    stowFrame();                                                     // hidden and inert: the page's input is the page's
    returnFocus?.focus?.();
    returnFocus = null;
  };
  const doClose = (): void => {
    if (!open) return;
    open = false;
    phase = 'closing';
    startRamp('closed', closeDone);
    cue('close');
    say();
  };

  // ---- the toggles: the opening button each frame (MU2-16: 16 unless rebound), the development build's key ----
  const poll = (): void => {
    if (disposed) return;
    persona?.sync();                                               // MU2-10 (a): the game's persona followed, each frame, once made
    if (page) followRound();                                       // MU2-12: the round followed while the console is drawn
    const now = clock();
    // OV-2 review 2: the page's read and, while open, the focused overlay document's -- Chromium can hand a document no
    // pad (nulls) until it has seen a gesture there, so the opening button is looked for in both.
    const reads: Pads[] = [readReal()];
    const innerNav = innerWin?.navigator as PadSource | undefined;
    if (open && typeof innerNav?.getGamepads === 'function') { try { reads.push(innerNav.getGamepads() ?? []); } catch { /* none */ } }
    let isDown = false;
    for (const pads of reads) for (let i = 0; i < pads.length; i++) if (down(pads[i]?.buttons[bound])) isDown = true;
    const toggled = boundActs(isDown, now);                         // spent before the toggle: a failed open waits for a new press
    if (toggled) { if (open) doClose(); else doOpen(); }
    if (phase === 'closed' && shadowed) settle(readReal());
    if (phase === 'open' && !toggled) padFrame(now);              // OT.R60 (e): the pad the console's once the open completed
  };
  const isToggleKey = (e: KeyboardEvent): boolean =>
    e.code === OVERLAY_TOGGLE_ADAPTATION.key && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey;
  const onPageKey = (e: KeyboardEvent): void => {
    if (isToggleKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); if (open) doClose(); else doOpen(); return; }
    if (phase !== 'closed') { e.preventDefault(); e.stopImmediatePropagation(); }   // a key left on the page: never the game's while shown
  };
  const onInnerKey = (e: KeyboardEvent): void => {
    if (isToggleKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); if (open) doClose(); else doOpen(); }
  };
  if (import.meta.env.DEV) {                                       // OT.R29: a development build's keyboard only
    keyboardSite('s2u-kb-chrome-keys');
    win?.addEventListener('keydown', onPageKey, { capture: true });
    // The frame's own window takes F9 from the frame's making (the first open) on; nothing of it before.
    innerKeys = (innerWin) => { innerWin?.addEventListener('keydown', onInnerKey, { capture: true }); return () => { innerWin?.removeEventListener('keydown', onInnerKey, { capture: true }); }; };
  }

  const schedule = opts.frame ?? ((cb: () => void): number => win?.requestAnimationFrame(cb) ?? 0);
  // Browser adaptation: the same menu is reachable on a phone without a physical Home button.
  const touchMenu = doc.createElement('button');
  touchMenu.type = 'button'; touchMenu.className = 'mu-touch-menu';
  touchMenu.textContent = 'Menu'; touchMenu.setAttribute('aria-label', 'Open in-game settings');
  touchMenu.hidden = !wantsTouchControls() && !(win?.navigator.maxTouchPoints);
  touchMenu.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  touchMenu.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const r = touchMenu.getBoundingClientRect();
    e.preventDefault(); e.stopPropagation();
    // A second thumb while the first holds fire produces no compatibility click on some touch browsers.
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      doOpen();
      // Issue #307: the overlay now covers the button, so the compatibility click that follows would land in the console
      // at this spot (a phantom press there); the frame's window takes that one click.
      swallowNextClick(frame?.contentWindow);
    }
  });
  touchMenu.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); doOpen(); });
  if (!touchMenu.hidden) doc.body.append(touchMenu);
  // The page's bar along the top (`TOUCH_MENU_BAR_SELECTOR`: the test room's #site-links, or a marked bar such as the
  // forge's toolbar): a shown bar the button would cover pushes it below the bar, measured at the mount, at each resize,
  // and whenever the bar's own box changes (a ResizeObserver on it: the test room's map dropdown is shown after the mount,
  // with no resize -- the review's F1), from the sheet's own place (its inline top cleared first). A page with no bar, or
  // a hidden one (no box), keeps the sheet's place.
  // F2 (the merge controller's rule): while pushed, the page's panel, controls and tip start below the button.
  const setClear = (px: number | null): void => {
    doc.body.classList.toggle(MENU_BELOW_BAR_CLASS, px !== null);
    if (px === null) doc.documentElement.style.removeProperty('--mu-touch-menu-clear');
    else doc.documentElement.style.setProperty('--mu-touch-menu-clear', `${px}px`);
  };
  const measureMenu = (): void => {
    if (touchMenu.hidden) return;
    touchMenu.style.top = '';
    setClear(null);
    const bar = doc.querySelector(TOUCH_MENU_BAR_SELECTOR);
    if (!bar) return;
    const b = bar.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return;
    const m = touchMenu.getBoundingClientRect();
    const covers = m.left < b.right && b.left < m.right && m.top < b.bottom && b.top < m.bottom;
    if (!covers) return;
    const top = Math.ceil(b.bottom) + TOUCH_MENU_BAR_GAP_ADAPTATION;
    touchMenu.style.top = `${top}px`;
    setClear(top + Math.ceil(m.height) + TOUCH_MENU_BAR_GAP_ADAPTATION);
  };
  // Browser adaptation (the mobile-controls rework's merge, `../../mobileControls.css`): the touch dock moves the button to
  // the bottom while the touch layer walks (the body's `touch is-walking`, not `pad-on`; the front end's `#menu-touch`
  // shown) and back to the top otherwise -- a class change, no resize -- so a change there measures again; the
  // measure's own class toggles on the body are taken off the watch's queue (`takeRecords`), never measured again.
  const placeMenu = (): void => { measureMenu(); layerWatch?.takeRecords(); };
  // Only where it can matter -- a shown button and a bar on the page -- so a closed overlay stays inert elsewhere
  // (OVERLAY-CONSOLE: no listener but F9 at the mount).
  const watchesBar = !touchMenu.hidden && doc.querySelector(TOUCH_MENU_BAR_SELECTOR) !== null;
  const RO = (win as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  const barWatch = watchesBar && RO ? new RO(() => placeMenu()) : null;
  const MO = (win as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
  const layerWatch = watchesBar && MO ? new MO((records) => {
    if (records.some((r) => r.target === doc.body || (r.target as Element).id === 'menu-touch')) placeMenu();
  }) : null;
  if (watchesBar) {
    placeMenu();
    win?.addEventListener('resize', placeMenu);
    const bar = doc.querySelector(TOUCH_MENU_BAR_SELECTOR);
    if (bar) barWatch?.observe(bar);
    layerWatch?.observe(doc.body, { attributes: true, attributeFilter: ['class', 'hidden'], subtree: true });
  }
  const cancel = opts.cancelFrame ?? ((id: number): void => { win?.cancelAnimationFrame(id); });
  let frameId = 0;
  // OV-2 review 3: the next frame asked for before this one's poll, and a failure said, never the loop's end.
  const loop = (): void => {
    if (disposed) return;
    frameId = schedule(loop);
    try { poll(); } catch (e) { console.error('overlay: the toggle failed', e); }
  };
  frameId = schedule(loop);

  const overlay: Overlay = {
    get el() { return frame; },
    isOpen: () => open,
    open: doOpen,
    close: doClose,
    toggle: () => { if (open) doClose(); else doOpen(); },
    onChange(cb) { watchers.add(cb); return () => { watchers.delete(cb); }; },
    poll,
    console: () => page,
    dispose(): void {
      if (disposed) return;
      // Taken down at once, with no cue and no transition (a dispose is no player's close).
      if (rampTimer !== null) { clearTimeout(rampTimer); rampTimer = null; }
      const was = open;
      open = false;
      if (phase !== 'closed') closeDone();
      releaseOwnership();
      if (was) say();
      disposed = true;
      if (watchesBar) win?.removeEventListener('resize', placeMenu);
      barWatch?.disconnect();
      layerWatch?.disconnect();
      if (watchesBar) setClear(null);
      touchMenu.remove();
      restore();
      cancel(frameId);
      win?.removeEventListener('keydown', onPageKey, { capture: true });
      offInnerKeys();
      offLaunch(); unadopt(); offBinding(); watchers.clear();
      frame?.remove();
      if (mounted.get(doc) === overlay) mounted.delete(doc);
    },
  };
  mounted.set(doc, overlay);
  return overlay;
}
