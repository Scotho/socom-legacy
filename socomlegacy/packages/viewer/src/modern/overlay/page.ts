import type { GameAccount } from './session';
import type { UiSoundCues } from '@s2u/ui';
import { FORGE_MATCHING_CLASS, forgeMatchSounds } from '../../forge/matchState';
import { readDisc } from '../discStore';
import { startSource } from '../../source';

/**
 * MU2-10 (MU2.R4 of `docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`): the page kinds the overlay is told of,
 * and what it reads of each. "The home page" is the console launcher at `/` and `/console` (CX.R8): the overlay never
 * mounts there. Every other page the entry boots (`../../pageEntry` `bootPage`, its one seam) is "the active page" and
 * takes it: the front end (`front-end`: over the served tree, or a menu flow's deep route the development console hands
 * on), the disc page and the front end it mounts once the image opens (`disc`), the test room (`viewer`), a
 * development build's launch settings sheet (`launch-settings`), and since MU2-17 the forge (`forge`, `/forge`; MU2.R9,
 * the owner 2026-10-14: "overlay over forge can exist", lifting MU2.R7). The project pages (news, roadmap, journey,
 * archive, server) are separate HTML entries (`src/projectSite/index.ts`) that never pass the entry: not mounted (row
 * MU2-10b).
 * A browser adaptation (`MODERN_OVERLAY_ADAPTATION`): the page's wiring, nothing of the game.
 */
export type OverlayPageKind = 'console' | 'front-end' | 'disc' | 'viewer' | 'launch-settings' | 'forge';

/** Every kind, the console first, the forge last (the tests' table). */
export const OVERLAY_PAGE_KINDS: readonly OverlayPageKind[] = ['console', 'front-end', 'disc', 'viewer', 'launch-settings', 'forge'];

/**
 * The front end's mount as the overlay reads it (`../../frontEnd` `FrontEndMount`, by its shape: the modern UI imports
 * nothing of the front end's module, `test/modern/launchGate.test.ts`): its session, once made.
 */
export interface FrontEndMountReads { session: Promise<unknown> }

/** What the seam hands the overlay: the page's kind and, on the front end's pages, its mount (or the disc page's promise of it). */
export interface OverlayPage {
  kind: OverlayPageKind;
  frontEnd?: FrontEndMountReads | Promise<FrontEndMountReads | null> | null;
}

/**
 * Whether the overlay mounts on a page of `kind`: every page but the console (the home page, MU2.R4), in every build.
 *
 * **The forge (MU2-17; MU2.R9 lifts MU2.R7).** `/forge` (FG.R9 / OT.R52) is a sandbox the pad drives; the overlay mounts
 * over it as over the others, read for conflicts first (the plan's Log, MU2-17): every pad read of the forge's --
 * its edge map (`../../forge/pad` `ForgePad`, buttons 0-15 only, never 16) and, on the forge lane, its lobby popup (fed
 * the same snapshot by the same page loop; FG.R22: the popup never reads or claims 16) -- goes through
 * `navigator.getGamepads()`, the read the overlay shadows while open (`./index`), so the forge sees its pad untouched
 * while the overlay is open and a button held through the close released until it is let go. Its layers (the docks,
 * the START menu, the match host, the popup's window) sit far below the overlay's frame (`./overlay.css`).
 * **The forge is not paused under it**, by choice and by necessity: the forge exposes no pause (`mountForge` answers
 * nothing to hold), and a sandbox under the overlay has nothing to lose by running on -- a pad read untouched moves
 * nothing, the camera and the selection stay where they are -- while a forge match or a forge lobby's match must keep
 * its clock and its network as any round does under the overlay (MU2.R3).
 */
export function overlayEnabled(kind: OverlayPageKind): boolean {
  return kind !== 'console';
}

