import type { ClientEvent, ServerEvent, Team } from './net/protocol';
import type { Play } from './play';
import type { VictoryData } from './victoryData';
import type { WalkMode } from './walk';

/**
 * Research 303: the VICTORY DANCE -- the contextual action (action 0x15, the mask's 0x200000: `FUN_0021ded0`
 * D:L73772-73781, `FUN_0021f850` D:L74205) offered at an enemy corpse in reach, played as one of seven weighted clips
 * the room picks. The eligibility here is the room's (`packages/match/src/room.ts` `victoryStatus`); the page's half is
 * `VictoryPage`, mounted by the action part (`./matchActions`) that both pages' matches share.
 */

export interface VictoryBody { alive: boolean; team: Team; position: readonly [number, number, number]; present: boolean }
export interface VictoryActor { alive: boolean; team: Team; position: readonly [number, number, number]; ready: boolean }
export type VictoryEligibility = 'available' | 'unavailable' | 'unsupported-state' | 'unsupported-order';

/**
 * VICTORY_RANGE_SQUARED_READING: `FUN_005940d0` keeps a proximity entry only while its squared distance (`FUN_002a0a10`
 * D:L145876+, full XYZ) is `<= DAT_00650680` (D:L452648), which the executable holds as 900.0 -- 30 units. [reading]
 */
export const VICTORY_RANGE_SQUARED_READING = 900;

/**
 * The room's eligibility (research 303 s3): `FUN_005940d0` D:L452650-452685 takes the FIRST dead actor of its proximity
 * list (not state 6, not removed: `+0xfb0`, `+0xfd1`), and a live interaction earlier in the list leaves none;
 * `FUN_0057ddf0` D:L440618-440660 then asks an enemy's (the team masks apart, type 2) and a living, free actor. The list's
 * order is temporal and only conditionally sorted (`FUN_002a1140`), so a reach holding a friendly corpse or a living
 * actor beside the enemy corpse is `unsupported-order` -- never a nearest-enemy rule in its place.
 */
export function victoryEligibility(actor: VictoryActor, bodies: readonly VictoryBody[]): VictoryEligibility {
  if (!actor.alive) return 'unavailable';
  if (!actor.ready) return 'unsupported-state';
  // BPN-6: allocation-free (F0043) -- one pass over the bodies, the same terms as the filters it replaces: a body in
  // reach (present, every coordinate finite, the squared distance summed in coordinate order); a dead enemy among them,
  // else 'unavailable'; then a living or friendly one among them, 'unsupported-order'.
  let deadEnemy = false, order = false;
  for (const b of bodies) {
    if (!b.present) continue;
    const pos = b.position;
    let finite = true, sum = 0;
    for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) { finite = false; break; }
    if (!finite) continue;
    for (let i = 0; i < pos.length; i++) sum = sum + (pos[i]! - actor.position[i]!) ** 2;
    if (!(sum <= VICTORY_RANGE_SQUARED_READING)) continue;
    if (!b.alive && b.team !== actor.team) deadEnemy = true;
    if (b.alive || b.team === actor.team) order = true;
  }
  if (!deadEnemy) return 'unavailable';
  if (order) return 'unsupported-order';
  return 'available';
}

/** A browser safeguard (no original): an Action held into or through a dance is the dance's until let go. */
export class VictoryActionInput {
  private consumed = false;
  frame(down: boolean, busy: boolean): boolean {
    if (busy && down) this.consumed = true;
    if (this.consumed) { if (!down) this.consumed = false; return false; }
    return busy ? false : down;
  }
}

/** The match's open client, as the page's dance needs it. */
export interface VictoryClient {
  readonly id: number;
  readonly role: string;
  send(ev: ClientEvent): void;
  /** The last command the page sent (`NetClient.lastSeq`). */
  lastSeq(): number;
  /**
   * PAR-37: the walk ran the commands after `after` again under the dance (`WalkMode.syncVictoryMotion`): the client's
   * predictions after it are the run's (`NetClient.replayed`).
   */
  replayed?(after: number): void;
}

export interface VictoryPageDeps {
  /** The match's client while open, else null. */
  client(): VictoryClient | null;
  /** The map on screen: its dances (`LoadedMap.victory`, `./victoryData`). */
  map(): { victory?: VictoryData } | null;
  play: Pick<Play, 'startVictory' | 'stopVictory' | 'resetVictory' | 'victoryActive' | 'victoryState'>;
  walk: Pick<WalkMode, 'syncVictoryMotion' | 'stopVictoryMotionAfter' | 'victoryMotionActive' | 'isDead' | 'mode'>;
  /** The trigger let go and a held grenade cancelled (no throw) as the dance takes the body (NoFire). */
  release(): void;
}

