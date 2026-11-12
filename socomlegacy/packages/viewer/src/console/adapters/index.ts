import { HttpAssetSource } from '@s2u/archive';
import { readGlobalValves } from '../../originalOptions';
import { connectedPads } from '../../controllerInput';
import { pageSession, type ModernSession } from '../../modern/session';
import type { LauncherState } from '../../modern/launcherState';
import type { PadSource } from '../../gamepad';
import { sampleAdapters } from '../sampleAdapters';
import type { Adapters } from '../state';
import { overlayDisc } from './overlayDisc';
import { touchDevice } from '../../touch';
import { liveCard } from './card';
import { liveControls } from './controls';
import { liveDisc } from './disc';
import { liveInvite } from './invite';
import { liveLaunch } from './launch';
import { liveLoadouts } from './loadouts';
import { launcherState } from '../../modern/launcherState';
import { liveMic } from './mic';
import { liveOptions, type OverlayButtonBinding } from './options';
import { livePad } from './pad';
import { liveProfile } from './profile';
import { noteServerDetail } from '../../modern/report/serverDetail';
import { liveRemap } from './remap';
import { liveReplays } from './replays';
import { liveCustomMatches } from './lobbies';
import { lobbyBase, liveRooms } from './rooms';
import { liveServer } from './server';
import { liveMods } from './mods';
import { liveSession } from './session';
import { liveUiSounds } from './sounds';
import { cardProfileEdits } from '../../modern/profile/cardEdits';
import { fetchUniverseService, universeServiceBase } from '../../universeHost';
import { buildMultiplayerEnabled } from '../../multiplayer';
import { readUniverseHost } from '../universe';
import { liveDiscShare } from '../../discShare';
import { readShareHostToken } from '../../discShareView';
import { discShareSignal } from '../../discShareSignal';
import { accountServiceBase } from '../../connectHost';

/**
 * The console launcher's adapters (slice 2): what the server and the emulator report, through the page's own readers
 * (`./disc`, `./pad`, `./mic`, `./card`, `./session`, `./rooms`, `./server`, `./replays`, `./options`), over the page's
 * one modern session (`pageSession`) and one rooms poll; a change any of them hears re-draws the page (`onChange`). The
 * prototype's sample adapters (`../sampleAdapters`, `SAMPLE_DATA`) run only under `?sample`, for screenshots. A browser
 * adaptation with no original (OT.R28).
 */
