import { selectXboxGraphics } from '../graphicsBackend';
import { cueFor, cueSnap, type CueSnap, type UiCue } from './sounds';
import { CROUCH_BIND, type BindingEvent, type PadBinding } from '../padBinding';
import { TOUCHPAD_CROUCH_TOAST, applyPressureDefault } from '../controllerInput';
import { MOBILE_LAYOUT_ROW } from '../mobileLayout';
import { STANCE_MODE_WORDS, controllerStanceMode, defaultController, setControllerStanceMode } from '../startupSettings';
import { extractPress } from './render/extract';
import { senderButtons } from './render/discShare';
import { SENDER_TITLE, SHARE_CODE_BAD, SHARE_TITLE } from '../discShareWords';
import { DEAD_VALUES, PAD_DEAD_ZONE_LABEL, REMAP_ACTION_ROW, REMAP_FINISH_TOAST, REMAP_DEAD_ROW, REMAP_STANCE_ROW, extraAddedWords, remapActionOfRow, remapBindOfRow, remapExtraAt, remapLock, remapRowCount, rowOfPhysical, secondsLeft } from './render/remap';
import { PAD_EXTRA_ACTIONS } from '../padExtras';
import {
  CATS, DISC_SOURCES, HOME_CATEGORY, INSTALL_APP_ROW, KEPT_DISC_ROW, SHARE_SEND_ROW, LOADOUT_SAVE_ROW, OVERLAY_LOCK_WORDS, PERSONA_DELETE_ROW, PERSONA_EDIT_ROWS, PERSONA_GENDER_ROW, PERSONA_NEW_CREATE_ROW,
  MODS_DROP_ROW, MODS_FIRST_PACK_ROW, MODS_TEXTURE_ROW, modsRowCount, modsTestHdRow, PERSONA_NEW_GENDER_ROW, PERSONA_NEW_ROWS, PERSONA_PHRASE_ROW, PERSONA_TOWN_ROW, REMAP_ROW, canChangeRow, canResetRow, cardNames, deployChecks, discSource, homeItems, isToggleRow, loadoutRows, optRowsNow, THEME_PANEL_ROW, themePicks, loadoutSideItems, serverItems,
  optCategories, optTabs, overGame, personaEditLock, replayRows, replayStatus, roomFull, normalize, playNeed, roundRunning, selectedRoom, sessionLock, signInFresh, startReady, visibleRooms, browseRows, BROWSE_KINDS, BROWSE_CLASSIC, BROWSE_CUSTOM, customShown,
  inputReady, launchCheckRows, launchCheckStart, launchCheckTitle, LAUNCH_DEPLOY_ROW, LAUNCH_DISC_ROW, LAUNCH_PAD_ROW, LAUNCH_PADSET_ROW, LAUNCH_SHARE_ROW, LAUNCH_SKIP_ROW,
  type Adapters, type Button, type ConsoleState, type FieldTarget, type LoadoutLocked, type LoadoutOutcome, type LoadoutSide, type PersonaOutcome,
  type QuickSignIn, type ReplaysMore,
} from './state';
import { SKIP_MENU_ROW, setSkipMenu, skipMenuOn } from './skipMenu';
import { clearInviteTaken } from '../inviteHost';
import { REPLAY_ROUND_WORDS } from '../modern/replays/view';
import { LOADOUT_UNOFFERED_WORDS } from './render/loadouts';
import { editorRows, fieldMeta, normalizeProfile, personaItems, recordRows } from './render/profile';
import { customItems, forgetFocus, lobbyGameItems, lobbyRoomItems, normalizeLobbies } from './render/lobbies';
import type { LauncherNav, LauncherSnap } from './history';
import { settleLoadoutDeepLink } from './routes';
import { openDiscord } from './discord';
import { copyLauncherAddress, installCopyOffered } from '../pwa/install';

/**
 * LR-25 (the LR-24 review's F1): a gamepad press is no user gesture, so a browser refuses the disc's chooser then; the line
 * that says how to open it (the source menu's pad press, and since the LR-36 fold the launch check's disc row).
 */
const POINTER_CHOOSER_WORDS = 'Choose your disc with the pointer: a browser opens its chooser only for a click or a tap';
/**
 * RB-5 (product track; a browser adaptation, OT.R28): a gamepad press is no user activation, so a browser opens neither a
 * new tab (`window.open`: Experiments' Forge and Test room) nor a file chooser (the MODS drop row) for one. A pad's
 * Cross there says how on the legend's line, and no toast claims what did not happen; a click, a tap and a key do it
 * (`keyGesture`, `S.input`).
 */
export const NEW_TAB_POINTER_WORDS = 'Open it with the pointer or a key: a browser opens a new tab only for a click, a tap or a key';
/**
 * RB-45 (b), wave 1's review (product track; a browser adaptation, OT.R28): the Install app dialog where the page can
 * install (Chromium's held prompt) -- `prompt()` runs only from a trusted click (`../pwa/install`), so a pad's Cross there
 * says how on the legend's line. Where it cannot, Cross is the Copy launcher address (`copyLauncherAddress`).
 */
export const INSTALL_POINTER_WORDS = 'Install with the pointer: a browser installs an app only for a click or a tap';
export const MODS_CHOOSER_POINTER_WORDS = 'Choose a pack with the pointer, or drop it on this screen: a browser opens its chooser only for a click, a tap or a key';
/** RB-5: the toast Square's first press on a MODS pack says; the second removes it (the legend's Square is "Remove"). */
export const modsRemoveAsk = (name: string): string => `Remove ${name}? Press Remove again to remove it.`;

/**
 * The console launcher's grammar: one press handler per context (the S2U Briefing design system's "Console launcher"
 * prototype, its actions -- `toast`, `legendError`, `chooseDisc`, `openSignIn`, `account`, `start`, `doAct`,
 * `roomPick`, `optStep`, `optAction`, `siType` / `siSubmit` / `siKey` -- and `press(b)` / `pressSignIn(b)` /
 * `flipState`; its "Controller UI" section 2's table). Cross confirms and Circle backs everywhere; Triangle is the
 * account; L1 / R1 the menu; L2 / R2 a screen's filter, the keyboard's Shift / Done, or else a page of a list taller
 * than its pane (CX-12, `pageList`); Options is START from anywhere
 * but the keyboard. The click handler is here too (`pointer`), since it does the same verbs. A browser adaptation with
 * no original (the project's own launcher page, OT.R28): the launched game's flow is not touched.
 */

/** What the controller asks of the page. */
export interface Host {
  editMobileLayout?(): void;
  render(): void;
  /** Says `text` to assistive technology (the page's `#live` region). */
  announce(text: string): void;
  /** Re-reads the root scale (Interface size changed). */
  fit(): void;
  /** The hand-over (slice 3): stop reading the page's inputs, read them again, give the window to the front end. */
  suspend?(): void;
  resume?(): void;
  takeDown?(): void;
  /** Browser adaptation: logical menu presses drive local glyph feedback and the focused row's Cross mark. */
  pressed?(b: Button): void;
  /** OVERLAY-CONSOLE: Circle at the top of the overlay's console asks its host to close it (back to the game). */
  close?(): void;
  /**
   * CX-12: the rows in a page of the list holding the focused row -- its pane's height in rows -- when that list is taller
   * than its pane; null when it fits (`./render/frame` `pageRows`). Absent, nothing pages.
   */
  page?(): number | null;
  /** Browser adaptation: scroll the current read-only modal by part of its visible page, bounded to its content. */
  scrollDialog?(direction: -1 | 1): void;
}

/** CX-12: the list L2 / R2 page on a screen -- its focused row, its length, and how the focus moves. */
export interface PagedList { at: number; count: number; set(i: number): void }

/**
 * CX-12 (the design's controls page names it; CX-11's lists scroll): the list L2 / R2 page here, or null where they are
 * the screen's own or nothing is paged -- every dialog (the keyboard's Shift and Done are its L2 / R2), Browse rooms (its
 * filter roller), Options' tabs, the Disc source dropdown open, a binding listened for, a screen with no list drawn. The
 * lists: Home's category actions, the replays, Options' rows, the button mapping's rows, the loadouts' list and editor,
 * the persona list, its editor and the new persona's form, the Service record, a room's games and players, a game's
 * lines, Custom matches, and (RB-5) the Server screen's and the MODS screen's rows. A browser adaptation with no original
 * (OT.R28).
 */
export function pageList(S: ConsoleState, A: Adapters): PagedList | null {
  if (S.overlay) return null;
  const list = (at: number, count: number, set: (i: number) => void): PagedList | null => (count > 1 ? { at, count, set } : null);
  switch (S.screen) {
    case 'home': return S.src.open || S.thm.open || S.chk.open ? null   // LR-36: the launch check holds the pad
      : list(S.item[S.cat] ?? 0, homeItems(CATS[S.cat]!.id, S, A).length, (i) => { S.item[S.cat] = i; });
    case 'replays': return list(S.rp.row, replayRows(A).length, (i) => { S.rp.row = i; });
    case 'options': return S.opt.zone !== 'rows' ? null : list(S.opt.row, optRowsNow(S, A).length, (i) => { S.opt.row = i; });
    case 'remap': {
      const m = A.remap?.current() ?? null;
      return !m || m.listening() >= 0 ? null : list(S.rm.row, remapRowCount(m), (i) => { S.rm.row = i; });
    }
    case 'loadoutSides': return list(S.lo.row, 2, (i) => { S.lo.row = i; });
    case 'loadouts': return A.loadouts?.list().kind === 'ok' ? list(S.lo.row, loadoutRows(A).length, (i) => { S.lo.row = i; }) : null;
    case 'loadout': return A.loadouts?.editor().kind === 'ok' ? list(S.lo.edit, LOADOUT_SAVE_ROW + 1, (i) => { S.lo.edit = i; }) : null;
    case 'persona': return A.profile ? list(S.pf.row, personaItems(A).length, (i) => { S.pf.row = i; }) : null;
    case 'personaEdit': {
      const v = S.pf.id === null ? null : A.profile?.editor(S.pf.id) ?? null;
      return v?.kind === 'ok' ? list(S.pf.edit, PERSONA_EDIT_ROWS, (i) => { S.pf.edit = i; }) : null;
    }
    case 'personaNew': return A.profile ? list(S.pf.nw.row, PERSONA_NEW_ROWS, (i) => { S.pf.nw.row = i; }) : null;
    case 'record': return A.profile ? list(S.pf.rec, recordRows(A).length, (i) => { S.pf.rec = i; }) : null;
    case 'room': return list(S.lb.row, lobbyRoomItems(A, S.lb.room).length, (i) => { S.lb.row = i; });
    case 'game': return list(S.lb.grow, lobbyGameItems(A, S.lb.game).length, (i) => { S.lb.grow = i; });
    case 'custom': return A.custom ? list(S.lb.crow, customItems(S, A).length, (i) => { S.lb.crow = i; }) : null;
    case 'server': return list(S.sv.row, serverItems(A).length, (i) => { S.sv.row = i; });            // RB-5
    case 'mods': return list(S.md.row, modsRowCount(A), (i) => { S.md.row = i; });                     // RB-5
    default: return null;                                             // Browse rooms: L2 / R2 its filter roller
  }
}

/** The OnScreenKeyboard's rows; the wide row (4) is Shift, Space, Delete, Done. */
export const OSK_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm._@'] as const;
/** From the wide row, up lands on these columns (OnScreenKeyboard README). */
export const WIDE_COL = [0, 2, 6, 8] as const;
/** The prototype's length cap (name and password), where the session gives none (the sample adapters). */
export const SIGN_IN_TEXT_MAX = 24;
/**
 * The agreement text's scroll per up / down: the step the retired modern panel took (`../modern/agreement/agreement`
 * `MU_AGREEMENT_SCROLL_STEP_ADAPTATION`, 24 CSS px: one of its lines; the original scrolls one SPACING).
 */
export const AGREEMENT_SCROLL_STEP = 24;
/** A sign-in's toast: "Signed in as <name>", and the agreement's line when it was accepted earlier (AGREEMENT-ONCE). */
const signedInWords = (name: string, accepted?: string): string => `Signed in as ${name}${accepted ? `. ${accepted}` : ''}`;
/** The Search query's cap: a lobby name is shorter (the original's game name field). */
export const SEARCH_TEXT_MAX = 64;

/** One D-pad step on the on-screen keyboard's grid (OnScreenKeyboard README: the wide row's column map). */
export function oskStep(k: { kr: number; kc: number }, b: Button): void {
  if (b === 'up') {
    if (k.kr === 4) { k.kc = WIDE_COL[k.kc] ?? 0; k.kr = 3; }
    else if (k.kr > 0) k.kr--;
  } else if (b === 'down') {
    if (k.kr === 3) { k.kc = k.kc < 2 ? 0 : k.kc < 6 ? 1 : k.kc < 8 ? 2 : 3; k.kr = 4; }
    else if (k.kr < 4) k.kr++;
  } else if (b === 'left') k.kc = Math.max(0, k.kc - 1);
  else if (b === 'right') k.kc = Math.min(k.kr === 4 ? 3 : 9, k.kc + 1);
}
/** CX-20: the presses that move the focus on a screen (the D-pad and the L1 / R1 shoulders), which the move cue follows. */
const MOVES: readonly Button[] = ['up', 'down', 'left', 'right', 'l1', 'r1'];
export const TOAST_MS = 2600;
export const LEGEND_ERROR_MS = 3600;
/** START arms for the design's `dur-signature`, then the launch screen. */
export const ARMING_MS = 360;

export class ConsoleController {
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private errTimer: ReturnType<typeof setTimeout> | undefined;
  private armTimer: ReturnType<typeof setTimeout> | undefined;
  /** CX-14: the open binding machine's subscription, and what its screen last drew (`remapFrame`). */
  private rmOff: (() => void) | null = null;
  private rmKey = '';
  /** LATER 380: the teach pass runs (its end said in its own words), and Not now was chosen (no press begins it again). */
  private rmTeaching = false;
  /** CX-34: the launcher's history. Absent in overlay mode (an iframe must not push the top page's history). */
  private nav: LauncherNav | null = null;
  /** Browser Back left the extraction popover. Its view stays until the run closes; don't draw it back on top. */
  private holdExtract = false;
  /** RB-26: the host's link has opened Play's share area (once a page: `syncHostLink`). */
  private hostLinkOpened = false;
  /** The page where the ephemeral account disclosure was opened. */
  private accountPlace = '';

  constructor(readonly S: ConsoleState, readonly A: Adapters, private readonly host: Host) {
    // CX-LOADOUTS (MU2-10, MU2-12): the loadouts read the round under the overlay live, through the page's reads.
    A.loadouts?.follow(() => roundRunning(S));
    // CX-PERSONA (OT.R60's locks): the persona's edits wait over any game page (the card is the game's), and elsewhere in
    // the overlay while the game holds the account or a round runs -- read live.
    A.profile?.follow(() => personaEditLock(S));
  }

  render(): void {
    this.syncViewer(); this.syncExtract(); this.syncShare(); this.syncHostLink(); this.sayReplaysFailure();
    // PERSONA-PERSIST (a), fold B: the quick sign-in's held answer, at the first draw with no dialog open.
    if (this.pendingQuick && this.S.overlay === null) { const r = this.pendingQuick; this.pendingQuick = null; this.applyQuick(r); }
    // CX-LOADOUTS: the round compared at each draw (its beginning drops the reads in flight, its end asks again), and the
    // screens' being shown (a list left closes its editor).
    this.A.loadouts?.sync(this.S.screen === 'loadouts' || this.S.screen === 'loadout');
    // CX-LOBBIES (MU_LOBBY_POLL_ADAPTATION): Custom matches are read only while they are shown -- their own screen, or
    // LR-37 (9) Browse rooms under ALL or CUSTOM.
    this.A.custom?.sync(customShown(this.S));
    settleLoadoutDeepLink(this.S, this.A);
    normalize(this.S, this.A); normalizeProfile(this.S, this.A); normalizeLobbies(this.S, this.A);
    if (this.S.accountOpen && (this.S.overlay || this.capturing() || this.accountPlace !== `${this.S.screen}:${this.S.cat}`)) this.S.accountOpen = false;
    this.host.render();
    this.nav?.sync(this.S, this.A);
  }

  /** CX-34: page mode only. Called once, before the first draw, after `adopt`. */
  useNav(nav: LauncherNav): void { this.nav = nav; }

  /** `popstate`: the entry's screen, focus and dialog, then a draw (its sync waits until the travel guard is down). */
  applySnap(snap: LauncherSnap): void {
    const S = this.S;
    // Browser Back applies the entry. The screen's own close still has to run: the viewer layer, the binding
    // machine, and the extraction popover are not in the snapshot.
    if (S.overlay === 'viewer' && snap.overlay !== 'viewer') this.A.replays.watching?.()?.close();
    if (S.screen === 'remap' && snap.screen !== 'remap') {
      this.rmOff?.(); this.rmOff = null;
      this.rmTeaching = false;                                         // LATER 380 (#491's re-read, 2)
      this.A.remap?.close();
      this.rmKey = '';
    }
    if ((S.overlay === 'extract' || S.extract) && snap.overlay !== 'extract') {
      this.holdExtract = true;
      this.A.disc.extractAct?.('cancel');
      this.A.disc.extractAct?.('close');
    }
    if (S.overlay === 'share' && snap.overlay !== 'share') S.snd.shut = true;   // DSH-5: Back leaves the sender's dialog shut
    S.accountOpen = false;
    S.screen = snap.screen;
    S.cat = snap.cat;
    S.item = snap.item.slice();
    S.overlay = snap.overlay;
    S.opt = { ...snap.opt };
    S.rooms = { ...snap.rooms, kind: snap.rooms.kind ?? 0 };   // LR-37 (9): an entry from before the filter reads ALL
    S.rp = { ...snap.rp };
    S.sv = { ...snap.sv };
    S.md = { row: snap.md?.row ?? 0 };
    S.rm = { ...snap.rm };
    S.lo = { ...snap.lo };
    S.pf = { ...snap.pf, nw: { ...snap.pf.nw } };
    S.lb = { ...snap.lb };
    S.confirmKind = snap.confirmKind;
    S.confirmRow = snap.confirmRow;
    this.hoverFrom = null;                                            // CX-51 L1: a hover's move stays on its page
    this.render();
  }

  /**
   * DX-3 (FI.R7): the extraction's popover follows the disc adapter's view -- shown, the overlay `extract` (over whatever
   * was open: a disc is chosen from Home or dropped on the window), the focus row the console's own while the phase is the
   * same; gone, the overlay closed.
   */
  private syncExtract(): void {
    const S = this.S;
    const v = this.A.disc.extract?.() ?? null;
    if (this.holdExtract) {
      if (!v) this.holdExtract = false;
      else {
        // A copy is still aborting. Once it pauses, Close is what lets the run finish and drop the view.
        this.A.disc.extractAct?.('close');
        if (S.overlay === 'extract') S.overlay = null;
        S.extract = null;
        return;
      }
    }
    if (v) {
      S.extract = S.extract && S.extract.phase === v.phase ? { ...v, row: S.extract.row } : v;
      if (S.overlay !== 'launch') S.overlay = 'extract';
    } else if (S.overlay === 'extract' || S.extract) {
      if (S.overlay === 'extract') S.overlay = null;
      S.extract = null;
    }
  }

