import type { FireEvent } from '../fire';
import type { NetClient } from './client';
import { TICK_HZ } from './protocol';

/** Browser transport adaptation extracted from NetPage. No renderer, pose or
 * firearm simulation is constructed here. Fire still owns the shared game rules;
 * the caller supplies its events and advances movement before flushing a press.
 */
export type FirearmWireClient = Pick<NetClient, 'state' | 'lastSeq' | 'send' | 'viewTick' | 'shownTick'> & {
  awaitingResume?(): boolean;
};
export interface FirearmWireDeps {
  client(): FirearmWireClient;
  sidearmId(): number;
  pressWindow?(until: number): void;
  staleRound?(shot: number): void;
  staleReload?(reload: number): void;
  /** Test clock only. Live claims use performance.now, never the round/replay clock. */
  now?(): number;
  /**
   * SHOT-LEDGER, an adaptation: a playtest instrument (B-16; it never changes the game). Told each round after its `fire`
   * is sent: its seq, the line it was sent on (`from`, the unit `dir`) and its reach (the weapon's `range`, else the
   * round's own length) -- for the page's own expectation (`../remotePlayers` `aimFirst`). Reads only.
   */
  sentRound?(seq: number, from: [number, number, number], dir: [number, number, number], reach: number): void;
}
type Round = Extract<FireEvent, { type: 'round' }>;

/** LOW-2 (research 223 s6): the existing bounded command journal, shared with throws. */
const STALE_MEMORY = 128;
export function rememberCommand<T>(map: Map<number, T>, seq: number, value: T): void {
  if (map.has(seq)) return; // Multiple pellet rays at one command spend one shell.
  map.set(seq, value);
  if (map.size > STALE_MEMORY) map.delete(map.keys().next().value!);
}

export class FirearmWire {
  /** PF-18 (research 218 section 2.1): last reload command, for flinch/knock rollback. */
  private reloadSeq_: number | null = null;
  get reloadSeq(): number | null { return this.reloadSeq_; }
  private readonly sentFires = new Map<number, number>();
  private readonly sentReloads = new Map<number, number>();
  /** LATER 347: a press before movement waits for its first trigger-bearing command.
   * Preserve the firing clock, not the later flush's clock. Otherwise the server's
   * shot cone starts the pull one round late and rejects longer bursts.
   */
  private readonly pressRounds: { client: FirearmWireClient; after: number; viewTick: number; shownTick: number | null; e: Round }[] = [];
  private triggerBit = false;
  constructor(private readonly deps: FirearmWireDeps) {}

  /** Called with walk.setTrigger before movement, and again after it. This does
   * not begin a client frame: the host retains its existing command-send order.
   */
  setTrigger(on: boolean): void { this.triggerBit = on; }
  clearPending(): void { this.pressRounds.length = 0; }
  /** The first command a `hand` event may be named at: never before this client's held press rounds (LATER 347; `flushPressRounds`). */
  handSeq(client: FirearmWireClient, seq: number): number {
    for (const h of this.pressRounds) if (h.client === client) seq = Math.max(seq, h.after + 1, h.e.seq ?? 0);
    return seq;
  }

  private sendRound(e: Round, viewTick: number, shownTick: number | null, seq: number): void {
    if (e.shot !== undefined) rememberCommand(this.sentFires, seq, e.shot);
    const d = [e.to[0] - e.from[0], e.to[1] - e.from[1], e.to[2] - e.from[2]];
    const length = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    // Protocol 5: the cone-adjusted eye ray as well as the muzzle's projectile ray.
    const eye = e.eye ?? e.from, aim = e.aim ?? [d[0]! / length, d[1]! / length, d[2]! / length];
    this.deps.client().send({ type: 'fire', seq, from: [...e.from], dir: [d[0]! / length, d[1]! / length, d[2]! / length],
      weapon: e.weapon.id === this.deps.sidearmId() ? 1 : 0, viewTick,
      eye: [eye[0], eye[1], eye[2]], aim: [aim[0]!, aim[1]!, aim[2]!],
      // LATER 1141 (protocol 19): the aim point the cone was rolled toward; a round without it is the eye's own.
      ...(e.at ? { at: [e.at[0], e.at[1], e.at[2]] as [number, number, number] } : {}),
      ...(shownTick !== null ? { shownTick } : {}) });
    // SHOT-LEDGER, an adaptation (B-16; it never changes the game): the round's line handed on, after it went.
    this.deps.sentRound?.(seq, [e.from[0], e.from[1], e.from[2]], [d[0]! / length, d[1]! / length, d[2]! / length], e.weapon.range ?? length);
  }

