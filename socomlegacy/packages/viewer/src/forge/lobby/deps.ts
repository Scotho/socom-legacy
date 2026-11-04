import type { ArmoryData } from '../../armoryData';
import type { ArmoryExit } from '../../armoryState';
import type { NetClient } from '../../net/client';
import type { ServerEvent } from '../../net/protocol';

/**
 * FORGE (FG-27; FG.R22): the seam between the forge's lobby popup (`./lobby`) and the forge's page, which provides it
 * (FG-26). A browser adaptation with no original -- the game has no editor and no editor lobby; the popup represents the
 * original's game lobby (`dlgGameLobby.rdr` as `../../gameLobbyHost` fills it) in the forge's own markup and changes
 * nothing of the game's behaviour.
 *
 * The owner's word (2026-10-14, FG.R22): the pad's Home button (button 16) is the modern UI overlay's -- nothing here
 * reads or claims it; a guest's ARMORY choice goes to the room only (`armory().send`, the room's `loadout`), never to
 * the memory card or `PUT /lobby/loadout` (FG.R21).
 */

/** The room's GAME LOBBY view (`../../net/protocol`, SVC-07a): the seats, the countdown, launched, a refusal's words. */
export type GameLobbyEvent = Extract<ServerEvent, { type: 'gameLobby' }>;
/** One seat of it: the room's id, the name, the side (null a watcher's), READY, the host's star, READY's gate in seconds. */
export type GameLobbySeat = GameLobbyEvent['seats'][number];

/** A line of the room's chat as the page hands it on (the room's `chat` event: the sender's name, the text, its scope). */
export interface ForgeLobbyChatLine { from: string; text: string; team: boolean }

/** The three pre-match requests (`lobbyReady`, `switchTeams`, `launch`: the protocol's, answered with `gameLobby`). */
export type ForgeLobbyRequest = 'lobbyReady' | 'switchTeams' | 'launch';

/** What the ARMORY in the window needs: the disc's data for the map (`armoryFromDisc`), the side, and the kit's way out. */
export interface ForgeLobbyArmorySource {
  /** The screen's data, read with its world (the map's arsenal and valves). */
  data: Promise<ArmoryData>;
  side: 'seal' | 'terrorist';
  /** A change of the type or its kit (live): sent to the room as its `loadout` -- never stored (FG.R21). */
  send(exit: ArmoryExit): void;
}

/**
 * FG-45 (FG.R24; a product-track adaptation, no original): the lobby's visibility as the creator's page holds it -- whether
 * it shows in the modern UI's Custom matches, and the change asked of the server (`../lobbyClient` `setListed`).
 */
export interface ForgeLobbyVisibility {
  /** Whether the lobby is listed now (the server's last answer). */
  listed(): boolean;
  /** Asks the server to list (true) or unlist (false) it: null on its 200, else the refusal's words. */
  set(on: boolean): Promise<string | null>;
}

/** FG-48a: the longest lobby password (`central/src/forgeLobby.ts` `FORGE_PASSWORD_MAX`: 1..32 printable ASCII). */
export const LOBBY_PASSWORD_MAX = 32;
/** FG-48a: whether `v` is a password the server takes (`central/src/forgeLobby.ts` `isForgePassword`). */
export function lobbyPasswordOk(v: string): boolean {
  return v.length >= 1 && v.length <= LOBBY_PASSWORD_MAX && /^[\x20-\x7e]+$/.test(v);
}

/**
 * FG-48a (FG.R24; a product-track adaptation, no original): the lobby's password as the host's page holds it -- whether
 * the lobby is locked, and the change asked of the server (`../lobbyClient` `setPassword`).
 */
export interface ForgeLobbyPassword {
  /** Whether the lobby asks a password now (the server's last answer). */
  locked(): boolean;
  /** Asks the server to lock the lobby with `password` (a string) or open it (null): null on its 200, else the refusal's words. */
  set(password: string | null): Promise<string | null>;
}

/**
 * FG-48b (FG.R24; a product-track adaptation, no original): the host's kick as the host's page holds it -- the seat the
 * room names removed from the lobby (`../lobbyClient` `kickSeat`), its account barred for the lobby's life.
 */
export interface ForgeLobbyKick {
  /** Asks the server to kick the seat with the room's id `seat`: null on its 204, else the refusal's words. */
  kick(seat: number): Promise<string | null>;
}

/**
 * FG-48c (FG.R24; a product-track adaptation, no original): the host's "Close the lobby" as the host's page holds it -- the
 * lobby closed for everyone (`../lobbyClient` `closeLobby`) and the window let go; LEAVE (`close` below) hands it on.
 */
export interface ForgeLobbyEnd {
  close(): void;
}

export interface ForgeLobbyDeps {
  doc: Document;
  /** The lobby's socket client once seated (`NetClient`: id, send, sendVoice, onVoice ...), null before. */
  net(): NetClient | null;
  /** The last `gameLobby` event (seats, countdown, launched, refused?), null before one. */
  lobby(): GameLobbyEvent | null;
  onLobby(cb: (ev: GameLobbyEvent) => void): () => void;
  /** Chat lines as they arrive (the room's `chat` event). */
  onChat(cb: (line: ForgeLobbyChatLine) => void): () => void;
  /** The seat's own id and whether it hosts, null before the welcome. */
  me(): { id: number; host: boolean } | null;
  /** The lobby's name, the map's, and the layout's player cap (`Layout.settings.players`, FG.R18) for the header. */
  title(): { name: string; map: string; players: number };
  send(ev: ForgeLobbyRequest): void;
  chat(text: string, team: boolean): void;
  /** The ARMORY's needs, or null when it cannot open (no map read, a watcher's seat). */
  armory(): ForgeLobbyArmorySource | null;
  /** LEAVE and the window's close: the page lets the lobby go (FG-48c: a host's hands it on) and takes the window down. */
  close(): void;
  /**
   * FG-45: the lobby's visibility, the host's page only; absent or null, a joiner's: no control. FG-48c: each host seam is
   * read each frame and given while the page's own seat carries the host's flag (a successor's too), so it may come and go.
   */
  visibility?(): ForgeLobbyVisibility | null;
  /** FG-48a: the lobby's password, the host's page only; absent or null, no control. */
  password?(): ForgeLobbyPassword | null;
  /** FG-48b: the host's kick, the host's page only; absent or null, no control. */
  kick?(): ForgeLobbyKick | null;
  /** FG-48c: the host's "Close the lobby", the host's page only; absent or null, no control. */
  end?(): ForgeLobbyEnd | null;
}
