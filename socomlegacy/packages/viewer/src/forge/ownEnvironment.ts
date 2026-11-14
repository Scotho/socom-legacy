import type { GlobalLighting } from '@s2u/scene';
import type { LoadedMap } from '../loadMap';
import type { LayoutBase, LayoutSettings } from './layout';
import { withSettings } from './matchMap';
import type { skyDomeFor } from './skyDome';

/**
 * The layout's environment on the match map Play and a Forge lobby compose (`./page` `composeForMatch`, through
 * `./composeLayout`; a browser adaptation, FG.R2 -- the game has no editor), by the base's kind (`LayoutBase.kind`).
 * Every base: the layout's fog distance (`./matchMap` `withSettings`, FG-24). A new empty map (`blank`) and a disc map
 * (`map`): its own light rig, drop-shadow direction and fog colour over the base's (a blank floor's library's), then its
 * fog's on, near distance and height band and its night (`NightMission`, `LensFX_NVG`) -- set last, so the near it names
 * is the near played; the sky dome (`./skyDome`, `skyFrom`) a new empty map's only. Another base (`content`, an authored
 * map) none of the six (`lightRig`, `fogColor`, `shadowVector`, `skyFrom`, `fog`, `night`), as the contributor's chain
 * left it. A disc map relit in a match started from the Forge, Play or a Forge lobby, is the owner's ruling (FC2.R2 (2),
 * 2026-11-13, MISSION OT.R112): FP-1b's "a disc map keeps its own" holds for a match NOT started from the Forge, which
 * never comes through this chain (pinned, `test/forge/ownEnvironment.test.ts`).
 */
export function withLayoutEnvironment(
  aimed: LoadedMap, own: LayoutSettings, base: LayoutBase['kind'], skyDome: ReturnType<typeof skyDomeFor> | null,
): LoadedMap {
  if (base !== 'blank' && base !== 'map') return withSettings(aimed, own);
  const sky = base === 'blank' ? skyDome : null;
  // Its fog colour (the camera record's) and drop-shadow direction likewise.
  const lit: LoadedMap = {
    ...aimed,
    ...(own.lightRig ? { lightRig: own.lightRig as GlobalLighting } : {}),
    ...(sky ? { world: [...aimed.world, ...sky.world], textures: { ...aimed.textures, ...sky.textures },
      textureFlags: { ...aimed.textureFlags, ...sky.textureFlags },
      ...(aimed.textureMips || sky.textureMips ? { textureMips: { ...(aimed.textureMips ?? {}), ...(sky.textureMips ?? {}) } } : {}) } : {}),
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
