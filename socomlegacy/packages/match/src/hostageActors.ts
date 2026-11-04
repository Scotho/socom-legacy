import type { AiLoc } from '@s2u/scene';

/** Read-only class2 actor view. Research334 §10 distinguishes source flags from roster-order limitations. */
export interface HostageActor {
  id: number; alive: boolean; cell: AiLoc | null; velocity: readonly [number, number, number];
  position?: readonly [number, number, number]; rawCell?: AiLoc | null;
  ai: boolean; stance: 0 | 1 | 2;
  /** AI ctrl+265 bits0/1. */
  excluded: boolean;
  /** State3's target, otherwise null. */
  yieldTo: number | null;
  /** Body105c bit7 set while105d bit0 clear. */
  probeRefused: boolean;
}
export interface HostageActorWorld { id: number; actors(): readonly HostageActor[]; yieldRandom?(): number }

/** FUN_00197728/00197740 D:L14514–14535: unsigned32 seed, 64-bit LCG, high31 result.
 * The room seed and separation from other original RNG consumers remain research334's stream residual.
 */
export const HOSTAGE_YIELD_SEED_PLACEHOLDER = 1;
export class HostageYieldRandom {
  private state: bigint;
  constructor(seed: number) { this.state = BigInt(seed >>> 0); }
  nextInt(): number {
    this.state = BigInt.asUintN(64, this.state * 0x5851f42d4c957f2dn + 1n);
    return Number((this.state >> 32n) & 0x7fffffffn);
  }
  next(): number { return Math.fround(this.nextInt() * 2 ** -31); }
}

/** FUN_00569aa0 D:L430132–430162; FUN_0056a130 D:L430347–349. Caller owns neighbor order. */
export function resolveProbeActor(self: number, cell: AiLoc, actors: readonly HostageActor[]): HostageActor | null {
  // FUN_002a0a10 D:L145910 excludes self when building the original neighbor list.
  const found = actors.find(a => a.id !== self && a.alive && (!a.ai || !a.excluded) && a.cell?.x === cell.x && a.cell.z === cell.z);
  return found && found.id !== self ? found : null;
}

/** FUN_00602b20 D:L512274–512322, called with25<225 (RAM651028/651030).
 * FUN_0050e3d0 D:L380666–669 compares full-vector speed squared strictly above RAM651020=50.
 */
export function actorProbeEligible(source: HostageActor, target: HostageActor): boolean {
  if (!target.alive || target.id === source.id || source.probeRefused) return false;
  if (target.ai) return target.stance !== 2 && target.yieldTo !== source.id;
  const moving = (a: HostageActor) => a.velocity.reduce((sum, v) => sum + v * v, 0) > 50;
  return source.stance < 2 && (moving(source) || moving(target));
}
