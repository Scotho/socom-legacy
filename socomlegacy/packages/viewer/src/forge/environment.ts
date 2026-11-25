import type { GlobalLighting } from '@s2u/scene';

/**
 * The Environment panel's read-only rows (a browser adaptation, FG.R2: the disc's own values shown, never edited -- a
 * layout keeps no field for them): the map's light rig, its fog, its night, its shadows, its reflections and its flares,
 * each section naming where on the disc its values come from. The layout's own lighting (Day / night, Fog distance) is
 * the panel's editable part, the Settings panel's controls moved there.
 */

type V3 = readonly [number, number, number];

/** What the rows read: each field the loaded map's own (`LoadedMap`), only the members used, so a test passes literals. */
export interface EnvironmentSource {
  /** `LoadedMap.lightRig`: `GlobalLighting` -- three directional lights and an ambient (`@s2u/scene` `worldRoot.ts`). */
  rig: GlobalLighting | null;
  /** `LoadedMap.camera`'s fog: `cameras/camera` (`@s2u/scene` `cameraParams.ts`), its colour 0..255. */
  camera: { fogColor: V3; fogNear: number; fogFar: number; fogTop: number; fogBottom: number; fogEnabled: boolean; fogAltitude: boolean } | null;
  /** `LoadedMap.night`: the world root's `NightMission` and `LensFX_NVG` (rgba 0..1, the disc's floats; research 84 s14). */
  night?: { mission: boolean; lens: readonly [number, number, number, number] | null };
  /** `LoadedMap.shadowVector`: the world root's `ShadowVector`, the way the characters' shadows are cast. */
  shadowVector?: V3;
  /** The layout's retired dimmer (`LayoutSettings.light`) when it is below 1, else null: shown, not offered. */
  legacyLight: number | null;
}

export interface EnvironmentRow { label: string; value: string; swatch?: string; note?: string }
export interface EnvironmentSection { title: string; source: string; rows: EnvironmentRow[] }

const hex2 = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
/** A 0..1 colour as `#rrggbb`, clamped (the rig's colours may pass 1: the GS clamps the product, not the light). */
export const rgbHex = (c: V3): string => `#${hex2(c[0] * 255)}${hex2(c[1] * 255)}${hex2(c[2] * 255)}`;
/** A 0..255 colour as `#rrggbb`. */
const byteHex = (c: readonly number[]): string => `#${hex2(c[0]!)}${hex2(c[1]!)}${hex2(c[2]!)}`;
const fixed = (c: V3): string => c.map((v) => v.toFixed(2)).join(' ');

/** A unit vector's heading in the port's yaw (degrees, 0 looking down -z, left positive) and its elevation. */
function headingOf(d: V3): { heading: number; elevation: number } {
  const heading = ((Math.round((Math.atan2(-d[0], -d[2]) * 180) / Math.PI) % 360) + 360) % 360;
  return { heading, elevation: Math.round((Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180) / Math.PI) };
}

/** Where a light shines from, in words: straight overhead or below, else its heading and its elevation. */
export function directionWords(d: V3): string {
  if (d[1] > 0.999) return 'from overhead';
  if (d[1] < -0.999) return 'from below';
  const { heading, elevation } = headingOf(d);
  return `from ${heading}°, ${elevation === 0 ? 'level' : elevation > 0 ? `${elevation}° up` : `${-elevation}° down`}`;
}

/** Which way a shadow is cast, in words: straight down, else its heading and how far below the horizon. */
function castWords(d: V3): string {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const u: V3 = [d[0] / len, d[1] / len, d[2] / len];
  if (u[1] < -0.999) return 'straight down';
  const { heading, elevation } = headingOf(u);
  return `toward ${heading}°, ${elevation < 0 ? `${-elevation}° down` : `${elevation}° up`}`;
}

/** The panel's read-only sections for one map, only those it has; none with no map. */
export function environmentSections(src: EnvironmentSource): EnvironmentSection[] {
  const out: EnvironmentSection[] = [];
  const lighting: EnvironmentRow[] = [];
  if (src.rig) {
    const rows: EnvironmentRow[] = src.rig.directions.map((d, k): EnvironmentRow => {
      const c = src.rig!.colours[k] ?? [0, 0, 0];
      const off = Math.hypot(d[0], d[1], d[2]) === 0;
      return off
        ? { label: `Light ${k + 1}`, value: 'off (this map runs on two lights)' }
        : { label: `Light ${k + 1}`, value: directionWords(d), swatch: rgbHex(c), note: `rgb ${fixed(c)}` };
    });
    rows.push({ label: 'Ambient', value: `rgb ${fixed(src.rig.ambient)}`, swatch: rgbHex(src.rig.ambient) });
    lighting.push(...rows);
  }
  // The shadows and the night in the same group (the owner, 2026-11-25: "merge some groups").
  if (src.shadowVector) lighting.push({ label: 'Shadows', value: castWords(src.shadowVector) });
  if (src.night) {
    const lens = src.night.lens;
    lighting.push(
      { label: 'Night mission', value: src.night.mission ? 'Yes' : 'No' },
      // The lens is the disc's 0..1 floats (FP-1b, REVIEW-A 12): shown as a colour, never read as bytes.
      lens ? { label: 'Night vision lens', value: `${rgbHex([lens[0], lens[1], lens[2]])} · alpha ${lens[3]}`, swatch: rgbHex([lens[0], lens[1], lens[2]]) } : { label: 'Night vision lens', value: 'None' },
    );
  }
  if (src.legacyLight !== null) {
    lighting.push({ label: 'Legacy brightness', value: `${Math.round(src.legacyLight * 100)}%`, note: "This layout's retired brightness dimmer, kept as it was saved · moving Day / night clears it" });
  }
  if (lighting.length) {
    out.unshift({ title: 'Lighting', source: "GlobalLighting (MP*.ZED): three directional lights and an ambient; the world root's ShadowVector, NightMission and LensFX_NVG", rows: lighting });
  }
  if (src.camera) {
    const f = src.camera;
    out.push({ title: 'Fog', source: "cameras/camera (MP*.ZED): the map's own fog", rows: [
      { label: 'On', value: f.fogEnabled ? 'Yes' : 'No' },
      { label: 'Colour', value: `rgb ${f.fogColor.map((v) => Math.round(v)).join(' ')}`, swatch: byteHex(f.fogColor) },
      { label: 'Distance', value: `${Math.round(f.fogNear)} – ${Math.round(f.fogFar)} u` },
      { label: 'Height fog', value: f.fogAltitude ? `${Math.round(f.fogBottom)} – ${Math.round(f.fogTop)} u` : 'Off' },
    ] });
  }
  // No Reflections and no Flares group (the owner, 2026-11-25: "flares and reflections is not useful (unless I can
  // change them)"): neither is set here -- the flares are placed and listed in the Outliner.
  return out;
}