  /** NCW-17: sample both rewind values at one moment, including queued presses.
   * Separate clock reads could put shownTick above viewTick and fail validation.
   */
  private roundTicks(): { viewTick: number; shownTick: number | null } {
    const now = this.deps.now?.() ?? performance.now(), client = this.deps.client();
    return { viewTick: client.viewTick(now), shownTick: client.shownTick(now) };
  }

  flushPressRounds(): void {
    if (this.pressRounds.length === 0) return;
    const client = this.deps.client();
    if (client.state !== 'open') { this.clearPending(); return; }
    const sent = client.lastSeq();
    if (this.pressRounds.some(h => h.client === client && h.after >= sent)) return;
    // LATER 338: a held round keeps its own game-tick command if later than the press.
    for (const h of this.pressRounds.splice(0)) if (h.client === client) {
      this.sendRound(h.e, h.viewTick, h.shownTick, Math.max(h.after + 1, h.e.seq ?? 0));
    }
  }

  /** LATER 587 / FireSource.roundSeq: mirror the exact command the claim will name.
   * NCW-8(b): a closed or not-yet-resumed client cannot name a new shot.
   */
  roundSeq(own?: number): number | null {
    const client = this.deps.client();
    if (client.state !== 'open' || client.awaitingResume?.() === true) return null;
    if (!this.triggerBit || this.pressRounds.length > 0) return Math.max(client.lastSeq() + 1, own ?? 0);
    return own ?? client.lastSeq();
  }

  fireEvent(e: FireEvent): void {
    const client = this.deps.client();
    if (client.state !== 'open' || client.awaitingResume?.() === true) {
      if (e.type === 'reloadStart') this.reloadSeq_ = null;
      return;
    }
    if (e.type === 'round') {
      if (!this.triggerBit || this.pressRounds.length > 0) {
        this.pressRounds.push({ client, after: client.lastSeq(), ...this.roundTicks(), e });
        return;
      }
      const { viewTick, shownTick } = this.roundTicks();
      this.sendRound(e, viewTick, shownTick, e.seq ?? client.lastSeq());
    } else if (e.type === 'reloadPress') {
      // LATER 72 (research 313 section 8.3): the existing command-sized delay window.
      const seq = client.lastSeq(); client.send({ type: 'reloadPress', seq });
      this.deps.pressWindow?.(seq + Math.round(e.seconds * TICK_HZ));
    } else if (e.type === 'reloadStart') {
      const seq = client.lastSeq(); client.send({ type: 'reload', seq }); this.reloadSeq_ = seq;
      if (e.reload !== undefined) rememberCommand(this.sentReloads, seq, e.reload);
    }
  }

  /** LOW-2: undo exactly the named operation, once; never a later reload or each pellet. */
  stale(request: 'fire' | 'reload', seq: number): void {
    const sent = request === 'fire' ? this.sentFires : this.sentReloads, value = sent.get(seq);
    if (value === undefined) return;
    sent.delete(seq);
    if (request === 'fire') this.deps.staleRound?.(value);
    else {
      if (seq === this.reloadSeq_) this.reloadSeq_ = null;
      this.deps.staleReload?.(value);
    }
  }
}
