import { Matrix4, Vector3 } from 'three';
import type { LoadedMap } from '../loadMap';
import type { BombSite } from './layout';

/**
 * The placed plant sites' outlines (the owner, 2026-11-06; a browser adaptation, FG.R2): a layout that plays its own
 * Demolition sites takes the map's tents out of play (`./objectives` `applyForgeObjectives`), but the map's `objectives`
 * script still lights its bases' outlines on the bomb's pickup (research 284 s3; `../bombPage` `worldPulse`). So the
 * map's own `terrorist_pulse` / `seal_pulse` entries are taken off the tents and copied onto the layout's sites -- the
 * disc's geometry, texture and pulse, each copy keeping its node's path, so `pulse_terrorist` / `pulse_seal` light and
 * pulse it exactly as they would the original (`WorldView.setNodeActive` / `setNodeOpacity` reach every placement of
 * the path). Who plants decides the colour, as on the disc: a SEALs' site (team 0, the SEAL carrier's target) wears
 * the red `terrorist_pulse`, a Terrorists' site the green `seal_pulse` (research 284 s3).
 *
 * The copy's size is the adaptation: the disc's outline is drawn round its tent's plant quad, not round a reach. Here
 * it is scaled across the ground so its outer edge lies on the site's `range` (`SITE_OUTLINE_FIT_ADAPTATION`), and
 * lifted `SITE_OUTLINE_LIFT_ADAPTATION` off the site's floor. A map with no outline of a side (a blank floor's library,
 * a map with no Demolition) leaves that side's sites unmarked: there is no program to light one.
 */
export const SITE_OUTLINE_FIT_ADAPTATION = 'outer-edge-on-range' as const;
/**
 * World units the copied outline sits above the site's point, the site itself left on the floor (its point is what the
 * plant's reach and height test measure from). The disc's own lie up to about 2 u off the floor -- MP72's `seal_pulse`
 * 1.0 to 2.06 u above the highest collision polygon (research 284 s1) -- so 1 u, inside the disc's own spread. Over the
 * collision, as the site's point is: where a prop's drawn floor stands higher than its hull (Crossroads' gazebo), the band
 * lies under that floor, as a disc outline would; the site raised onto the drawn floor shows it, its reach unchanged
 * within its Elevation.
 */
export const SITE_OUTLINE_LIFT_ADAPTATION = 1;

/** The outline node a site wears, by who plants there (`BombSite.team`: 0 the SEALs, 1 the Terrorists). */
const OUTLINE_NODE: Readonly<Record<0 | 1, string>> = { 0: 'terrorist_pulse', 1: 'seal_pulse' };

/** A path's last node name, before any `=<model>`. */
const nodeName = (path: string | undefined): string => path?.split('/').pop()?.split('=')[0]?.toLowerCase() ?? '';

/** Whether a prop entry is one of the bases' outlines. */
const isOutline = (p: LoadedMap['props'][number]): boolean =>
  (p.paths ?? []).some((path) => nodeName(path) === OUTLINE_NODE[0] || nodeName(path) === OUTLINE_NODE[1]);

/**
 * The turn about y that squares an entry's footprint under `m` to the world's axes: of every turn in a quarter circle
 * (the footprint's box repeats each 90 degrees), the one whose box on the ground is smallest -- a rounded rectangle's
 * edges then run along x and z. Quarter-degree steps, then the best refined to a hundredth.
 */
function squareTurn(p: LoadedMap['props'][number], m: Matrix4): number {
  const v = new Vector3();
  const xz: number[] = [];
  for (const part of p.parts) {
    const pos = part.positions;
    for (let i = 0; i + 2 < pos.length; i += 3) { v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!).applyMatrix4(m); xz.push(v.x, v.z); }
  }
  // `makeRotationY(a)` takes (x, z) to (x cos a + z sin a, -x sin a + z cos a).
  const area = (a: number): number => {
    const c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < xz.length; i += 2) {
      const x = xz[i]! * c + xz[i + 1]! * s, z = -xz[i]! * s + xz[i + 1]! * c;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    return (x1 - x0) * (z1 - z0);
  };
  if (!xz.length) return 0;
  const deg = Math.PI / 180;
  let best = 0, bestArea = area(0);
  for (let d = 0.25; d < 90; d += 0.25) { const a = area(d * deg); if (a < bestArea) { bestArea = a; best = d; } }
  for (let d = best - 0.25; d <= best + 0.25; d += 0.01) { const a = area(d * deg); if (a < bestArea) { bestArea = a; best = d; } }
  return best * deg;
}

/** The bounds of an entry's geometry under `m` (its first placement's matrix, or that turned square). */
function boundsOf(p: LoadedMap['props'][number], m: Matrix4): { min: Vector3; max: Vector3 } {
  const v = new Vector3(), min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const part of p.parts) {
    const pos = part.positions;
    for (let i = 0; i + 2 < pos.length; i += 3) { v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!).applyMatrix4(m); min.min(v); max.max(v); }
  }
  return { min, max };
}

