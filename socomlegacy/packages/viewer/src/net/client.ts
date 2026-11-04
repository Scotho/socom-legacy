import { decodeSnapshot, encodeCommands, frameKind } from './codec';
import { shortTurn, wrapYaw } from '../yaw';
import type { Knock } from './blast';
import { LookGate, LookLog, OPEN_LOOK_CONTEXT } from './lookGate';
import {
  COMMAND_REDUNDANCY, epochNewer, Frame, partHealthOf, partHealthWire, PROTOCOL_VERSION, SNAPSHOT_HZ, TICK_HZ,
  type BodyState, type ClientEvent, type CombatReport, type Command, type CraneWire, type DoorWire, type EnvWire, type Role, type Rules, type ServerEvent, type Snapshot, type Team,
} from './protocol';
import type { WorldState } from '../worldState';
import type { GameType } from '@s2u/scene';
import { decodeVoiceDown, type VoiceDown } from './voiceWire';
import { SeatToldBoard } from './seatTold';
import { SeatClanBoard } from './seatClans';
import { equipmentLimit } from '../equipmentLimit';
import { markLoad } from '../loadMarks';

/**
 * The page's end of the match (web sprint 3, M4; W3.R8-R10): the socket, the commands numbered and sent every tick
 * with the last `COMMAND_REDUNDANCY` repeated, the prediction checked against each snapshot's own state (smoothed
 * under `SNAP_DISTANCE`, snapped past it), the respawns replayed, the server's clock, and the other players' bodies
 * held `INTERP_DELAY_MS` behind it and drawn between two snapshots. A latency/loss injector (`simulate`) sits under
 * the socket for the tests and the playtest's network matrix (the bar's 0-150 ms, 1-2 % loss).
 */

/** What the net client drives on the page (`./walk` `WalkMode`). */
export interface NetWalk {
  /**
   * The walk's tap: each tick's command, the mover's feet after it and (protocol 11, NET-WIRE) its facing after the
   * look gate (yaw, pitch, degrees) -- what the room's own state is compared with at that command. `sent` is the number
   * of the client's last command (0 on a new client; its count so far on a `rebind`, which never restarts the numbering):
   * the walk's next tick is command `sent + 1`, so a walk that keys anything by command (its look record, the landing's
   * draw) keys it by the number the room acks (NET-WIRE's landing review, F1).
   */
  setNetTap(tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number], facing?: readonly [number, number]) => void) | null, sent?: number): void;
  respawn(at: readonly [number, number, number], yaw: number, replay?: readonly Command[]): boolean;
  /**
   * LATER 498: whether the walk has ground to stand a mover on (`WalkMode.grounded`). A walk without (a map with no
   * ground, a test's) refuses every respawn; its spawn is not held (`NetClient.spawned`), as before LATER 496. Absent: true.
   */
  grounded?(): boolean;
  /**
   * A correction from the room: the mover moved by (dx, dy, dz) now -- found at the room's snapshot acking command `ack`
   * (LATER 528: `WalkMode` lays no correction found at or past a send-time turret take's M on its record before M; the
   * predictions there were the hold's). A walk may ignore `ack`.
   */
  nudge(dx: number, dy: number, dz: number, ack?: number): void;
  /**
   * Protocol 11 (NET-WIRE): a facing correction from the room -- the mover turned by (dyaw, dpitch) degrees now, where
   * the look gate's next step starts (`./lookGate`). Absent: the walk takes none.
   */
  nudgeFacing?(dyaw: number, dpitch: number): void;
  /**
   * NET-WIRE's independent review (research 224 §4): the room's facing after command `ack` laid on the mover and every
   * later command's look REPLAYED through the look gate from it (`LookLog.replay`, the gate's own steps as recorded):
   * the facing after each replayed command by seq, or null when the walk holds no record from `ack` (then the client
   * replays its own shadow of the gate and turns the walk by `nudgeFacing`; one offset only as the last resort). The
   * page's real walk (`WalkMode`) and a `MoverSim` page (`MoverSim.replayLook`) have it.
   */
  reconcileFacing?(ack: number, facing: { yaw: number; pitch: number }): Map<number, [number, number]> | null;
  setLocked(on: boolean): void;
  /**
   * A blast's knock on the prediction (`./blast` `applyKnock`), as the server laid it on its mover after command
   * `after`. When the walk replays from that command it calls `replayed` with it (the predictions after it are the run's).
   */
  knock?(knock: Knock, after?: number, replayed?: (after: number) => void): boolean;
  /** Dead as the server has it (`kill` or `deadAtLoad`) until the next `spawn`: the mover's death landing stays down. */
  setDead?(on: boolean, opts?: { keepDeath?: boolean }): void;
  /**
   * OT.R59 (RECONNECT-GHOST, a labelled adaptation): the seat handed back alive -- the mover stood at `at` facing `yaw`
   * in `posture`, `weapon` in the hand, the launcher `held` (null: none on the body), with no spawn's reset. Absent: the
   * client stands it with `respawn`.
   */
  resume?(at: readonly [number, number, number], yaw: number, posture: 'stand' | 'crouch' | 'prone', weapon: 0 | 1, held: number | null): boolean;
}

export interface Simulate {
  /** One-way delay each way, ms, and its jitter (uniform +-). */
  latencyMs: number; jitterMs?: number;
  /** The share of frames lost each way (commands and snapshots; the JSON events ride a reliable socket). */
  loss?: number;
}

export interface NetOptions {
  url: string;
  map: string;
  name: string;
  simulate?: Simulate;
  /** Join as a watcher (the map viewer's Online setting): a spectator that never plays, so the walk is not driven. */
  watch?: boolean;
  /** Protocol 4: the rules of the room to join (the server's default when absent). */
  rules?: Rules;
  /**
   * Protocol 9: the page's character type for each side (its ARMORY choice), read when the hello goes (each socket's,
   * so a rejoin names the types chosen since); absent, the room seats the default (R95.5).
   */
  types?: () => { seal: number; terrorist: number };
  /** The tab's session token for the hello (S2 round 4, `./session`): the room's key for this page's record. */
  session?: string;
  /** The page opens the ARMORY on its seats (web sprint 5; the hello's `armory`, `ARMORY_SEAT_READING`). */
  armory?: boolean;
  /** Whether the page's ARMORY is open as the hello goes (the S3 repair; the hello's `armoryOpen`, with `armory` only). */
  armoryOpen?: () => boolean;
  /**
   * SVC-07a: the game to join (a room-service game the account holds a seat in) and the login's ticket, the session's
   * bearer: the hello's `game` and `ticket` (research 159 §4). Both or neither. SA-6b (`../connectHost`
   * `GAME_DOOR_ADAPTATION`, SA.R22 (6)): a placed game's carries its game `token` in place of the ticket, never both.
   */
  game?: { id: number; ticket: string } | { id: number; token: string };
  /**
   * FG-34 (W19.R6; a browser adaptation with no original): the forge lobby this hello joins -- the protocol's FG-25 field
   * (`./protocol` hello `forge`): the lobby's id and, on the creator's page only, the create's host ticket. Present, the
   * hello names no `game` (a forge lobby is not a room-service game) and carries `forgeAccount` as its own `ticket`.
   * LATER 275 (SA-7i's page half, `../forge/lobbyClient` `askForgeSeat`): a lobby central placed on a host is joined at
   * that host's door with central's forge token -- `{ id, token }`: the hello carries `forge: { id }` and the `token`,
   * never a `forge.ticket` nor a `ticket` (`forgeAccount` is ignored with it). The token is one per entry (it lives 60 s):
   * a lobby socket is never reopened with these options (`ForgeLobbySession` ends at any close; the match's reconnect,
   * `../netPage`, names no `forge`), and a reconnect would need a fresh token.
   */
  forge?: { id: string; ticket?: string } | { id: string; token: string };
  /**
   * SA-7h S5 (`../connectHost` `ROOM_DOOR_ADAPTATION`): a host-run standing room's seat -- the hello carries the room
   * pass's `token` with the map and the rules; no `ticket`, no `game`. Not with `game` or `forge`.
   */
  room?: { token: string };
  /**
   * FG-34: the account's login ticket a forge hello carries as the hello's own `ticket` (a signed-in seat's name); absent
   * or null, the page is the lobby's guest (FG.R21, `Guest-<n>`). Read only with `forge`, and never with its token form
   * (LATER 275: the token names the seat's account).
   */
  forgeAccount?: string | null;
  random?: () => number;
  /** A socket for the tests (a `WebSocket`-alike); the page's own by default. */
  socket?: (url: string) => WebSocketLike;
  /**
   * Protocol 10 (MAP-03): the page's world (`../worldState`, on the walk's own hull), which the welcome's and every
   * snapshot's environment are laid on (`applySnapshotWorld`) -- before the snapshot corrects the prediction. Null or
   * absent: the environment is kept (`env`) and laid on nothing.
   */
  world?: () => WorldState | null;
  /**
   * LOW-3 (web research 223 s6): the page's load was already reported on an earlier socket of this page (`NetPage`'s
   * retry carries `loadReported`). That `loaded` may have been lost with the socket before the room read it, so a
   * welcome in any launched phase (`LAUNCHED_PHASES`: the load's hold, a round in any phase; never the lobby's
   * `waiting`) sends it again, under every rule and role (NET-RES.R8, the controller's RC0 ruling). The room owns what
   * follows: a fresh late respawn seat is published dead at load (VRJ-1); a seat already placed, a spectator or a
   * duplicate changes nothing there but the seat's late mark.
   */
  loaded?: boolean;
}

