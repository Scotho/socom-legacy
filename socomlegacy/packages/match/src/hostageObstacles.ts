import type { AiLoc } from '@s2u/scene';

/** FUN_00515750 D:L384503-384528: bounding rectangle and half-open row spans (research 335 §1). */
export interface HostageFootprint { origin: AiLoc; width: number; rows: readonly (readonly [number, number])[] }
/** Research 335 §5: type4 object's quad-to-row raster and runtime object binding remain unported. */
export const HOSTAGE_DYNAMIC_FOOTPRINT_PLACEHOLDER = 'registered scene-object footprint producer not bound';
const key = (p: AiLoc): string => `${p.map}:${p.x}:${p.z}`;
/** Per-room copy-on-write bit32 overlay. No shared map cell is mutated; source has no self exclusion. */
export class HostageObstacles {
  private readonly soils = new Map<string, number>();
  private readonly bits = new Map<string, boolean>();
  private readonly actors = new Map<number, AiLoc>();
  private readonly footprints = new Map<number, HostageFootprint>();
  /** Read-only retained navigable cell; never infer actor identity from bit32 alone (research334 §10). */
  actorCell(id: number): AiLoc | null { const at = this.actors.get(id); return at ? { ...at } : null; }
  readonly word = (loc: AiLoc, authored: number): number => {
    const soil = this.soils.get(key(loc));
    if (soil !== undefined) authored = (authored & ~31) | soil;
    const occupied = this.bits.get(key(loc));
    return occupied === undefined ? authored : (authored & ~32) | (occupied ? 32 : 0);
  };
  /** FUN_00556ee0 D:L420963-420972: persistent collision soil, with links and other soils untouched. */
  markCollision(loc: AiLoc, authored: number): void {
    const word = this.word(loc, authored), soil = word & 31;
    if (!(word & 256) && [1, 2, 4, 5, 12, 13].includes(soil)) this.soils.set(key(loc), 13);
  }
  readonly dynamicFootprint = (loc: AiLoc): boolean => {
    for (const p of this.footprints.values()) {
      const x = loc.x - p.origin.x, z = loc.z - p.origin.z;
      if (loc.map !== p.origin.map || x < 0 || x >= p.width || z < 0 || z >= p.rows.length) continue;
      const row = p.rows[z]!;
      if (x >= row[0] && x < row[1]) return true;
    }
    return false;
  };
  /** FUN_00529a90 D:L394775-394796: old clear unless object mask covers it, new set.
   * FUN_005b7ba0 D:L471284-471327 only updates after x/z change (map bits are not compared).
   */
  moveActor(id: number, loc: AiLoc): void {
    const old = this.actors.get(id);
    if (old && old.x === loc.x && old.z === loc.z) return;
    if (old && !this.dynamicFootprint(old)) this.bits.set(key(old), false);
    this.actors.set(id, { ...loc }); this.bits.set(key(loc), true);
  }
  /** FUN_00547af0 D:L413029: release old cell using invalid next location. */
  removeActor(id: number): void {
    const old = this.actors.get(id);
    if (old && !this.dynamicFootprint(old)) this.bits.set(key(old), false);
    this.actors.delete(id);
  }
  private stamp(p: HostageFootprint, on: boolean): void {
    p.rows.forEach(([start, end], z) => {
      for (let x = start; x < end; x++) this.bits.set(key({ map: p.origin.map, x: p.origin.x + x, z: p.origin.z + z }), on);
    });
  }
  /** FUN_00515880 D:L384539-384541: clear prior mask then stamp replacement. */
  setFootprint(id: number, mask: HostageFootprint | null): void {
    const old = this.footprints.get(id);
    if (old) this.stamp(old, false);
    this.footprints.delete(id);
    if (mask) {
      const copy = { origin: { ...mask.origin }, width: mask.width, rows: mask.rows.map(([a, b]) => [a, b] as const) };
      this.footprints.set(id, copy); this.stamp(copy, true);
    }
  }
  /** Round-owned runtime storage, discarded with its actor roster. */
  clear(): void { this.soils.clear(); this.bits.clear(); this.actors.clear(); this.footprints.clear(); }
}
