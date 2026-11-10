import type { GlobalLighting } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';
import type { LayoutSettings } from './layout';
import { withSettings } from './matchMap';
import type { skyDomeFor } from './skyDome';

/**
 * The layout's environment on the match map Play composes (`./page` `composeForMatch`; a browser adaptation, FG.R2 --
 * the game has no editor). Every layout: its fog distance (`./matchMap` `withSettings`, FG-24). A new empty map's only
 * (`blank`): its own light rig, sky dome (`./skyDome`), drop-shadow direction and fog colour over its library's, then
 * its fog's on, near distance and height band and its night (`NightMission`, `LensFX_NVG`) -- set last, so the near it
 * names is the near played. On a disc map none of the six (`lightRig`, `fogColor`, `shadowVector`, `skyFrom`, `fog`,
 * `night`) applies, whatever the layout holds: a disc map keeps its own and plays as before (pinned,
 * `test/forge/ownEnvironment.test.ts`).
 */
export function withLayoutEnvironment(
  aimed: LoadedMap, own: LayoutSettings, blank: boolean, skyDome: ReturnType<typeof skyDomeFor> | null,
): LoadedMap {
  if (!blank) return withSettings(aimed, own);
  // Its fog colour (the camera record's) and drop-shadow direction likewise.
  const lit: LoadedMap = {
    ...aimed,
    ...(own.lightRig ? { lightRig: own.lightRig as GlobalLighting } : {}),
    ...(skyDome ? { world: [...aimed.world, ...skyDome.world], textures: { ...aimed.textures, ...skyDome.textures },
      textureFlags: { ...aimed.textureFlags, ...skyDome.textureFlags },
      ...(aimed.textureMips || skyDome.textureMips ? { textureMips: { ...(aimed.textureMips ?? {}), ...(skyDome.textureMips ?? {}) } } : {}) } : {}),
    ...(own.shadowVector ? { shadowVector: [...own.shadowVector] as [number, number, number] } : {}),
    // A colour chosen is a fog to see: on, whatever the built-from map's camera had.
    ...(own.fogColor && aimed.camera ? { camera: { ...aimed.camera, fogEnabled: true, fogColor: [...own.fogColor] as [number, number, number] } } : {}),
  };
  const m = withSettings(lit, own);
  const f = own.fog, cam = m.camera;
  return {
    ...m,
    ...(f && cam ? { camera: { ...cam, fogEnabled: f.on, fogNear: Math.max(0, Math.min(f.near, cam.fogFar - 1)), fogAltitude: f.height !== null,
      ...(f.height ? { fogTop: f.height.top, fogBottom: f.height.bottom } : {}) } } : {}),
    ...(own.night ? { night: { mission: own.night.mission, lens: own.night.lens ? [...own.night.lens] as [number, number, number, number] : null } } : {}),
  };
}