/**
 * Where a base has no outline of its own (a blank floor: its library lends no world, research 284 s5 lists the maps
 * that hold them), the outlines are copied from this Demolition map: Crossroads, whose two research 284 s1 reads in
 * full. An editor's choice of donor (FG.R2), as `DEFAULT_TURRET`'s Crossroads.
 */
export const SITE_OUTLINE_DONOR = 'MP72';

/**
 * `map` with its bases' outlines moved onto `sites`: every outline entry of its own taken out, and for each site a copy
 * of its side's first outline, centred on the site and fitted to its range. With outlines of its own, each copy keeps
 * the node's path, so the map's own `pulse_*` programs light it. With none, the outlines are `donor`'s (another archive:
 * its textures carried as a turret's are), each under a path of its own (`forge/outline_<i>/<node>`) listed in
 * `forgeSiteOutlines` for `../bombPage` `worldPulse` to light. Sites none, or no outline anywhere: `map` itself.
 */
export function withSiteOutlines(map: LoadedMap, sites: readonly BombSite[], donor: LoadedMap | null = null): LoadedMap {
  if (!sites.length) return map;
  const own = map.props.filter(isOutline);
  const from = own.length ? map : donor;
  const outlines = own.length ? own : (donor?.props.filter(isOutline) ?? []);
  if (!from || !outlines.length) return map;
  const foreign = from !== map && from.archive !== map.archive;
  const rename = (name: string | null): string | null => (name === null || !foreign ? name : `${from.archive}/${name}`);
  const textures = { ...map.textures }, textureFlags = { ...map.textureFlags };
  const textureMips = map.textureMips ? { ...map.textureMips } : undefined;
  const of = (team: 0 | 1): LoadedMap['props'][number] | undefined =>
    outlines.find((p) => (p.paths ?? []).some((path) => nodeName(path) === OUTLINE_NODE[team]));
  const props = map.props.filter((p) => !isOutline(p));
  const driven: { path: string; side: 'seal' | 'terrorist' }[] = [];
  sites.forEach((site, i) => {
    const src = of(site.team);
    const ownPath = src?.paths?.find((q) => nodeName(q) === OUTLINE_NODE[site.team]);
    if (!src || !ownPath) return;
    // The band's own turn on the ground taken out, so it stands square to the world and then takes the site's own yaw: a
    // site at 0 has its band square, a turned one turns it. Read off the band itself (`squareTurn`), not its node's
    // matrix: the disc's geometry can already lie turned inside an unturned node. Measured once square.
    const placed = new Matrix4().fromArray(Array.from(src.matrices.subarray(0, 16)));
    const square = new Matrix4().makeRotationY(squareTurn(src, placed)).multiply(placed);
    const { min, max } = boundsOf(src, square);
    const half = Math.max(max.x - min.x, max.z - min.z) / 2;
    if (!(half > 0)) return;
    const s = site.range / half;
    const centre = new Vector3().addVectors(min, max).multiplyScalar(0.5);
    const m = new Matrix4().makeTranslation(site.at[0], site.at[1] + SITE_OUTLINE_LIFT_ADAPTATION, site.at[2])
      // One scale on every axis: the band is flat, so its height is untouched either way, and a scale across the ground
      // alone after the node's own turn would shear the matrix -- a single prop's draw splits it into a place, a turn and
      // a scale (`../world` `mesh.applyMatrix4`), which a shear does not survive.
      .multiply(new Matrix4().makeRotationY(site.yaw))
      .multiply(new Matrix4().makeScale(s, s, s))
      .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
      .multiply(square);
    const { cells: _c, walk: _w, ...rest } = src;
    // The map's own: the node's path, its programs light it. A donor's: a path of its own, hidden until lit.
    const path = own.length ? ownPath : `forge/outline_${i}/${OUTLINE_NODE[site.team]}`;
    if (foreign) {
      for (const part of src.parts) {
        const name = part.textureName;
        if (name === null) continue;
        const key = rename(name)!;
        if (from.textures[name]) textures[key] = from.textures[name]!;
        if (from.textureFlags[name]) textureFlags[key] = from.textureFlags[name]!;
        if (textureMips && from.textureMips?.[name]) textureMips[key] = from.textureMips[name]!;
      }
    }
    props.push({
      ...rest, matrices: Float32Array.from(m.elements), paths: [path], alternate: true,
      parts: foreign ? src.parts.map((part) => ({ ...part, textureName: rename(part.textureName) })) : src.parts,
    });
    // Who lights it: a SEALs' site (team 0) is the SEAL carrier's target (research 284 s3: `bomb_owner == 1`).
    if (!own.length) driven.push({ path, side: site.team === 0 ? 'seal' : 'terrorist' });
  });
  return { ...map, props, textures, textureFlags, ...(textureMips ? { textureMips } : {}), ...(driven.length ? { forgeSiteOutlines: driven } : {}) };
}
