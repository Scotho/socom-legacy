import { pageDeviceClass, type DeviceClass } from './deviceClass';
import { readGraphicsBackend } from './graphicsBackend';

/**
 * IP3 (card bbXnSJNH; the owner's word, 2026-11-02: "pre compiling in the lobby, yeah"): a browser adaptation with no
 * original (product track, OT.R53). While the player sits in a game's lobby -- its map known there -- the page prepares
 * the match (`./matchMount` `MatchLoader.prepare`: the decode, then the mount's own stage 1 -- the canvas, the renderer,
 * the world, the compile, its frames to the first-frame gate) so the hand-off's own load and prepare find it ready and the loading screen is short. The original has no such
 * step (its level load is the loading screen's); the shader compile it hides is a browser's cost the console never had.
 * It changes nothing the game does: the same world, the same renderer, the same frame, the same report point
 * (`LOAD_REPORT_AT_PREPARED_READING`). Guarded (`lobbyPrepareAllowed`): off under the Xbox preset until measured.
 */
export const LOBBY_PREPARE_ADAPTATION = 'the match prepared in the game lobby, before the launch (a browser adaptation)' as const;

/**
 * The device memory (`navigator.deviceMemory`, GB) below which the lobby does not prepare: an adaptation's threshold, not
 * the original's -- the prepared match holds the map's world, the renderer and its programs while the menus draw, beside
 * the menus' own. Unknown memory (a browser that does not say) prepares.
 */
export const LOBBY_PREPARE_MIN_DEVICE_MEMORY_GB = 4;

/** The address override (`?lobbyprepare=0|1`, read as `./graphicsBackend`'s `?renderer=`): false, true, or null when absent. */
export function lobbyPrepareOverride(search = globalThis.location?.search ?? ''): boolean | null {
  const v = new URLSearchParams(search).get('lobbyprepare');
  return v === '0' ? false : v === '1' ? true : null;
}

/** What the guard reads; each absent field is the page's own. */
export interface LobbyPrepareContext {
  /** The graphics preset (`./graphicsBackend` `readGraphicsBackend`). */
  graphics?: string;
  /** `navigator.deviceMemory`, GB; undefined when the browser does not say. */
  deviceMemory?: number | undefined;
  /** The address's query. */
  search?: string;
  /** VS-7: the device class (`./deviceClass` `pageDeviceClass`); the Xbox class, by VS.R1's certain bar or the pick, prepares nothing. */
  deviceClass?: DeviceClass;
}

/**
 * Whether the lobby prepares: never under the Xbox preset or the Xbox device class (off there until measured; VS-7, the
 * spec §4.4 item 5); `?lobbyprepare=0` off, `=1` on;
 * otherwise off when the device memory is known and below `LOBBY_PREPARE_MIN_DEVICE_MEMORY_GB`, else on.
 */
export function lobbyPrepareAllowed(c: LobbyPrepareContext = {}): boolean {
  const graphics = c.graphics ?? readGraphicsBackend(c.search);
  if (graphics === 'xbox') return false;
  if ((c.deviceClass ?? pageDeviceClass()) === 'xbox') return false;
  const override = lobbyPrepareOverride(c.search);
  if (override !== null) return override;
  const memory = 'deviceMemory' in c ? c.deviceMemory : (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory;
  return !(typeof memory === 'number' && memory < LOBBY_PREPARE_MIN_DEVICE_MEMORY_GB);
}

/** The page's two ports (`FrontEndSessionOptions.lobbyMatch`): each optional, neither expected to throw. */
export interface LobbyPreparePorts {
  /** The game lobby holds a game on `mission`: prepare its match (guarded by the page). */
  lobbyPrepare?(mission: string): void;
  /** The game left, or another mission: the prepared match let go. */
  lobbyRelease?(): void;
  /**
   * IP3 (5d's ruling (a)): the seat's side changed in the game lobby (SWITCH TEAMS, or the welcome that seats it) while its
   * mission is prepared: the prepared match re-seats from its side source (`./matchMount` `MatchLoader.reseat`).
   */
  lobbySide?(): void;
}

/**
 * The session's trigger (`FrontEndSession.advance`, once a frame): the game lobby's mission
 * (`GameLobbyCommands.missionName`, '' with no game) watched for a change -- a mission prepared once, '' or another
 * mission releasing the last first. While a match is up (loading or running, or its return not yet settled) nothing is
 * called and the last mission is forgotten (`handedOff` forgets it at the hand-off itself): the hand-off's own load and
 * prepare take the prepared match, and a release then would drop the match the mount is about to take. Once the return
 * has settled (its dialog's ONSTART run, which may leave the game), a game still held is prepared again. A port that
 * throws is not the frame's failure. The seat's side (`side`, the game lobby's own client's team; '' with none) is
 * watched beside the mission: a change while the same mission stays prepared tells `lobbySide` (5d's ruling (a)); a new
 * mission's prepare reads the side itself.
 */
export class LobbyPrepareTrigger {
  private asked = '';
  private side = '';
  constructor(private readonly ports: () => LobbyPreparePorts | undefined) {}

  /**
   * The hand-off (`GAME_LOBBY_MATCH_START`): the last mission forgotten at once -- a match begun and ended between two
   * frames is never seen up by `frame`, and the prepared match it took (or its end dropped) is gone either way.
   */
  handedOff(): void { this.asked = ''; }

  frame(mission: string, matchUp: boolean, side = ''): void {
    if (matchUp) { this.asked = ''; return; }
    if (mission === this.asked) {
      if (mission === '' || side === this.side) return;
      this.side = side;
      try { this.ports()?.lobbySide?.(); } catch { /* an adaptation never stops the frame */ }
      return;
    }
    const was = this.asked;
    this.asked = mission;
    this.side = side;
    const p = this.ports();
    if (was !== '') { try { p?.lobbyRelease?.(); } catch { /* an adaptation never stops the frame */ } }
    if (mission !== '') { try { p?.lobbyPrepare?.(mission); } catch { /* an adaptation never stops the frame */ } }
  }
}