export function liveAdapters(doc: Document, win: Window): Adapters & { dispose(): void } {
  const subs = new Set<() => void>();
  const notify = (): void => { for (const cb of [...subs]) cb(); };
  const session = pageSession(win);
  // DX-3: the disc's read set kept in this browser (FI.R6): extracted at a pick, START from storage once it is whole.
  const disc = liveDisc(doc, notify, { extraction: {} });
  const pad = livePad(notify);
  const mic = liveMic(notify);
  const card = liveCard();
  // PERSONA-PERSIST (a) (OT.R61): the launcher's card files SAVE PASSWORD; this server is the universe the page reads.
  const signIn = liveSession(notify, {
    session, card: cardProfileEdits(),
    here: () => (buildMultiplayerEnabled() ? readUniverseHost(fetchUniverseService(universeServiceBase(win.location.search, win.location))) : Promise.resolve(null)),
  });
  // CX-LOBBIES: the lists' failure detail for the Report, as the retired section noted it.
  const rooms = liveRooms(doc, notify, { session, noteDetail: (d) => { noteServerDetail(doc, 'lobby', d); } });
  const server = liveServer(notify, { rooms, session });
  // CX-LOBBIES (FG-46): Custom matches at the rooms' own base; JOIN takes this page's window to the forge.
  const custom = liveCustomMatches(doc, notify, { base: lobbyBase(win), page: win, missions: () => rooms.missions() });
  // CX-15: Watch opens the viewer over this page; its lock's words read the disc.
  const replays = liveReplays(notify, { session, doc, disc: () => disc.state() });
  const options = liveOptions(notify, { pad, signedIn: () => session.state() === 'signed-in', kept: { info: () => disc.kept(), forget: () => disc.forgetKept() }, share: true });
  // CX-LOADOUTS: the Armory's loadouts, over the page's session and the disc this page opened (the disc store's readers).
  const loadouts = liveLoadouts(notify, { session, launcher: launcherState(doc), win });
  // CX-PERSONA: the Profile's Persona and Service record over the page's session, card and settings.
  const profile = liveProfile(notify, profileDeps(doc, win, session, launcherState(doc), card));
  // CX-14: the button mapping screen's binding machine (Options > Controller > Button mapping), its changes read by the pad.
  const remap = liveRemap(win, pad);
  // START's hand-over (slice 3): the console awaits the session's sign-out itself and ends it after the mount
  // (`./launch`); it is not registered at the START boundary, whose `end()` cannot be undone if the mount then fails.
  const launch = liveLaunch(doc, { session, ...(disc.start ? { start: disc.start } : {}) });
  // INVITE-START (FI.R8): an invite address's auto-START, and the invite channel answered while the session holds a sign-in.
  // LOBBY-LINK-DIRECT: a lobby link's auto-START waits for the load's quick sign-in, and its START decides the direct path.
  const invite = liveInvite(win, { session, disc, notify, quickPending: () => signIn.quickPending() });
  // Only a START press marks the keyboard or the mouse for START (`../input`: the START keys, a click on START; the
  // merge controller's call on #400, 2026-10-20), so an invite address's auto-START waits for one, or for a pad.
  const controls = liveControls(pad, { touch: touchDevice });   // LR-31: Play needs a pad or a touch screen; a key or a click seen no longer counts
  // Another writer (the setup page in another tab) may have saved the card: it is read again when the page has focus.
  const onFocus = (): void => { card.reload(); notify(); };
  win.addEventListener('focus', onFocus);
  // CX-51 (CX.R19): the launcher page's UI sounds; the overlay's adapters take none (never over a game page).
  const sounds = liveUiSounds(win, doc);
  // DSH-4 (DSH.R11, DSH.R12): the disc share's screens over the real transfer -- pairing at central's /api/discshare/* (the
  // account requests' base: this page's origin in a release, DSH.R10), the files sent to the device that made the code
  // once the sender says Yes beside it (DSH.R16: between players too), on one network or across networks, directly or
  // through Cloudflare's relay (DSH.R15). "Has the disc in" is a complete extraction kept in this browser (DSH.R7); a copy
  // received whole is taken by the disc as a finished extraction is. Its changes re-draw the page.
  const hostToken = readShareHostToken(win.location.search);
  const discShare = liveDiscShare({
    search: win.location.search, origin: win.location.origin,
    signal: discShareSignal(accountServiceBase(win.location.search, win.location, (import.meta.env as Record<string, unknown> | undefined)?.['DEV'] === true)),
    complete: () => disc.kept()?.whole === true,
    onReceived: () => { void disc.adoptKept(); },
    // RB-26: a host's link (`?discshare-host=<token>`) opened this page: its request is made against that host.
    ...(hostToken !== null ? { hostToken } : {}),
  });
  const shareOff = discShare.onChange(notify);
  // B206 ML-2: the MODS screen, through the one pack registry (loaded at the screen's first open).
  const mods = liveMods(doc, notify);
  return {
    data: 'live', disc, pad, mic, card, session: signIn, rooms, server, replays, options, launch, controls, invite, remap, loadouts, profile, custom, discShare, mods,
    cue: sounds.cue,
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    dispose(): void {
      win.removeEventListener('focus', onFocus);
      shareOff();
      discShare.dispose();
      for (const d of [disc, signIn, rooms, server, replays, options, loadouts, profile, custom, sounds, mods]) d.dispose();
      remap.close();
    },
  };
}

/** What the overlay hands its console's adapters (`../../modern/overlay` `mountOverlay`). */
export interface OverlayAdapterDeps {
  /** The overlay's session: `overlaySession` over the game's account, else the overlay's own `pageSession`. */
  session: ModernSession;
  /** The disc's state: the disc store's over the page (`launcherState`), followed (MU2-12). */
  state: LauncherState;
  /** The real pads, never the navigator the overlay shadows for the game while it is open (MU2.R3). */
  pads: PadSource;
  /** MU2-12: the page reads the served tree (no disc published); absent, never. */
  servedTree?: () => boolean;
  /** FB-1's Report, the Server screen's "Report a problem" row. */
  report?: NonNullable<Adapters['report']>;
  /** MU2-16: the overlay's opening button, for Options > Controller's "Overlay button" row. */
  overlayButton?: OverlayButtonBinding;
  /** HD-4 review F2: the page's match follows the page's picture (`../../modern/overlay/page` `videoPictureFollows`); absent, no. */
  videoPicture?: boolean;
}

/**
 * OVERLAY-CONSOLE (CX.R13, OT.R60): the console's adapters in the overlay over a game page, beside `liveAdapters` and of
 * its parts. `innerDoc` is the overlay's frame (the replay viewer opens over the console there); `pageWin` the game
 * page's window, whose address every request and the rooms' and server's bases are built from (`../../modern/pageWindow`
 * `adoptPageWindow`'s rule: never the frame's `about:blank`). The session is the overlay's (`deps.session`); the disc
 * the disc store's, read only and followed (`./overlayDisc`); the pad, the button mapping's machine and Options' pad
 * rows read the real pads (`deps.pads`); rooms, the server, replays, options, the button mapping and the microphone are
 * as live. No launch and no invite adapter: overlay mode has no START. A browser adaptation with no original (OT.R28).
 */