  /**
   * DSH-5 (DSH.R12): the sender's dialog follows the disc share adapter -- a page the pairing link opened (`sender()` a
   * view, not declined) shows it over the launcher page once nothing else is over it (the extraction's popover, a sign-in
   * or the agreement first), until the player closes it; a view gone or declined closes it.
   */
  private syncShare(): void {
    const S = this.S;
    const v = this.A.discShare?.sender() ?? null;
    const live = v !== null && v.phase !== 'declined' && S.mode !== 'overlay' && !S.snd.shut;
    if (S.overlay === 'share' && !live) S.overlay = null;
    else if (live && S.overlay === null) { S.overlay = 'share'; S.snd.row = 0; S.chk.open = false; }
  }

  /**
   * RB-26 (the replay batch plan; DSH.R16): a page a host's link opened (`?discshare-host=<token>`, the adapter's
   * `hostLinked`) opens Play's "Before you deploy" panel on the share's area once, as soon as the launcher page's Home has
   * nothing over it (a sign-in, the agreement, the sender's dialog first), and makes its request against the host. The
   * cursor's one move to Deploy counted as made (`auto`), so a pad waking does not take the area away. Not an Xbox
   * choice (no `selectXboxGraphics`): the link says nothing of the device. Circle then backs out as from the row.
   */
  private syncHostLink(): void {
    const S = this.S;
    const share = this.A.discShare;
    if (this.hostLinkOpened || !share?.hostLinked?.() || S.mode === 'overlay' || S.screen !== 'home' || S.overlay !== null) return;
    this.hostLinkOpened = true;
    S.cat = HOME_CATEGORY;
    S.src.open = false;
    S.thm.open = false;
    S.chk = { open: true, row: LAUNCH_SHARE_ROW, auto: true, share: true };
    if (share.receiver().phase === 'idle') share.request();
    this.host.announce(SHARE_TITLE);
  }

  /** DSH-5: the sender's dialog -- Up / Down / Left / Right its buttons, Cross the focused one, Circle its No (or Close, Stop). */
  private pressShare(b: Button): void {
    const S = this.S;
    const v = this.A.discShare?.sender() ?? null;
    if (!v) { S.overlay = null; return; }
    const buttons = senderButtons(v);
    S.snd.row = Math.max(0, Math.min(buttons.length - 1, S.snd.row));
    if (b === 'up' || b === 'left') S.snd.row = Math.max(0, S.snd.row - 1);
    else if (b === 'down' || b === 'right') S.snd.row = Math.min(buttons.length - 1, S.snd.row + 1);
    else if (b === 'cross') this.shareSendAct(S.snd.row, S.input === 'pointer' || this.keyGesture);
    else if (b === 'circle') this.shareSendAct(buttons.length - 1, false);
  }

  /** DSH-5: the sender's button `i` (a press or a click; `gesture`, a user activation the disc's chooser needs). */
  private shareSendAct(i: number, gesture: boolean): void {
    const S = this.S;
    const share = this.A.discShare;
    const v = share?.sender() ?? null;
    if (!share || !v) { S.overlay = null; return; }
    const act = senderButtons(v)[i]?.act;
    if (act === 'yes') share.approve();
    else if (act === 'pick') { const code = senderButtons(v)[i]?.code; if (code && share.choose(code)) S.snd.row = 0; }   // DSH-4: a nearby request
    else if (act === 'type') this.openField({ kind: 'share-code' }, '');                                               // DSH-4: the launcher's text field
    else if (act === 'no' || act === 'stop') { share.decline(); S.overlay = null; S.snd.shut = true; }
    else if (act === 'close') { S.overlay = null; S.snd.shut = true; }
    else if (act === 'extract') {
      // DSH.R7: the extraction first (the disc's chooser, in the press's own event), then this dialog asks again.
      if (!gesture) this.legendError(POINTER_CHOOSER_WORDS);
      else { S.overlay = null; this.chooseDisc(); }
    }
  }

  /**
   * DSH-4 (DSH.R12 leaves the sender's entry without the QR to us): Options → App → "Send game files to another device" --
   * the sender's dialog in its code entry (the requests on this network listed, a code typed), over the settings.
   */
  openSender(): void {
    const share = this.A.discShare;
    if (!share) return;
    share.openSend();
    this.S.snd = { row: 0, shut: false };
    this.S.overlay = 'share';
    this.cue('open');
    this.host.announce(SENDER_TITLE);
  }

  /**
   * DSH-5 (DSH.R12): the "Request Game Files (XBOX)" row's area -- expanded on its row (a request made when none stands:
   * a failure stays shown with its Try again), collapsed by Circle or the crumb's Back (a request no device has answered
   * withdrawn; a copy under way goes on, the row saying how far).
   */
  openShare(): void {
    const share = this.A.discShare;
    if (!share) return;
    // Explicit Xbox receiver selection, not controller/UA detection or the sender's transfer path.
    selectXboxGraphics();
    this.S.chk.share = true;
    if (share.receiver().phase === 'idle') share.request();
    this.cue('open');
    this.host.announce(SHARE_TITLE);
  }

  closeShare(): void {
    const share = this.A.discShare;
    this.S.chk.share = false;
    const phase = share?.receiver().phase;
    if (phase === 'requesting' || phase === 'waiting') share!.cancel();
    this.cue('back');
  }

  /** MU2-14e: the replays list's failed page last said (`sayReplaysFailure`), by identity; null, none standing. */
  private saidMore: ReplaysMore | null = null;

  /**
   * MU2-14e (a browser adaptation, OT.R28): a failed page of the replays list -- its end line, drawn with its words when
   * the page fails (`./render/replays` `moreHtml`) -- said once to assistive technology through the page's live region
   * (`Host.announce`, `#live`: in the page's markup before any failure and outside the regions a draw patches, as the
   * remap's refusal and the category's name are said), the failure's title and line in the Replays section's words.
   * Said at the draw that first shows it on the replays screen; a draw with nothing new says nothing; a retry's own
   * failure, a new answer, is said again. A failure answered while another screen is shown is held until the list is
   * shown again, then said (the review's F1: marked said only when said). The end line stays the button it is (its
   * role and its words unchanged).
   */
  private sayReplaysFailure(): void {
    const v = this.A.replays.view?.();
    const m = v?.kind === 'ok' ? v.more : undefined;
    if (m?.kind !== 'failed') { this.saidMore = null; return; }
    if (m === this.saidMore || this.S.screen !== 'replays') return;
    this.saidMore = m;
    this.host.announce(`${m.title}. ${m.words}`);
  }

  dispose(): void {
    clearTimeout(this.toastTimer); clearTimeout(this.errTimer); clearTimeout(this.armTimer);
    this.rmOff?.(); this.rmOff = null;
    this.A.remap?.close();
    this.nav?.dispose();
    this.nav = null;
  }

  /* ---------- actions ---------- */