/** The page's view of its dance (the browser spec's hook). */
export interface VictoryState {
  offer: VictoryEligibility;
  pending: boolean;
  playing: { serial: number; clip: string; elapsed: number; seconds: number; frames: number } | null;
  moving: boolean;
  missing: string[];
}

/**
 * Research 303: the page's own dance. The room's `victoryOffer` is the offer; the action's release asks the room
 * (`fire`: one request, then nothing until the room answers); the room's `victory` for this seat plays it on the body
 * (`Play`) and the mover (`WalkMode.syncVictoryMotion`: the root's travel, the NoFire). Another seat's `victory` is the
 * others' (`./netPage` -> `./remotePlayers`). The page never picks a variant, a target or a recipient.
 */
export class VictoryPage {
  private offer: VictoryEligibility = 'unavailable';
  private pending = false;
  private request = 0;
  /** PAR-37: the commands the page's reloads rode while the request was in flight (`reloaded`). */
  private reloads: number[] = [];

  constructor(private readonly d: VictoryPageDeps) {}

  /** The room's events (`RoomEvents`): the offer, this seat's dance, a welcome's reset. */
  event(ev: ServerEvent): void {
    if (ev.type === 'welcome') { this.reset(); return; }
    if (ev.type === 'victoryOffer') { this.offer = ev.status; this.pending = false; this.reloads = []; return; }
    if (ev.type !== 'victory') return;
    const c = this.d.client();
    if (!c || ev.id !== c.id) return;
    this.pending = false;
    const reloads = this.reloads;
    this.reloads = [];
    if (!ev.clip) { this.stop(ev.seq); return; }
    this.d.release();
    this.d.play.startVictory(ev.serial, ev.clip, ev.elapsed);
    const v = this.d.map()?.victory?.variants.find((x) => x.name === ev.clip);
    // PAR-37 (research 251 section 9): the commands sent past the room's `seq` run again under the dance on the walk.
    if (v) {
      this.d.walk.syncVictoryMotion({ serial: ev.serial, elapsed: ev.elapsed }, v.clip, v.motion, ev.seq === undefined ? 0 : c.lastSeq() - ev.seq,
        reloads, (after) => c.replayed?.(after));
    }
  }

  /**
   * The firearm's reload began (`./matchActions`, its `reloadStart`): an accepted reload clears the dance (`FUN_005a86b4`
   * -> `FUN_0058a4d0`), as the room's does -- the dance playing stops now; while the request is in flight, the reload's
   * command (`NetClient.lastSeq`, the one `./netPage` names) is kept, so the dance heard after it ends where the room's
   * did (PAR-37: the room stops it once the command after that one has run).
   */
  reloaded(): void {
    const c = this.d.client();
    if (this.pending && c) this.reloads.push(c.lastSeq());
    this.d.play.stopVictory();
    // A run under the dance waiting for its tick lays this stop after the command past the reload's, where the room
    // decides it; a dance playing stops now, as before.
    this.d.walk.stopVictoryMotionAfter(c ? c.lastSeq() + 1 : 0);
  }

  /** A dance asked and not answered, or playing (the body's or the mover's). */
  busy(): boolean {
    return this.pending || this.d.play.victoryActive() || this.d.walk.victoryMotionActive();
  }

  /** The picker's input (`./actionWiring` `victory`): the room offers it, walking, alive, idle, the map's clips in. */
  offered(): boolean {
    return this.offer === 'available' && !this.busy() && this.d.walk.mode() === 'walk' && !this.d.walk.isDead()
      && (this.d.map()?.victory?.variants.length ?? 0) > 0;
  }

  /** The action's release on it: one request to the room (a player's only); true when sent. */
  fire(): boolean {
    const c = this.d.client();
    if (!c || c.role !== 'player' || !this.offered()) return false;
    this.pending = true;
    this.d.release();
    c.send({ type: 'victory', request: ++this.request });
    return true;
  }

  /**
   * The dance stopped on the body and the mover. PAR-49 (research 251 section 9.1): a room's stop naming `seq`, its last
   * command run at the stop, is laid after exactly that command; one without (an older room) after the last sent.
   */
  stop(seq?: number): void {
    this.d.play.stopVictory();
    if (seq === undefined) this.d.walk.syncVictoryMotion(null); else this.d.walk.stopVictoryMotionAfter(seq);
  }

  /** A new room or map: nothing offered, nothing asked, nothing playing. */
  reset(): void {
    this.offer = 'unavailable';
    this.pending = false;
    this.reloads = [];
    this.d.play.resetVictory();
    this.d.walk.syncVictoryMotion(null);
  }

  state(): VictoryState {
    return {
      offer: this.offer, pending: this.pending, playing: this.d.play.victoryState(), moving: this.d.walk.victoryMotionActive(),
      missing: this.d.map()?.victory?.missing ?? [],
    };
  }
}
