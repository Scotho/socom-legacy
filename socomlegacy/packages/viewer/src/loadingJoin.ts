import { LOAD_STATE_FADE_SECONDS } from '@s2u/ui/loading';
import type { OnlineStatus } from './online';

/** Browser adaptation: do not expose a partially prepared scene or enter before the room's welcome.
 * The completion hold follows FUN_001f5e70 D:L55748-55762 (research 125), not a minimum total load time.
 * Timing is reading, pending independent review. The requested 5–7 seconds awaits Craig's ruling (HUMAN_TASKS H88).
 */

/**
 * What the page knows of each lane on a frame (`./main` fills it; nothing here reads the page):
 * - `scene`: the map's world warm-up (`warmScene`): done, failed (its rejection is surfaced where `main` surfaces it) or pending.
 * - `play`: the worker's answer to the play request: clips, `none` (no `MOTION_P.ZAR`: the bind pose) or pending.
 * - `walkWarmed`: the walk's own warm-up ran (it always ends, its failure caught).
 * - `armory`: its data in and a context made (`ready`), its data in with no context (`none`), not asked (`off`), pending.
 * - `effects`, `sound`: the map's answers came (the worker answers them even when parts will not read).
 * - `url`: a server is named; `net`: the state of the net client made for THIS load (`OnlineStatus`), `unasked` while
 *   no client has been attempted for it (until `show` calls `connectNet`, once the decoded map is back -- a previous
 *   load's client never answers for this one), null when this load's attempt could not make one (`pageLanes`).
 */
export interface JoinLanes {
  playOn: boolean;
  scene: 'done' | 'failed' | 'pending';
  play: 'clips' | 'none' | 'pending';
  walkWarmed: boolean;
  armory: 'ready' | 'none' | 'off' | 'pending';
  effects: boolean;
  sound: boolean;
  url: boolean;
  /** The room's welcome (`online`) stands in for the game object's byte the original's completion waits on online
   * (`LOAD_NET_HOLD_READING`, research 125 §7-§8). */
  net: OnlineStatus['state'] | 'unasked' | null;
  /** The server's reason, when refused. */
  reason?: string;
  /**
   * LOAD-HOLD (research 322 (agent/parity-2 0d2d69644) §4.1 B1): the host's barrier has passed for this page
   * (`./lobbyMatch` `CLIENT_ROUND_WAIT_READING`: the original's load state leaves only on `+0x112` = 2, or `+0xcc` clear
   * and game state 3, `FUN_001f5e70` D:L55704-55707). With it the load reports itself when every other lane is in --
   * the loader's minor state 2 (D:L55699-55702) -- and holds on the barrier. ROUND1-COUNT: the barrier is the room's
   * round 1 (`roundStart`), which the room sends its 0.5 s after its own barrier (server `ROUND1_AFTER_BARRIER_S_READING`,
   * the host's count D:L55748-55755), so the page's own 0.5 s runs from the frame its other lanes are all in (the counter
   * zeroed at the load's end, D:L55657-55659 online, D:L55603-55604 offline) and the release is the later of that count's end and the barrier -- the
   * original's max(own load, host's barrier) + 0.5 s. Absent: the page has no barrier to wait on (`/testroom`'s maps'
   * room, whose round 1 is the owner's countdown, research 166 §3), and the report runs at the release, as ONL-18b built
   * it.
   */
  barrier?: boolean;
}
export type JoinLane = 'scene' | 'player' | 'armory' | 'effects' | 'sound' | 'connection' | 'barrier';
export type JoinVerdict = { state: 'ready' } | { state: 'waiting'; on: JoinLane[] } | { state: 'failed'; reason: string };

/**
 * The hold's verdict from the lanes (pure). A lane that cannot complete does not hold the screen:
 * - a refused join fails at once with its reason -- the original leaves the load state for `dlgNetError` /
 *   `dlgNetAbandoned` on its network failures (FUN_001f5e70 D:L55712-55744); the browser shows the map with the Online
 *   line saying why, as before the hold (a browser adaptation, research 125 §8);
 * - a named server whose client could not be made fails the same way; one not attempted yet for this load (`unasked`)
 *   waits on the connection;
 * - `retrying` -- the net client's own state after an attempt that got no answer -- ends the hold but not the
 *   connection: the map shows and the line keeps reporting (a browser adaptation: no time in the original's load
 *   state, research 125 §8);
 * - the play answer without clips, a failed world warm-up and an ARMORY with no context count as done.
 */