/**
 * JOIN_SILENT_READING (MAP-03; research 209 s11): a joiner takes the world as the room has it without its effects -- the
 * welcome's environment (and, under protocol 10, its first snapshot's repeat of it) is applied with the game's
 * `skip_effects` (`WorldState.apply`'s `silent`: no destroy program replayed, no damage dealt); every later change plays
 * its effects. Protocol 11 (NET-WIRE) names the environment only when it changed, so a snapshot after the welcome either
 * repeats nothing or carries a later change. [reading: the original
 * replays every non-zero valve to a joiner (`FUN_002b4440` D:L156767, research 92 s1); whether that replay runs its
 * sequences' sounds and effects or only their end state is not traced. Research 209 s11.]
 */
export const JOIN_SILENT_READING = true;

/**
 * Lays a snapshot's (or a welcome's) environment on the page's world -- the one call the page makes before its
 * prediction is corrected or replayed (research 175 s7, 198 WP2: "apply geometry before movement correction/replay"),
 * so the page's mover meets the room's geometry within one snapshot (ruling PF.R12, `SHOT_GEOMETRY_LIVE_READING`:
 * the room resolves against its present world, as `FUN_003c9b70` walks the live world). The whole difference each time (`WorldState.applyWire`). The round
 * epoch is the caller's to check (`NetClient`).
 */
export function applySnapshotWorld(snap: { env?: EnvWire }, world: WorldState, silent: boolean): boolean {
  if (!snap.env) return false;
  world.applyWire(snap.env, silent);
  return true;
}

/**
 * NET-WIRE's review: whether world revision `a` is later than `b` on the wire's 32 bits (a serial-number comparison, as
 * `epochNewer` on 16: a wrap is later).
 */
export function revisionNewer(a: number, b: number): boolean {
  const d = (a - b) >>> 0;
  return d !== 0 && d < 0x80000000;
}

/** NET-WIRE's independent review: whether environment `a` is later than `b` -- a later round, or a later revision of one. */
export function envNewer(a: Pick<EnvWire, 'epoch' | 'revision'>, b: Pick<EnvWire, 'epoch' | 'revision'>): boolean {
  if (epochNewer(a.epoch, b.epoch)) return true;
  return (a.epoch & 0xffff) === (b.epoch & 0xffff) && revisionNewer(a.revision, b.revision);
}

export interface WebSocketLike {
  binaryType: string;
  readyState: number;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** The others are drawn this far behind the server: two snapshot intervals and a margin for jitter. */
export const INTERP_DELAY_MS = 100;
/** A prediction error past this (units) is snapped at once; under it, spread over `SMOOTH_TICKS` (bar 1: never snapped otherwise). */
export const SNAP_DISTANCE = 24;
/** An error under this is float noise, not a correction. */
export const CORRECTION_FLOOR = 0.001;
/** Ticks over which a small correction is spread (100 ms). */
export const SMOOTH_TICKS = 6;
/**
 * Protocol 11 (NET-WIRE; research 224 §4): a facing error under this many degrees is the float32's noise (3e-5 on a yaw
 * near 360), not a correction. A page policy with no original, like `CORRECTION_FLOOR`.
 */
export const FACING_FLOOR_DEG = 0.001;
/**
 * The socket a constructor that threw leaves behind (closed, `readyState` 3): nothing is sent on it, closing it is a
 * no-op, and the client reads 'closed', so `NetPage` backs off and retries as after a refused connect.
 */
const deadSocket = (): WebSocketLike => ({
  binaryType: 'arraybuffer', readyState: 3,
  send: () => undefined, close: () => undefined,
  onopen: null, onclose: null, onmessage: null, onerror: null,
});

/**
 * The combat reports the page keeps (INT.R5, research 127 §5; ported from Chris's browser-beta-v5,
 * chris/browser-beta-integration d578f347: his `client.ts` ring of 1024): the last this many `combat` events a room with
 * the option on sent, for the playtest report. A page policy of a playtest instrument with no original, not a game value.
 */
export const COMBAT_REPORT_RING = 1024;

/** Commands kept for replay and reconciliation: 10 s. */
const HISTORY = 10 * TICK_HZ;
/** NET-RES-2a: the welcome's phases of a launched game (its load's hold, a round in any phase) -- not the lobby's 'waiting'. */
const LAUNCHED_PHASES: ReadonlySet<string> = new Set(['loading', 'play', 'expired', 'decided', 'over']);
/** Snapshots kept for the others' interpolation. */
const SNAPSHOTS = 32;

interface Sent { cmd: Command; feet: [number, number, number] | null; facing: [number, number] | null }
interface Received { snap: Snapshot; at: number }

export type NetState = 'connecting' | 'open' | 'closed' | 'refused';

export class NetClient {
  id = 0;
  /**
   * OBF-3 (a browser adaptation of the transport): the room's name for this socket's own seat -- its welcome's, then its
   * own `renamed` -- or null before a welcome. The lobby that takes the client back from a match (`GameSocketHost.adopt`)
   * names its seat by it, with `id` (`adoptedWelcome`).
   */
  seatName: string | null = null;
  role: Role = 'spectator';
  team: Team | null = null;
  /** The room's trusted CREATE GAME restriction (research 362 §3); older welcomes mean unrestricted. */
  eqLimit = 0;
  state: NetState = 'connecting';
  /** The socket's close code as the page heard it (HARD-SEAT: a game's seat ended for good, or a drop), null while open. */
  closeCode: number | null = null;
  /**
   * TR-2 (the test room's maps plan, TR.R3; research 307 §2): the refused hello's -- the server's reason and the map the
   * hello named -- or null before a refusal. The frame carries the reason alone (`packages/match/src/server.ts` :918);
   * the map its 4004 'no such map' names in the server's log (`{ map: String(ev.map) }`, :806) is the hello's own
   * (`opts.map`). Read by the page's Online line (`../online` `withRefusalMap`).
   */
  refusal: { reason: string; map: string } | null = null;
  queue = 0;
  /** Round trip, ms (the last pong). */
  rtt = 0;
  /**
   * Corrections taken: small (smoothed) and snapped, and the largest error seen -- the playtest's numbers; protocol 11's
   * facing corrections and the largest facing error (degrees) beside them.
   */
  readonly corrections = { small: 0, snapped: 0, largest: 0, facing: 0, largestFacing: 0 };
  private readonly socket: WebSocketLike;
  private seq = 0;
  /** OBF-20 (the review's F1): the resume's last taunt and communication requests (`requestFloor`). */
  private readonly floors = { taunt: 0, communication: 0 };
  /**
   * OBF-20 (the review's F1): the request a Chat menu's send numbers on from (`../matchTaunts`, `../matchChat`): the
   * room's last taken for this seat as a resume told it, 0 before any -- so a reloaded page's first send is new to the
   * pages that heard the seat's earlier ones.
   */
  requestFloor(kind: 'taunt' | 'communication'): number { return this.floors[kind]; }
  private readonly history: Sent[] = [];
  private readonly snaps: Received[] = [];
  private correction: [number, number, number] = [0, 0, 0];
  private correctionTicks = 0;
  /** LATER 528: the command whose snapshot found the correction being spread (the newer, where two were merged). */
  private correctionAck = 0;
  private readonly listeners = new Set<(ev: ServerEvent) => void>();
  /** SVC-07c SEAT-TOLD: each seat's last told rating and medal (the room's `seatTold`, `./seatTold`), for the screens. */
  readonly told = new SeatToldBoard(this);
  /** AD-13: each seat's clan tag as the room last told it (the room's `seatClans`, `./seatClans`), for the speaker line and the game lobby. */
  readonly clans = new SeatClanBoard(this);
  /**
   * AD-14 (C92; research 227 §2.11): the room's last `voiceMembers` -- this socket's own voice channel and its member
   * count, itself included -- for the HUD's number beside the channel icon (`../hudVoice` `voiceCount`); null before the
   * room's first (an older server: the page's estimate stands).
   */
  voiceMembers: { channel: number; members: number } | null = null;
  private readonly random: () => number;
  private lastPing = 0;
  private alive = false;
  /** The combat reports kept (`COMBAT_REPORT_RING`, oldest first) and how many were let go: empty unless a room sends them. */
  private readonly combats: CombatReport[] = [];
  private combatsDropped = 0;
  /**
   * NU-3c (research 321 section 4.2.1): each other seat's six part bytes as the room last sent them (`health`), by seat
   * id -- its side's and, to a spectator, every seat's; a seat's `left` forgets them. Read through `healthOf`.
   */
  private readonly partHealth = new Map<number, readonly number[]>();