/**
 * HD-4 review F2 (OT.R79, HD.R8; a browser adaptation): the pages whose match follows the page's picture (`../../picture`
 * `pagePicture`) -- the console (Home; its START mounts the front end), the front end and the disc page that mounts it --
 * so only there Options > Display offers its "Video" row. RB-16 (PS-4, OT.R114): and the test room, whose look follows
 * the same picture (`../../main`'s `ui.onLook(..., pagePicture())`). The forge and the launch settings draw their own
 * look; a row there would say a match follows it when none does.
 */
export function videoPictureFollows(kind: OverlayPageKind): boolean {
  return kind === 'console' || kind === 'front-end' || kind === 'disc' || kind === 'viewer';
}

/**
 * MU2-17: the forge's own mark of its match on the body, read (never written) as the forge's round: added by the forge
 * when its Play match starts and removed when it ends (`../../forge/page` `startMatch` / `endMatch`, the class its own
 * stylesheet draws the match by). The forge's walk (`is-playing`, no match) and its building are no round.
 * The forge's own export (`../../forge/matchState` `FORGE_MATCHING_CLASS`, a module with no other imports), taken at the
 * forge lane's checkpoint 2 landing (the merge controller's resolution: the overlay had copied the literal while the
 * export was on the forge lane only; `test/pageOverlaySeam.test.ts` holds the two equal).
 */
export const FORGE_MATCH_CLASS: string = FORGE_MATCHING_CLASS;

/**
 * The front end's session as the overlay reads it: its LOGIN's lobby client, its match's phase and (OT.R60 (e)) its menus'
 * cues, the game's audio path for UI sounds (`../../frontEnd` `FrontEndSession.sounds`, null when the front end is silent).
 */
interface FrontEndReads { lobby: GameAccount | null; match: { phase: string }; sounds?: UiSoundCues | null }

/**
 * The test room's page hook as the overlay reads it (`../../hook` `ViewerHook.net`, by its shape: `window.__viewer`,
 * assigned by `../../main` in every build): the room the page plays in -- the loopback's in reCOM mode offline
 * (`../../net/loopback` `LoopbackMatch`), or a joined one -- or null; `waiting` while no round has started in it.
 */
interface TestRoomReads { __viewer?: { net?(): { waiting: boolean } | null } }

/** What the overlay reads of a page (`overlayPageReads`). */
export interface OverlayPageReads {
  /** The game's own account on the page: the front end's lobby client once its session is made; null without one. */
  game(): GameAccount | null;
  /** Whether a round runs under the overlay (MU2-7's review F1: Replays' Watch and the loadout editor's disc read gated off). */
  roundRunning(): boolean;
  /**
   * Whether the overlay's own session ends at the page's START boundary (`../launchGate`, MU-F2a): the disc page's. On
   * every page whose game has a lobby (the front end's and the disc page's, through `game`) it also ends at the game's
   * `LobbyConnect`, the LOGIN's beginning (`./session`, MU2-10's review F1).
   */
  startBoundary: boolean;
  /**
   * MU2-12 (MU2.R6, "the served tree"): whether the page reads the game's files from the served tree -- under a
   * development build's `?devmode` (`../../source` `startSource`, the page's own reader of its address: the front end the
   * entry booted, the test room, the launch settings sheet, the forge; batch B's review F2), where no disc is published to
   * the store. The address read once, at the mount
   * (the one the page booted from), and only while the store holds no disc: the console's START hands the front end an
   * image (the store `in-game`), whatever its address says.
   */
  servedTree(): boolean;
  /**
   * CX-25's review F2: whether the game itself runs under the overlay -- its front end, once its session is made (the
   * front end's page, and the disc page after its image opened and the front end mounted) -- whose menus hold ONLINE,
   * where an account is made. Every other kind (the forge, the test room, the launch sheet, the disc page before START)
   * runs none, though each is a game page for the locks (`../../console/state` `ConsolePageReads.gamePage`).
   */
  frontEndRuns(): boolean;
  /**
   * OT.R60 (e): the menus' cues of the page's game audio -- the front end's (its `UiSoundCues` over the disc's
   * `uisounds.rdr` and HUDUI bank, played through the page's `GameAudio`) -- or null: no front end, or one with no disc
   * audio loaded (the open and the close silent then). F7 (a): on the forge, while its match runs (`FORGE_MATCH_CLASS`),
   * the match's own (`../../forge/matchState` `forgeMatchSounds`: the same files over an audio on the match's output,
   * `../../forge/match` `forgeMatchCues`); the forge's editor and walk load none, so none. The test room stays silent, a
   * named gap: an instrument whose audio is behind `../../main`, which hands the overlay nothing to play by.
   */
  sounds(): UiSoundCues | null;
}