export function joinVerdict(l: JoinLanes, netOverdue = false): JoinVerdict {
  if (l.url) {
    if (l.net === 'refused') return { state: 'failed', reason: `refused: ${l.reason ?? 'by the server'}` };
    if (l.net === null || l.net === 'off') return { state: 'failed', reason: 'the match could not be joined' };
  }
  const on: JoinLane[] = [];
  if (l.scene === 'pending') on.push('scene');
  if (l.playOn && (l.play === 'pending' || !l.walkWarmed)) on.push('player');
  if (l.playOn && l.armory === 'pending') on.push('armory');
  if (!l.effects) on.push('effects');
  if (!l.sound) on.push('sound');
  if (l.url && l.net !== 'online' && l.net !== 'retrying' && l.net !== 'offline' && !(netOverdue && l.net === 'connecting')) on.push('connection');
  if (l.barrier === false) on.push('barrier');
  return on.length ? { state: 'waiting', on } : { state: 'ready' };
}

/**
 * LOAD_NET_HOLD_CEILING_PLACEHOLDER (seconds): the most the screen holds on this load's client while it is `connecting`
 * -- a server that opens the socket and never sends the welcome (the net client has no hello timeout; `retrying`
 * follows only a close). A **browser adaptation**: the original's load state has no timer; it leaves for its net error
 * screen (`dlgNetError`) when its net layer says so (`FUN_002b83e0`, `FUN_002c2fa0`, not read: research 125 §7-§8).
 * 20 s is the page's own choice -- four times the server's heartbeat sweep (`@s2u/match` `HEARTBEAT_MS`; a socket
 * is dropped 20-25 s after it stops answering, `PEER_SILENCE_MS_PLACEHOLDER`), so a live but slow server's welcome is
 * not cut short. Past it the screen
 * releases (after the completion hold) and the Online line keeps reporting the wait; the connection is not ended.
 */
export const LOAD_NET_HOLD_CEILING_PLACEHOLDER = 20;

/** What a frame did: nothing asked (`idle`), still covered (`hold`), the completion done (`released`), or let go on a failure (`failed`). */
export type JoinStep = 'idle' | 'hold' | 'released' | 'failed';

/**
 * MCW.R8 (the owner, 2026-10-24: the test room's extra loading delay removed, loading takes only actual preparation time):
 * the presentation hold is decided PER LOAD, never once per page. 0 only for an actual solo test-room load; a replay, a
 * network test room (a net client, a remembered or addressed Online, an open room ask) and every game mount keep the
 * original (LOAD_STATE_FADE_SECONDS, FUN_001f5e70). A browser adaptation of the solo instrument alone.
 */
export interface LoadKind {
  testroomPage: boolean;
  replay: boolean;
  netClientOnline: boolean;
  netUrl: boolean;
  roomOpen: boolean;
  networkAddress: boolean;
}
export function soloLoadHold(load: LoadKind): number | undefined {
  const solo = load.testroomPage && !load.replay && !load.netClientOnline && !load.netUrl && !load.roomOpen && !load.networkAddress;
  return solo ? 0 : undefined;
}

