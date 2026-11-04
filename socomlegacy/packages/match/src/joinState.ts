import { JOIN_STATE_VERSION, TICK_HZ, type DropWire, type JoinCorpseWire, type JoinProjectileWire, type JoinResultWire, type JoinWire } from '../../viewer/src/net/protocol';

/**
 * PF-28 (ruling PF.R47; web research 231 s1-s4): the join envelope, built from the room's state alone. Pure: the room
 * hands in a view of its flying list, its standing result and its seats (`Room.joinWire`), and the welcome carries what
 * comes back (`welcome.join`). The original sends every owned object whole to a new client (`FUN_0061ba10`
 * D:L527450-527468; GrenadeState `FUN_002c1850` D:L163774+, SealState `FUN_002bf070` -> `FUN_002be150`
 * D:L162596-162602; research 195 s4-s6); it replicates no fuse age and no death time, so the ages are the room's clock.
 */

/**
 * The port's stable projectile id (`Room.pidSerial`): a serial the room gives each projectile it flies, from 0 at each
 * round's (and the abandon's) cleared air, never given twice within it; the `grenade` event and the envelope name a
 * projectile by it, so an observer's copy and a joiner's are one. The original keys its replicated objects by their
 * network object (DME) and its owner by the recyclable player id (research 195 s4) -- a browser design. [reading]
 */
export const PROJECTILE_ID_READING = 'per round, never reused' as const;

/**
 * The projectile's age, fuse and removal on the wire are the room's own (its `Grenade`'s, stepped by game frames since
 * the launch), in ticks (`JOIN_CLOCK_UNIT`): the original's GrenadeState carries position, velocity, owner and a
 * monotonic state but no fuse age (`FUN_002c1420` D:L163598+; research 195 s4: "do not claim one"). [reading]
 */
export const PROJECTILE_AGE_WIRE_READING = 'room clock' as const;

/**
 * A corpse's age on the wire is the room's ticks since its `kill` (`Player.diedAt`): the original has no replicated
 * death time (`FUN_002be150` D:L162596-162602; D:L162386-162395 sets health 0 and actor state 8 from a flag; research
 * 195 s6). [reading]
 */
export const CORPSE_AGE_WIRE_READING = 'room clock' as const;

/**
 * The AN-M8's smoke is read off its projectile: the room keeps a detonated grenade in its flying list until its removal
 * (`stepGrenade`: detonated at `Timer1`, removed at `Timer2`, 40 s for the AN-M8; `flyGrenades` drops it only then), so
 * its envelope entry -- detonated, its age, `-fuse` the seconds since the detonation and `removal` those left -- is the
 * smoke's phase, and no separate effect record is sent (research 195 s4 asked for one only if the effect outlived its
 * projectile; it does not). The page's smoke runs `Timer2 - Timer1` from the detonation (`grenade.ts` `smokes`). [reading]
 */
export const SMOKE_PHASE_ON_WIRE_READING = 'flying until removal' as const;

/** A projectile as the room flies it: its pid, its owner's id, its kind and its `Grenade`'s state. */
export interface JoinFlyer {
  pid: number; owner: number; kind: string;
  g: { pos: readonly number[]; vel: readonly number[]; state: 'flight' | 'rest' | 'detonated' | 'removed'; age: number; fuse: number; removal: number; bounces: number; dud: boolean };
  facing?: readonly number[];
}
/** A seat as the room holds it: alive or not, the tick it died on (-1: not since its spawn), its death's clip and cause. */
export interface JoinSeat { id: number; alive: boolean; diedAt: number; deathClip: string | null; deathCause: number | null }
/** What `joinWire` reads: the room's tick, its flying list, its standing result (null outside the round screens) and seats. */
export interface JoinView {
  tick: number;
  flying: readonly JoinFlyer[];
  result: JoinResultWire | null;
  seats: readonly JoinSeat[];
  /** PF-34 (research 234 s1): the world drops lying (`WorldDrops.wire`); absent or empty, the envelope carries none. */
  drops?: readonly DropWire[];
}

const v3 = (v: readonly number[]): [number, number, number] => [v[0]!, v[1]!, v[2]!];

/**
 * The envelope (`JoinWire`, version `JOIN_STATE_VERSION`): every projectile not yet removed with its pid, owner, kind,
 * position, velocity, state, its age, fuse and removal in ticks, its bounces and dud; the standing result as the room sent it, with the
 * tick it went; every dead seat with a death (`diedAt` >= 0) as a corpse with its clip, cause and age in ticks; every
 * dead seat without one (a ghost seated this round, never spawned) as a ghost.
 */
export function joinWire(view: JoinView): JoinWire {
  const projectiles: JoinProjectileWire[] = [];
  for (const f of view.flying) {
    const g = f.g;
    if (g.state === 'removed') continue;
    projectiles.push({
      pid: f.pid, owner: f.owner, kind: f.kind, pos: v3(g.pos), vel: v3(g.vel), state: g.state,
      age: g.age * TICK_HZ, fuse: g.fuse * TICK_HZ, removal: g.removal * TICK_HZ, bounces: g.bounces, dud: g.dud,
      ...(f.facing ? { facing: v3(f.facing) } : {}),
    });
  }
  const corpses: JoinCorpseWire[] = [];
  const ghosts: number[] = [];
  for (const s of view.seats) {
    if (s.alive) continue;
    if (s.diedAt < 0) { ghosts.push(s.id); continue; }
    corpses.push({ id: s.id, clip: s.deathClip, ...(s.deathCause !== null ? { cause: s.deathCause } : {}), age: view.tick - s.diedAt });
  }
  return {
    v: JOIN_STATE_VERSION, ...(view.result ? { result: { ...view.result } } : {}), projectiles, corpses, ghosts,
    ...(view.drops?.length ? { drops: view.drops.map((d) => ({ ...d })) } : {}),
  };
}