/**
 * The reads of `page`.
 * - **The game's account** (MU2-9's finding (a): one truth, the game's own signed-in persona): on the front end's pages,
 *   `FrontEndSession.lobby` (`../../frontEnd`: "the session's lobby -- its state, and the login's ticket (`lobby.ticket()`:
 *   the seam for the screens after the login)"), the `@s2u/ui` `LobbyClient` the original's LOGIN drives -- read, never
 *   driven. The test room and the launch settings sheet run no account session (`../../main` makes no login), so none.
 * - **A round** on the front end's pages: its match (`FrontEndSession.match`, `../../lobbyMatch` `LobbyMatch.phase`)
 *   loading or playing. On the test room (the controller's answer, MU2-10's fold): while its room's round runs -- the
 *   page's hook (`win.__viewer.net()`, `TestRoomReads`) answers a room and it is not `waiting` (`../../netPage`
 *   `waitingRoom`) -- for the same reason: the round keeps the disc readers. Exploring (no room) or a room waiting for
 *   its round, no gate. The sheet runs none. On the forge (MU2-17): while its match plays (`FORGE_MATCH_CLASS` on the
 *   page's body), for the same reason; the forge runs no account session, so no game account.
 */
export function overlayPageReads(page: OverlayPage, win: Window | null = null): OverlayPageReads {
  let fe: FrontEndReads | null = null;
  const frontEnd = page.kind === 'front-end' || page.kind === 'disc' ? page.frontEnd ?? null : null;
  if (frontEnd) {
    void Promise.resolve(frontEnd)
      .then((m) => m?.session ?? null)
      .then((s) => { fe = (s as unknown as FrontEndReads | null) ?? null; })
      .catch(() => { fe = null; });
  }
  const noDisc = (): boolean => { try { return !win?.document || readDisc(win.document).state === 'empty'; } catch { return true; } };
  let served = false;
  // Batch B's review F2 (the seat's frames F-B): every page that reads the served tree, whatever its kind -- the front end,
  // the test room and the launch settings sheet (`../../main`'s `startSource(SEARCH, MAPS)`), the forge -- not the front
  // end's alone. The disc page never does: the entry boots the front end in its place under `?devmode`.
  try { served = !!win?.location && startSource(win.location.search, '') !== null && noDisc(); } catch { served = false; }
  /** The forge's match running (MU2-17): its body's class, read. */
  const forgeMatching = (): boolean => { try { return win?.document?.body?.classList.contains(FORGE_MATCH_CLASS) ?? false; } catch { return false; } };
  return {
    servedTree: () => served && noDisc(),
    frontEndRuns: () => fe !== null,
    game: () => fe?.lobby ?? null,
    sounds: () => (page.kind === 'forge' ? (forgeMatching() ? forgeMatchSounds() : null) : fe?.sounds ?? null),
    roundRunning: () => {
      if (page.kind === 'forge') return forgeMatching();
      if (page.kind === 'viewer') {
        let room: { waiting: boolean } | null = null;
        try { room = (win as (Window & TestRoomReads) | null)?.__viewer?.net?.() ?? null; } catch { room = null; }
        return room !== null && !room.waiting;
      }
      return fe !== null && (fe.match.phase === 'loading' || fe.match.phase === 'match');
    },
    startBoundary: page.kind === 'disc',
  };
}
