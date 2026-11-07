import type { LoadedMap } from '../loadMap';
import { SETTINGS_BOUNDS, type LayoutSettings, type LightRigSetting } from './layout';

/**
 * A disc map's environment as a new empty map's own settings (the owner, 2026-11-06: "copy the layout lighting from the
 * map into our custom map": a browser adaptation, FG.R2): every value the empty map's environment holds, read off the
 * map it is built from -- its light rig (`GlobalLighting`), its camera's fog (on, colour, near, far, height band), its
 * night (`NightMission`, `LensFX_NVG`), its drop-shadow vector (`ShadowVector`) and its own sky dome (`./skyDome`) -- so
 * the empty map starts lit as that map is, its own to change. A value the map lacks is left out (the editor's own
 * fallback then). Each is held inside the settings' bounds (`parseSettings`), so the layout reads back.
 */
export function environmentOf(map: LoadedMap): Partial<LayoutSettings> {
  const out: Partial<LayoutSettings> = {};
  const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const rig = map.lightRig;
  if (rig) {
    const v3 = (v: readonly number[], min: number, max: number): [number, number, number] => [clamp(v[0]!, min, max), clamp(v[1]!, min, max), clamp(v[2]!, min, max)];
    out.lightRig = {
      directions: rig.directions.slice(0, 3).map((d) => v3(d, -1, 1)) as LightRigSetting['directions'],
      colours: rig.colours.slice(0, 3).map((c) => v3(c, 0, 2)) as LightRigSetting['colours'],
      ambient: v3(rig.ambient, 0, 2),
    };
  }
  const c = map.camera;
  if (c) {
    const far = Math.round(clamp(c.fogFar, SETTINGS_BOUNDS.fogFar.min, SETTINGS_BOUNDS.fogFar.max));
    out.fogFar = far;
    out.fogColor = [clamp(c.fogColor[0], 0, 255), clamp(c.fogColor[1], 0, 255), clamp(c.fogColor[2], 0, 255)];
    out.fog = {
      on: c.fogEnabled,
      near: clamp(c.fogNear, 0, Math.max(0, far - 1)),
      height: c.fogAltitude ? { top: clamp(c.fogTop, -100000, 100000), bottom: clamp(c.fogBottom, -100000, 100000) } : null,
    };
  }
  // Its night always (the owner, 2026-11-06: a preset sets every field): a map with no night record is no night mission
  // and no lens -- never the built-from map's showing through.
  const l = map.night?.lens ?? null;
  out.night = { mission: map.night?.mission ?? false, lens: l ? [clamp(l[0], 0, 255), clamp(l[1], 0, 255), clamp(l[2], 0, 255), clamp(l[3], 0, 1)] : null };
  const sv = map.shadowVector;
  if (sv && Math.hypot(sv[0], sv[1], sv[2]) > 0) out.shadowVector = [clamp(sv[0], -1000, 1000), clamp(sv[1], -1000, 1000), clamp(sv[2], -1000, 1000)];
  // Its sky named whether or not the dome is found by its textures (`SKY_DOME_TEXTURE_READING`): the field shows the map
  // chosen, and the editor says when it finds no sky there to copy.
  if (/^[A-Z]{1,3}\d{1,3}$/.test(map.archive)) out.skyFrom = map.archive;
  return out;
}