  toast(t: string): void {
    this.S.toast = t;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.S.toast = ''; this.render(); }, TOAST_MS);
  }

  legendError(t: string): void {
    this.S.legendError = t;
    clearTimeout(this.errTimer);
    this.errTimer = setTimeout(() => { this.S.legendError = ''; this.render(); }, LEGEND_ERROR_MS);
  }

  /**
   * The Disc action, the legend's chip and Armory's "Choose disc": the active source's chooser (CX-16, CX.R9: "Only one
   * needs/should be active to launch") -- the image's picker, or the folder's (`chooseFolder`).
   */
  chooseDisc(): void {
    // OVERLAY-CONSOLE (OT.R60): over a game page the disc is the game's (it opened it at its boot): no chooser, its line.
    if (overGame(this.S)) { this.legendError(OVERLAY_LOCK_WORDS.disc); return; }
    if (discSource(this.A) === 'folder' && this.A.disc.chooseFolder) { this.chooseFolder(); return; }
    if (this.A.disc.state() === 'reading') return;
    const read = this.A.disc.choose();
    this.render();
    read.then((ok) => { if (ok) this.toast('Disc ready: ' + this.A.disc.title()); this.render(); }, () => { this.render(); });
  }

  /**
   * CX-10a: the folder chooser (`./adapters/disc` `chooseFolder`), called in the press's own event, as `chooseDisc` calls
   * the image's (the browser shows a picker only inside a user activation). The outcome as the image's: the toast names
   * the disc; a picker that fails says the browser's words on the legend's warn line. Since CX-16 the folder source's
   * (`chooseDisc`), no action of its own.
   */
  private chooseFolder(): void {
    const disc = this.A.disc;
    if (!disc.chooseFolder || disc.state() === 'reading') return;
    const read = disc.chooseFolder();
    this.render();
    read.then((ok) => { if (ok) this.toast('Disc ready: ' + disc.title()); this.render(); },
      (e: unknown) => { this.legendError(e instanceof Error ? e.message : String(e)); this.render(); });
  }

  openSignIn(): void {
    this.S.overlay = 'signin';
    this.S.si = signInFresh();
    // No persona on the card: Add new is the only tile, its name the first field (slice 2; the prototype has one).
    if (cardNames(this.A).length === 0) this.S.si.target = 'name';
  }

  /** Add new's tile (ADD-NEW; the code's name kept): after the card's personas. */
  private another(): number { return cardNames(this.A).length; }

  /** PERSONA-PERSIST (a) (OT.R61 (b)): "Remember me" offered on the sign-in (ticked by default, `signInFresh`). */
  remembers(): boolean { return this.A.session.remembers?.() ?? false; }

  /** The sign-in remembers: offered and ticked. */
  private remembering(): boolean { return this.remembers() && this.S.si.remember; }

  /**
   * PERSONA-PERSIST (a) (OT.R61 (a); SVC-03a step 2): the launcher's load -- not over a game page -- tries the card's
   * remembered persona for this server once (the session adapter's `quick`, which keeps its own once). Success is the
   * agreement, as every sign-in; a refusal opens the sign-in with that persona chosen and its words on the error line --
   * for -978 (the cookie gone) the password asked once, no second try. Fold B: an answer that arrives while another
   * dialog is open (the player's) is held as the one pending step (`pendingQuick`, never two) and shown at the draw that
   * finds no dialog open, so the session never waits in the agreement with no dialog for the player.
   */
  quickSignIn(): void {
    const quick = this.A.session.quick;
    if (!quick || this.S.mode !== 'page' || this.A.session.signedIn()) return;
    quick.call(this.A.session).then((r) => {
      if (!r) { this.render(); return; }
      const S = this.S;
      if (S.overlay !== null && S.overlay !== 'signin') this.pendingQuick = r;   // fold B: shown when it closes
      else this.applyQuick(r);
      this.render();
    }, () => { this.render(); });
  }

  /** Fold B: the quick sign-in's answer held while another dialog was open (one at most). */
  private pendingQuick: QuickSignIn | null = null;

  /** The quick sign-in's answer shown: the agreement, or the sign-in asking the password (`quickSignIn`). Draws nothing. */
  private applyQuick(r: QuickSignIn): void {
    const S = this.S;
    // AGREEMENT-ONCE: an agreement accepted on this browser earlier left the session signed in already; its line is said.
    if (r.ok && r.accepted && this.A.session.signedIn()) { S.overlay = null; this.toast(signedInWords(this.A.session.persona(), r.accepted)); return; }
    if (this.A.session.signedIn()) return;
    if (r.ok) {
      if (this.A.session.persona() === '') return;                   // ended meanwhile (START's hand-over): nothing to show
      if (r.next === 'agreement') this.openAgreement();
      else { S.overlay = null; this.toast(signedInWords(this.A.session.persona(), r.accepted)); }
      return;
    }
    this.openSignIn();
    const i = cardNames(this.A).indexOf(r.persona);
    if (i >= 0) S.si.persona = i; else { S.si.persona = this.another(); S.si.name = r.persona; }
    S.si.zone = 'keys'; S.si.target = 'password'; S.si.kr = 1; S.si.kc = 0;
    S.si.error = r.error;
  }

  private limits(): { name: number; password: number } {
    return this.A.session.limits?.() ?? { name: SIGN_IN_TEXT_MAX, password: SIGN_IN_TEXT_MAX };
  }

  /** Browser adaptation: the header disclosure is ephemeral, independent of route history. */
  toggleAccountMenu(): void {
    if (this.S.overlay || this.capturing()) return;
    this.S.accountOpen = !this.S.accountOpen;
    this.accountPlace = `${this.S.screen}:${this.S.cat}`;
    this.S.src.open = false;
    this.S.input = 'pointer';
    this.cue(this.S.accountOpen ? 'open' : 'close');                  // LR-37 (2): a menu's cues, as the drop-ups'
    this.render();
  }

  /** `quiet`: the menu shut by the pick of one of its items, whose own act says its cue (LR-37 (2)). */
  closeAccountMenu(quiet = false): void {
    if (!this.S.accountOpen) return;
    this.S.accountOpen = false;
    if (!quiet) this.cue('close');
    this.render();
  }

  account(): void {
    if (!this.A.session.signedIn()) this.openSignIn();
    else { const at = Math.max(0, CATS.findIndex((c) => c.id === 'profile')); this.S.screen = 'home'; this.S.cat = at; this.S.item[at] = 0; }
  }

  start(): void {
    if (this.S.accountOpen) return;
    const S = this.S;
    if (S.mode === 'overlay') return;                                 // OVERLAY-CONSOLE: no START over a game page
    if (!startReady(S, this.A)) {
      const disc = this.A.disc.state();
      // CX-16: the line names the active source (the design's words for the image).
      const first = discSource(this.A) === 'folder' ? 'Choose your disc folder first: Cross on Play, or the disc mark.' : 'Choose your disc image first: Cross on Play, or the disc mark.';   // LR-24: Home's Disc item is gone (LR-13); the way now
      this.legendError(disc === 'reading' ? 'Your disc is still being read.' : disc !== 'ready' ? first
        : this.A.controls?.reason() ?? '');
      this.render();
      return;
    }
    if (S.start !== 'idle') return;
    S.start = 'arming';
    S.chk.open = false;                                               // LR-36: the launch check shuts as the launch arms
    this.A.disc.hold?.(true);                                         // the image START was pressed for stays the one
    // The seam names the target as it is now: the sign-out the hand-over starts with clears it (slice 3).
    S.launch = { target: selectedRoom(S, this.A)?.name ?? null, error: '' };
    this.render();
    this.armTimer = setTimeout(() => { S.start = 'launching'; S.overlay = 'launch'; this.render(); this.handOver(); }, ARMING_MS);
  }

  /** START's hand-over to the original's front end (slice 3; the live page's `launch` adapter). */
  private handOver(): void {
    const launch = this.A.launch;
    if (!launch) return;
    const nav = this.nav;
    // CX-36: strip the launcher snapshot before the game's router inherits the entry. One entry strips on this
    // turn — a fake-timer arming test never flushes a promise scheduled inside the arming callback. Several entries
    // walk back first (that `history.go` is a later turn); Circle during it leaves the launch screen and does not mount.
    if (!nav) { this.handOverNow(launch); return; }
    const walk = nav.span() > 0;
    const done = nav.rewind();
    if (!walk) this.handOverNow(launch);
    else void done.then(() => {
      if (this.S.start !== 'launching' || this.S.overlay !== 'launch') { this.giveBackHistory(); return; }
      this.handOverNow(launch);
    });
  }

  /**
   * #356's review N2: a START that does not mount -- left by Circle on the launch screen, refused, the disc gone -- gives
   * the launcher's history back (`LauncherNav.release`), and the draw writes the page the player is on again (after the
   * walk back the address was the first launcher entry). A mount that resumes the page releases through the host too.
   */
  private giveBackHistory(): void {
    this.nav?.release();
    this.render();
  }

  private handOverNow(launch: NonNullable<Adapters['launch']>): void {
    const h = this.host;
    launch.run({ suspend: () => h.suspend?.(), resume: () => h.resume?.(), takeDown: () => h.takeDown?.() }).then((r) => {
      // INVITE-FOLLOW: a START that did not mount (cancelled, refused, the disc gone, the mount thrown) drops an invite's
      // taken mark (`../inviteHost` `markInviteTaken`); for a START with no invite there is no mark, and this is nothing.
      if (!r.ok) { clearInviteTaken(); this.giveBackHistory(); }
      if (r.ok || r.cancelled) return;
      this.S.launch.error = r.error;
      this.render();
    }, (e: unknown) => {
      clearInviteTaken();                                             // as above: no mount, no mark kept
      this.S.launch.error = `The game could not start: ${e instanceof Error ? e.message : String(e)}`;
      this.render();
    });
  }

  /** Runs an item's act (`disc`, `mic`, `resume`, `rooms`, `signin`, `signout`, `cat:<id>`, `opt:<id>`, `page:<name>`, `discord`, `todo:<what>`, `refresh-*`). */
  doAct(act: string | undefined): void {
    if (!act) return;
    this.S.accountOpen = false;
    const S = this.S;
    const A = this.A;
    const at = act.indexOf(':');
    const k = at < 0 ? act : act.slice(0, at);
    const arg = at < 0 ? '' : act.slice(at + 1);
    if (k === 'disc') this.chooseDisc();
    else if (k === 'play') this.play();                                                         // LR-23 (LR.R22)
    // LR-39 (LR.R32): the overlay's Resume game is its close -- the host's, as Circle at Home and the header's "Back to
    // game" ask it (below, `press`) -- never a launch; nothing on the page, which has no Resume.
    else if (k === 'resume') { if (S.mode === 'overlay') this.host.close?.(); }
    else if (k === 'themes') this.toggleThemes();                                               // LR-13 (LR.R16 (2))
    else if (k === 'mic') A.mic.toggle().then((on) => { this.toast(on ? 'Microphone on' : 'Microphone off'); this.render(); }, () => { this.render(); });
    else if (k === 'rooms') { S.screen = 'rooms'; if (S.rooms.kind !== 0) { S.rooms.kind = 0; S.rooms.row = 0; } }   // LR-37 (9): ALL at every open
    else if (k === 'replays') { S.screen = 'replays'; S.rp.row = 0; }
    else if (k === 'install') S.overlay = 'install';
    else if (k === 'loadout-sides') { S.screen = 'loadoutSides'; S.lo.row = 0; }
    else if (k === 'loadouts') this.openLoadouts(arg === 'terrorist' ? 'terrorist' : 'seal');   // CX-LOADOUTS
    else if (k === 'persona') this.openPersona();                                                // CX-PERSONA
    else if (k === 'record') this.openRecord();
    else if (k === 'custom') this.openCustom();                                                  // CX-LOBBIES
    else if (k === 'server') { S.screen = 'server'; S.sv.row = 0; A.server.loadNews?.(); }       // CX-28
    else if (k === 'mods') { S.screen = 'mods'; S.md.row = 0; this.removeAsk = null; A.mods?.open(); }   // B206 ML-2
    else if (k === 'signin') this.openSignIn();
    else if (k === 'signout') { if (!this.signOutLocked()) { S.overlay = 'confirm'; S.confirmRow = 0; S.confirmKind = 'signout'; } }
    else if (k === 'cat') S.cat = Math.max(0, CATS.findIndex((c) => c.id === arg));
    else if (k === 'opt') { S.screen = 'options'; S.opt = { cat: Math.max(0, optCategories(S, A).findIndex((c) => c.id === arg)), row: 0, zone: 'rows' }; }
    // RB-5: a new tab only for a user activation; a pad's press says how (`NEW_TAB_POINTER_WORDS`), never a false toast.
    else if (k === 'page') {
      if (!this.gesture()) this.legendError(NEW_TAB_POINTER_WORDS);
      else { A.server.openPage(arg); this.toast(`Opens the ${arg} page in a new tab`); }
    }
    // LATER 291: the pad's Cross. A click on the link follows the href and does not come through here. RB-45 (c): a new
    // tab only for a user activation (a key's press); a pad's says how, as `page` above.
    else if (k === 'discord') {
      if (!this.gesture()) this.legendError(NEW_TAB_POINTER_WORDS);
      else openDiscord();
    }
    else if (k === 'news') { S.overlay = 'news'; A.server.loadNews?.(); }
    else if (k === 'report') A.report?.open();                          // OVERLAY-CONSOLE: FB-1's Report, the overlay's
    // OVERLAY-CONSOLE (OT.R60 (c)): a gap with no console screen yet shows "Coming" (`./state` `homeItems`) and does
    // nothing; a locked item says its line on the legend's warn line.
    else if (k === 'todo') this.host.announce(`${arg}: coming`);
    else if (k === 'lock') this.legendError(arg);
    else if (k === 'refresh-replays') {
      // OVERLAY-CONSOLE fold 2 (the seat's run, `modernReplays.spec.ts:123`): on the list the focus stays on its replay --
      // by id once the list is back (a newer one may lead it now), its row while it is read (`./state` `normalize`).
      const kept = S.screen === 'replays' ? replayRows(A)[S.rp.row]?.id : undefined;
      A.replays.refresh().then(() => {
        const i = kept === undefined ? -1 : replayRows(A).findIndex((r) => r.id === kept);
        if (i >= 0 && S.screen === 'replays') S.rp.row = i;
        this.toast(A.replays.count() === 0 ? 'Replays refreshed. None yet.' : 'Replays refreshed.');
        this.render();
      }, () => { this.render(); });
    }
    else if (k === 'refresh-server') A.server.refresh().then(() => {
      const st = A.server.status();
      if (st.alert) this.legendError(st.line); else this.toast('Server status refreshed');
      this.render();
    }, () => { this.render(); });
  }

  /**
   * LR-23 (LR.R22, the owner: "Start game, gone"; the mockup's `playPressed`, S2 Launcher v2.dc.html line 590: launch when
   * the disc and the controller are in, else open the check): Play's Cross is START when Play is ready (`playNeed` null:
   * the existing hand-over, its confirm cue START's arming's, `./sounds` `cueFor`); otherwise it opens the check that is
   * not -- the disc's chooser (the legend chip's act, the active source's: CX-16), or Settings > System Settings >
   * Controller (the Controller step's act) -- and a disc still read says so on the warn line, as START does. The legend's
   * Cross names what it does (`./render/legend`, `PLAY_NEED_WORDS`). LR-13's "Before you deploy" panel it opened is gone.
   * LR-36 (LR.R30, the owner, 2026-10-28: "pressing PLAY SOCOM 2 while controller is not connected was meant to bring up
   * the right aligned pre-launch UI that the mockup contained, not take them directly to controller setttings"): with the
   * disc in and no controller, Play's Cross opens the mockup's "Before you deploy" panel (`openCheck`) on its controller
   * check -- was (LR-31, LR.R25): Settings > System Settings > Controller, now the panel's "Controller settings" link.
   * The LR-36 fold (the dispatcher, 2026-10-28, following the mockup's `playPressed` / `openCheck`; LR.R30 amended): every
   * need opens it -- the disc out, refused or still read too, the cursor on the disc row, whose Cross (a click, a tap, a
   * key) opens the chooser in the press's own event. Was (LR-23, LR.R30 (b)): the disc's chooser at once, the reading's
   * line on the warn line.
   */
  play(): void {
    if (playNeed(this.S, this.A) === null) { this.start(); return; }
    this.openCheck();
  }

  /**
   * LR-36 (LR.R30; the mockup's `openCheck()`, S2 Launcher v2.dc.html): Play's "Before you deploy" panel over the launcher
   * page's Home, the cursor on the first check not ready (`launchCheckStart`), the cursor's one move to Deploy not yet
   * made (`autoF`, `../state` `normalize`). Its cue LR-13's for Play's panel opened, `confirm`. A browser adaptation.
   */
  openCheck(): void {
    const S = this.S;
    if (S.mode === 'overlay') return;                                 // OVERLAY-CONSOLE: no Play over a game page
    S.src.open = false;
    S.thm.open = false;
    S.chk = { open: true, row: launchCheckStart(this.A), auto: false };
    this.cue('confirm');
    this.host.announce(launchCheckTitle(S, this.A));
  }

  /** LR-36: the panel shut (Circle, its crumb's Back), the focus back on Play, LR-13's cue for out of Play's panel (`back`). */
  closeCheck(): void {
    if (!this.S.chk.open) return;
    this.S.chk.open = false;
    this.cue('back');
  }

  /**
   * LR-36: Cross on the panel's row `row` (the mockup's `checkActivate`): the disc check opens the active source's chooser
   * (the Disc step's act; its reading says so) when the press is a user gesture (`gesture`: a click, a tap, a key) -- a
   * gamepad press is none, so the browser would refuse the chooser: LR-25's line says to use the pointer (the LR-36 fold,
   * as `pickSource`'s pad press); the controller check says what it sees -- the browser reports a pad only
   * once a button on it is pressed, so its "scan" is that line (the mockup's Scan / Identify have no browser equivalent);
   * Deploy launches when Play is ready, else only says why (LR.R30, the dispatcher's reading: no keyboard deploy, LR.R25's
   * gate stands); "Controller settings" goes where LR-31 went, Settings > System Settings > Controller.
   */
  checkAct(row: number, gesture = true): void {
    const S = this.S;
    const A = this.A;
    if (row === LAUNCH_DISC_ROW) {
      if (A.disc.state() === 'reading') this.legendError('Your disc is still being read.');
      else if (!gesture) this.legendError(POINTER_CHOOSER_WORDS);
      else this.chooseDisc();
    } else if (row === LAUNCH_PAD_ROW) {
      if (inputReady(A)) this.toast(A.controls?.line() ?? 'Controller connected');
      else this.legendError('Press any button on your controller.');
    } else if (row === LAUNCH_DEPLOY_ROW) {
      const need = playNeed(S, A);
      if (need === null) { S.chk.open = false; this.start(); return; }
      this.legendError(need === 'reading' ? 'Your disc is still being read.' : need === 'disc' ? 'Disc required' : A.controls?.reason() ?? 'Connect a controller to start.');
    } else if (row === LAUNCH_SKIP_ROW) {
      setSkipMenu(!skipMenuOn());                                     // SKIP-MENU (LR.R33): flipped and saved, the panel stays
      S.opt.flip = SKIP_MENU_ROW;                                     // the review fold (1): the knob's motion, as LR-13's toggles
      this.toggled();
    } else if (row === LAUNCH_PADSET_ROW) {
      S.chk.open = false;
      this.doAct('opt:controller');
    } else if (row === LAUNCH_SHARE_ROW) this.openShare();   // DSH-5 (DSH.R12)
  }

  /** LR-36: the panel holds the pad -- Up / Down walk its rows (the ends kept), Cross does the row, Circle shuts it; nothing behind it moves. */
  private pressCheck(b: Button): void {
    const c = this.S.chk;
    // DSH-5: the share's area holds the pad -- Cross its Try again after a failure (RB-26: Ask again after a host's No),
    // Circle back to the rows.
    if (c.share) {
      const phase = this.A.discShare?.receiver().phase;
      if (b === 'circle') this.closeShare();
      else if (b === 'cross' && (phase === 'failed' || phase === 'declined')) { this.A.discShare!.request(); this.cue('confirm'); }
      return;
    }
    if (b === 'up') c.row = Math.max(0, c.row - 1);
    else if (b === 'down') c.row = Math.min(launchCheckRows(this.A) - 1, c.row + 1);
    else if ((b === 'left' || b === 'right') && c.row === LAUNCH_DISC_ROW) this.stepCheckSource(b === 'right' ? 1 : -1);
    else if (b === 'cross') this.checkAct(c.row, this.S.input === 'pointer' || this.keyGesture);   // as `pickSource`'s Cross (LR-25)
    else if (b === 'circle') this.closeCheck();
  }

  /**
   * Setup onboarding (Trello ZjCZXTTW, the playtest of 2026-11-01): Left / Right on the launch check's Disc row step its
   * source (CX-16's two, the ends kept) -- the switch alone, no chooser: a pad press is no user gesture, and an arrow key
   * opening a picker would surprise; Cross on the row then opens the new source's (`checkAct`). Nothing is closed (as
   * `pickSource`). A browser adaptation.
   */
  private stepCheckSource(d: 1 | -1): void {
    const A = this.A;
    if (!A.disc.setSource || !deployChecks(this.S, A)[0]?.source) return;
    const at = Math.max(0, DISC_SOURCES.findIndex((o) => o.id === discSource(A)));
    const o = DISC_SOURCES[Math.max(0, Math.min(DISC_SOURCES.length - 1, at + d))]!;
    if (o.id === discSource(A)) return;
    A.disc.setSource(o.id);
    this.cue('confirm');                                              // LR-37 (2): a pick, as the source menu's
    this.host.announce(`Disc source: ${o.label}`);
  }

  /**
   * LR-13 (LR.R16 (2)): Settings' theme drop-up -- opens on the current theme (the pop-up's cue, `open`), or closes (`close`).
   */
  toggleThemes(): void {
    const t = this.S.thm;
    if (t.open) { t.open = false; this.cue('close'); return; }
    const picks = themePicks(this.A);
    if (!picks.length) return;
    t.open = true;
    t.row = Math.max(0, picks.findIndex((r) => r.pick?.picked));
    this.cue('open');
  }

  /** LR-13: the drop-up's theme `i` applied at once (the options adapter's pick, saved in this browser); the drop-up closes. */
  pickTheme(i: number): void {
    const r = themePicks(this.A)[i];
    this.S.thm.open = false;
    if (!r) return;
    this.cue('confirm');
    this.A.options.action(r.id).then((t) => { if (t) this.toast(t); this.render(); }, () => { this.render(); });
  }

  /**
   * LR-13 (LR.R16 (3), CX.R19): a cue said where an act makes it, and no other for this press. Each is the disc's own
   * (`./sounds` UI_CUE_SOURCE, research 122 R122.7: the menu init's `uisounds.rdr` code cues, rendered from the HUDUI
   * bank off the player's disc): `confirm` SELECTION (`.METAL`) -- Play's panel opened, a theme picked; `back` and
   * `close` BACK (`.BACK`) -- out of Play's panel, the drop-up shut; `open` `PopUpDialog`'s `.METAL` -- the drop-up
   * opened. A browser adaptation: nothing synthesized, no new file read; silent until a disc is in.
   */
  private cue(c: UiCue): void {
    this.A.cue?.play?.(c);
    this.cued = true;
    this.hoverFrom = null;
  }

  roomPick(): void {
    const S = this.S;
    // LR-37 (9): a custom match's row in the merged list keeps its own screen's Cross, JOIN (locked over a game page).
    const c = browseRows(S, this.A)[S.rooms.row];
    if (c?.kind === 'custom') {
      if (overGame(S)) { this.legendError(OVERLAY_LOCK_WORDS.join); return; }
      this.A.custom?.join(c.id);
      return;
    }
    const r = visibleRooms(S, this.A)[S.rooms.row];
    // CX-LOBBIES: a briefing room's row opens its detail, a game's its players -- read only in the overlay too.
    if (r?.kind && this.A.session.signedIn()) {
      if (r.kind === 'room') this.openRoom(r.id); else this.openGame(r.id, 'rooms');
      return;
    }
    if (S.mode === 'overlay') return;                                 // OVERLAY-CONSOLE: the rooms read only, no launch target
    if (!r) return;
    if (!this.A.session.signedIn()) { this.openSignIn(); return; }
    if (roomFull(r)) { this.toast(`Room ${r.name} is full`); return; }
    S.rooms.selected = S.rooms.selected === r.id ? null : r.id;
    this.A.rooms.select?.(S.rooms.selected);
    this.host.announce(S.rooms.selected != null ? `Launch target: room ${r.name}` : 'Launch target cleared');
  }

  /** LR-37 (9): Browse rooms' ALL / CLASSIC / CUSTOM, `k` clamped; a change puts the focus on the list's first row. */
  roomKind(k: number): void {
    const S = this.S;
    const to = Math.max(0, Math.min(BROWSE_KINDS.length - 1, k));
    if (to === S.rooms.kind || !Number.isInteger(to)) return;
    S.rooms.kind = to;
    S.rooms.row = 0;
    forgetFocus(S, 'rooms');
  }

  /* ---------- CX-16: the disc source dropdown beside Home's Disc action ---------- */

  /** Opens the dropdown on the active source's option, or closes it. */
  toggleSource(): void {
    const src = this.S.src;
    if (overGame(this.S)) { src.open = false; return; }             // OVERLAY-CONSOLE: the disc's source is the game's
    // LR-37 (2; the owner: "Re-add the menu sounds ... across the whole launcher UI"): the menu's open and close are the
    // theme drop-up's cues (CX-51 had kept them silent).
    if (src.open) { src.open = false; this.cue('close'); return; }
    src.open = true;
    src.row = Math.max(0, DISC_SOURCES.findIndex((o) => o.id === discSource(this.A)));
    this.cue('open');
  }

  /** LR-37 (2): the source menu shut from outside it (a click elsewhere), its close cue; nothing when it was shut. */
  closeSource(): void {
    if (!this.S.src.open) return;
    this.S.src.open = false;
    this.cue('close');
    this.render();
  }

  /**
   * Makes option `i` the active source and closes the dropdown, the focus back on the Disc action. Nothing is closed:
   * the disc open now stays until a new one is chosen. Over a game's overlay nothing is opened either (the Disc action's
   * Cross then opens the new source's chooser); on the launcher page (LR-24) the new source's chooser opens.
   */
  pickSource(i: number, gesture = true): void {
    const o = DISC_SOURCES[i];
    this.S.src.open = false;
    if (!o || !this.A.disc.setSource || overGame(this.S)) return;
    this.A.disc.setSource(o.id);
    this.cue('confirm');                                              // LR-37 (2): a pick, as the theme drop-up's
    this.host.announce(`Disc source: ${o.label}`);
    // LR-24 (LR.R23 (b)): on the launcher page the menu is the disc mark's, its one control (no chip to press after it):
    // the source chosen, its chooser opens, in the press's own event (`chooseDisc`). Over a game page's overlay (its
    // Disc item's cog) CX-16's switch opens nothing.
    // LR-25 (the LR-24 review's F1): a gamepad press is no user gesture -- a browser refuses its chooser then -- so the
    // source is switched and the legend says how to open it; a click, a tap and a key are gestures.
    if (this.S.mode !== 'overlay') {
      if (gesture) this.chooseDisc();
      else this.legendError(`Disc source set. ${POINTER_CHOOSER_WORDS}`);
    }
  }

  /** LR-25 (LR.R23 (e)): true while a keyboard key's press runs (`./input`) -- a key is a user gesture, a gamepad button is not. */
  keyGesture = false;

  /** RB-5: whether the press now is a user activation -- the pointer's (a click, a tap) or a key's -- as LR-25's Cross asks. */
  private gesture(): boolean { return this.S.input === 'pointer' || this.keyGesture; }

  /** RB-5: the MODS pack Square asked to remove (its first press); the next press on the screen removes it or forgets it. */
  private removeAsk: string | null = null;

  /**
   * LR-25 (LR.R23 (e); the mockup's `openCheck()` and `jumpTo('set', 'game', 'sys-voice')`, S2 Launcher v2.dc.html lines
   * 1066-1068): Settings on a category and, where one is named, a row. The first of `rowIds` found in a category, else the
   * category `catId` at its first row.
   */
  private openSettings(catId: string, rowIds: readonly string[] = []): void {
    const S = this.S;
    const cats = optCategories(S, this.A);
    let cat = -1; let row = 0;
    for (const id of rowIds) {
      cat = cats.findIndex((c) => c.rows.some((r) => r.id === id));
      if (cat >= 0) { row = cats[cat]!.rows.findIndex((r) => r.id === id); break; }
    }
    if (cat < 0) cat = Math.max(0, cats.findIndex((c) => c.id === catId));
    S.accountOpen = false;
    S.screen = 'options';
    S.opt = { cat, row, zone: 'rows' };
  }

  /* ---------- Search (slice 2: the live lobby's name query; Triangle in a list, "Controller UI" 2) ---------- */

  openSearch(): void {
    this.S.overlay = 'search';
    this.S.q = { text: this.S.rooms.query, kr: 1, kc: 0, shift: false, typing: false };
  }

  qType(ch: string): void {
    const q = this.S.q;
    if (q.text.length < SEARCH_TEXT_MAX) q.text += q.shift ? ch.toUpperCase() : ch;
  }

  applySearch(): void {
    this.S.rooms.query = this.S.q.text.trim();
    this.S.rooms.row = 0;
    this.S.overlay = null;
  }

  qKey(r: number, c: number): void {
    const q = this.S.q;
    if (r < 4) { const ch = OSK_ROWS[r]?.[c]; if (ch) this.qType(ch); }
    else if (c === 0) q.shift = !q.shift;
    else if (c === 1) this.qType(' ');
    else if (c === 2) q.text = q.text.slice(0, -1);
    else this.applySearch();
  }

  pressSearch(b: Button): void {
    const q = this.S.q;
    if (b === 'circle') this.S.overlay = null;
    else if (b === 'square') q.text = q.text.slice(0, -1);
    else if (b === 'triangle') this.qType(' ');
    else if (b === 'l2') q.shift = !q.shift;
    else if (b === 'r2') this.applySearch();
    else if (b === 'cross') this.qKey(q.kr, q.kc);
    else oskStep(q, b);                                   // OPTIONS is not read on a text field
    this.render();
  }

  private optRow() { return optRowsNow(this.S, this.A)[this.S.opt.row]; }

  /** OVERLAY-CONSOLE: sign out waits while the game holds the account or a round runs; its line said on the warn line. */
  private signOutLocked(): boolean {
    const lock = sessionLock(this.S);
    if (lock) this.legendError(lock === 'game' ? OVERLAY_LOCK_WORDS.signOutGame : OVERLAY_LOCK_WORDS.signOutRound);
    return lock !== null;
  }

  private locked(row: { needsSignIn?: boolean; locked?: string }): boolean {
    return (!!row.needsSignIn && !this.A.session.signedIn()) || !!row.locked;
  }

  optStep(d: number, exact = false): void {
    const row = this.optRow();
    if (!canChangeRow(row, this.A.session.signedIn())) return;
    const n = row.values.length;
    const had = this.A.options.value(row.id);
    if (!exact && this.A.options.step && (d === -1 || d === 1)) this.A.options.step(row.id, d < 0 ? -1 : 1);   // CX-23: the adapter steps from what it holds
    else this.A.options.set(row.id, Math.max(0, Math.min(n - 1, this.A.options.value(row.id) + d)));
    if (this.A.options.value(row.id) !== had) {
      this.toggled();
      if (isToggleRow(row)) this.S.opt.flip = row.id;                    // LR-13 (review F4): the knob's motion plays on a flip only
    }
    const said = this.A.options.takeToast?.();                           // SEP-SHOW: what the change has to say
    if (said) this.toast(said);
    if (row.id === 'uiscale') this.host.fit();
  }

  /**
   * LR-38 (5) (the owner, 2026-10-29: "Sliders should work with tap"; the mockup's slider sets the value at the point of its
   * track, its `onTrack`): a tap or a drag on a Settings slider's track (`./input`) at `frac` (0 its left end, 1 its right)
   * focuses the row and sets the nearest absolute value -- cued and saved as a pad step is; nothing changes on a row
   * that cannot change (signed out, locked) or at the value it holds. Answers whether it was a slider screen's row. A browser
   * adaptation: the launcher's pointer and touch, nothing of the game.
   */
  optSlide(i: number, frac: number): boolean {
    const S = this.S;
    if (S.screen !== 'options' || S.overlay || !(i >= 0)) return false;
    S.opt.zone = 'rows';
    S.opt.row = i;
    const row = this.optRow();
    if (row && canChangeRow(row, this.A.session.signedIn()) && row.values.length > 1) {
      const to = Math.round(Math.max(0, Math.min(1, frac)) * (row.values.length - 1));
      const d = to - this.A.options.value(row.id);
      if (d !== 0) this.optStep(d, true); // pointer coordinates are absolute, never the controller's larger step
    }
    this.render();
    return true;
  }

  /** LR-13 (LR.R16 (1), (6)): Cross or a click on a toggle row flips it (Off to On, On to Off), the setting cue said. */
  optFlip(): void {
    const row = this.optRow();
    if (!canChangeRow(row, this.A.session.signedIn()) || !isToggleRow(row)) return;
    const at = this.A.options.value(row.id);
    const to = row.values.indexOf(row.values[at] === 'On' ? 'Off' : 'On');
    this.optStep(to - at);
  }

  optAction(): void {
    const row = this.optRow();
    if (!row) return;
    if (isToggleRow(row)) { this.optFlip(); return; }                    // LR-13: a toggle's click
    if (row.needsSignIn && !this.A.session.signedIn()) { this.openSignIn(); return; }
    if (row.locked) { if (this.S.mode === 'overlay') this.legendError(row.locked); return; }
    if (row.id === MOBILE_LAYOUT_ROW) { this.host.editMobileLayout?.(); return; }
    // LR-13 (LR.R16 (2)): Appearance's "Theme & background" pushes its panel, on its first pick.
    if (row.id === THEME_PANEL_ROW && this.A.options.panel?.('theme')) { this.S.opt.panel = 'theme'; this.S.opt.row = 0; this.cue('confirm'); return; }   // LR-37 (2): a push
    // CX-14: the Button mapping row pushes the console's own mapping screen (the options adapter's action otherwise).
    if (row.id === REMAP_ROW && this.A.remap) { this.openRemap(); return; }
    if (row.id === 'signout') { this.S.overlay = 'confirm'; this.S.confirmRow = 0; this.S.confirmKind = 'signout'; return; }
    // DX-3: the kept disc is deleted only after the console's confirm (No first and focused).
    if (row.id === KEPT_DISC_ROW) { this.S.overlay = 'confirm'; this.S.confirmRow = 0; this.S.confirmKind = 'kept'; return; }
    // PWA-6: the dialog's button is the click. A pad's Cross on the row must not call prompt().
    if (row.id === INSTALL_APP_ROW) { this.S.overlay = 'install'; return; }
    // DSH-4: "Send game files to another device" opens the sender's dialog in its code entry.
    if (row.id === SHARE_SEND_ROW) { this.openSender(); return; }
    this.A.options.action(row.id).then((t) => { if (t) this.toast(t); this.render(); }, () => { this.render(); });
  }

  siType(ch: string): void {
    const si = this.S.si;
    if (si.busy) return;
    si.error = '';
    const c = si.shift ? ch.toUpperCase() : ch;
    const cap = this.limits();
    if (si.target === 'name') { if (si.name.length < cap.name) si.name += c; }
    else if (si.text.length < cap.password) si.text += c;
  }

  /** Delete: the focused field's last character. */
  siDelete(): void {
    const si = this.S.si;
    if (si.target === 'name') si.name = si.name.slice(0, -1);
    else si.text = si.text.slice(0, -1);
  }

  /** Clips the fields to the session's caps (a field typed natively, a password manager's fill). */
  siClip(): void {
    const si = this.S.si;
    const cap = this.limits();
    si.name = si.name.slice(0, cap.name);
    si.text = si.text.slice(0, cap.password);
  }

  siSubmit(): void {
    const si = this.S.si;
    const names = cardNames(this.A);
    const another = si.persona >= names.length;
    if (another && this.A.data === 'sample') { si.error = 'Only ' + this.A.card.persona() + ' is on this memory card in the prototype.'; return; }
    // Add new: Done on the name field moves on to the password (the keyboard's Done is named NEXT there).
    if (another && si.target === 'name') { si.target = 'password'; si.error = ''; return; }
    const persona = another ? si.name : names[si.persona] ?? '';
    if (!si.text) { si.error = 'Enter the password for ' + (persona || 'the persona') + '.'; return; }
    si.busy = true;
    this.render();
    this.A.session.signIn(persona, si.text, this.remembering()).then((res) => {
      if (res.ok && res.note) this.toast(res.note);                    // PERSONA-PERSIST (a), fold A: not remembered, and why
      if (res.ok && res.next === 'agreement') this.openAgreement();
      else if (res.ok) {
        this.S.overlay = null;
        // The review's F1: fold A's note (not remembered, and why) is kept beside the agreement's line, not overwritten.
        const said = signedInWords(this.A.session.persona(), res.accepted);
        this.toast(res.note ? `${said}. ${res.note}` : said);
      } else {
        si.busy = false;
        si.error = res.error;
      }
      this.render();
    }, () => { si.busy = false; this.render(); });
  }

  siKey(r: number, c: number): void {
    const si = this.S.si;
    if (r < 4) { const ch = OSK_ROWS[r]?.[c]; if (ch) this.siType(ch); }
    else if (c === 0) si.shift = !si.shift;
    else if (c === 1) this.siType(' ');
    else if (c === 2) this.siDelete();
    else this.siSubmit();
  }

  /** The USER AGREEMENT after a login (slice 2; the original's `dlgUsagePolicy`): Accept focused, its text asked. */
  private openAgreement(): void {
    const ag = this.A.session.agreement;
    this.S.overlay = 'agreement';
    this.S.ag = { row: 0, scroll: 0, text: ag?.waiting ?? '' };
    ag?.text().then((t) => { if (this.S.overlay === 'agreement' || this.S.confirmKind === 'decline') this.S.ag.text = t; this.render(); }, () => { this.render(); });
  }

  private askDecline(): void { this.S.overlay = 'confirm'; this.S.confirmRow = 0; this.S.confirmKind = 'decline'; }

  /* ---------- CX-15 (RV-12): the replay viewer over the page ---------- */

  /**
   * Watch on the replays list's focused row (the disc ready): the Replays section's own viewer opened over the console
   * page (`./adapters/replays` `watch`; CX.R2: no navigation, the game's flow untouched). The state says so before the
   * mount, so a render the mount causes leaves the focus in the viewer.
   */
  watch(): void {
    const S = this.S;
    const row = replayRows(this.A)[S.rp.row];
    // The RV-12 review: not while START arms or launches (its timer would lay the launch screen over the viewer).
    if (!row || !this.A.replays.watch || S.start !== 'idle') return;
    S.overlay = 'viewer';
    S.rp.watching = row.id;
    const w = this.A.replays.watch(row.id, () => { this.closeViewer(); this.render(); });
    if (!w) { S.overlay = null; S.rp.watching = null; }
  }

  /**
   * RV-4 on the release path (the sprint 39 close, rounds 1-2): the page after the replays list's rows, while the server
   * has one (the view's `more`) and it is not being read -- or, failed, asked again -- with the focus on the last row,
   * where it stays. The down press on the last row and a click on the list's end line (`data-act="replays-more"`,
   * CX.R6's touch and mouse) both come here. Answers whether it asked.
   */
  replaysMore(): boolean {
    const n = replayRows(this.A).length;
    const v = this.A.replays.view?.();
    if (n === 0 || v?.kind !== 'ok' || !v.more || v.more.kind === 'loading' || !this.A.replays.more) return false;
    this.S.rp.row = n - 1;
    void this.A.replays.more();
    return true;
  }

  /** Close: the viewer taken away, the replays list again with the focus on the row it was opened from. */
  closeViewer(): void {
    const S = this.S;
    const id = S.rp.watching;
    S.overlay = null;
    S.rp.watching = null;
    this.A.replays.watching?.()?.close();
    S.screen = 'replays';
    const i = replayRows(this.A).findIndex((r) => r.id === id);
    if (i >= 0) S.rp.row = i;
  }

  /**
   * What the viewer follows of the page, as the Replays section's does (`../modern/replays/view`): the disc taken out
   * locks it, put back returns to the list; a sign-out closes it (the list is the account's); a viewer gone closes.
   */
  private syncViewer(): void {
    if (this.S.overlay !== 'viewer') return;
    const w = this.A.replays.watching?.() ?? null;
    // OVERLAY-CONSOLE (MU2-12's rule): a round beginning under the overlay closes the viewer to the list (the round keeps
    // the disc readers).
    if (!w || !this.A.session.signedIn() || roundRunning(this.S)) { this.closeViewer(); return; }
    const ready = this.A.disc.state() === 'ready';
    if (!ready && !w.locked()) w.lock();
    else if (ready && w.locked()) this.closeViewer();
  }

  /** The prototype's states panel (sample adapters only): flip the disc, the sign-in or the pad. */
  flipState(i: number): void {
    this.A.states?.flip(i);
    if (i === 1 && !this.A.session.signedIn()) this.S.rooms.selected = null;
    this.render();
  }

  /** DX-3: the confirm's Yes on "Delete the kept disc": the options adapter's action, its outcome a toast or the warn line. */
  private forgetKept(): void {
    this.A.options.action(KEPT_DISC_ROW).then((t) => { if (t) this.toast(t); this.render(); }, (e: unknown) => {
      this.legendError(`Downloaded content could not be removed: ${e instanceof Error ? e.message : String(e)}`);
      this.render();
    });
  }

  /** Signs out; `forget` (OT.R61 (b)): "Forget this device" -- the remember cookie dropped, the card's SAVE PASSWORD NO. */
  private signOutNow(forget = false): void {
    this.S.rooms.selected = null;
    this.A.rooms.select?.(null);
    this.toast(forget ? 'Signed out. This browser no longer remembers you' : 'Signed out');
    const name = this.A.session.persona();
    this.A.session.signOut(forget).then(() => { this.restSignedOut(forget ? null : name); this.render(); }, () => { this.render(); });
  }

  /**
   * LR-12 (LR-1's `./render/signedOut`): after a sign-out from the launcher page -- not over a game, whose overlay keeps
   * its own flow -- the Signed out resting screen, as the persona signed out of (none with "forget this device"), when the
   * session is signed out and no other dialog has opened meanwhile. Its Cross is the sign-in with that persona chosen (the
   * quick sign-in is the load's, once: `./adapters/session` `quick`); its Circle closes it (`pressNow`).
   */
  private restSignedOut(name: string | null): void {
    const S = this.S;
    if (S.mode !== 'page' || S.overlay !== null || this.A.session.signedIn()) return;
    S.overlay = 'signedout';
    S.signedOutAs = name || null;
    // LR-20 (the LR.R11 side-by-side's pass 2, Q8): the screen is the message -- the sign-out's toast repeated its heading
    // and covered its sign-in line (844x390) or its title (640x360), as the artifact shows no toast there. Elsewhere (over
    // a game, the agreement's decline) the toast stays.
    S.toast = '';
    clearTimeout(this.toastTimer);
  }

  /* ---------- CX-14: the button mapping screen (`./render/remap`, over `../padBinding`) ---------- */

  /**
   * Pushes the button mapping screen (CX-14; CX.R13, OT.R60), as Rooms and Replays are pushed: the remap adapter's binding
   * machine opened (the one the setup page's Controller view drives), its changes heard, the pads read at once so the
   * first draw names the chosen pad; the focus on the first row. Options' state is kept for Circle's way back.
   */
  openRemap(): void {
    const R = this.A.remap;
    if (!R) return;
    const m = R.open();
    this.rmOff?.();
    this.rmOff = m.onChange((e) => { this.onRemap(m, e); });
    this.rmTeaching = false;
    m.frame();
    this.rmKey = '';
    this.S.screen = 'remap';
    this.S.rm = { row: REMAP_ACTION_ROW };                        // STANCE-TOP, DEAD-UP: on the first binding, the Stance mode and the dead zone above it
  }

  /** Circle on the screen (no listen): the machine closed, Options again on the Button mapping row it was opened from. */
  closeRemap(): void {
    this.rmOff?.(); this.rmOff = null;
    this.rmTeaching = false; this.S.rm.teachDeclined = false;
    this.A.remap?.close();
    this.rmKey = '';
    const S = this.S;
    if (S.overlay === 'confirm' && (S.confirmKind === 'conflict' || S.confirmKind === 'restore')) S.overlay = null;
    if (S.screen === 'remap') S.screen = 'options';
  }

  /**
   * LATER 380: a pad of another layout connected (`./input`'s `gamepadconnected`): one not yet taught opens this screen,
   * whose first press of it begins the pass ("teach me your pad"); one taught is a controller like any other. Not over a
   * dialog, and not when the screen is already up.
   */
  padOfOtherLayout(): void {
    const R = this.A.remap;
    if (!R || this.S.overlay || this.S.screen === 'remap') return;
    const probe = R.open();
    probe.frame();
    const untaught = probe.teachable() && !probe.usable();
    R.close();
    if (!untaught) { this.toast('Controller connected'); this.render(); return; }
    this.openRemap();
    this.toast('A controller of another layout: teach it its buttons');
    this.render();
  }

  private binding(): PadBinding | null { return this.S.screen === 'remap' ? this.A.remap?.current() ?? null : null; }
  private remapListening(): boolean { return (this.binding()?.listening() ?? -1) >= 0; }

  /**
   * A binding is listened for and no question is asked: the page's pad walker stands down (`./input`), so the press meant
   * for the binding neither moves the focus nor acts (the setup page's view's `capturing`).
   */
  capturing(): boolean { return this.binding()?.capturing() ?? false; }

  /**
   * MODAL-CLOSE, OT.R62 (the owner, 2026-10-17: "esc in release builds: fine to add for players"): a popup is open -- a
   * dialog (`S.overlay`, any kind: the sign-in, the agreement, every Confirm, the news, the search and the Profile's field,
   * the launch screen, the extraction's popover, the replay viewer, the prototype's states panel), or Home's disc source
   * dropdown. Not while the button mapping screen listens for a binding (its own rule: the pad's Circle cancels the
   * listen, `pressRemap`), nor under the overlay's Report (its own Escape, `../modern/report`). A pushed screen is no popup.
   */
  popupOpen(): boolean {
    const S = this.S;
    if (this.capturing() || (this.A.report?.isOpen() ?? false)) return false;
    return S.accountOpen || S.overlay !== null || (S.screen === 'home' && (S.src.open || S.thm.open));
  }

  /**
   * MODAL-CLOSE, OT.R62: the keyboard's Escape (`./input`, every build) -- Circle's press while a popup is open, so it
   * closes what Circle closes there, an inner layer first (Decline's question back to the agreement); nothing otherwise.
   * Answers whether it was read.
   */
  escape(): boolean {
    if (!this.popupOpen()) return false;
    this.press('circle');
    return true;
  }

  /**
   * One frame of the binding machine, at the page's pad poll and before the walker reads the pad (`./input`): the pads
   * read, a listen advanced; the screen drawn again when what it shows changed (the pad, the listen and its seconds left,
   * the question, the profile).
   */
  remapFrame(now: number): void {
    const m = this.binding();
    if (m) m.frame(now);
    // PS2P: a pressure pad seen with no Stance mode stored, by whichever reader (this screen's, the console's pad, the
    // match's), waits for the front end's console: SEPARATE applied here and said once, as SEP-SHOW's touchpad Crouch is
    // (`../controllerInput` `applyPressureDefault`); never by the overlay's console, over a match (5d's fold, 2026-11-01:
    // "The mode must never change under the player in a match").
    const said = this.S.mode === 'page' ? applyPressureDefault() : null;
    if (said) { this.toast(said); this.render(); }
    if (!m) return;
    // LATER 380: on this screen a pad of another layout not yet taught begins its pass at its first press (it cannot
    // press Start: its buttons mean nothing to the console until it is taught), unless Not now was chosen.
    if (m.raw && m.teachable() && !m.usable() && !m.teachState() && !this.S.rm.teachDeclined && m.raw.buttons.some((b) => b.pressed || b.value >= 0.5)) m.teach();
    const q = m.question();
    const t = m.teachState(now);
    const key = [m.raw?.id ?? '', m.standard(), m.usable(), m.listening(), m.released(), secondsLeft(m), q ? q.refused ?? '?' : '', JSON.stringify(m.input.config),
      t ? `${t.step}:${t.waiting}:${Math.round(t.progress * 20)}` : '', m.holding(), Math.round(m.holdProgress(now) * 20), m.down().join(','),
      m.extraModifier(), JSON.stringify(m.extraList())].join('|');   // h59U9CLb: the extras' listen and list
    if (key !== this.rmKey) { this.rmKey = key; this.render(); }
  }

  /**
   * The machine's events in the console's parts: a conflict opens the Confirm (Cancel focused, as every console Confirm
   * starts on its safe answer -- OT.R60's one design; the setup page's view focuses Swap); a binding taken
   * or a listen ended closes it; a binding taken, a cancel and Restore defaults are said on the toast in the setup page's
   * view's words; a timeout and a pad lost are failures, said on the legend's warn line (errors are not toasts).
   */
  private onRemap(m: PadBinding, e: BindingEvent): void {
    const S = this.S;
    const asking = S.overlay === 'confirm' && S.confirmKind === 'conflict';
    if (e.kind === 'teach') {
      this.rmTeaching = true;
    } else if (e.kind === 'taught') {
      this.rmTeaching = false;
      this.toast('Controller taught. Its buttons now work in the menus and in a match.');
    } else if (e.kind === 'end' && this.rmTeaching) {
      // LATER 380: the pass's own ends -- Not now, a pad that sent nothing (the way out: the mouse or touch, or later), a pad lost.
      this.rmTeaching = false;
      if (e.why === 'cancelled') { this.S.rm.teachDeclined = true; this.toast('Not now. Teach it later in Settings · Controller.'); }
      else if (e.why === 'timeout') { this.S.rm.teachDeclined = true; this.legendError('Nothing received from this controller. Use the mouse or touch, or teach it later in Settings · Controller.'); }
      else if (e.why === 'disconnected') this.legendError('Controller disconnected. Connect it and try again.');
    } else if (e.kind === 'conflict') {
      S.overlay = 'confirm'; S.confirmKind = 'conflict'; S.confirmRow = 2;   // Cancel
    } else if (e.kind === 'refused') {
      this.host.announce(e.words);
    } else if (e.kind === 'bound' || e.kind === 'end') {
      if (asking) S.overlay = null;
      if (e.kind === 'bound') this.toast(`${m.bindName(e.action)} now uses ${m.label(e.physical)}.`);
      else if (e.why === 'cancelled') this.toast('Binding cancelled.');
      else if (e.why === 'timeout') this.legendError('No button received. Select a binding to try again.');
      else if (e.why === 'disconnected') this.legendError('Controller disconnected. Connect it and try again.');
    } else if (e.kind === 'restored') {
      this.toast('Default bindings and dead zone restored.');
    } else if (e.kind === 'extra' && e.change === 'added') {
      const x = m.lastExtra();
      if (x) this.toast(extraAddedWords(m, x));        // h59U9CLb: the extra said, as a binding is
    }
  }

  /**
   * Cross on the focused row: an action's row listens (refused, its lock said, without a standard-layout pad), and so do
   * Crouch and Prone (PP-5; SEPARATE's rows, STM.R1); the Stance mode's is a toggle; the dead zone's has no Cross.
   */
  private remapAct(): void {
    const m = this.binding();
    if (!m) return;
    const r = this.S.rm.row;
    const lock = remapLock(m);
    if (r === REMAP_DEAD_ROW) return;
    // OBF-10b's review (1): Teach again, a row the pad reaches. OBF-13: Finish closes the screen, with its confirmation
    // (no lock: it closes with no controller too).
    const extra = remapExtraAt(m, r);
    if (extra === 'teach') { this.S.rm.teachDeclined = false; m.teach(); return; }
    if (extra === 'pressureConnect') { void m.connectPressure().then((ok) => { if (ok) this.toast('USB pressure connected. Press Triangle once to identify its mapping.'); }).catch((e: unknown) => this.toast(e instanceof Error ? e.message : 'Controller connection failed.')); return; }
    if (extra === 'finish') { this.closeRemap(); this.toast(REMAP_FINISH_TOAST); return; }
    // h59U9CLb (a browser adaptation): Extra binds opens and folds; an Add row listens for its extra; a kept one is removed.
    if (extra === 'extras') { m.extrasOpen = !m.extrasOpen; return; }
    if (extra === 'addDouble' || extra === 'addCombo') {
      if (lock) { this.legendError(lock.line); return; }
      const kind = extra === 'addDouble' ? 'double' : 'combo';
      m.listenExtra(kind, m.addAction[kind]);
      return;
    }
    if (extra?.startsWith('bind:')) { m.removeExtra(Number(extra.slice(5))); this.toast('Extra bind removed.'); return; }
    // PP-5: the Stance mode is the browser's, not the pad's -- no lock.
    if (r === REMAP_STANCE_ROW) { this.stanceModeStep(controllerStanceMode() === 'pop' ? 1 : -1); return; }
    if (lock) { this.legendError(lock.line); return; }
    m.listen(remapBindOfRow(r) ?? remapActionOfRow(r));
  }

  /**
   * PP-5: the Stance mode stepped (COMBINED, SEPARATE), clamped; its toggle cue when it changed. STM.R1: entering SEPARATE,
   * the open pad's unbound Prone takes Triangle's button (`PadBinding.enterSeparate`; a bound one kept, Crouch left
   * unbound: STM.R1a, but for a free touchpad, SEP-SHOW); leaving it, the binds stay in the profile, hidden. The rows follow the mode (`remapRowCount`), the
   * focus clamped by `normalize` where it would fall past the end.
   */
  private stanceModeStep(d: number): void {
    const to = d > 0 ? 'separate' : 'pop';
    if (to === controllerStanceMode()) return;
    // SEP-SHOW: a touchpad pad's unbound Crouch bound to a free touchpad on the way in, said.
    if (to === 'separate' && this.binding()?.enterSeparate()) this.toast(TOUCHPAD_CROUCH_TOAST);
    setControllerStanceMode(to);
    this.toggled();
  }

  /** Left / Right on a tuner row: the dead zone by 1 % (0-40 %), the Stance mode, clamped. */
  private remapStep(d: number): void {
    if (this.S.rm.row === REMAP_STANCE_ROW) { this.stanceModeStep(d); return; }
    const m = this.binding();
    if (!m || remapLock(m)) return;
    const r = this.S.rm.row;
    // h59U9CLb: an Add row's action, stepped through the play set in its order, clamped.
    const extra = remapExtraAt(m, r);
    if (extra === 'addDouble' || extra === 'addCombo') {
      const kind = extra === 'addDouble' ? 'double' : 'combo';
      const at = PAD_EXTRA_ACTIONS.indexOf(m.addAction[kind]);
      m.addAction[kind] = PAD_EXTRA_ACTIONS[Math.max(0, Math.min(PAD_EXTRA_ACTIONS.length - 1, at + d))]!;
      return;
    }
    if (r === REMAP_DEAD_ROW) {
      const at = Math.round(m.deadZone() * 100);
      const to = Math.max(0, Math.min(DEAD_VALUES.length - 1, at + d));
      if (to !== at) m.setDeadZone(to / 100);
    }
  }

  /**
   * The screen's presses. While a binding is listened for, every pad button is the binding's (the walker stands down);
   * what reaches here then is a key (a development build's keymap, CX.R6) or a click on the legend, and only Circle
   * acts: it cancels the listen. Otherwise Up / Down walk the rows, Cross changes the row, Left / Right step a tuner,
   * Square resets one, Triangle asks Restore defaults, Circle goes back.
   */
  private pressRemap(b: Button): void {
    const S = this.S;
    const m = this.binding();
    if (!m) { S.screen = 'options'; return; }
    // LATER 380: the pass's keys as the pad does them (#491's review, 3): Circle skips a step that may be skipped -- the
    // taught Circle's tap on the pad, or the prompt's click -- and Not now is the panel's own button; before it, Cross
    // begins it and Circle goes back.
    if (m.teachState()) { if (b === 'circle') m.skipStep(); return; }
    if (m.raw && m.teachable() && !m.usable()) { if (b === 'cross') { this.S.rm.teachDeclined = false; m.teach(); } else if (b === 'circle') this.closeRemap(); return; }
    if (m.listening() >= 0) { if (b === 'circle') m.cancel(); return; }
    const lock = remapLock(m);
    if (b === 'up') S.rm.row = Math.max(0, S.rm.row - 1);
    else if (b === 'down') S.rm.row = Math.min(remapRowCount(m) - 1, S.rm.row + 1);
    else if (b === 'cross') this.remapAct();
    else if (b === 'left' || b === 'right') this.remapStep(b === 'left' ? -1 : 1);
    else if (b === 'square' && S.rm.row === REMAP_STANCE_ROW) {
      if (controllerStanceMode() !== 'pop') { setControllerStanceMode('pop'); this.toast(`Stance mode reset to ${STANCE_MODE_WORDS.pop}`); }
    } else if (b === 'square' && !lock && remapExtraAt(m, S.rm.row) === 'extras') {
      if (m.extraList().length > 0) { m.clearExtras(); this.toast('Extra binds cleared.'); }   // h59U9CLb
    } else if (b === 'square' && !lock) {
      const def = defaultController();
      const bind = remapBindOfRow(S.rm.row);                     // STM.R1: SEPARATE's rows only
      if (S.rm.row === REMAP_DEAD_ROW) { m.setDeadZone(def.deadZone); this.toast(`${PAD_DEAD_ZONE_LABEL} reset to ${Math.round(def.deadZone * 100)}%`); }
      else if (bind !== undefined) {
        if (bind === CROUCH_BIND) m.setCrouch(def.crouch); else m.setProne(def.prone);
        this.toast(`${m.bindName(bind)} unbound`);
      }
    } else if (b === 'triangle') {
      if (lock) this.legendError(lock.line);
      else { S.overlay = 'confirm'; S.confirmKind = 'restore'; S.confirmRow = 0; }
    } else if (b === 'circle') this.closeRemap();
  }

  /** The conflict's Confirm: Up / Down (Left / Right) between Swap, Replace and Cancel; Cross answers; Circle is Cancel. */
  private pressConflict(b: Button): void {
    const S = this.S;
    const m = this.binding();
    if (b === 'up' || b === 'left') S.confirmRow = Math.max(0, S.confirmRow - 1);
    else if (b === 'down' || b === 'right') S.confirmRow = Math.min(2, S.confirmRow + 1);
    else if (b === 'cross') m?.answer((['swap', 'replace', 'cancel'] as const)[S.confirmRow] ?? 'cancel');
    else if (b === 'circle') m?.answer('cancel');
    if (!m?.question()) S.overlay = null;                // answered, or the machine gone; a refused Replace keeps it
  }

  /* ---------- CX-LOADOUTS: the Armory's loadouts (`./render/loadouts`, over `./adapters/loadouts`) ---------- */

  /**
   * Pushes a side's mission list from the Armory's row, as Rooms and Replays are pushed: the focus on its first row, the
   * account's records read now if they are not (on demand, OT.R14).
   */
  openLoadouts(side: LoadoutSide): void {
    const L = this.A.loadouts;
    if (!L) return;
    this.S.screen = 'loadouts';
    this.S.lo = { side, row: 0, edit: 0 };
    L.open(side);
  }

  /** Circle on the list: Profile again, on the side's loadouts row (CX-31: found by title). */
  private closeLoadouts(): void {
    this.S.screen = 'loadoutSides';
    this.S.lo.row = this.S.lo.side === 'seal' ? 0 : 1;
  }

  /** The editor of `mission`, its focus on the type: its world asked of the disc. */
  private openLoadoutEditor(mission: string): void {
    this.S.screen = 'loadout';
    // A deep link's segment must not outlive the editor opened from the list.
    this.S.lo = { side: this.S.lo.side, row: this.S.lo.row, edit: 0 };
    this.A.loadouts?.edit(mission);
  }

  /** Back from the editor to the list, on the mission's row; its edits dropped. */
  leaveLoadoutEditor(): void {
    const S = this.S;
    const L = this.A.loadouts;
    const v = L?.editor();
    L?.close();
    if (S.overlay === 'confirm' && (S.confirmKind === 'loadout-leave' || S.confirmKind === 'loadout-defaults')) S.overlay = null;
    S.screen = 'loadouts';
    const i = v?.kind === 'ok' ? loadoutRows(this.A).findIndex((r) => r.mission === v.mission) : -1;
    if (i >= 0) S.lo.row = i;
  }

  /** A save's or a Defaults' outcome: the toast says it landed, the warn line a refusal (errors are not toasts). */
  private loadoutOutcome(p: Promise<LoadoutOutcome | null> | null): void {
    if (!p) return;
    this.render();                                                    // the save out: the Save row says so
    p.then((r) => {
      if (r?.ok) this.toast(r.words);
      else if (r) this.legendError(r.words);
      this.render();
    }, () => { this.render(); });
  }

  /**
   * Cross on a locked screen: signed out, the console's sign-in; the disc out, its chooser (over a game page the overlay's
   * lock, `chooseDisc`); a round running, its line again on the warn line.
   */
  private loadoutLocked(v: LoadoutLocked): void {
    if (v.lock === 'sign-in') this.openSignIn();
    else if (v.lock === 'disc') this.chooseDisc();
    else this.legendError(v.line);
  }

  /**
   * The two screens' presses. The list: Up / Down walk its rows, Cross opens the mission (a record not offered says so;
   * a refusal's Cross is Try again; a locked list's, its way out), Circle goes back, Triangle the account. The editor: Up
   * / Down walk the type, the five slots and Save; Left / Right step the type or a slot (`./adapters/loadouts`
   * `LOADOUT_ROLLER_PRESS_ADAPTATION`); Cross on Save, and Square on a slot -- the original ARMORY's Square on a weapon row
   * stores the record (S5, `StoringLoadout`, `CharacterProfile` mode 1: `../armoryState`; its `comeFromLan || eqLimit !==
   * 0` gate never fires here, `./loadoutModel` `LOADOUT_EDITOR_NO_GAME_ADAPTATION`) -- save; the type has no Square (the
   * original's character select has none); Triangle asks Defaults behind the Confirm; Circle goes back, asking first
   * while there are unsaved changes. Each Confirm starts on its safe answer (No).
   */
  private pressLoadouts(b: Button): void {
    const S = this.S;
    const L = this.A.loadouts;
    if (!L) { S.screen = 'home'; return; }
    if (S.screen === 'loadouts') {
      const v = L.list();
      const rows = v.kind === 'ok' ? v.rows : [];
      if (b === 'up') S.lo.row = Math.max(0, S.lo.row - 1);
      else if (b === 'down') S.lo.row = Math.max(0, Math.min(rows.length - 1, S.lo.row + 1));
      else if (b === 'circle') this.closeLoadouts();
      else if (b === 'triangle') this.account();
      else if (b === 'cross') {
        if (v.kind === 'locked') this.loadoutLocked(v);
        else if (v.kind === 'failed') L.retry();
        else {
          const r = rows[S.lo.row];
          if (r?.state === 'unoffered') this.legendError(LOADOUT_UNOFFERED_WORDS);
          else if (r) this.openLoadoutEditor(r.mission);
        }
      }
      return;
    }
    const v = L.editor();
    if (v.kind !== 'ok') {
      if (b === 'circle') this.leaveLoadoutEditor();
      else if (b === 'cross' && v.kind === 'locked') this.loadoutLocked(v);
      return;
    }
    const r = S.lo.edit;
    const ask = (kind: 'loadout-leave' | 'loadout-defaults'): void => { S.overlay = 'confirm'; S.confirmKind = kind; S.confirmRow = 0; };
    if (b === 'up') S.lo.edit = Math.max(0, r - 1);
    else if (b === 'down') S.lo.edit = Math.min(LOADOUT_SAVE_ROW, r + 1);
    else if (b === 'left' || b === 'right') { if (r < LOADOUT_SAVE_ROW) L.step(r, b === 'left' ? -1 : 1); }
    else if (b === 'cross') { if (r === LOADOUT_SAVE_ROW) this.loadoutOutcome(L.save()); }
    else if (b === 'square') { if (r >= 1 && r < LOADOUT_SAVE_ROW) this.loadoutOutcome(L.save()); }
    else if (b === 'triangle') { if (!v.busy) ask('loadout-defaults'); }
    else if (b === 'circle') { if (v.dirty) ask('loadout-leave'); else this.leaveLoadoutEditor(); }
  }

  /* ---------- CX-PERSONA: the Profile's Persona and Service record (`./render/profile`, over `./adapters/profile`) ---------- */

  /** Pushes the persona list from the Profile's row, its focus on the first row; the universe a new persona needs asked now. */
  openPersona(): void {
    const P = this.A.profile;
    if (!P) return;
    this.S.screen = 'persona';
    this.S.pf.row = 0;
    P.open('persona');
  }

  /** Pushes the Service record from the Profile's row: the record, the loadouts and the rank read now (OT.R14). */
  openRecord(): void {
    const P = this.A.profile;
    if (!P) return;
    this.S.screen = 'record';
    this.S.pf.rec = 0;
    P.open('record');
  }

  /** Back to the Profile category, on the row the screen was opened from. */
  private closeProfile(item: number): void {
    const S = this.S;
    const at = Math.max(0, CATS.findIndex((c) => c.id === 'profile'));
    S.screen = 'home';
    S.cat = at;
    S.item[at] = item;
  }

  /** The persona list again, on the row of `kind` (and `id`, a persona's). */
  private toPersonaList(kind: 'persona' | 'new', id: string | null = null): void {
    this.S.screen = 'persona';
    const i = personaItems(this.A).findIndex((x) => x.kind === kind && (kind !== 'persona' || x.id === id));
    if (i >= 0) this.S.pf.row = i;
  }

  /** An edit's outcome: the toast says it landed, the warn line a refusal (errors are not toasts). */
  private personaOutcome(r: PersonaOutcome): boolean {
    if (r.ok) { if (r.words) this.toast(r.words); } else this.legendError(r.words);
    return r.ok;
  }

  /** Opens the text field over the on-screen keyboard on `text`, its first letter key focused (the Search dialog's start). */
  private openField(target: FieldTarget, text: string): void {
    this.S.overlay = 'field';
    this.S.fd = { target, text, kr: 1, kc: 0, shift: false, typing: false, error: '' };
  }

  fType(ch: string): void {
    const fd = this.S.fd;
    fd.error = '';
    if (Array.from(fd.text).length < fieldMeta(this.S, this.A).cap) fd.text += fd.shift ? ch.toUpperCase() : ch;
  }

  /** The field's text clipped to its cap (typed on a real keyboard). */
  fClip(): void {
    const fd = this.S.fd;
    fd.text = Array.from(fd.text).slice(0, fieldMeta(this.S, this.A).cap).join('');
  }

  fKey(r: number, c: number): void {
    const fd = this.S.fd;
    if (r < 4) { const ch = OSK_ROWS[r]?.[c]; if (ch) this.fType(ch); }
    else if (c === 0) fd.shift = !fd.shift;
    else if (c === 1) this.fType(' ');
    else if (c === 2) fd.text = Array.from(fd.text).slice(0, -1).join('');
    else this.fDone();
  }

  /**
   * The field's Done: the edit sent through the adapter (the section's checks there); landed, the field closes and the
   * toast says so; refused, the field stays open with the refusal on its error line, in the section's words. The new
   * persona's two fields are kept for its Create.
   */
  fDone(): void {
    const S = this.S;
    const P = this.A.profile;
    const t = S.fd.target;
    const text = S.fd.text;
    if (t.kind === 'share-code') {
      // DSH-4: the sender's typed code; a code, the dialog asks as the link's would; else the field says why.
      if (!this.A.discShare?.choose(text)) { S.fd.error = SHARE_CODE_BAD; return; }
      S.snd = { row: 0, shut: false };
      S.overlay = 'share';
      return;
    }
    if (t.kind === 'new-name' || t.kind === 'new-town') {
      if (t.kind === 'new-name') S.pf.nw.name = text; else S.pf.nw.town = text;
      S.overlay = null;
      return;
    }
    if (!P) { S.overlay = null; return; }
    const id = S.pf.id ?? '';
    const r = t.kind === 'match-name' ? P.setMatchName(text) : t.kind === 'town' ? P.setTown(id, text) : P.setPhrase(t.phrase, t.slot, text);
    if (!r.ok) { S.fd.error = r.words; return; }
    S.overlay = null;
    if (r.words) this.toast(r.words);
  }

  /** The field's presses: the on-screen keyboard's grid and Cross; Square deletes, Triangle a space, L2 Shift, R2 Done; Circle cancels. */
  private pressField(b: Button): void {
    const fd = this.S.fd;
    if (b === 'circle') this.S.overlay = null;
    else if (b === 'square') fd.text = Array.from(fd.text).slice(0, -1).join('');
    else if (b === 'triangle') this.fType(' ');
    else if (b === 'l2') fd.shift = !fd.shift;
    else if (b === 'r2') this.fDone();
    else if (b === 'cross') this.fKey(fd.kr, fd.kc);
    else oskStep(fd, b);                                              // OPTIONS is not read on a text field
  }

  /** Delete's Yes: the persona removed from the card; the list again, on New persona (the section's focus after a delete). */
  private deletePersona(): void {
    const P = this.A.profile;
    const id = this.S.pf.id;
    if (!P || id === null) return;
    if (!this.personaOutcome(P.remove(id))) return;
    this.S.pf.id = null;
    this.toPersonaList('new');
  }

  /**
   * The four screens' presses. The list: Up / Down walk its rows; Cross on a persona opens its editor (read only under
   * the lock), on New persona its form (or the universe's Try again), on the match name its field; a locked row says its
   * line. The editor: Up / Down walk the home town, the gender, the ten phrases and Delete; Cross opens a field, flips the
   * gender or asks Delete's Confirm (No first); Left / Right step the gender, written at once. The new persona: its two
   * fields, its gender, Create. The Service record: Up / Down walk its lines, Square reads it again, Cross a refusal's Try
   * again or, signed out, the sign-in. Circle goes back everywhere (the new persona's is its Cancel); Triangle the account.
   */
  private pressProfile(b: Button): void {
    const S = this.S;
    const P = this.A.profile;
    if (!P) { S.screen = 'home'; return; }
    if (b === 'triangle') { this.account(); return; }
    if (S.screen === 'persona') {
      const items = personaItems(this.A);
      if (b === 'up') S.pf.row = Math.max(0, S.pf.row - 1);
      else if (b === 'down') S.pf.row = Math.max(0, Math.min(items.length - 1, S.pf.row + 1));
      else if (b === 'circle') this.closeProfile(3);
      else if (b === 'cross') {
        const it = items[S.pf.row];
        if (!it) return;
        if (it.locked) this.legendError(it.locked);
        else if (it.kind === 'persona' && it.id) { S.pf.id = it.id; S.pf.edit = PERSONA_TOWN_ROW; S.screen = 'personaEdit'; }
        else if (it.kind === 'new' && it.retry) P.retryHost();
        else if (it.kind === 'new' && it.verb) { S.screen = 'personaNew'; S.pf.nw = { name: '', town: '', gender: 0, row: 0 }; }
        else if (it.kind === 'match-name') this.openField({ kind: 'match-name' }, P.matchName());
      }
      return;
    }
    if (S.screen === 'personaEdit') {
      const v = S.pf.id === null ? null : P.editor(S.pf.id);
      if (!v || v.kind !== 'ok') { if (b === 'circle') this.toPersonaList('persona'); return; }
      const r = S.pf.edit;
      if (b === 'up') S.pf.edit = Math.max(0, r - 1);
      else if (b === 'down') S.pf.edit = Math.min(PERSONA_EDIT_ROWS - 1, r + 1);
      else if (b === 'circle') this.toPersonaList('persona', v.id);
      else if (b === 'left' || b === 'right') {
        if (r !== PERSONA_GENDER_ROW) return;
        if (v.locked) { this.legendError(v.locked); return; }
        this.personaOutcome(P.setGender(v.id, b === 'left' ? 0 : 1));
      } else if (b === 'cross') {
        if (v.locked) { this.legendError(v.locked); return; }
        const row = editorRows(v)[r];
        if (r === PERSONA_TOWN_ROW) this.openField({ kind: 'town' }, v.town);
        else if (r === PERSONA_GENDER_ROW) this.personaOutcome(P.setGender(v.id, v.gender === 1 ? 0 : 1));
        else if (r === PERSONA_DELETE_ROW) { S.overlay = 'confirm'; S.confirmKind = 'persona-delete'; S.confirmRow = 0; }
        else if (r >= PERSONA_PHRASE_ROW && row?.phrase) this.openField({ kind: 'phrase', phrase: row.phrase.kind, slot: row.phrase.slot }, row.phrase.own ? row.phrase.value : '');
      }
      return;
    }
    if (S.screen === 'personaNew') {
      const n = S.pf.nw;
      if (b === 'up') n.row = Math.max(0, n.row - 1);
      else if (b === 'down') n.row = Math.min(PERSONA_NEW_ROWS - 1, n.row + 1);
      else if (b === 'circle') this.toPersonaList('new');
      else if (b === 'left' || b === 'right') { if (n.row === PERSONA_NEW_GENDER_ROW) n.gender = b === 'left' ? 0 : 1; }
      else if (b === 'cross') {
        if (n.row === 0) this.openField({ kind: 'new-name' }, n.name);
        else if (n.row === 1) this.openField({ kind: 'new-town' }, n.town);
        else if (n.row === PERSONA_NEW_GENDER_ROW) n.gender = n.gender === 1 ? 0 : 1;
        else if (n.row === PERSONA_NEW_CREATE_ROW) {
          const r = P.create({ name: n.name, town: n.town, gender: n.gender });
          // After a create, its home town's Edit (the section's focus rule): the new persona's editor on its first row.
          if (this.personaOutcome(r) && r.id) { S.pf.id = r.id; S.pf.edit = PERSONA_TOWN_ROW; S.screen = 'personaEdit'; }
        }
      }
      return;
    }
    const v = P.record();
    if (b === 'up') S.pf.rec = Math.max(0, S.pf.rec - 1);
    else if (b === 'down') S.pf.rec = Math.max(0, Math.min(recordRows(this.A).length - 1, S.pf.rec + 1));
    else if (b === 'circle') this.closeProfile(0);
    else if (b === 'square') { if (v.kind === 'signed-in') P.retry(); }
    else if (b === 'cross') {
      if (v.kind === 'signed-out') this.openSignIn();
      else if (v.record.kind === 'failed') P.retry();
    }
  }

  /* ---------- CX-LOBBIES: a room's and a game's detail, Custom matches (`./render/lobbies`) ---------- */

  /**
   * On the launcher, opening a room or a game makes it the launch target (kept by id in `lobbySelection`, where the
   * launch reads it), as Browse rooms' Cross made a game one before CX-LOBBIES; and, as then, it outlives the screens:
   * Circle keeps it. Only these let it go -- another picked, Clear target (`clearTarget`), a sign-out (`signOutNow`),
   * and in the rooms adapter a lost session or its row gone from the list. A full room is not made the target and the
   * one held stays (567e767cf's `roomPick`: the toast, nothing changed). In the overlay nothing is a target
   * (OVERLAY-CONSOLE: the rooms read only).
   */
  private setTarget(id: string): void {
    const S = this.S;
    if (S.mode === 'overlay') return;
    const r = this.A.rooms.row?.(id) ?? null;
    if (!r || r.id === S.rooms.selected) return;
    if (roomFull(r)) { this.toast(`Room ${r.name} is full`); return; }
    S.rooms.selected = r.id;
    this.A.rooms.select?.(r.id);
    this.host.announce(`Launch target: ${r.name}`);
  }

  /** Clear target (L1 on Browse rooms, a room's and a game's screen, while one is set): the launch target let go. */
  private clearTarget(): void {
    const S = this.S;
    if (S.mode === 'overlay' || S.rooms.selected === null) return;
    S.rooms.selected = null;
    this.A.rooms.select?.(null);
    this.host.announce('Launch target cleared');
  }

  /** Pushes a briefing room's detail from its Browse rooms row: its games, then its players; the focus on its first row. */
  openRoom(id: string): void {
    const S = this.S;
    S.screen = 'room';
    S.lb.room = id;
    S.lb.row = 0;
    forgetFocus(S, 'room');
    this.setTarget(id);
  }

  /** Pushes a game's detail -- from a room's list (`room`) or its own Browse rooms row (`rooms`). */
  openGame(id: string, from: 'room' | 'rooms'): void {
    const S = this.S;
    S.screen = 'game';
    S.lb.game = id;
    S.lb.grow = 0;
    S.lb.from = from;
    this.setTarget(id);
  }

  /** Browse rooms again, the focus on the row `id` when it is drawn there; the target kept (the fold: as Browse rooms kept it). */
  private toRooms(id: string | null): void {
    const S = this.S;
    S.screen = 'rooms';
    forgetFocus(S, 'rooms');
    const i = id === null ? -1 : visibleRooms(S, this.A).findIndex((r) => r.id === id);
    if (i >= 0) S.rooms.row = i;
  }

  /** Pushes Custom matches from Play online's row, the focus on its first row: its read starts with the draw (`sync`). */
  openCustom(): void {
    if (!this.A.custom) return;
    this.S.screen = 'custom';
    this.S.lb.crow = 0;
    forgetFocus(this.S, 'custom');
  }

  /** Circle on Custom matches: Play online again, on its row. */
  private closeCustom(): void {
    const S = this.S;
    const at = Math.max(0, CATS.findIndex((c) => c.id === 'online'));
    S.screen = 'home';
    S.cat = at;
    S.item[at] = Math.max(0, homeItems('online', S, this.A).findIndex((x) => x.act === 'custom'));
  }

  /** The list answered again: said once it has, a failure on the legend's warn line (errors are not toasts). */
  private refreshRooms(): void {
    this.A.rooms.refresh().then(() => {
      const st = this.A.rooms.status?.();
      if (st?.kind === 'failed') this.legendError(st.words); else this.toast('Room list updated');
      this.render();
    }, () => { this.render(); });
  }

  /**
   * LR2 review F2 (LR-37 (9)): Browse rooms' Square reads again what its filter shows -- CLASSIC the classic rooms (the
   * rooms' own refresh, `refreshRooms`), CUSTOM the custom matches (their adapter's `refresh`, as the old Custom matches
   * screen's Square), ALL both -- and says once they have answered what was read: "Room list updated", "Custom matches
   * updated", or both in one line. The rooms' failure is the legend's warn line, as `refreshRooms` says it. With no custom
   * matches adapter, ALL is the rooms alone and CUSTOM reads nothing. A browser adaptation, nothing of the game.
   */
  private refreshBrowse(): void {
    const kind = this.S.rooms.kind;
    const custom = kind !== BROWSE_CLASSIC ? this.A.custom : undefined;
    if (kind === BROWSE_CUSTOM) {
      custom?.refresh().then(() => { this.toast('Custom matches updated'); this.render(); }, () => { this.render(); });
      return;
    }
    if (!custom) { this.refreshRooms(); return; }
    Promise.all([this.A.rooms.refresh(), custom.refresh()]).then(() => {
      const st = this.A.rooms.status?.();
      if (st?.kind === 'failed') this.legendError(st.words); else this.toast('Rooms and custom matches updated');
      this.render();
    }, () => { this.render(); });
  }

  /**
   * The three screens' presses (the retired section's pad, MU2-5, in the console's grammar). A room: Up / Down walk its
   * games and its players, Cross on a game opens it. A game: Up / Down walk its lines, read only. Circle backs out one
   * level -- a game opened in a room back to that room, a room or a game back to Browse rooms on its row -- and keeps the
   * launch target; L1 is Clear target. Square reads the list again. Custom matches: Up / Down walk the lobbies, Cross is JOIN
   * (the forge at the lobby, a change of page; locked over a game page, its line on the warn line), Circle back to Play
   * online, Square reads them again. Triangle is the account.
   */
  private pressLobbies(b: Button): void {
    const S = this.S;
    if (b === 'triangle') { this.account(); return; }
    if (S.screen === 'custom') {
      const items = customItems(S, this.A);
      if (b === 'up') S.lb.crow = Math.max(0, S.lb.crow - 1);
      else if (b === 'down') S.lb.crow = Math.max(0, Math.min(items.length - 1, S.lb.crow + 1));
      else if (b === 'circle') this.closeCustom();
      else if (b === 'square') this.A.custom?.refresh().then(() => { this.toast('Custom matches updated'); this.render(); }, () => { this.render(); });
      else if (b === 'cross') {
        const it = items[S.lb.crow];
        if (it?.kind !== 'match' || it.id === undefined) return;
        if (overGame(S)) { this.legendError(OVERLAY_LOCK_WORDS.join); return; }   // OT.R60: the forge would take the game's page
        this.A.custom?.join(it.id);
      }
      return;
    }
    if (b === 'square') { this.refreshRooms(); return; }
    if (b === 'l1') { this.clearTarget(); return; }
    if (S.screen === 'room') {
      const items = lobbyRoomItems(this.A, S.lb.room);
      if (b === 'up') S.lb.row = Math.max(0, S.lb.row - 1);
      else if (b === 'down') S.lb.row = Math.max(0, Math.min(items.length - 1, S.lb.row + 1));
      else if (b === 'circle') this.toRooms(S.lb.room);
      else if (b === 'cross') {
        const it = items[S.lb.row];
        if (it?.kind === 'game' && it.id !== undefined) this.openGame(it.id, 'room');
      }
      return;
    }
    const n = lobbyGameItems(this.A, S.lb.game).length;
    if (b === 'up') S.lb.grow = Math.max(0, S.lb.grow - 1);
    else if (b === 'down') S.lb.grow = Math.max(0, Math.min(n - 1, S.lb.grow + 1));
    else if (b === 'circle') {
      const room = S.lb.from === 'room' ? S.lb.room : null;
      if (room !== null && this.A.rooms.room?.(room).kind === 'ok') {
        const game = S.lb.game;
        S.screen = 'room';
        S.lb.game = null;
        const i = lobbyRoomItems(this.A, room).findIndex((x) => x.id === game);
        if (i >= 0) S.lb.row = i;
        forgetFocus(S, 'room');
      } else {
        const game = S.lb.game;
        S.lb.game = null;
        this.toRooms(game);
      }
    }
  }

  /* ---------- the grammar: one press handler per context ---------- */

  /**
   * Where the focus is on the console's own screens (Home's category, its item and the disc source dropdown's row; Browse
   * rooms' and the replays' rows; Options' tab, zone and row): a move is a press that changes it. `source` false leaves
   * the dropdown's row out (CX-51's taps: its opening and closing are not moves).
   */
  private focusKey(source = true): string {
    const S = this.S;
    return [S.screen, S.cat, S.item[S.cat] ?? 0, S.thm.open ? `t${S.thm.row}` : '-', S.chk.open ? `c${S.chk.row}` : '-', S.opt.panel ?? '-', source && S.src.open ? S.src.row : '-', S.rooms.row, S.rooms.kind, S.rp.row, S.opt.cat, S.opt.zone, S.opt.row, S.rm.row, S.lo.row, S.lo.edit, S.pf.row, S.pf.edit, S.pf.nw.row, S.pf.rec, S.lb.row, S.lb.grow, S.lb.crow, S.sv.row, S.md.row].join('|');   // RB-5: Server's and Mods' rows
  }

  /**
   * One press. CX-20 (CX.R12, the owner, 2026-10-12: "R1/L1 should make the same sound as changing items"): a press of the
   * D-pad or a shoulder that moves the focus on a screen -- to another item, row or tab, or, by L1 / R1 or Left / Right, to
   * another category -- calls the console's one menu-move cue (`Adapters.cue.selection`, the original's menus' cue at a
   * focus move: `@s2u/ui` `UiSoundCues.selection`), the same function for every move; none when nothing moved (an end
   * clamped, a roller's value stepped) and none in a dialog. The console page wires no sound to it yet (the plan's Log,
   * CX-20): absent, the move is silent.
   */
  press(b: Button): void {
    // CX-12: a page by L2 / R2 is a move too, where they page (`pageList`: not Browse rooms' filter roller, not the
    // Disc source dropdown they close).
    const move = (MOVES.includes(b) || ((b === 'l2' || b === 'r2') && pageList(this.S, this.A) !== null)) && !this.S.overlay;
    const before = move ? this.focusKey() : '';
    const was = cueSnap(this.S);
    this.cued = false;
    this.S.opt.flip = undefined;                                      // LR-13 (review F4): a flip's mark lasts one draw
    this.hoverFrom = null;                                            // CX-51 F1: a press takes a hover's move (its own cue)
    this.host.pressed?.(b);
    this.pressNow(b);
    if (move && !this.S.overlay && !this.cued && this.focusKey() !== before) { this.A.cue?.selection(); this.cued = true; }
    else this.cueAfter(was, b);
  }

  /** CX-51: whether a cue was already said during this press or tap (a setting changed: `toggled`). */
  private cued = false;

  /** CX-51: a setting or a switch changed -- its own cue, and no other for this press. */
  private toggled(): void {
    this.A.cue?.play?.('toggle');
    this.cued = true;
    this.hoverFrom = null;
  }

  /** CX-51 (CX.R19): the cue a press or a tap plays, from the state before it and now (`./sounds` `cueFor`). */
  private cueAfter(was: CueSnap, b: Button): void {
    if (this.cued) return;
    const cue = cueFor(was, cueSnap(this.S), b);
    if (cue) { this.A.cue?.play?.(cue); this.cued = true; this.hoverFrom = null; }
  }

  private pressNow(b: Button): void {
    const S = this.S;
    const A = this.A;
    // The mouse disclosure consumes controller actions until it is dismissed; never act on the page underneath.
    if (S.accountOpen) { if (b === 'circle') this.closeAccountMenu(); return; }
    if (S.overlay === 'extract') {
      // DX-3: the popover's grammar (`extractPress`): while it runs Circle cancels; on a refusal the D-pad moves between
      // its two buttons, Cross presses the focused one, Circle goes on from the disc (a disc refused: closes). OPTIONS is
      // not START here.
      const v = S.extract;
      if (v) {
        const r = extractPress(v, b);
        S.extract = r.view;
        if (r.act) A.disc.extractAct?.(r.act);
      }
      this.render();
      return;
    }
    if (S.overlay === 'launch') {
      // Circle is Back to the launcher: before the mount it cancels the hand-over; after a refusal it closes the screen.
      if (b === 'circle') { A.launch?.cancel(); A.disc.hold?.(false); S.overlay = null; S.start = 'idle'; S.launch.error = ''; this.nav?.release(); }
      this.render();
      return;
    }
    if (S.overlay === 'states') {
      if (b === 'up') S.states.row = Math.max(0, S.states.row - 1);
      else if (b === 'down') S.states.row = Math.min(2, S.states.row + 1);
      else if (b === 'cross') { this.flipState(S.states.row); return; }
      else if (b === 'circle') S.overlay = null;
      this.render();
      return;
    }
    if (S.overlay === 'confirm' && S.confirmKind === 'conflict') { this.pressConflict(b); this.render(); return; }
    if (S.overlay === 'confirm') {
      const decline = S.confirmKind === 'decline';
      const last = S.confirmKind === 'signout' && (A.session.forgets?.() ?? false) ? 2 : 1;   // OT.R61: Forget this device
      if (b === 'up' || b === 'left') S.confirmRow = Math.max(0, S.confirmRow - 1);
      else if (b === 'down' || b === 'right') S.confirmRow = Math.min(last, S.confirmRow + 1);
      else if (b === 'cross' && S.confirmRow === 2 && last === 2) {
        S.overlay = null;
        if (!this.signOutLocked()) this.signOutNow(true);           // PERSONA-PERSIST (a): the cookie dropped, NO filed
      } else if (b === 'cross' && S.confirmRow === 1) {
        S.overlay = null;
        if (decline) A.session.signOut().then(() => { this.toast('Signed out'); this.render(); }, () => { this.render(); });
        else if (S.confirmKind === 'kept') this.forgetKept();
        else if (S.confirmKind === 'restore') this.binding()?.restoreDefaults();   // CX-14
        else if (S.confirmKind === 'loadout-leave') this.leaveLoadoutEditor();        // CX-LOADOUTS: the edits dropped
        else if (S.confirmKind === 'loadout-defaults') this.loadoutOutcome(this.A.loadouts?.defaults() ?? null);
        else if (S.confirmKind === 'persona-delete') this.deletePersona();             // CX-PERSONA
        else if (!this.signOutLocked()) this.signOutNow();          // OVERLAY-CONSOLE: a lock met while it was asked
      } else if (b === 'cross' || b === 'circle') S.overlay = decline ? 'agreement' : null;   // No, first and focused
      this.render();
      return;
    }
    if (S.overlay === 'agreement') {
      // The original's dlgUsagePolicy: LEFT / RIGHT between ACCEPT and DECLINE, UP / DOWN scroll the text; Circle is
      // Decline (the modern panel's Escape). OPTIONS is not read.
      if (b === 'left' || b === 'right') S.ag.row = b === 'left' ? 0 : 1;
      else if (b === 'up') S.ag.scroll = Math.max(0, S.ag.scroll - AGREEMENT_SCROLL_STEP);
      else if (b === 'down') S.ag.scroll += AGREEMENT_SCROLL_STEP;
      else if (b === 'circle' || (b === 'cross' && S.ag.row === 1)) this.askDecline();
      else if (b === 'cross') {
        A.session.agreement?.accept();
        S.overlay = null;
        this.toast('Signed in as ' + A.session.persona());
      }
      this.render();
      return;
    }
    if (S.overlay === 'signedout') {
      // LR-12: Cross signs in as the persona signed out of (the sign-in, it chosen); Circle closes (MODAL-CLOSE, OT.R62).
      const name = S.signedOutAs ?? null;
      if (b === 'cross') {
        S.overlay = null;
        delete S.signedOutAs;
        this.openSignIn();
        const i = name ? cardNames(A).indexOf(name) : -1;
        if (i >= 0) S.si.persona = i;
      } else if (b === 'circle') { S.overlay = null; delete S.signedOutAs; }
      this.render();
      return;
    }
    if (S.overlay === 'signin') { this.pressSignIn(b); return; }
    if (S.overlay === 'search') { this.pressSearch(b); return; }
    if (S.overlay === 'field') { this.pressField(b); this.render(); return; }     // CX-PERSONA: the Profile's field
    if (S.overlay === 'share') { this.pressShare(b); this.render(); return; }   // DSH-5: the sender's dialog
    if (S.overlay === 'install') {
      // Circle closes. Cross does not install: a pad press is not a user activation, so prompt() would fail. RB-45 (b):
      // where the dialog offers Copy launcher address, Cross is that copy (the clipboard decides; a refusal shows the
      // note with the address); where it installs, Cross says how on the legend's line.
      if (b === 'circle') S.overlay = null;
      else if (b === 'up' || b === 'down') this.host.scrollDialog?.(b === 'up' ? -1 : 1);
      else if (b === 'cross') {
        const surface = A.options.installSurface?.() ?? 'other';
        if (installCopyOffered(surface)) void copyLauncherAddress();
        else if (surface === 'chromium') this.legendError(INSTALL_POINTER_WORDS);
      }
      this.render();
      return;
    }
    if (S.overlay === 'news') {
      // The server's news (slice 2). CX-29: Circle closes it; the project's News page is not linked from here.
      if (b === 'circle') S.overlay = null;
      else if (b === 'up' || b === 'down') this.host.scrollDialog?.(b === 'up' ? -1 : 1);
      this.render();
      return;
    }
    if (S.overlay === 'viewer') {
      // CX-15: the pad goes to the viewer -- the D-pad walks its controls, Cross presses -- and Circle is Close. The
      // other buttons are not read there (OPTIONS is not START while a replay plays).
      if (b === 'circle') this.closeViewer();
      else if (b === 'cross' || b === 'up' || b === 'down' || b === 'left' || b === 'right') A.replays.watching?.()?.press(b);
      this.render();
      return;
    }
    // CX-12: L2 / R2 page the screen's list when it is taller than its pane (`pageList`, the host's `page`); where it fits,
    // or where they are the screen's own, the press goes on as before.
    if ((b === 'l2' || b === 'r2') && this.pageBy(b === 'l2' ? -1 : 1)) { this.render(); return; }
    // CX-14: the mapping screen's own presses (OPTIONS stays START there, but not while a binding is listened for).
    if (S.screen === 'remap' && (b !== 'options' || this.remapListening())) { this.pressRemap(b); this.render(); return; }
    // CX-LOADOUTS: the loadouts screens' own presses (OPTIONS stays START there).
    if (S.screen === 'loadoutSides' && b !== 'options') {
      if (b === 'up') S.lo.row = Math.max(0, S.lo.row - 1);
      else if (b === 'down') S.lo.row = Math.min(1, S.lo.row + 1);
      else if (b === 'cross') this.doAct(loadoutSideItems(A)[S.lo.row]?.act);
      else if (b === 'circle') this.closeProfile(2);
      else if (b === 'triangle') this.account();
      this.render(); return;
    }
    if ((S.screen === 'loadouts' || S.screen === 'loadout') && b !== 'options') { this.pressLoadouts(b); this.render(); return; }
    // CX-PERSONA: the Profile's screens' own presses (OPTIONS stays START there).
    if ((S.screen === 'persona' || S.screen === 'personaEdit' || S.screen === 'personaNew' || S.screen === 'record') && b !== 'options') { this.pressProfile(b); this.render(); return; }
    // CX-LOBBIES: a room's and a game's detail and Custom matches (OPTIONS stays START there).
    if ((S.screen === 'room' || S.screen === 'game' || S.screen === 'custom') && b !== 'options') { this.pressLobbies(b); this.render(); return; }
    // CX-28: the Server screen (OPTIONS stays START there).
    if (S.screen === 'server' && b !== 'options') { this.pressServer(b); this.render(); return; }
    // B206 ML-2: the MODS screen (OPTIONS stays START there).
    if (S.screen === 'mods' && b !== 'options') { this.pressMods(b); this.render(); return; }
    if (b === 'options') { this.start(); return; }
    // OVERLAY-CONSOLE: Circle at the top of the overlay's console (Home, nothing open over it) is the way back to the game.
    if (b === 'circle' && S.screen === 'home' && S.mode === 'overlay' && !S.src.open && !S.thm.open) { this.host.close?.(); return; }
    if (b === 'triangle' && S.screen !== 'rooms') { this.account(); this.render(); return; }
    if (S.screen === 'home' && S.chk.open) { this.pressCheck(b); this.render(); return; }   // LR-36: Play's launch check
    if (S.screen === 'home') {
      const cat = CATS[S.cat]!;
      const items = homeItems(cat.id, S, A);
      const it = S.item[S.cat] ?? 0;
      // CX-16: the source dropdown, opened by Square on the Disc action (the legend's "the screen's own" press; Left and
      // Right stay the crossbar's, the design's one axis per direction): Up / Down walk its two options, Cross picks one,
      // Circle or Square closes it; any other press closes it and does its own work.
      if (S.src.open) {
        if (b === 'up' || b === 'down') { S.src.row = Math.max(0, Math.min(DISC_SOURCES.length - 1, S.src.row + (b === 'up' ? -1 : 1))); this.render(); return; }
        if (b === 'cross') { this.pickSource(S.src.row, S.input === 'pointer' || this.keyGesture); this.render(); return; }
        S.src.open = false;
        if (b === 'circle' || b === 'square') { this.cue('close'); this.render(); return; }   // LR-37 (2)
      }
      // LR-13 (LR.R16 (2)): the theme drop-up over Settings' Theme item: Up / Down walk it (the ends kept), Cross applies
      // the theme, Circle closes it; any other press closes it and does its own work.
      if (S.thm.open) {
        const n = themePicks(A).length;
        if (b === 'up' || b === 'down') { S.thm.row = Math.max(0, Math.min(n - 1, S.thm.row + (b === 'up' ? -1 : 1))); this.render(); return; }
        if (b === 'cross') { this.pickTheme(S.thm.row); this.render(); return; }
        S.thm.open = false;
        if (b === 'circle') { this.cue('close'); this.render(); return; }
      }
      // LP.R13: every Home category input stops at the ends. Nested Settings tabs keep their existing wrap.
      const cat0 = S.cat;
      if (b === 'left') S.cat = Math.max(0, S.cat - 1);
      else if (b === 'right') S.cat = Math.min(CATS.length - 1, S.cat + 1);
      else if (b === 'l1') S.cat = Math.max(0, S.cat - 1);
      else if (b === 'r1') S.cat = Math.min(CATS.length - 1, S.cat + 1);
      else if (b === 'up') S.item[S.cat] = Math.max(0, it - 1);
      else if (b === 'down') S.item[S.cat] = Math.min(items.length - 1, it + 1);
      else if (b === 'cross') this.doAct(items[it]?.act);
      else if (b === 'square' && items[it]?.source) this.toggleSource();
      // LR-23: on the launcher page the disc's source is the legend chip's cog; Square on Play opens it (the legend names it).
      else if (b === 'square' && items[it]?.act === 'play' && deployChecks(S, A)[0]?.source) this.toggleSource();
      else if (b === 'square' && cat.id === 'replays') this.doAct(items[0]?.act);
      // none when nothing moved (an end clamped; LR.R3: the rail's bump is the end's only feedback)
      if ((b === 'left' || b === 'right' || b === 'l1' || b === 'r1') && S.cat !== cat0) this.host.announce(CATS[S.cat]!.label);
    } else if (S.screen === 'rooms') {
      const n = browseRows(S, A).length;                               // LR-37 (9): the classic rooms, then the custom matches
      const nf = A.rooms.filters().length;
      if (b === 'up') S.rooms.row = Math.max(0, S.rooms.row - 1);
      else if (b === 'down') S.rooms.row = Math.max(0, Math.min(n - 1, S.rooms.row + 1));
      else if (b === 'cross') this.roomPick();
      else if (b === 'circle') { S.screen = 'home'; S.cat = Math.max(0, CATS.findIndex((c) => c.id === 'online')); }
      // Said once the list has answered: an outcome in the past tense, a failure on the legend's warn line (errors are not
      // toasts: the design export's Toast page, `components/Toast/README.md`, not a file of this repository).
      else if (b === 'square') this.refreshBrowse();                   // LR2 review F2: what the filter shows
      else if (b === 'l1') this.clearTarget();                         // CX-LOBBIES: Clear target (Cross opens the row)
      else if (b === 'l2' && nf) { S.rooms.filter = (S.rooms.filter + nf - 1) % nf; S.rooms.row = 0; }
      else if (b === 'r2' && nf) { S.rooms.filter = (S.rooms.filter + 1) % nf; S.rooms.row = 0; }
      // LR-37 (9): Left / Right step the left column's ALL / CLASSIC / CUSTOM (the ends kept), the focus to the list's top.
      else if (b === 'left' || b === 'right') this.roomKind(S.rooms.kind + (b === 'left' ? -1 : 1));
      else if (b === 'triangle') { if (A.rooms.search) this.openSearch(); else this.account(); }
    } else if (S.screen === 'replays') {
      // The replays list: a pushed Profile screen; its empty/status action keeps sign-in and recovery reachable.
      // RV-4 on the release path (the sprint 39 close review's item 1): the down press on the last row, while the server
      // has a page after the rows read, asks for it (`replaysMore`). Only the list's own next page: no shoulder page
      // jumps (long-list paging by L2/R2 is the console plan's CX-12).
      const n = replayRows(A).length;
      if (b === 'up') S.rp.row = Math.max(0, S.rp.row - 1);
      else if (b === 'down') { if (!(S.rp.row >= n - 1 && this.replaysMore())) S.rp.row = Math.max(0, Math.min(n - 1, S.rp.row + 1)); }
      else if (b === 'circle') this.closeProfile(1);
      else if (b === 'square') this.doAct('refresh-replays');
      else if (b === 'cross' && n === 0) this.doAct(replayStatus(A)?.act);
      else if (b === 'cross' && n > 0) {
        // OVERLAY-CONSOLE (MU2-7's review F1): in a running round under the overlay Watch waits (the round keeps the disc
        // readers), said in the Replays section's words.
        if (roundRunning(S)) this.legendError(REPLAY_ROUND_WORDS);
        else if (A.disc.state() !== 'ready') this.legendError('Watching a replay needs your disc: Cross on Play, or the disc mark.');   // LR-24: the way now
        else this.watch();                                         // CX-15: the viewer over the page
      }
    } else if (S.screen === 'options') {
      const o = S.opt;
      const cats = optCategories(S, A);
      const rows = optRowsNow(S, A);
      if (o.panel) {
        // LR-13 (LR.R16 (2)): the pushed "Theme & background" panel -- Up / Down walk it, Cross picks, Circle (or Left) goes
        // back to the tab on its link row; L1 / R1 stay on it (no tabs there).
        if (b === 'up') o.row = Math.max(0, o.row - 1);
        else if (b === 'down') o.row = Math.min(rows.length - 1, o.row + 1);
        else if (b === 'cross') this.optAction();
        else if (b === 'circle' || b === 'left') {
          delete o.panel;
          o.zone = 'rows';
          o.row = Math.max(0, (cats[o.cat]?.rows ?? []).findIndex((r) => r.id === THEME_PANEL_ROW));
          this.cue('back');                                           // LR-37 (2): out of a pushed panel
        }
      }
      else if (b === 'l1' || b === 'r1') {
        const shown = optTabs(S, A);
        const at = Math.max(0, shown.findIndex((c) => c.id === cats[o.cat]?.id));
        const next = shown[(at + (b === 'l1' ? shown.length - 1 : 1)) % shown.length];
        if (next) o.cat = Math.max(0, cats.findIndex((c) => c.id === next.id));
        o.row = 0;
      }
      else if (o.zone === 'cats') {
        const shown = optTabs(S, A);
        const atTab = Math.max(0, shown.findIndex((c) => c.id === cats[o.cat]?.id));
        if (b === 'up' || b === 'down') {
          const i = b === 'up' ? Math.max(0, atTab - 1) : Math.min(shown.length - 1, atTab + 1);
          const next = shown[i];
          if (next) o.cat = Math.max(0, cats.findIndex((c) => c.id === next.id));
        }
        else if (b === 'right' || b === 'cross') { o.zone = 'rows'; o.row = 0; }
        else if (b === 'circle') {
          // Back on the Settings item that opens this tab, else the family's door (Game or Launcher).
          const at = Math.max(0, CATS.findIndex((c) => c.id === 'options'));
          S.screen = 'home'; S.cat = at;
          const cur = cats[o.cat];
          const items = homeItems('options', S, A);
          if (cur?.family) {
            const exact = items.findIndex((x) => x.act === `opt:${cur.id}`);
            const door = items.findIndex((x) => x.act === (cur.family === 'launcher' ? 'opt:controller' : 'opt:display'));
            S.item[at] = exact >= 0 ? exact : Math.max(0, door);
          } else S.item[at] = Math.max(0, items.findIndex((x) => x.act === `opt:${cur?.id ?? ''}` && x.act !== 'opt:display'));
        }
      } else {
        const row = rows[o.row];
        if (b === 'up') o.row = Math.max(0, o.row - 1);
        else if (b === 'down') o.row = Math.min(rows.length - 1, o.row + 1);
        else if (b === 'left' || b === 'right') { if (row?.values) this.optStep(b === 'left' ? -1 : 1); else if (b === 'left') o.zone = 'cats'; }
        else if (b === 'cross') { if (row?.action) this.optAction(); else if (isToggleRow(row)) this.optFlip(); }   // LR-13: Cross flips a toggle
        else if (b === 'square') {
          if (canResetRow(row, this.A.session.signedIn())) {      // a row with no default has nothing to reset to (the legend reads the same rule)
            const had = A.options.value(row.id);
            A.options.reset(row.id);
            if (A.options.value(row.id) !== had) this.toggled();          // LR-37 (2): a setting changed, its cue
            if (row.id === 'uiscale') this.host.fit();
            this.toast(row.label + ' reset to ' + row.values[row.def ?? 0]);
          }
        } else if (b === 'circle') { o.zone = 'cats'; this.cue('back'); }   // LR-37 (2): back to the tabs
      }
    }
    this.render();
  }

  /** CX-28: the Server screen. Up / Down walk its rows, Cross does the row, Square refreshes, Circle returns to Play online on the Server row. */
  private pressServer(b: Button): void {
    const S = this.S;
    const items = serverItems(this.A);
    if (b === 'up') S.sv.row = Math.max(0, S.sv.row - 1);
    else if (b === 'down') S.sv.row = Math.max(0, Math.min(items.length - 1, S.sv.row + 1));
    else if (b === 'cross') this.doAct(items[S.sv.row]?.act);
    else if (b === 'square') this.doAct('refresh-server');
    else if (b === 'circle') this.closeServer();
    else if (b === 'triangle') this.account();
  }

  /**
   * B206 ML-2 (ML.R6): the MODS screen. Up / Down walk its rows; on the drop zone Cross opens the file picker (a pad
   * cannot drop; RB-5: a pad's press is no user activation, so it says how on the legend's line); on the texture selector
   * Left / Right (and Cross) step Original and the installed texture packs; on a pack Cross switches it, Square asks and
   * a second Square removes it (RB-5), Left / Right move a data mod up or down the order; Circle returns to Experiments on
   * the Mods row.
   */
  private pressMods(b: Button): void {
    const S = this.S;
    const m = this.A.mods;
    const n = modsRowCount(this.A);
    const asked = this.removeAsk;
    this.removeAsk = null;                                            // RB-5: any other press forgets the ask
    if (b === 'up') { S.md.row = Math.max(0, S.md.row - 1); return; }
    if (b === 'down') { S.md.row = Math.max(0, Math.min(n - 1, S.md.row + 1)); return; }
    if (b === 'circle') { this.closeMods(); return; }
    if (b === 'triangle') { this.account(); return; }
    if (!m) return;
    const v = m.view();
    if (S.md.row === MODS_DROP_ROW) {
      if (b === 'cross') { if (this.gesture()) m.choose(); else this.legendError(MODS_CHOOSER_POINTER_WORDS); }   // RB-5
      return;
    }
    if (S.md.row === MODS_TEXTURE_ROW) {
      if (b !== 'left' && b !== 'right' && b !== 'cross') return;
      const at = Math.max(0, v.textures.findIndex((t) => t.id === v.texture));
      const next = v.textures[(at + (b === 'left' ? -1 : 1) + v.textures.length) % Math.max(1, v.textures.length)];
      if (next && next.id !== v.texture) m.setTexture(next.id);
      return;
    }
    if (S.md.row === modsTestHdRow(v)) { if (b === 'cross') m.addTestHdPack?.(); return; }   // TEST_HD_PACK_BUTTON_ADAPTATION (ML-12)
    const row = v.rows[S.md.row - MODS_FIRST_PACK_ROW];
    if (!row) return;
    if (b === 'cross' && row.on !== null) m.toggle(row.id);
    else if (b === 'square') {
      // RB-5: Square asks first (the toast); the next Square on the same pack removes it.
      if (asked === row.id) m.remove(row.id);
      else { this.removeAsk = row.id; this.toast(modsRemoveAsk(row.name)); }
    }
    else if ((b === 'left' && row.up) || (b === 'right' && row.down)) m.move(row.id, b === 'left' ? -1 : 1);
  }

  /** Circle on the MODS screen: Experiments, on the Mods row. */
  private closeMods(): void {
    const S = this.S;
    const at = Math.max(0, CATS.findIndex((c) => c.id === 'experiments'));
    const i = homeItems('experiments', S, this.A).findIndex((x) => x.act === 'mods');
    S.screen = 'home';
    S.cat = at;
    if (i >= 0) S.item[at] = i;
  }

  /** Circle on the Server screen: Play online, on the Server row -- or (LR-13) Home, on Server status, when opened from there. */
  private closeServer(): void {
    const S = this.S;
    const from = CATS[S.cat]?.id === 'home' ? 'home' : 'online';
    const at = Math.max(0, CATS.findIndex((c) => c.id === from));
    const i = homeItems(from, S, this.A).findIndex((x) => x.act === 'server');
    S.screen = 'home';
    S.cat = at;
    if (i >= 0) S.item[at] = i;
  }

  /**
   * CX-12: moves the focused row of the screen's list a page (`d` -1 up, +1 down: the pane's height in rows), clamped at
   * the ends. Answers whether the list pages here -- it is the screen's and taller than its pane -- whether or not the
   * focus moved (at an end it stays).
   */
  private pageBy(d: -1 | 1): boolean {
    const list = pageList(this.S, this.A);
    const rows = list ? this.host.page?.() ?? null : null;
    if (!list || !rows || rows < 1) return false;
    list.set(Math.max(0, Math.min(list.count - 1, list.at + d * rows)));
    return true;
  }

  /** A pad's press (the poll): pad mode, and in the sign-in dialog the focus back on the on-screen keyboard. */
  padPress(b: Button): void {
    this.S.input = 'pad';
    if (this.S.overlay === 'signin') this.S.si.typing = false;
    if (this.S.overlay === 'search') this.S.q.typing = false;
    if (this.S.overlay === 'field') this.S.fd.typing = false;
    this.press(b);
  }

  pressSignIn(b: Button): void {
    const S = this.S;
    const si = S.si;
    if (si.busy) return;
    if (b === 'circle') { S.overlay = null; this.render(); return; }
    if (b === 'l1') { if (this.remembers()) { si.remember = !si.remember; this.toggled(); } }   // PERSONA-PERSIST (a): Remember me
    else if (b === 'square') this.siDelete();
    else if (b === 'triangle') this.siType(' ');
    else if (b === 'l2') si.shift = !si.shift;
    else if (b === 'r2' || b === 'options') { this.siSubmit(); if (si.busy) return; }
    else if (si.zone === 'personas') {
      if (b === 'left') si.persona = Math.max(0, si.persona - 1);
      else if (b === 'right') si.persona = Math.min(this.another(), si.persona + 1);
      else if (b === 'down' || b === 'cross') {
        si.zone = 'keys'; si.kr = 0; si.kc = 0;
        si.target = si.persona >= this.another() && this.A.data !== 'sample' ? 'name' : 'password';
      }
    } else if (b === 'up' && si.kr === 0) si.zone = 'personas';
    else if (b === 'cross') { this.siKey(si.kr, si.kc); if (si.busy) return; }
    else oskStep(si, b);
    this.render();
  }

  /* ---------- the pointer: a click does the verb (the prototype's click handler) ---------- */

  /** A click on a `[data-act]` control. `d` is its dataset. Answers whether the event should stop propagating. */
  pointer(act: string, d: DOMStringMap, isAction = false): boolean {
    this.S.opt.flip = undefined;                                      // LR-13 (review F4): a flip's mark lasts one draw
    // CX-51: a tap plays the cue a press would. A legend prompt is a press (`press` plays its own cue).
    if (act === 'press') return this.pointerNow(act, d, isAction);
    const was = cueSnap(this.S);
    // CX-51 (the owner, 2026-10-21: "make mouse clicks trigger the same audio effects as controller on launcher as
    // well"): a tap that moves the focus is the pad's move and then its verb -- the move's cue (`press`) when the verb
    // said none of its own (a nested `press` or `toggled` sets `cued`). Not a move: the source dropdown opening or
    // closing (the pad's Square and Cross there are silent; another option picked is the move to it), the account's
    // jump to Profile (Triangle's, silent) and a room filter (L2 / R2's roller, silent: no tab sound, CX.R12).
    // The review's F1: in pointer mode the page's `mouseover` moved the focus before the click (`hover`, silent); the
    // click carries that move, while the focus is still where the hover left it (the re-review's L1: a page changed since
    // -- the browser's Back, an adapter's answer -- drops it). F2: a click on the Home item already focused moves
    // nothing, whatever its act does then (Cross on the focused Memory card jumps to Profile in silence on the pad); the
    // re-review's L2: only the item -- another tap that changes the focus (the current Settings tab from a row below it
    // puts the focus on its first row) is a move.
    const before = this.focusKey(false);
    const hovered = this.hoverFrom !== null && this.hoverFrom !== before && this.hoverTo === before;
    this.hoverFrom = null;
    const onItem = act === 'item' && this.S.screen === 'home' && (this.S.item[this.S.cat] ?? 0) === Number(d.i);
    const srcRow = this.S.src.open ? this.S.src.row : -1;
    this.cued = false;
    const done = this.pointerNow(act, d, isAction);
    // The batch review's F2: `done` says whether to stop the event, not whether the tap acted; the cue follows the state.
    this.cueAfter(was, 'cross');
    const moved = hovered || (this.focusKey(false) !== before && !onItem)
      || (act === 'srcopt' && srcRow >= 0 && Number(d.i) !== srcRow);
    if (!this.cued && moved && !was.overlay && !this.S.overlay && act !== 'account' && act !== 'filter') {
      this.A.cue?.selection();
      this.cued = true;
    }
    return done;
  }

  /** CX-51 (the review's F1): the focus before the first silent hover move since the last press or tap; null for none. */
  private hoverFrom: string | null = null;

  /** CX-51 (the re-review's L1): where the last silent hover move left the focus; a tap carries the move only from there. */
  private hoverTo: string | null = null;

  private pointerNow(act: string, d: DOMStringMap, isAction = false): boolean {
    const S = this.S;
    const A = this.A;
    const i = Number(d.i);
    // CX-15: under the viewer only the legend's prompts are read (its own controls are its own).
    if (S.overlay === 'viewer' && act !== 'press') return false;
    // DX-3: under the extraction's popover, its own buttons (`extract`, by row) and the prompts; nothing behind it.
    if (S.overlay === 'extract') {
      if (act === 'extract' && S.extract) { S.extract = { ...S.extract, row: i === 1 ? 1 : 0 }; this.press('cross'); }
      else if (act === 'press') this.press(d.b as Button);
      return false;
    }
    // RB-45 (b): the Install dialog's Copy button is a Cross press whose click `onInstallClick` (`./input`, in capture)
    // has already copied; the press would copy a second time.
    if (S.overlay === 'install' && act === 'press' && d.pwaCopy !== undefined) { this.render(); return false; }
    // DSH-5: under the sender's dialog, its buttons (`sharesend`, by index) and the prompts; nothing behind it.
    if (S.overlay === 'share') {
      if (act === 'sharesend') { S.snd.row = i; this.shareSendAct(i, true); this.render(); }
      else if (act === 'press') this.press(d.b as Button);
      return false;
    }
    // LR-12: under the Signed out screen, its one target (a click is Cross) and the prompts; nothing behind it.
    if (S.overlay === 'signedout') {
      if (act === 'signedout') this.press('cross');
      else if (act === 'press') this.press(d.b as Button);
      return false;
    }
    if (act === 'states') { if (A.states) S.overlay = S.overlay === 'states' ? null : 'states'; }
    else if (act === 'account') { if (S.overlay) return false; this.account(); }
    else if (act === 'cat') S.cat = i;
    else if (act === 'accountmenu') { this.toggleAccountMenu(); return false; }
    else if (act === 'profileitem') { if (S.overlay) return false; S.accountOpen = false; this.doAct(homeItems('profile', S, A)[i]?.act); }
    else if (act === 'loside') { S.lo.row = i; this.doAct(loadoutSideItems(A)[i]?.act); }
    else if (act === 'item') {
      // LR-13: a click on the Theme item opens and closes its drop-up; on another item it closes.
      const same = S.item[S.cat] === i;
      S.item[S.cat] = i; S.src.open = false;
      S.chk.open = false;                                             // LR-36: a Home item clicked behind the panel shuts it (Play opens it again)
      const it = homeItems(CATS[S.cat]!.id, S, A)[i];
      if (S.thm.open && !(same && it?.act === 'themes')) S.thm.open = false;
      this.doAct(it?.act);
    }
    else if (act === 'themeopt') { if (S.screen !== 'home' || S.overlay || !S.thm.open) return false; S.thm.row = i; this.pickTheme(i); }   // LR-13
    // LR-36: a row of Play's launch check -- its click focuses it and is its Cross (the disc's chooser in the click's own event).
    // Setup onboarding (ZjCZXTTW): a source on the launch check's Disc row -- the row focused, then the source menu's option.
    else if (act === 'chksrc') { if (S.screen !== 'home' || S.overlay || !S.chk.open || S.chk.share || !(i >= 0 && i < DISC_SOURCES.length)) return false; S.chk.row = LAUNCH_DISC_ROW; this.pickSource(i); }
    else if (act === 'chkrow') { if (S.screen !== 'home' || S.overlay || !S.chk.open || S.chk.share || !(i >= 0 && i < launchCheckRows(A))) return false; S.chk.row = i; this.checkAct(i, true); }
    // DSH-5: the share area's Try again (its failed phase).
    else if (act === 'sharerx') { const ph = A.discShare?.receiver().phase; if (S.screen !== 'home' || S.overlay || !S.chk.share || (ph !== 'failed' && ph !== 'declined')) return false; A.discShare!.request(); }
    // LATER 291: the phone row is an anchor. Move the focus and let the click follow the href — do not also open it.
    else if (act === 'discord') {
      if (S.screen !== 'home' || S.overlay) return false;
      S.item[S.cat] = i;
      S.src.open = false;
      return false;
    }
    else if (act === 'filter') { S.rooms.filter = i; S.rooms.row = 0; }
    else if (act === 'roomkind') { if (S.screen !== 'rooms' || S.overlay) return false; this.roomKind(i); }   // LR-37 (9)
    else if (act === 'replay') { S.rp.row = i; this.press('cross'); return false; }
    else if (act === 'replay-status') { if (S.screen === 'replays' && !S.overlay) this.press('cross'); return false; }
    else if (act === 'replays-more') { if (S.screen === 'replays' && !S.overlay) this.replaysMore(); }
    else if (act === 'search') this.openSearch();
    else if (act === 'qkey') { S.q.kr = Number(d.r); S.q.kc = Number(d.c); this.qKey(S.q.kr, S.q.kc); }
    else if (act === 'room') { S.rooms.row = i; this.roomPick(); }
    else if (act === 'optcat') {
      const cats = optCategories(S, A);
      const at = d.cat ? cats.findIndex((c) => c.id === d.cat) : i;
      if (at >= 0) { S.opt.cat = at; S.opt.row = 0; S.opt.zone = 'rows'; }
    }
    else if (act === 'optrow') { S.opt.zone = 'rows'; S.opt.row = i; if (isAction) this.optAction(); }
    else if (act === 'optstep') { S.opt.zone = 'rows'; S.opt.row = i; this.optStep(Number(d.d)); this.render(); return true; }
    else if (act === 'remaprow') {
      // CX-14: a row's click focuses it and does its Cross; not while a binding is listened for (the legend's Circle
      // prompt cancels then) or with a dialog over it.
      if (S.screen !== 'remap' || S.overlay || this.remapListening()) return false;
      S.rm.row = i;
      this.remapAct();
    }
    else if (act === 'remapstep') {
      if (S.screen !== 'remap' || S.overlay || this.remapListening()) return false;
      S.rm.row = i; this.remapStep(Number(d.d)); this.render(); return true;
    }
    else if (act === 'remappad') {
      // LATER 380: a button clicked on the drawing focuses the row it drives (the action's, then a bind's).
      const m = this.binding();
      if (!m || S.overlay || this.remapListening() || m.teachState()) return false;
      const row = rowOfPhysical(m, Number(d.p));
      if (row < 0) return false;
      S.rm.row = row; this.render(); return true;
    }
    else if (act === 'teachstart' || act === 'teachskip' || act === 'teachcancel') {
      const m = this.binding();
      if (!m || S.overlay) return false;
      if (act === 'teachstart') { this.S.rm.teachDeclined = false; m.teach(); } else if (act === 'teachskip') m.skipStep(); else m.cancel();
      this.render(); return true;
    }
    // CX-LOADOUTS (CX.R6: touch and mouse are release inputs too): a list row's click is its Cross; an editor row's click
    // focuses it (Save's saves); a roller's step mark steps it.
    else if (act === 'lorow') { if (S.screen !== 'loadouts' || S.overlay) return false; S.lo.row = i; this.press('cross'); return false; }
    else if (act === 'loedit') {
      if (S.screen !== 'loadout' || S.overlay) return false;
      S.lo.edit = i;
      if (i === LOADOUT_SAVE_ROW) { this.press('cross'); return false; }
    }
    else if (act === 'lostep') {
      if (S.screen !== 'loadout' || S.overlay) return false;
      S.lo.edit = i; this.A.loadouts?.step(i, Number(d.d) < 0 ? -1 : 1); this.render(); return true;
    }
    // CX-PERSONA (CX.R6): a list row's click is its Cross; an editor row's too (the gender's step marks step it); a record
    // line's focuses it; the field's keys are its keyboard's.
    else if (act === 'pfrow') { if (S.screen !== 'persona' || S.overlay) return false; S.pf.row = i; this.press('cross'); return false; }
    else if (act === 'pfedit') { if (S.screen !== 'personaEdit' || S.overlay) return false; S.pf.edit = i; this.press('cross'); return false; }
    else if (act === 'pfstep') { if (S.screen !== 'personaEdit' || S.overlay) return false; S.pf.edit = i; this.press(Number(d.d) < 0 ? 'left' : 'right'); return true; }
    else if (act === 'pfnew') { if (S.screen !== 'personaNew' || S.overlay) return false; S.pf.nw.row = i; this.press('cross'); return false; }
    else if (act === 'pfnewstep') { if (S.screen !== 'personaNew' || S.overlay) return false; S.pf.nw.row = i; this.press(Number(d.d) < 0 ? 'left' : 'right'); return true; }
    else if (act === 'pfrec') { if (S.screen !== 'record' || S.overlay) return false; S.pf.rec = i; }
    // CX-LOBBIES (CX.R6): a room's or Custom matches' row's click is its Cross; a game's lines are read only (a click focuses).
    else if (act === 'lbrow') { if (S.screen !== 'room' || S.overlay) return false; S.lb.row = i; this.press('cross'); return false; }
    else if (act === 'lbgame') { if (S.screen !== 'game' || S.overlay) return false; S.lb.grow = i; }
    else if (act === 'lbcustom') { if (S.screen !== 'custom' || S.overlay) return false; S.lb.crow = i; this.press('cross'); return false; }
    else if (act === 'svrow') { if (S.screen !== 'server' || S.overlay) return false; S.sv.row = i; this.press('cross'); return false; }
    // B206 ML-2 (CX.R6): a MODS row's click is its Cross; the selector's step marks step it; a pack's Remove removes it.
    else if (act === 'mdrow') { if (S.screen !== 'mods' || S.overlay) return false; S.md.row = i; this.press('cross'); return false; }
    else if (act === 'mdstep') { if (S.screen !== 'mods' || S.overlay) return false; S.md.row = i; this.press(Number(d.d) < 0 ? 'left' : 'right'); return true; }
    else if (act === 'mdremove') { if (S.screen !== 'mods' || S.overlay) return false; S.md.row = i; this.press('square'); return false; }
    else if (act === 'fkey') { if (S.overlay !== 'field') return false; S.fd.kr = Number(d.r); S.fd.kc = Number(d.c); this.fKey(S.fd.kr, S.fd.kc); }
    else if (act === 'press') {
      // LATER 380 (#491's re-read, 1): during the pass Circle is Skip, so the screen's Back and the overlay's close are
      // Not now there.
      const pass = S.screen === 'remap' && d.b === 'circle' ? this.binding() : null;
      if (pass?.teachState()) { pass.cancel(); this.render(); return false; }
      // Header Back is Circle, except on a Settings tab: Circle there only focuses the tabs, and the button
      // should leave the page in one click.
      if (d.fk === 'back' && S.screen === 'options' && S.opt.zone === 'rows' && !S.opt.panel) S.opt.zone = 'cats';   // LR-13: a panel's Back is its Circle
      this.press(d.b as Button);
      return false;
    }
    else if (act === 'disc') { this.chooseDisc(); return false; }
    else if (act === 'srcbtn') {
      if (S.screen !== 'home' || S.overlay) return false;
      // LR-23: on the launcher page the cog sits beside the legend's disc chip (the focus stays where it is). LR-39
      // (LR.R32): the overlay's list has no Disc item any more, and over a game the Disc step has no source.
      if (!deployChecks(S, A)[0]?.source) return false;
      this.toggleSource();
    }
    else if (act === 'discmark') {
      // LR-24 (LR.R23 (b)): the page's Home's disc mark is the disc's one control -- the source's menu where there is a
      // source to switch (the cog's act, CX-16), else the chooser (the chip's act). LR-39 (LR.R32): the overlay's Home
      // draws it too; over a game the Disc step has no source and its chooser is locked, so the press says the lock's line.
      // LR-46: Settings draws the marks too; its disc mark is the chooser, as the chip it replaced was (no source menu there).
      if (S.screen === 'options' && !S.overlay) { this.chooseDisc(); return false; }
      if (S.screen !== 'home' || S.overlay) return false;
      if (deployChecks(S, A)[0]?.source) this.toggleSource();
      else { this.chooseDisc(); return false; }
    }
    else if (act === 'markpad' || act === 'markmic') {
      // LR-25 (LR.R23 (e)): Home only -- since LR-39 (LR.R32) the overlay's Home too, which draws the page's marks; since
      // LR-46 Settings too, which draws them (the controller's mark its Controller tab, the microphone's its voice row).
      if ((S.screen !== 'home' && S.screen !== 'options') || S.overlay) return false;
      S.src.open = false;
      if (act === 'markpad') this.openSettings('controller');
      else this.openSettings('communication', ['mic-on', 'voice']);
    }
    else if (act === 'srcopt') this.pickSource(i);
    else if (act === 'start') { this.start(); return false; }
    else if (act === 'persona') { S.si.persona = Math.max(0, Math.min(this.another(), i)); S.si.zone = 'personas'; S.si.target = S.si.persona >= this.another() && A.data !== 'sample' ? 'name' : 'password'; }
    else if (act === 'agree') { S.ag.row = i; this.press('cross'); return false; }
    else if (act === 'remember') { if (S.overlay === 'signin' && !S.si.busy && this.remembers()) { S.si.remember = !S.si.remember; this.toggled(); } }   // OT.R61
    else if (act === 'key') { S.si.zone = 'keys'; S.si.kr = Number(d.r); S.si.kc = Number(d.c); this.siKey(S.si.kr, S.si.kc); if (S.si.busy) return false; }
    else if (act === 'stateflip') { S.states.row = i; this.flipState(i); return false; }
    else if (act === 'confirm') { S.confirmRow = i; this.press('cross'); return false; }
    this.render();
    return false;
  }

  /** In pointer mode, hover moves focus to the item, room or option row under the pointer. */
  hover(act: string, i: number): void {
    const S = this.S;
    if (S.input !== 'pointer') return;
    // CX-51 (the review's F1): silent, as the owner asked for clicks; the focus it left is kept for the click (`pointer`).
    const before = this.focusKey(false);
    this.hoverNow(act, i);
    const after = this.focusKey(false);
    if (after === before) return;
    if (this.hoverFrom === null) this.hoverFrom = before;
    this.hoverTo = after;
  }

  private hoverNow(act: string, i: number): void {
    const S = this.S;
    if (S.accountOpen) return;
    if (act === 'item' && S.item[S.cat] !== i) { S.item[S.cat] = i; this.render(); }
    else if (act === 'discord' && S.screen === 'home' && !S.overlay && S.item[S.cat] !== i) { S.item[S.cat] = i; S.src.open = false; this.render(); }
    else if (act === 'room' && S.rooms.row !== i) { S.rooms.row = i; this.render(); }
    else if (act === 'optrow' && (S.opt.row !== i || S.opt.zone !== 'rows')) { S.opt.row = i; S.opt.zone = 'rows'; this.render(); }
    else if (act === 'remaprow' && S.screen === 'remap' && S.rm.row !== i && !this.remapListening()) { S.rm.row = i; this.render(); }
    else if (act === 'loside' && S.screen === 'loadoutSides' && S.lo.row !== i) { S.lo.row = i; this.render(); }
    else if (act === 'lorow' && S.screen === 'loadouts' && S.lo.row !== i) { S.lo.row = i; this.render(); }
    else if (act === 'loedit' && S.screen === 'loadout' && S.lo.edit !== i) { S.lo.edit = i; this.render(); }
    else if (act === 'pfrow' && S.screen === 'persona' && S.pf.row !== i) { S.pf.row = i; this.render(); }       // CX-PERSONA
    else if (act === 'pfedit' && S.screen === 'personaEdit' && S.pf.edit !== i) { S.pf.edit = i; this.render(); }
    else if (act === 'pfnew' && S.screen === 'personaNew' && S.pf.nw.row !== i) { S.pf.nw.row = i; this.render(); }
    else if (act === 'pfrec' && S.screen === 'record' && S.pf.rec !== i) { S.pf.rec = i; this.render(); }
    else if (act === 'lbrow' && S.screen === 'room' && S.lb.row !== i) { S.lb.row = i; this.render(); }           // CX-LOBBIES
    else if (act === 'lbgame' && S.screen === 'game' && S.lb.grow !== i) { S.lb.grow = i; this.render(); }
    else if (act === 'lbcustom' && S.screen === 'custom' && S.lb.crow !== i) { S.lb.crow = i; this.render(); }
    else if (act === 'svrow' && S.screen === 'server' && S.sv.row !== i) { S.sv.row = i; this.render(); }
    else if (act === 'mdrow' && S.screen === 'mods' && S.md.row !== i) { S.md.row = i; this.render(); }   // B206 ML-2
  }

  /** The current home item (for the legend). */
  homeItem() { return homeItems(CATS[this.S.cat]!.id, this.S, this.A)[this.S.item[this.S.cat] ?? 0]; }

  /** The selected room while signed in, or null. */
  target() { return selectedRoom(this.S, this.A); }
}