export class LoadingJoin {
  /** The page's default hold; `begin` may name another for ONE load (`soloLoadHold`). Instruments may construct with 0. */
  constructor(private readonly defaultHoldSeconds: number = LOAD_STATE_FADE_SECONDS) { this.completionHoldSeconds = defaultHoldSeconds; }
  private completionHoldSeconds: number;
  private request: number | null = null;
  private since: number | null = null;
  /** When this load's client was first seen `connecting` (LOAD_NET_HOLD_CEILING_PLACEHOLDER counts from it). */
  private connectingSince: number | null = null;
  /** The last failure's reason, for the page to show. */
  reason: string | null = null;
  /** ONL-18b: the load's report (the page's `loaded`), run once on the frame that releases it; dropped at a failure or the next `begin`. */
  private report: (() => void) | null = null;
  get blocked(): boolean { return this.request !== null; }
  /**
   * A load asked. `report` (ONL-18b, web research 221) runs once -- the page's `loaded`, the original loader's minor
   * state 2 reported to the host (`FUN_001f5e70` D:L55699-55702, `FUN_002c5360`) -- never twice, never for a load that
   * failed or was replaced. A load whose lanes carry the host's barrier (`JoinLanes.barrier`, LOAD-HOLD: the front end's
   * match, `./lobbyMatch`) reports on the first frame its other lanes are all in, as the original's loader does, and
   * then holds on the barrier; one without it (the test room, `./main`) reports on the frame that releases, never while
   * it holds. Both the front end's match and the test room release through here.
   */
  begin(id: number, report?: () => void, holdSeconds: number = this.defaultHoldSeconds): void {
    this.request = id; this.since = null; this.connectingSince = null; this.reason = null; this.report = report ?? null;
    this.completionHoldSeconds = holdSeconds;                  // this load's hold only; the next `begin` decides again
  }
  failed(id: number): void { if (id === this.request) { this.request = null; this.since = null; this.report = null; } }
  /**
   * `holdSeconds`: the load's kind read again this frame (`soloLoadHold`: 0 for a solo load, `undefined` for any other,
   * which means the default). The hold may only be PROMOTED mid-load (a solo load that goes online before it shows gets
   * the original's hold), never demoted.
   */
  frame(id: number, lanes: JoinLanes, seconds: number, holdSeconds?: number): JoinStep {
    if (id !== this.request) return 'idle';
    const want = holdSeconds ?? this.defaultHoldSeconds;    // `undefined` = not a solo load: the original's hold
    if (want > this.completionHoldSeconds) this.completionHoldSeconds = want;
    if (lanes.url && lanes.net === 'connecting') this.connectingSince ??= seconds;
    const overdue = this.connectingSince !== null && seconds - this.connectingSince > LOAD_NET_HOLD_CEILING_PLACEHOLDER;
    const verdict = joinVerdict(lanes, overdue);
    if (verdict.state === 'failed') { this.reason = verdict.reason; this.failed(id); return 'failed'; }
    if (verdict.state === 'waiting') {
      // LOAD-HOLD: every lane in but the host's barrier -- the page's own load is done, so it reports (D:L55699-55702);
      // ROUND1-COUNT: and its 0.5 s counts from here, the room's round 1 coming the host's 0.5 s after its barrier.
      if (verdict.on.length === 1 && verdict.on[0] === 'barrier') { this.since ??= seconds; this.reportOnce(); }
      else this.since = null;
      return 'hold';
    }
    this.since ??= seconds;
    if (lanes.barrier !== undefined) this.reportOnce();     // a barrier load reports at its lanes' end, before the 0.5 s
    if (this.completionHoldSeconds > 0 && seconds - this.since <= this.completionHoldSeconds) return 'hold';
    const report = this.report;
    this.failed(id);
    report?.();
    return 'released';
  }
  /** The load's report run now, and dropped so nothing runs it again (LOAD-HOLD's early report). */
  private reportOnce(): void { const report = this.report; this.report = null; report?.(); }
}

/**
 * The page's facts on a frame (`./main` reads them; nothing here reads the page). `load` is the wanted load's id; the
 * `loaded*` ids are the loads whose answers came; `netLoad` is the load whose map the current net client was attempted
 * for (`connectNet`), and `status` that client's (`NetPage.status`), null when there is none.
 */
export interface PageFacts {
  load: number;
  playOn: boolean;
  view: object | null;
  worldWarmed: object | null;
  worldWarmFailed: object | null;
  playAnswer: JoinLanes['play'];
  walkWarmed: boolean;
  noArmory: boolean;
  loadedArmory: number;
  armoryReady: boolean;
  loadedEffects: number;
  loadedSound: number;
  url: boolean;
  netLoad: number;
  status: Pick<OnlineStatus, 'state' | 'reason'> | null;
}

/**
 * The lanes from the page's facts (pure; review F1/F2 of the PR #10 carry). The connection: a client attempted for
 * another load (none yet on this one: `net` stays null until `show` calls `connectNet`; or the previous map's, whose
 * `refused` or `online` is not this load's) is `unasked`, so a named server holds on the connection lane; a client
 * attempted for this load answers with its state, or null when the attempt could not make one (`connectNet`'s catch).
 */
export function pageLanes(f: PageFacts): JoinLanes {
  const mine = f.netLoad === f.load;
  const net: JoinLanes['net'] = !mine ? 'unasked' : f.status ? f.status.state : null;
  const reason = mine ? f.status?.reason : undefined;
  return {
    playOn: f.playOn,
    scene: !f.view ? 'pending' : f.worldWarmed === f.view ? 'done' : f.worldWarmFailed === f.view ? 'failed' : 'pending',
    play: f.playAnswer,
    walkWarmed: f.walkWarmed,
    armory: f.noArmory || !f.playOn ? 'off' : f.loadedArmory !== f.load ? 'pending' : f.armoryReady ? 'ready' : 'none',
    effects: f.loadedEffects === f.load,
    sound: f.loadedSound === f.load,
    url: f.url,
    net,
    ...(reason ? { reason } : {}),
  };
}