  /** LATER 62: the socket's URL (the server or the door it named), for the close report's route (`./closeReport`). */
  get url(): string { return this.opts.url; }

  constructor(private readonly opts: NetOptions, private walk: NetWalk) {
    this.random = opts.random ?? Math.random;
    const factory = opts.socket ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
    try {
      this.socket = factory(opts.url);
    } catch {
      // The WebSocket constructor throws for a bad scheme or a fragment (SyntaxError) and for ws:// from an https page
      // (SecurityError): the connection failed, as a refused one does -- never the page's show() half-way.
      this.socket = deadSocket();
      this.state = 'closed';
      return;
    }
    this.socket.binaryType = 'arraybuffer';
    this.socket.onopen = () => {
      this.state = 'open';
      const types = opts.watch ? undefined : opts.types?.();
      this.out(JSON.stringify({
        type: 'hello', version: PROTOCOL_VERSION, name: opts.name, map: opts.map, cranes: true, ...(opts.watch ? { watch: true } : {}), ...(opts.rules ? { rules: opts.rules } : {}),
        ...(types ? { types: { seal: types.seal, terrorist: types.terrorist } } : {}), ...(opts.session ? { session: opts.session } : {}),
        ...(opts.armory && !opts.watch ? { armory: true, ...(opts.armoryOpen?.() ? { armoryOpen: true } : {}) } : {}),
        ...(opts.room ? { token: opts.room.token } : opts.forge
          ? 'token' in opts.forge ? { forge: { id: opts.forge.id }, token: opts.forge.token }   // LATER 275: a placed lobby, at its door
            : { forge: { id: opts.forge.id, ...(opts.forge.ticket ? { ticket: opts.forge.ticket } : {}) }, ...(opts.forgeAccount ? { ticket: opts.forgeAccount } : {}) }
          : opts.game ? { game: opts.game.id, ...('token' in opts.game ? { token: opts.game.token } : { ticket: opts.game.ticket }) } : {}),
      } satisfies ClientEvent), true);
    };
    this.socket.onclose = (ev) => {
      this.closeCode = typeof ev?.code === 'number' ? ev.code : null;
      if (this.state !== 'refused') this.state = 'closed';
      this.release();
    };
    this.socket.onerror = () => undefined;
    // A socket the page closed (`close`) is heard no more: a frame still on its way would stand or knock the walk the
    // page's next client holds (a map change, 2026-10-01).
    this.socket.onmessage = (ev) => { this.lastHeard = performance.now(); this.delayed(() => { if (!this.left) this.receive(ev.data); }, false); };   // NET-RES-2d: heard
    if (!opts.watch) {
      walk.setNetTap((cmd, feet, facing) => this.tick(cmd, feet, facing), this.seq);
      walk.setLocked(true);                                    // until the server stands the mover somewhere
    }
  }

  /**
   * ONL-18 (web research 166 §1): the client taken on by another walk -- the game lobby's idle walk handed to the
   * match's (`LOBBY_IDLE_WALK_ADAPTATION`, `../gameLobbyHost`) -- on the same socket. The old walk's tap goes; the new
   * one is tapped, locked unless the room has stood the mover, and a spawn the room made meanwhile (the round started
   * during the load) stood on it; the snapshots correct the rest. A watcher drives no walk.
   */
  rebind(walk: NetWalk): void {
    if (walk === this.walk || this.opts.watch || this.released) return;
    this.walk.setNetTap(null);
    this.walk = walk;
    walk.setNetTap((cmd, feet, facing) => this.tick(cmd, feet, facing), this.seq);
    // LATER 498: a spawn the old walk refused (the game lobby's idle walk refuses every one) is stood on the new walk
    // at the spawn's own point (`retrySpawn`), once -- not respawned again below.
    const stood = this.pendingSpawn !== null && this.lastSpawn !== null && (this.retrySpawn(this.lastSpawn.at), this.pendingSpawn === null);
    walk.setLocked(!this.alive);
    if (!this.alive && this.markedDead) this.placeLoadDeath();
    walk.setDead?.(this.markedDead);
    // LATER 498's review F1: the new walk refuses the point (no floor there on the match's map) and has ground: held as
    // `spawned` holds one -- the lobby's idle walk (no ground) held nothing, so the hold is taken here.
    if (this.alive && this.lastSpawn && !stood && !walk.respawn(this.lastSpawn.at, this.lastSpawn.yaw, []) && walk.grounded?.() !== false) {
      this.holdSpawn(this.lastSpawn.yaw, this.lastSpawnAfter);
    }
  }
  /** The room's last spawn of this page's mover (`rebind` stands it on a new walk). */
  private lastSpawn: { at: readonly [number, number, number]; yaw: number } | null = null;

