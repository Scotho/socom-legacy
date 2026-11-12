import type { NavigationData } from '../../../match/src/bots/navigation';
import { MatchBots } from '../../../match/src/bots/matchBots';
import type { Room } from '../../../match/src/room';
import type { NpcBehaviour } from './layout';
import type { ForgeNpc } from './npcs';

/**
 * NPB-5 (the forge's `patrol` NPCs; docs/plans/2026-10-24-forge-npc-brains.md, NPB.R1/R5): a browser adaptation of the
 * forge's sandbox, with no original. The game had no bots; this puts the lobby bots' own brain (`MatchBots`, BOTS-LAND)
 * on the seats the forge's NPCs already hold, so one brain plays in both places.
 *
 * What stays the room's: each NPC is still a seat its own `NetClient` seated on its marker's side with its model; the brain
 * never seats, moves or releases it (`MatchBots.adopt`), and acts only through the room's `binary` and `text` paths as a
 * player does (NPB.R3). What is the adapter's own: the room's tick runs the brain (`RoomOptions.beforeStep`, the
 * lobby's own hook) so a command lands the tick it is planned; a seat is adopted when the room has seated it (the NPCs say
 * hello after the player's welcome); and a driven NPC's sentry driver stops (it would send a second, stationary command
 * stream onto the same seat) and is put back when the brain closes.
 *
 * The graph comes ready-made (`public/maps/nav/<stem>.json`, `fetchNpcNavigation`): the brain's own builder runs in Node
 * and takes minutes on a full map, which a page cannot spend. A map with no graph has no brain here; its NPCs stay sentries.
 */
export const FORGE_NPC_BRAIN_ADAPTATION = 'the forge\'s patrol NPCs: the lobby bots\' brain on the NPCs\' own seats, a prebuilt graph, the room\'s tick' as const;


/**
 * The prebuilt graph for `stem` under `<base>maps/nav/`, or null for anything that is not one: absent (404), the dev
 * server's HTML fallback, a network failure, a graph of another version, a stem that is not a plain name. Never throws:
 * a missing graph means sentries, not a broken match. The brain's `MatchBots` validates the points and edges in full.
 */
export async function fetchNpcNavigation(base: string, stem: string, get: typeof fetch = fetch): Promise<NavigationData | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(stem)) return null;
  try {
    const res = await get(`${base}maps/nav/${stem}.json`);
    if (!res.ok) return null;
    const data: unknown = JSON.parse(await res.text());
    const v = data as Partial<NavigationData> | null;
    return v && v.version === 2 && Array.isArray(v.nodes) ? v as NavigationData : null;
  } catch { return null; }
}

/** Yield to the page between slices of the brain's preparation, so a full map's tactics never hold a frame. */
const YIELD = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The lobby bots' brain over the NPCs' own seats in the page's room. No authored opening lanes (`teamProfile`): those are
 * the lobby's Frostfire lanes from its start points, and an NPC stands on its marker; the generic planner plays (NPB.R7).
 */
export class NpcBrain {
  private readonly adopted = new Map<number, () => void>();
  private readonly restore: (() => void)[] = [];

  /** Prepare the brain for `npcs` on `room`'s map, yielding to the page; rejects when `navigation` is not valid for it. */
  static async create(room: Room, npcs: readonly ForgeNpc[], navigation: NavigationData, random: () => number = Math.random,
    yieldWork: () => Promise<void> = YIELD): Promise<NpcBrain> {
    return new NpcBrain(room, npcs, await MatchBots.prepare(room, { random, navigation, kits: room.botKits }, yieldWork));
  }

  /** `npcs`: the NPCs to drive; each one's sentry driver stops now and returns on `close`. */
  private constructor(private readonly room: Room, private readonly npcs: readonly ForgeNpc[], private readonly bots: MatchBots) {
    for (const n of npcs) {
      const sentry = n.step;
      n.step = (): void => {};
      this.restore.push(() => { n.step = sentry; });
    }
  }

  /** The seats the brain drives now. */
  driving(): number[] { return [...this.adopted.keys()]; }

  /** The brain's own account of each seat it drives (`MatchBots.stats`): position, target, route, last shot and the room's verdict on it. */
  stats(): ReturnType<MatchBots['stats']> { return this.bots.stats(); }

  /**
   * Drive a seat this brain was not given at construction -- a rules `spawner.release` (`forgePlayNpcSeats`). The same
   * `MatchBots.adopt` as a marker NPC. The caller hears the seat's events (there is no `NetClient` on a released seat).
   */
  adoptSeat(id: number): ReturnType<MatchBots['adopt']> {
    if (this.adopted.has(id)) return null;
    const hear = this.bots.adopt(id);
    if (!hear) return null;
    this.adopted.set(id, () => {});
    return hear;
  }

  /**
   * Forget a released seat (`forgePlayNpcSeats`, at its vacate and at the round's clear): the brain lets it go now, so a
   * later release that takes the same id -- a new round starts its ids again -- is adopted and driven. A maintainers' fix
   * (the review of #768/#773, F1; product track): without it the id stayed "adopted" here after `MatchBots` had dropped
   * the departed seat, and every reuse was refused. A seat it does not hold is a no-op; a marker NPC's is never released.
   */
  releaseSeat(id: number): void {
    const off = this.adopted.get(id);
    if (!off) return;
    off();
    this.adopted.delete(id);
    this.bots.release(id);
  }

  /** One room tick's worth (`beforeStep`): adopt any seated NPC not yet adopted, then the brain's own step. */
  step(): void {
    for (const n of this.npcs) {
      if (this.adopted.has(n.id) || n.client.role !== 'player' || !this.room.player(n.id)) continue;
      const hear = this.bots.adopt(n.id);
      if (hear) this.adopted.set(n.id, n.client.on(hear));
    }
    this.bots.step();
  }

  /** Stop driving: the seats stay (the NPCs' clients own them) and the sentry drivers return. */
  close(): void {
    for (const off of this.adopted.values()) off();
    for (const id of this.adopted.keys()) this.bots.release(id);
    this.adopted.clear();
    this.bots.dispose();
    for (const undo of this.restore) undo();
    this.restore.length = 0;
  }
}

/**
 * The brain a layout's `behaviour` asks for, or null where the NPCs stay sentries: `sentry`, no NPCs, no graph for this
 * map, or a graph the brain refuses. Never throws -- a map without a graph is a sentry map, not a broken match.
 */
export async function brainFor(behaviour: NpcBehaviour, room: Room, npcs: readonly ForgeNpc[], navigation: NavigationData | null,
  random?: () => number, yieldWork?: () => Promise<void>): Promise<NpcBrain | null> {
  if (behaviour !== 'patrol' || !npcs.length || !navigation) return null;
  try { return await NpcBrain.create(room, npcs, navigation, random, yieldWork); } catch { return null; }
}