export function overlayAdapters(innerDoc: Document, pageWin: Window, deps: OverlayAdapterDeps): Adapters & { dispose(): void } {
  const subs = new Set<() => void>();
  const notify = (): void => { for (const cb of [...subs]) cb(); };
  const session = deps.session;
  const disc = overlayDisc(deps.state, notify, deps.servedTree);
  const pad = livePad(notify, { source: deps.pads });
  const mic = liveMic(notify);
  const card = liveCard();
  const signIn = liveSession(notify, { session });
  // CX-LOBBIES: the lists' failure detail for the frame's Report (FB-1), as the retired section noted it.
  const rooms = liveRooms(pageWin.document, notify, { session, launcher: deps.state, noteDetail: (d) => { noteServerDetail(innerDoc, 'lobby', d); } });
  const live = liveServer(notify, { rooms, session });
  // CX-LOBBIES (FG-46): Custom matches read from the game page's address (never the frame's); JOIN is locked over a game
  // page (`../grammar`), and where it is not, it takes the page's window to the forge, never the frame's.
  const custom = liveCustomMatches(pageWin.document, notify, { base: lobbyBase(pageWin), page: pageWin, missions: () => rooms.missions() });
  // OVERLAY-CONSOLE: the Report (FB-1) is the Server screen's last row (CX-28).
  const server: Adapters['server'] = deps.report
    ? { ...live, pages: () => [...live.pages(), { name: 'Report a problem', sub: 'Save a problem report file to send us (nothing is sent from here)', icon: 'alert', verb: 'Report', act: 'report' }] }
    : live;
  const replays = liveReplays(notify, { session, doc: innerDoc, disc: () => disc.state() });
  const padKeys = (): { key: string; name: string }[] => {
    try {
      return connectedPads(deps.pads).map((p) => ({ key: `${p.index}:${p.id}`, name: p.id }));
    } catch { return []; }
  };
  const options = liveOptions(notify, { pad, launcher: deps.state,
    ...(import.meta.env.DEV && deps.servedTree?.() ? { readDefaults: () => readGlobalValves(new HttpAssetSource(`${import.meta.env.BASE_URL}maps/`)) } : {}), pads: padKeys, signedIn: () => session.state() === 'signed-in', ...(deps.overlayButton ? { overlayButton: deps.overlayButton } : {}), videoPicture: deps.videoPicture ?? false });
  const frameWin = innerDoc.defaultView ?? pageWin;
  const remap = liveRemap(frameWin, pad, { pads: deps.pads, now: () => pageWin.performance.now() });
  const controls = liveControls(pad, { touch: touchDevice, keyboard: () => import.meta.env.DEV });
  // CX-LOADOUTS: the Armory's loadouts over the overlay's session and the disc store's state; requests from the game
  // page's address (never the frame's). Locked in a round through the console's page reads (`../grammar`).
  const loadouts = liveLoadouts(notify, { session, launcher: deps.state, win: pageWin });
  // CX-PERSONA: the Persona and Service record over the overlay's session -- the game's persona when it holds one, read
  // only -- the edits locked while it does or a round runs (`../grammar`); the Report's detail the frame's (its Report's).
  const profile = liveProfile(notify, profileDeps(innerDoc, pageWin, session, deps.state, card));
  // B206 ML-2 (ML.R9): MODS over a match too -- a change is heard by the game page through the registry's notice.
  const mods = liveMods(innerDoc, notify);
  return {
    data: 'live', disc, pad, mic, card, session: signIn, rooms, server, replays, options, controls, remap, loadouts, profile, custom, mods,
    ...(deps.report ? { report: deps.report } : {}),
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb); }; },
    dispose(): void {
      for (const d of [disc, signIn, rooms, live, replays, options, loadouts, profile, custom, mods]) d.dispose();
      remap.close();
      subs.clear();
    },
  };
}

/**
 * CX-PERSONA: what the profile adapter is handed: the session and disc state, requests from `pageWin`'s address, the card
 * adapter read again after each card write, the page's own `#mp-name` field kept in step with the match name (the
 * retired section's review 2: `main.ts`'s handler would write its stale text back), the universe's failure detail for
 * `reportDoc`'s Report.
 */
function profileDeps(reportDoc: Document, pageWin: Window, session: ModernSession, launcher: LauncherState, card: { reload(): void }): Parameters<typeof liveProfile>[1] {
  return {
    session, launcher, win: pageWin,
    onCardWrite: () => { card.reload(); },
    onMatchName: (name) => {
      const live = pageWin.document.getElementById('mp-name');
      if (live && 'value' in live) (live as { value: string }).value = name;
    },
    noteDetail: (d) => { noteServerDetail(reportDoc, 'universe', d); },
  };
}

/** The page's adapters for its address: the prototype's sample ones under `?sample`, else the live ones (`live()`). */
export function adaptersFor(search: string, live: () => Adapters): Adapters {
  return new URLSearchParams(search).has('sample') ? sampleAdapters() : live();
}
