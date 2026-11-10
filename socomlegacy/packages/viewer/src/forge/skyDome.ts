import type { LoadedMap, LoadedMesh } from '../loadMap';

/**
 * A new empty map's sky (the owner, 2026-11-06; a browser adaptation, FG.R2): a disc map's own sky dome copied over the
 * floor. The game has no skybox: each map's sky is ordinary world geometry -- a dome or a ring with a cap, textured with
 * a sky or cloud image, its rim fading into the fog by its vertices' alpha, its clouds on some maps scrolling
 * (`LoadedMesh.scroll`) -- drawn in front of the screen cleared to the fog colour (research 196, D5 and the F rounds).
 *
 * SKY_DOME_TEXTURE_ADAPTATION: which world parts are the dome is the Forge's own choice, by their texture's name -- a
 * sky or cloud image (`sky01.tif`, `gen_cloud_n_sun_256x256.tif` on MP51 and MP6, `mp82_skycap.tif`: the names
 * research 196 reads) -- not by a node of the scene. [adaptation: the editor's match on the names, not read off the
 * original -- the game names no dome and copies no sky; each map's dome nodes are not traced.] A map whose sky textures
 * are named otherwise offers no sky.
 */
export const SKY_DOME_TEXTURE_ADAPTATION = /sky|cloud/i;

/** A map's sky parts: its world chunks textured with a sky or cloud image (`SKY_DOME_TEXTURE_ADAPTATION`). */
export function skyPartsOf(map: Pick<LoadedMap, 'world'>): LoadedMesh[] {
  return map.world.filter((m) => m.textureName !== null && SKY_DOME_TEXTURE_ADAPTATION.test(m.textureName));
}

/** The horizontal middle of a set of parts (world space): the dome's centre over its own map. */
function middleOf(parts: readonly LoadedMesh[]): [number, number] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of parts) {
    const pos = p.positions;
    for (let i = 0; i + 2 < pos.length; i += 3) {
      const x = pos[i]!, z = pos[i + 2]!;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  }
  return Number.isFinite(x0) ? [(x0 + x1) / 2, (z0 + z1) / 2] : [0, 0];
}

/**
 * `source`'s sky dome as world parts over a new empty map: centred over the floor's middle (its height its own), off the
 * engine order's grid (an empty map has its own), each texture renamed `<source archive>/<name>` where `into` is another
 * archive -- with the textures, flags and mips that go with it. Empty where `source` has no sky (`skyPartsOf`).
 */
export function skyDomeFor(source: LoadedMap, into: string | null): {
  world: LoadedMesh[]; textures: LoadedMap['textures']; textureFlags: LoadedMap['textureFlags']; textureMips?: LoadedMap['textureMips'];
} {
  const parts = skyPartsOf(source);
  const textures: LoadedMap['textures'] = {}, textureFlags: LoadedMap['textureFlags'] = {};
  const textureMips: NonNullable<LoadedMap['textureMips']> = {};
  if (!parts.length) return { world: [], textures, textureFlags };
  const [cx, cz] = middleOf(parts);
  const foreign = into !== null && into !== source.archive;
  const rename = (name: string): string => (foreign ? `${source.archive}/${name}` : name);
  const world = parts.map((p): LoadedMesh => {
    const positions = Float32Array.from(p.positions);
    for (let i = 0; i + 2 < positions.length; i += 3) { positions[i]! -= cx; positions[i + 2]! -= cz; }
    const name = p.textureName!;
    if (source.textures[name]) textures[rename(name)] = source.textures[name]!;
    if (source.textureFlags[name]) textureFlags[rename(name)] = source.textureFlags[name]!;
    if (source.textureMips?.[name]) textureMips[rename(name)] = source.textureMips[name]!;
    const { cells: _cells, switchPath: _switch, centre, ...rest } = p;
    // A merged draw's per-vertex centroids (the detail gate's) move with it.
    const centroids = (p as { centroids?: Float32Array }).centroids;
    const moved = centroids ? Float32Array.from(centroids) : null;
    if (moved) for (let i = 0; i + 2 < moved.length; i += 3) { moved[i]! -= cx; moved[i + 2]! -= cz; }
    return { ...rest, positions, textureName: rename(name), ...(moved ? { centroids: moved } : {}),
      ...(centre ? { centre: [centre[0] - cx, centre[1], centre[2] - cz] as [number, number, number] } : {}) };
  });
  return { world, textures, textureFlags, ...(Object.keys(textureMips).length ? { textureMips } : {}) };
}