  /** Listens for the server's events (the HUD, the kill lines, the scoreboard); returns the unsubscribe. */
  on(listener: (ev: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(ev: ClientEvent): void {
    this.out(JSON.stringify(ev), true);
  }

  /**
   * SVC-20b-page (web sprint 20, W20.R1): the room's voice frames (`Frame.Voice`, decoded: `./voiceWire` `VoiceDown`) to
   * `listener`; returns the unsubscribe. The page's voice client (`../voice/voiceClient`) takes them through `NetPage`.
   */
  onVoice(listener: (down: VoiceDown) => void): () => void {
    this.voiceListeners.add(listener);
    return () => this.voiceListeners.delete(listener);
  }
  private readonly voiceListeners = new Set<(down: VoiceDown) => void>();
  /** SVC-20b-page: the page's own voice frame (`./voiceWire` `encodeVoiceUp`), lossy as the commands are (W20.R7). */
  sendVoice(frame: Uint8Array): void {
    this.out(frame, false);
  }

  /**
   * ONL-18b (web research 221): the page's loading screen released -- `loaded`, which a launched game's room counts
   * toward round 1 (`FUN_002c4020` D:L165414-165441). On a welcomed socket it goes now; before the welcome it is owed
   * and goes with it (the room ignores an unseated socket's). The caller sends it once a load (`./loadingJoin`).
   */
  reportLoaded(): void {
    this.loadDone = true;
    if (this.welcomed && this.state === 'open') { this.send({ type: 'loaded' }); markLoad('loaded-sent'); }   // IP3 (`../loadMarks`)
    else this.loadedOwed = true;
  }
  /**
   * LATER 64: a late seat's load started (its READY in the lobby, `LobbyMatch.start`), told once to a welcomed, open
   * socket (`lateLoad`), so the services keep its late flag across the host's return while the load runs.
   */
  reportLateLoad(): void {
    if (this.lateLoadSent) return;
    if (!this.welcomed || this.state !== 'open') { this.lateLoadOwed = true; return; }   // the review's F4: owed, as `loaded` is
    this.lateLoadSent = true;
    this.send({ type: 'lateLoad' });
  }
  private lateLoadSent = false;
  /** LATER 64's review F4: a `lateLoad` asked before the welcome, sent with it. */
  private lateLoadOwed = false;
  /** LOW-3: whether this page's load has been reported, on this socket or (carried, `NetOptions.loaded`) an earlier one. */
  loadReported(): boolean { return this.loadDone || this.opts.loaded === true; }
  private loadDone = false;
  /** ONL-18b: this socket's welcome came; a `loaded` asked before it (`reportLoaded`). */
  private welcomed = false;
  private loadedOwed = false;

  close(): void {
    // OT.R59 (RECONNECT-GHOST step 2): the page's own leave said first, so the room never parks the seat (`bye`).
    this.sayBye();
    this.left = true;
    this.told.close();
    this.clans.close();
    this.release();
    this.socket.close(1000, 'left');
  }

  /**
   * OT.R59 (RECONNECT-GHOST step 2; a labelled adaptation): `bye` -- the page leaves on purpose -- sent at once (never
   * through the latency injector, `delayed`: it must reach the room before the close frame), once a socket, and only on
   * an open one. `close` sends it; the page's pagehide sends it early (`NetPage.onPageHideBye`), before anything closes.
   */
  sayBye(): void {
    if (this.byeSent || this.socket.readyState !== 1) return;
    this.byeSent = true;
    this.socket.send(JSON.stringify({ type: 'bye' } satisfies ClientEvent));
  }
  private byeSent = false;

  /** NET-RES-2d (`LINK_SILENCE_MS_ADAPTATION`, the page's): when the server last sent anything on this socket (`performance.now()`). */
  heardAt(): number { return this.lastHeard; }
  private lastHeard = performance.now();

  /**
   * NET-RES-2d (NET-RES.R7, R9): the page gives up on a silent link -- the socket closed as `close` closes it but with no
   * `bye`, so a room that still hears the close holds the seat (its page coming back), as it holds any unannounced close.
   */
  drop(): void {
    this.left = true;
    this.told.close();
    this.clans.close();
    this.release();
    this.socket.close(1000, 'link silent');
  }

  /**
   * The walk given back (its tap off, its lock lifted), once: at the page's `close` or at a close the server or the
   * network made. A socket the page closed answers its `onclose` only after the closing handshake (a browser's; the
   * offline room's a microtask later), by when the page's next client may hold the walk -- a map change, a new Online
   * setting (`main.ts` `connectNet`). That late close must not take the next client's tap: the owner's play test of
   * 2026-10-01 (after a map change each player saw the other frozen at its spawn: the page sent its room nothing).
   */
  private release(): void {
    if (this.released) return;
    this.released = true;
    if (!this.opts.watch) { this.walk.setNetTap(null); this.walk.setLocked(false); }
    // Dead at the close (the server's, a kick, Online off): the walk back alive, as unlocked -- a dead walk keeps the
    // death camera and hides the reticle (`../reticle` `reticleShown`) until a `spawn` no closed match will send.
    if (this.markedDead) { this.markedDead = false; this.walk.setDead?.(false); }
    this.clearDeathTick();
  }
  private released = false;
  /** The walk marked dead (its own `kill` or `deadAtLoad`) until its `spawn` or the close's `release`. */
  private markedDead = false;
  /** Arrival of this seat's load death, kept through the loading screen's event replay (research 322 §5.3). */
  private loadDeathAt: number | null = null;
  deadAtLoadAt(): number | null { return this.loadDeathAt; }
  /**
   * B138 (BTL.R8, run 1): this seat's death on the ROOM's clock -- the newest snapshot's tick heard when its `kill` or
   * `deadAtLoad` came (less the load death's `age`), or, with no snapshot heard yet, the first one's after (`pending`).
   * The room takes the respawn press by its own ticks since the death (`room.ts` `respawnReady`), and its loop drops a
   * stall's ticks (`server.ts` `loop`, LATER 163), so on a loaded host its 5 s can be longer than the page's; the page's
   * ready reads this (`roomSecondsDead`) beside its own clock, so it never shows before the room would take the press.
   */
  private deathTick: number | null = null;
  private deathTickPending = false;
  /** The seconds since this seat's death on the room's ticks as heard (never ahead of the room); null with no death or no snapshot. */
  roomSecondsDead(): number | null {
    const heard = this.snaps[this.snaps.length - 1]?.snap.tick;
    return this.deathTick === null || heard === undefined ? null : Math.max(0, heard - this.deathTick) / TICK_HZ;
  }
  private markDeathTick(age = 0): void {
    const heard = this.snaps[this.snaps.length - 1]?.snap.tick;
    this.deathTick = heard === undefined ? null : heard - Math.max(0, age);
    this.deathTickPending = heard === undefined;
  }
  private clearDeathTick(): void { this.deathTick = null; this.deathTickPending = false; }
  /** The original's key0/2 transform before the load death, kept across the lobby's idle-walk adoption. */
  private loadDeathPose: { at: readonly [number, number, number]; yaw: number } | null = null;
  private placeLoadDeath(): void {
    const pose = this.loadDeathPose;
    // `resume` places the existing mover without a living spawn/rebuild; the caller marks it dead before any frame.
    if (pose) this.walk.resume?.(pose.at, pose.yaw, 'stand', 0, null);
  }
  /** The page closed this client (`close`): its socket's late frames are not read. */
  private left = false;

  /** The command number of the last tick sent (a round fired in this frame names it). */
  lastSeq(): number {
    return this.seq;
  }

  // ---- up ----

  private tick(partial: Omit<Command, 'seq'>, feet: [number, number, number], facing?: readonly [number, number]): void {
    const cmd: Command = { ...partial, seq: ++this.seq };
    // The prediction is where the mover is plus the correction still to be spread: the two sum to where it should be,
    // and each step of `applyCorrection` moves the one into the other. The facing is laid at once, so it is as it is.
    const c = this.correction;
    this.history.push({
      cmd, feet: this.alive ? [feet[0] + c[0], feet[1] + c[1], feet[2] + c[2]] : null,
      facing: this.alive && facing ? [facing[0], facing[1]] : null,
    });
    this.shadowStep(cmd, this.alive && facing ? facing : null);
    if (this.history.length > HISTORY) this.history.shift();
    this.applyCorrection();
    if (this.state !== 'open' || this.role !== 'player') return;
    const batch = this.history.slice(-COMMAND_REDUNDANCY).map((h) => h.cmd);
    this.out(encodeCommands({ viewTick: this.viewTick(), commands: batch }), false);
    const now = performance.now();
    if (now - this.lastPing > 2000) { this.lastPing = now; this.send({ type: 'ping', t: now }); }
  }

  /** LATER 249 (the review's F1): the injector's outbound reliable messages, in send order -- drained by one timer, so a
   * browser's whole-millisecond `setTimeout` cannot let a later one pass an earlier one (TCP's order). */
  private reliableQ: { due: number; run: () => void }[] = [];
  /** LATER 249 (the review's F1, re-entrance): the drain's one timer while armed, and a drain running -- a `run` that
   * sends another reliable message queues it, never a second timer or a nested drain. */
  private reliableTimer: ReturnType<typeof setTimeout> | null = null;
  private pumping = false;
  private out(frame: string | Uint8Array, reliable: boolean): void {
    this.delayed(() => { if (this.socket.readyState === 1) this.socket.send(frame); }, !reliable, reliable);
  }

  /**
   * The injector: a delay each way, and a lost frame (never a JSON event: those ride TCP in the real world too).
   * NU-12 (the review's F3): each message is delayed on its own, so a `spawn` can come after its first snapshot -- the
   * order `markSpawn` rests on is not kept: the body slides one interval and its copy is rebuilt a snapshot late.
   * Since LATER 249, outbound reliable messages keep their order. The injector is reachable without a dev gate (`?lag=`),
   * so it models the real transport faithfully. The inbound order (NU-12) is unchanged. The review's F1: one queue
   * drained by one timer (`pumpReliable`), not a timer a message -- a browser truncates `setTimeout`'s delay to whole
   * milliseconds, so a later message clamped to an earlier one's due could fire up to 1 ms before it.
   */
  private delayed(run: () => void, lossy: boolean, ordered = false): void {
    const sim = this.opts.simulate;
    if (!sim) { run(); return; }
    if (lossy && sim.loss && this.random() < sim.loss) return;
    const ms = Math.max(0, sim.latencyMs + (sim.jitterMs ? (this.random() * 2 - 1) * sim.jitterMs : 0));
    if (!ordered) { if (ms === 0) run(); else setTimeout(run, ms); return; }
    const now = performance.now(), last = this.reliableQ.at(-1)?.due ?? now;
    this.reliableQ.push({ due: Math.max(now + ms, last), run });
    if (this.reliableTimer === null && !this.pumping) this.pumpReliable();
  }

  /** LATER 249 (the review's F1): runs the reliable messages now due, in order, then arms the one timer for the next. */
  private pumpReliable(fired = false): void {
    if (this.pumping) return;
    const q = this.reliableQ;
    this.pumping = true;
    try {
      // The timer fired for the head (armed `ceil(due - now)` ahead): its due has come on the timer's own clock, which a
      // test's fake timers advance without `performance.now` (turretHold's `netRig`) -- so the head and any due no later run.
      const at = fired && q.length ? Math.max(performance.now(), q[0]!.due) : performance.now();
      while (q.length && q[0]!.due <= at) q.shift()!.run();
    } finally {
      this.pumping = false;
    }
    if (q.length && this.reliableTimer === null) {
      this.reliableTimer = setTimeout(() => { this.reliableTimer = null; this.pumpReliable(true); }, Math.ceil(q[0]!.due - performance.now()));
    }
  }

  // ---- down ----

  private receive(data: unknown): void {
    if (typeof data === 'string') { this.event(JSON.parse(data) as ServerEvent); return; }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data instanceof Uint8Array ? data : null;
    // Protocol 11 (NET-WIRE): the frame's type byte first -- a snapshot is taken; a voice frame goes to the voice
    // listeners (SVC-20b-page; a malformed one dropped); a command frame, an unknown type and an empty frame are
    // dropped, nothing thrown.
    if (bytes && frameKind(bytes) === Frame.Voice) {
      const down = decodeVoiceDown(bytes);
      if (down) for (const l of this.voiceListeners) l(down);
      return;
    }
    if (!bytes || frameKind(bytes) !== Frame.Snapshot) return;
    if (this.opts.simulate?.loss && this.random() < this.opts.simulate.loss) return;
    let snap: Snapshot;
    try { snap = decodeSnapshot(bytes); } catch { return; }
    this.snaps.push({ snap, at: performance.now() });
    if (this.deathTickPending) { this.deathTick = snap.tick; this.deathTickPending = false; }   // B138: no tick heard at the death
    if (this.snaps.length > SNAPSHOTS) this.snaps.shift();
    // HARD-FLOOD (research 169 measure 8): a watcher sends no commands, so its snapshots carry the player's 2 s ping up
    // -- the room closes a watcher that sends nothing for its idle time (`Room.idle`). A transport keep-alive, no original.
    if (this.role !== 'player' && this.state === 'open') {
      const now = performance.now();
      if (now - this.lastPing > 2000) { this.lastPing = now; this.send({ type: 'ping', t: now }); }
    }
    // Protocol 10 (MAP-03): the room's world first, then the correction against it. Protocol 11 (NET-WIRE): only a
    // snapshot whose environment changed for this connection names it; one without keeps the page's last.
    if (snap.env) this.takeEnv(snap.env, false);
    if (snap.own && this.pendingSpawn) this.retrySpawn([snap.own.x, snap.own.y, snap.own.z]);   // LATER 496
    else if (snap.own) this.reconcile(snap.own.ack, [snap.own.x, snap.own.y, snap.own.z], snap.own.facing);
  }

  /** The round epoch this page is in (the welcome's, a round start's, or a newer snapshot's); null before the welcome. */
  private epoch: number | null = null;
  /** PF-40: the welcome's game type (`gameType`), or null. */
  private type: GameType | null = null;

  /**
   * An environment from the room: one of an older round than the page's (`epochNewer`: a snapshot overtaken by the
   * round's start) is not applied; else laid on the world -- silently for the welcome's (JOIN_SILENT_READING),
   * with its effects after. One of a LATER round than the page's (its `roundStart` not yet
   * heard: the latency injector's jitter) means the round boundary has passed: the page's round reset runs first
   * (`newEpoch`), silently, and the snapshot's state is then laid on the reset world. NET-WIRE's review (protocol 11
   * names the environment once a change, and the injector's jitter can reorder two snapshots): within the page's epoch a
   * snapshot's environment no newer than the one held (`revisionNewer`) is dropped; only a taken one is `env()`'s.
   */
  private takeEnv(env: EnvWire, welcome: boolean): void {
    if (this.epoch !== null && epochNewer(this.epoch, env.epoch)) return;
    const held = this.lastEnv;
    if (!welcome && held && this.epoch === (env.epoch & 0xffff) && !revisionNewer(env.revision, held.revision)) return;
    if (this.epoch === null) this.epoch = env.epoch & 0xffff;
    else this.newEpoch(env.epoch);
    // Protocol 11: the room names no environment the welcome already gave (`Room.envSent`), and a repeat of the held
    // revision is dropped above -- so the joiner's silent one is the first this socket takes (the welcome's, or a snapshot's
    // that the injector's jitter delivered before it) and every one named after it is a change.
    const silent = welcome || this.namedEnv === null;
    this.lastEnv = env;
    this.namedEnv = env;
    const world = this.worldNow();
    if (world) applySnapshotWorld({ env }, world, JOIN_SILENT_READING && silent);
  }

  /** The environment last taken (the welcome's or a snapshot's, of the page's round): what `setWorld` lays on at once. */
  private lastEnv: EnvWire | null = null;
  /** `setWorld`'s world, which replaces the options' `world` once set (null inside: none). */
  private handedWorld: { get: (() => WorldState | null) | null } | null = null;
  /** The page's world now: the one handed by `setWorld`, else the options' (`NetOptions.world`). */
  private worldNow(): WorldState | null {
    return (this.handedWorld ? this.handedWorld.get?.() : this.opts.world?.()) ?? null;
  }

  /**
   * MATCH-GAPS review round (web research 222 §9): the world a client opened without one follows from here -- the game
   * lobby's client (`../gameLobbyHost`), adopted by the front end's match (`NetPageDeps.game.adopt`). The room's world as
   * this client last took it is laid on at once, silently (the adopting page is a joiner to it: JOIN_SILENT_READING),
   * then every snapshot's environment and every new epoch's reset (`takeEnv`, `newEpoch`) reach it. Null: none (the
   * match's end, `NetPage.release`, hands the client back to a lobby that has no world).
   */
  setWorld(world: (() => WorldState | null) | null): void {
    this.handedWorld = { get: world };
    const w = this.worldNow();
    if (w && this.lastEnv) applySnapshotWorld({ env: this.lastEnv }, w, JOIN_SILENT_READING);
  }

  /**
   * The page's round boundary, in one place: a round epoch later than the page's -- a `roundStart`'s (`../netPage`), or a
   * snapshot's that overtook it (`takeEnv`) -- becomes the page's, and the page's world is reset as the room's
   * `startRound` resets its own (`WorldState.reset`, `FUN_002ac0e0`: no effect played). True then; false for an epoch
   * not later (the round start after a snapshot that already crossed the boundary does nothing more).
   */
  newEpoch(epoch: number): boolean {
    if (this.epoch !== null && !epochNewer(epoch, this.epoch)) return false;
    this.epoch = epoch & 0xffff;
    this.lastEnv = null;                               // the round's opening state: nothing of the last round to lay on
    this.worldNow()?.reset();
    return true;
  }

  /** The round epoch the page is in, or null before the welcome. */
  roundEpoch(): number | null {
    return this.epoch;
  }

  /**
   * PF-40 (research 210 s4): the room's game type, the welcome's `gameType` (protocol 10, MAP-03; the server's
   * `SimMap.gameType` off `missionlist.rdr`, research 192 s1); null before a welcome, or from a room whose map's type the
   * server did not read (SUPPRESSION's rules, `./rules` `modeRules`). Read by the page (`NetPage.gameType`); nothing on
   * it keys on the type yet -- the room plays the rules and sends their results.
   */
  gameType(): GameType | null {
    return this.type;
  }

  private event(ev: ServerEvent): void {
    switch (ev.type) {
      case 'welcome':
        this.id = ev.id; this.seatName = ev.name; this.role = ev.role; this.team = ev.team; this.queue = ev.queue;
        this.eqLimit = equipmentLimit(ev.eqLimit);
        // Protocol 10: this socket's round and world (a client is one socket: a rejoin is a new client, `NetPage`).
        // NET-WIRE's independent review (finding 2): under the injector's jitter a snapshot sent after the welcome can land
        // before it; a welcome no newer than the environment this socket already took (`envNewer`: the epoch, then the
        // revision) keeps that environment and its round -- the room never names it again -- while the rest applies.
        if (!(ev.env && this.namedEnv && !envNewer(ev.env, this.namedEnv))) {
          this.epoch = typeof ev.epoch === 'number' ? ev.epoch & 0xffff : null;
          if (ev.env) this.takeEnv(ev.env, true);
        }
        this.type = ev.gameType ?? null;                // PF-40: the room's mode, a new socket's own
        this.welcomed = true;
        if (this.lateLoadOwed && !this.lateLoadSent) { this.lateLoadOwed = false; this.lateLoadSent = true; this.send({ type: 'lateLoad' }); }   // LATER 64's review F4
        if (this.loadedOwed) { this.loadedOwed = false; this.send({ type: 'loaded' }); markLoad('loaded-sent'); }   // ONL-18b: `reportLoaded`; IP3's mark
        // LOW-3 (research 223 s6): a load reported on a dropped socket, the room still holding round 1 for it; and (NET-RES.R8,
        // RC0) to a round in any phase, every rule and role -- the room publishes a fresh late respawn seat dead at load
        // (VRJ-1) and ignores the rest. Never to the lobby ('waiting').
        else if (this.opts.loaded === true && ev.phase !== undefined && LAUNCHED_PHASES.has(ev.phase)) { this.send({ type: 'loaded' }); markLoad('loaded-sent'); }
        break;
      case 'refused': this.state = 'refused'; this.refusal = { reason: ev.reason, map: this.opts.map }; break;
      case 'queue': this.queue = ev.position; break;
      case 'renamed': if (ev.id === this.id) this.seatName = ev.name; break;   // OBF-3: the seat's own name, kept
      case 'promoted': this.role = 'player'; this.team = ev.team; this.queue = 0; break;
      // MENU-SIDE (the owner's playtest of main 50a98582c): a game seat's side is its own seat in the bridge's view, as
      // the lobby's `player_team` is (`@s2u/ui` `GameLobbyCommands.gameLobby`) -- SWITCH TEAMS re-seats the switcher
      // (`Room.switchTeam`, `FUN_002c4290` D:L165538-165568) and tells it so only here (`left` and `joined` go to the
      // others). Set before the listeners hear the view: the lobby's hand-off, made on it, hands on the side it names.
      case 'gameLobby': {
        this.eqLimit = equipmentLimit(ev.eqLimit);
        const seat = this.role === 'player' && this.welcomed ? ev.seats.find((s) => s.id === this.id) : undefined;
        if (seat?.team) this.team = seat.team;
        break;
      }
      // Protocol 5 (PL-8): moved out for idling -- a spectator's role: no commands go up, the mover is held.
      case 'demoted': this.role = 'spectator'; this.team = null; this.queue = ev.position; this.alive = false; this.walk.setLocked(true); break;
      case 'pong': this.rtt = performance.now() - ev.t; break;
      case 'spawn':
        if (ev.id === this.id) this.spawned(ev.at, ev.yaw, ev.after);
        else this.markSpawn(ev.id);                     // NU-12 B2: another seat's, counted on the bodies drawn
        break;
      case 'kill':
        if (ev.victim === this.id) { this.loadDeathAt = null; this.loadDeathPose = null; this.alive = false; this.walk.setLocked(true); this.markedDead = true; this.walk.setDead?.(true); this.markDeathTick(); }
        break;
      case 'deadAtLoad':
        if (ev.id === this.id && this.role === 'player') {
          this.loadDeathAt = performance.now() - Math.max(0, ev.age ?? 0) / TICK_HZ * 1000;
          this.markDeathTick(ev.age ?? 0);
          this.loadDeathPose = ev.at && ev.yaw !== undefined ? { at: [...ev.at], yaw: ev.yaw } : null;
          this.placeLoadDeath();
          this.alive = false; this.walk.setLocked(true); this.markedDead = true; this.walk.setDead?.(true);
        }
        break;
      case 'kicked': this.walk.setLocked(true); break;
      // OT.R59 (RECONNECT-GHOST): the room handed this page's seat back alive.
      case 'resume': if (ev.id === this.id) this.resumed(ev); break;
      // The server laid a knock on its mover after command `ev.after` (`FUN_0057e770` on that frame, research 85 §12).
      // The walk replays from the kept mover there when it still has it, and then the predictions after it are the run's.
      case 'blast':
        if (ev.knock && this.alive) this.walk.knock?.(ev.knock, ev.after, (after) => this.replayed(after));
        break;
      // INT.R5: a playtest instrument's report, kept for the playtest report only; nothing in the match reads it.
      case 'combat':
        this.combats.push(ev);
        if (this.combats.length > COMBAT_REPORT_RING) { this.combats.shift(); this.combatsDropped++; }
        break;
      // NU-3c: another seat's part bytes, kept for the reticle's bar (`healthOf`); a malformed one is not kept.
      case 'health': { const parts = partHealthWire(ev.parts); if (parts) this.partHealth.set(ev.id, parts); break; }
      case 'left': this.partHealth.delete(ev.id); break;
      // AD-14: its own channel's count -- a channel of the twelve (0..11, R170.2; the server's `VOICE_CHANNEL_MAP_READING`),
      // a count not below 0; a malformed one is not kept.
      case 'voiceMembers':
        if (Number.isInteger(ev.channel) && ev.channel >= 0 && ev.channel <= 11 && Number.isInteger(ev.members) && ev.members >= 0) {
          this.voiceMembers = { channel: ev.channel, members: ev.members };
        }
        break;
      // LATER 362: the room's pick for a door's use, for the page's next followed swing (`takeDoorPicks`).
      case 'doorUse':
        if (Number.isInteger(ev.door) && (ev.pick === 0 || ev.pick === 1)) { this.doorPicks.push({ door: ev.door, pick: ev.pick }); if (this.doorPicks.length > 64) this.doorPicks.shift(); }
        break;
      default: break;
    }
    for (const l of this.listeners) l(ev);
  }

  /** LATER 362: the room's door picks (`doorUse`) since the last call, oldest first. */
  takeDoorPicks(): { door: number; pick: 0 | 1 }[] {
    return this.doorPicks.splice(0);
  }
  private readonly doorPicks: { door: number; pick: 0 | 1 }[] = [];

  /**
   * The combat reports this client kept (INT.R5, research 127 §5): the last `COMBAT_REPORT_RING`, oldest first, and how
   * many older ones were let go -- a copy, for the playtest report. Empty while the room's option is off.
   */
  combatReport(): { events: CombatReport[]; dropped: number } {
    return { events: [...this.combats], dropped: this.combatsDropped };
  }

  /**
   * NU-3c (research 321 section 4.2.1): another seat's health as the reticle's bar reads it, 0..1 -- `partHealthOf` over
   * the bytes the room last sent (`FUN_002be150` -> `FUN_005a5790`, then `FUN_005a56d0`) -- or null when the room has
   * sent none for it: a seat never sent (an enemy's, `TEAM_HEALTH_RECIPIENTS_ADAPTATION`). A former teammate's last bytes
   * are kept after a switch of sides or a promotion until its `left` (never drawn: `reticleTargetState` gives a bar to a
   * teammate only); clearing them on a side change would leave a switch back with unchanged bytes never re-sent.
   */
  healthOf(id: number): number | null {
    const parts = this.partHealth.get(id);
    return parts ? partHealthOf(parts) : null;
  }

  /**
   * PAR-37 (research 251 section 9): the walk ran the commands after `after` again (a victory dance heard after them, run
   * under it: `WalkMode.syncVictoryMotion`) -- their predictions are the run's now, not compared, as a respawn's replayed
   * ones are (`spawned`); the next snapshots past them are.
   */
  replayed(after: number): void {
    for (const h of this.history) if (h.cmd.seq > after) { h.feet = null; h.facing = null; }
    // LATER 528 (LATER 526's review F2): a correction still being spread that was found past `after` was found against a
    // prediction the run has replaced (a refused take's wait: the hold's place, which the room's body on foot never had,
    // `WalkMode.mountUntake`), so it is dropped -- else it goes on nudging the run's body off the room's. One found at or
    // before `after` stands: the run started from the state the part already spread moved (`WalkMode.nudge`), and the
    // rest still follows it. Where two were merged, the newer's command decides (`correctionAck`).
    if (this.correctionTicks > 0 && this.correctionAck > after) { this.correction = [0, 0, 0]; this.correctionTicks = 0; }
  }

  /**
   * LATER 496 (a browser adaptation: the original's spawn rebuild `FUN_00599b60` D:L455604 has no refusal): a spawn the
   * walk refused (`WalkMode.respawn` false: no floor at the room's point in the page's ground grid), retried at the room's
   * own feet on each own-body snapshot (`retrySpawn`) until one holds; meanwhile the walk stays locked and dead.
   */
  private pendingSpawn: { yaw: number; after: number } | null = null;

  /**
   * LATER 496: a spawn the walk refused (the page's own case, see `pendingSpawn`): the player stays down and locked -- not
   * alive, so nothing it predicts is compared -- and the room's next own-body snapshot retries it at the room's feet.
   */
  private holdSpawn(yaw: number, after: number): void {
    this.alive = false;
    this.markedDead = true;
    this.walk.setDead?.(true);
    this.walk.setLocked(true);
    this.pendingSpawn = { yaw, after };
  }

  /** LATER 498's review F1: the commands the last spawn replays after (`spawned`'s `after`), for a hold at `rebind`. */
  private lastSpawnAfter = 0;

  /** LATER 498: whether a spawn the walk refused waits for the room's next own-body snapshot (`retrySpawn`). */
  spawnPending(): boolean { return this.pendingSpawn !== null; }

  /** LATER 498: `fn` when a held spawn stands at last (`retrySpawn`): the page's own spawn handling, held till then. */
  onSpawnHeld(fn: () => void): () => void {
    this.spawnHeldListeners.add(fn);
    return () => this.spawnHeldListeners.delete(fn);
  }
  private readonly spawnHeldListeners = new Set<() => void>();

  /** The server stood the mover somewhere: a new mover there, the commands after `after` replayed on it. */
  private spawned(at: readonly [number, number, number], yaw: number, after: number): void {
    this.loadDeathAt = null;
    this.clearDeathTick();
    this.loadDeathPose = null;
    this.pendingSpawn = null;
    const replay = this.history.filter((h) => h.cmd.seq > after).map((h) => h.cmd);
    this.alive = true;
    this.lastSpawn = { at, yaw };
    this.walk.setLocked(false);
    this.markedDead = false;
    this.walk.setDead?.(false, { keepDeath: true });               // LATER 496: kept only for a refused respawn
    // LATER 498: held only where the walk has ground (a ground-less walk's false is no refused point).
    this.lastSpawnAfter = after;
    if (!this.walk.respawn(at, yaw, replay) && this.walk.grounded?.() !== false) { this.holdSpawn(yaw, after); return; }
    this.spawnedAfter(after);
  }

  /**
   * LATER 496: a refused spawn retried at the room's feet (`server`, the own body's snapshot), with the commands after the
   * spawn's `after` replayed as `spawned` does; once it holds the walk is unlocked and alive, as at a first-call spawn.
   * Never at all where the page's grid has no floor at the room's feet: the player stays locked (LATER 496's residue).
   */
  private retrySpawn(server: readonly [number, number, number]): void {
    const p = this.pendingSpawn;
    if (!p) return;
    const replay = this.history.filter((h) => h.cmd.seq > p.after).map((h) => h.cmd);
    if (!this.walk.respawn(server, p.yaw, replay)) return;
    this.pendingSpawn = null;
    this.alive = true;
    this.lastSpawn = { at: server, yaw: p.yaw };
    this.markedDead = false;
    this.walk.setDead?.(false);
    this.walk.setLocked(false);
    this.spawnedAfter(p.after);
    for (const fn of [...this.spawnHeldListeners]) fn();      // LATER 498: the page's held spawn handling
  }

  /** What follows a spawn the walk stood (`spawned`, `retrySpawn`): its replayed predictions and the shadow gate new. */
  private spawnedAfter(after: number): void {
    // The replayed ticks' predictions are the new mover's now: they are not compared (the next snapshots are). Nor is
    // the one at `after` itself: a snapshot taken in the spawn's tick acks it with the new mover's feet.
    for (const h of this.history) if (h.cmd.seq >= after) { h.feet = null; h.facing = null; }
    this.shadow = new LookGate();                       // a new mover: its gate new (NET-WIRE's shadow, `shadowStep`)
    this.shadowLog.clear();
    this.shadowRef = null;
    this.correction = [0, 0, 0];
    this.correctionTicks = 0;
  }

  /**
   * OT.R59 (RECONNECT-GHOST, a labelled adaptation): the room handed this page's seat back alive (`resume`). The walk is
   * stood where the room's body stands, in its posture, its firearm and launcher in the hand (`NetWalk.resume`: no
   * respawn, no spawn's reset), so the first snapshot is no hard correction and the first command no swap; unlocked and
   * alive. The commands number on from the room's count (never below this client's own), and those sent before it,
   * which the room never ran, are forgotten. RESUME-MOUNTED: alive, and unlocked unless it holds a turret (`turret`).
   */
  private resumed(ev: Extract<ServerEvent, { type: 'resume' }>): void {
    // OBF-20 (the review's F1): the Chat menu's sends number on from the room's last taken, as the commands from `seq`.
    this.floors.taunt = Math.max(this.floors.taunt, ev.taunt ?? 0);
    this.floors.communication = Math.max(this.floors.communication, ev.communication ?? 0);
    this.pendingSpawn = null;                                   // LATER 496: the room's resume stands the seat instead
    this.loadDeathPose = null;
    this.clearDeathTick();
    this.seq = Math.max(this.seq, ev.seq);
    this.history.length = 0;
    this.alive = true;
    this.markedDead = false;
    this.lastSpawn = { at: ev.at, yaw: ev.yaw };
    this.lastSpawnAfter = this.seq;                              // LATER 498: the resume's commands start here
    this.correction = [0, 0, 0]; this.correctionTicks = 0;
    this.shadow = new LookGate(); this.shadowLog.clear(); this.shadowRef = null;
    if (this.opts.watch || this.released) return;
    // The review's F3: a walk that could not stand it at once is respawned there, then given the posture and the firearm.
    if (!this.walk.resume?.(ev.at, ev.yaw, ev.posture, ev.weapon, ev.held)) {
      this.walk.respawn(ev.at, ev.yaw, []);
      this.walk.resume?.(ev.at, ev.yaw, ev.posture, ev.weapon, ev.held);
    }
    this.walk.setNetTap((cmd, feet, facing) => this.tick(cmd, feet, facing), this.seq);
    this.walk.setDead?.(false);
    // RESUME-MOUNTED (OT.R59's follow-up): a seat resumed on a turret stays locked -- the turret page's hold (`TurretPage`
    // re-applies it from this event), as the room holds the body; unmounted (or an older room's resume), unlocked.
    this.walk.setLocked((ev.turret ?? null) !== null);
  }

  /**
   * The server ran up to `ack` and left the mover at `server`; the page predicted `feet` there. The difference is
   * the correction: carried by every later prediction, and applied to the mover now (snapped) or over
   * `SMOOTH_TICKS` (smoothed).
   */
  private reconcile(ack: number, server: [number, number, number], facing?: { yaw: number; pitch: number }): void {
    const i = this.history.findIndex((h) => h.cmd.seq === ack);
    if (i < 0) return;
    if (facing) this.reconcileFacing(i, facing);
    this.reconcileFeet(i, server);
  }

  /**
   * Protocol 11 (NET-WIRE; NET-LOOK's design call, research 223 §8; research 224 §4): the room's facing after command
   * `i` against the page's prediction there -- the yaw the short way round, the pitch plainly. Past `FACING_FLOOR_DEG`
   * the walk lays the room's facing on its mover and REPLAYS every later command's look through the look gate from it
   * (`NetWalk.reconcileFacing`; the independent review of 2026-10-08: the gate slews toward each command's absolute look,
   * so one offset on every later prediction is not what the commands give once a turn stops or reverses), and the later
   * predictions take the replayed facings. Never spread: the gate's next step starts from the facing. The camera is not
   * moved. A walk with no record falls back to the client's shadow (`shadowStep`: the open context, no held move, no
   * stance limits), its mover turned to where the replay ends (`nudgeFacing`); only when the shadow holds no step of
   * the command either (a life's first command, or the page dead since the ack) is the error laid as one offset on every later prediction and on
   * the walk (`nudgeFacing`), the last resort.
   */
  private reconcileFacing(i: number, facing: { yaw: number; pitch: number }): void {
    const h = this.history[i]!, at = h.facing;
    if (!at) return;
    const ey = shortTurn(at[0], facing.yaw), ep = facing.pitch - at[1];
    const size = Math.max(Math.abs(ey), Math.abs(ep));
    if (size < FACING_FLOOR_DEG) return;
    this.corrections.facing++;
    this.corrections.largestFacing = Math.max(this.corrections.largestFacing, size);
    const replayed = this.walk.reconcileFacing?.(h.cmd.seq, { yaw: facing.yaw, pitch: facing.pitch }) ?? null;
    if (replayed) {
      at[0] = facing.yaw; at[1] = facing.pitch;
      for (let k = i + 1; k < this.history.length; k++) {
        const f = this.history[k]!.facing, r = replayed.get(this.history[k]!.cmd.seq);
        if (f && r) { f[0] = r[0]; f[1] = r[1]; }
      }
      return;
    }
    // A walk that keeps no record of its gate: the client's shadow replays the commands (the open context, no held move,
    // no stance limits) and the walk's mover is turned to where the replay ends.
    const now = this.lastFacing();
    const shadow = now ? this.shadowLog.replay(h.cmd.seq, facing, this.shadow) : null;
    if (now && shadow) {
      this.shadow = shadow.gate;
      this.shadowRef = { yaw: shadow.ref.yaw, pitch: shadow.ref.pitch };
      at[0] = facing.yaw; at[1] = facing.pitch;
      for (let k = i + 1; k < this.history.length; k++) {
        const f = this.history[k]!.facing, r = shadow.facings.get(this.history[k]!.cmd.seq);
        if (f && r) { f[0] = r[0]; f[1] = r[1]; }
      }
      this.walk.nudgeFacing?.(shortTurn(now[0], shadow.ref.yaw), shadow.ref.pitch - now[1]);
      return;
    }
    // The last resort, when neither record holds the command's step (the shadow steps from the facing after the tick
    // before, so a life's first command has none; or the newest command carries no facing, the page dead since): one
    // offset -- after it that command's prediction is the room's, so a later snapshot of the same ack corrects nothing.
    for (let k = i; k < this.history.length; k++) {
      const f = this.history[k]!.facing;
      if (f) { f[0] = wrapYaw(f[0] + ey); f[1] += ep; }
    }
    this.walk.nudgeFacing?.(ey, ep);
  }

  /**
   * The server ran up to command `i` and left the mover at `server`; the page predicted `feet` there. The difference is
   * the correction: carried by every later prediction, and applied to the mover now (snapped) or over `SMOOTH_TICKS`
   * (smoothed).
   */
  private reconcileFeet(i: number, server: [number, number, number]): void {
    const at = this.history[i]!;
    if (!at.feet) return;
    const e: [number, number, number] = [server[0] - at.feet[0], server[1] - at.feet[1], server[2] - at.feet[2]];
    const size = Math.hypot(e[0], e[1], e[2]);
    // The error is taken out of every prediction from `ack` on (they all stood on the wrong place).
    for (let k = i; k < this.history.length; k++) {
      const f = this.history[k]!.feet;
      if (f) { f[0] += e[0]; f[1] += e[1]; f[2] += e[2]; }
    }
    if (size < CORRECTION_FLOOR) return;
    this.corrections.largest = Math.max(this.corrections.largest, size);
    if (size > SNAP_DISTANCE) {
      this.corrections.snapped++;
      this.walk.nudge(e[0], e[1], e[2], at.cmd.seq);
      return;
    }
    this.corrections.small++;
    this.correction = [this.correction[0] + e[0], this.correction[1] + e[1], this.correction[2] + e[2]];
    this.correctionTicks = SMOOTH_TICKS;
    this.correctionAck = at.cmd.seq;
  }

  /**
   * NET-WIRE's independent review (research 224 §4): the client's own record of the look gate's steps, for a walk that
   * keeps none (`NetWalk.reconcileFacing` absent): a shadow gate stepped on each sent command from the facing the walk
   * reported after the tick before (the open context: a walk with a scope's or a stance's limits keeps its own record,
   * as `WalkMode` does). The page's prediction is the walk's; the shadow only replays it at a correction.
   */
  private shadow = new LookGate();
  private readonly shadowLog = new LookLog();
  private shadowRef: { yaw: number; pitch: number } | null = null;
  private shadowStep(cmd: Command, facing: readonly [number, number] | null): void {
    if (!facing) { this.shadowRef = null; return; }
    if (this.shadowRef) {
      this.shadowLog.record(cmd.seq, this.shadow, cmd, OPEN_LOOK_CONTEXT, false, null);
      this.shadow.step(this.shadowRef, cmd, OPEN_LOOK_CONTEXT, false, null);
    }
    this.shadowRef = { yaw: facing[0], pitch: facing[1] };
  }
  /** The newest predicted facing (the walk's after its last tick), or null. */
  private lastFacing(): [number, number] | null {
    const f = this.history[this.history.length - 1]?.facing;
    return f ? [f[0], f[1]] : null;
  }

  private applyCorrection(): void {
    if (this.correctionTicks <= 0) return;
    const f = 1 / this.correctionTicks;
    const step: [number, number, number] = [this.correction[0] * f, this.correction[1] * f, this.correction[2] * f];
    this.walk.nudge(step[0], step[1], step[2], this.correctionAck);
    this.correction = [this.correction[0] - step[0], this.correction[1] - step[1], this.correction[2] - step[2]];
    this.correctionTicks--;
  }

  // ---- the clock and the others ----

  /** The server's tick now, as the newest snapshot and the time since it came say. */
  serverTick(now = performance.now()): number {
    const last = this.snaps[this.snaps.length - 1];
    return last ? last.snap.tick + ((now - last.at) / 1000) * TICK_HZ : 0;
  }

  /** The tick the others are drawn at: `INTERP_DELAY_MS` behind the server (what a shot's rewind asks for). */
  viewTick(now = performance.now()): number {
    return Math.max(0, this.serverTick(now) - (INTERP_DELAY_MS / 1000) * TICK_HZ);
  }

  /**
   * Every other body at the view tick: the feet, yaw and pitch between the two snapshots around it; the rest from the
   * newer. A body missing from the newer snapshot is gone; with nothing newer yet, the newest is held.
   * NU-12 B2 (research 328 §4.3 D5-D6, §5 B2; the build brief's F3): each body carries its seat's spawns the drawn
   * (newer) snapshot is past (`spawns`, `markSpawn`) -- `RemotePlayers` rebuilds the copy at a change -- and a body
   * spawned between the two snapshots is drawn whole from the newer, its feet not lerped from where it lay or stood:
   * the original places the rebuilt copy at its record (`FUN_00598b90` D:L455245-455324). Was: lerped across it.
   */
  bodies(now = performance.now()): (BodyState & { spawns?: number })[] {
    const n = this.snaps.length;
    if (!n) return [];
    const t = this.viewTick(now);
    let b = n - 1;
    while (b > 0 && this.snaps[b - 1]!.snap.tick > t) b--;
    const newer = this.snaps[b]!.snap, older = b > 0 ? this.snaps[b - 1]!.snap : null;
    const counted = (x: BodyState): BodyState & { spawns: number } => ({ ...x, spawns: this.spawnsAt(x.id, newer.tick) });
    if (!older || newer.tick <= t) return newer.bodies.map(counted);
    const f = Math.max(0, Math.min(1, (t - older.tick) / (newer.tick - older.tick)));
    const before = new Map(older.bodies.map((x) => [x.id, x]));
    return newer.bodies.map((x) => {
      const o = before.get(x.id);
      const spawns = this.spawnsAt(x.id, newer.tick);
      if (!o || spawns !== this.spawnsAt(x.id, older.tick)) return { ...x, spawns };   // NU-12 D6: spawned between them
      const turn = shortTurn(o.yaw, x.yaw);
      return {
        ...x, spawns,
        feet: [o.feet[0] + (x.feet[0] - o.feet[0]) * f, o.feet[1] + (x.feet[1] - o.feet[1]) * f, o.feet[2] + (x.feet[2] - o.feet[2]) * f],
        yaw: wrapYaw(o.yaw + turn * f), pitch: o.pitch + (x.pitch - o.pitch) * f,
      };
    });
  }

  /**
   * NU-12 B2: each other seat's `spawn` events (the room's, `room.ts` `spawn`, broadcast for every seat at a round's start,
   * a respawn, `abandon` and `rebuildWaiting`), each marked with the newest snapshot tick in hand when it came -- the room
   * sends a spawn before the snapshot that first has its body (its `clock()` before `snapshots()`; JSON and binary on
   * one ordered socket: `packages/central/test/roomSpawnOrder.test.ts`), so the snapshots past the mark draw the spawned
   * body -- and how many came before the marks kept (a mark older than every snapshot held counts for all of them).
   */
  private readonly spawnMarks = new Map<number, { before: number; ticks: number[] }>();
  private markSpawn(id: number): void {
    const m = this.spawnMarks.get(id) ?? { before: 0, ticks: [] };
    m.ticks.push(this.snaps[this.snaps.length - 1]?.snap.tick ?? -1);
    const oldest = this.snaps[0]?.snap.tick ?? -Infinity;
    while (m.ticks.length > 1 && m.ticks[0]! < oldest) { m.ticks.shift(); m.before++; }
    this.spawnMarks.set(id, m);
  }
  /** Seat `id`'s spawns the snapshot at `tick` is past (0 for a seat whose spawn this client never heard). */
  private spawnsAt(id: number, tick: number): number {
    const m = this.spawnMarks.get(id);
    return m ? m.before + m.ticks.filter((at) => at < tick).length : 0;
  }

  /** DOORS: the doors as the newest snapshot has them (`Snapshot.doors`), or undefined before one or on a map without. */
  doors(): DoorWire[] | undefined {
    return this.snaps[this.snaps.length - 1]?.snap.doors;
  }

  /**
   * P7 (`DOOR_PREDICT_ADAPTATION`): the last command the room had run for this seat as of the newest snapshot (its
   * `own.ack`, the snapshot `doors` reads), or null before one or with no own body in it.
   */
  acked(): number | null {
    return this.snaps[this.snaps.length - 1]?.snap.own?.ack ?? null;
  }

  /**
   * P8's review F1 (`GATE_PREDICT_ADAPTATION`): the room's tick of the newest snapshot (`Snapshot.tick`), or null before
   * one -- the room's own clock, which a stall's burst of commands does not run ahead as it runs `acked`.
   */
  heardTick(): number | null {
    return this.snaps[this.snaps.length - 1]?.snap.tick ?? null;
  }

  /** Chain Reaction's hooks as the newest snapshot has them (`Snapshot.cranes`), or undefined on a map without. */
  cranes(): CraneWire[] | undefined {
    return this.snaps[this.snaps.length - 1]?.snap.cranes;
  }

  /**
   * Protocol 10 (MAP-03): the room's world as the room last named it -- the welcome's, or the newest snapshot that carried
   * one (protocol 11, NET-WIRE: a snapshot names it only when its revision or epoch changed) -- or undefined before one.
   */
  env(): EnvWire | undefined {
    return this.namedEnv ?? undefined;
  }
  /** The environment the room last named (the welcome's or a snapshot's), whatever its round: `env()`. */
  private namedEnv: EnvWire | null = null;

  /** The snapshot rate seen over the kept snapshots, a second's worth (the metrics' check on W3.R10). */
  snapshotRate(): number {
    const n = this.snaps.length;
    if (n < 2) return 0;
    const span = (this.snaps[n - 1]!.snap.tick - this.snaps[0]!.snap.tick) / TICK_HZ;
    return span > 0 ? (n - 1) / span : SNAPSHOT_HZ;
  }
}
