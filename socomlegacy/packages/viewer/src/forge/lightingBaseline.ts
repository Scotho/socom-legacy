import type { LoadedMap } from '../loadMap';
import { applyLighting, DEFAULT_LIGHTING } from '../lighting';

/** Saved Forge lighting adaptation (FDL.R0-R4), promoted from the approved 2026-10-25 study. All targets/curves are browser adaptations,
 * chosen for comparison, never readings of the original. No source arrays are changed.
 * A fixed map-wide baseline avoids camera-driven exposure pumping underground.
 */
export const previewTarget = (time: number): number => 0.055 * (0.34 / 0.055) ** Math.min(1, Math.max(0, time));
export const previewGain = (baseline: number, time: number): number => {
  const b = Math.min(0.95, Math.max(0.005, baseline)), t = previewTarget(time);
  return (t / (1 - t)) / (b / (1 - b));
};
export function previewRgb(rgb: readonly number[], baseline: number, time: number): [number, number, number] {
  const g = previewGain(baseline, time);
  return rgb.map(c => { const x = Math.min(1, Math.max(0, c)); return x * g / (1 + x * (g - 1)); }) as [number, number, number];
}

export interface Baseline { median: number; p10: number; p90: number; triangles: number }

/** Shared atmosphere endpoints for the outdoor preview; browser adaptation, not original values. */
export const atmosphereTarget = (time: number): [number, number, number] => {
  const t = Math.min(1, Math.max(0, time));
  const night = [0.012, 0.019, 0.035], day = [0.47, 0.58, 0.70];
  return night.map((v, c) => v * (day[c]!/v)**t) as [number,number,number];
};

/** Surface-area-weighted histogram of estimated texel * prelight luminance. Only opaque,
 * fogged world surfaces: skips sky, water, glow and alpha passes. Texture means are an
 * approximation (not UV sampling); geometry establishes a repeatable baseline, not ground truth.
 */
export function calibrate(map: LoadedMap): Baseline {
  const bins = new Float64Array(1024);
  let total = 0, triangles = 0;
  const means = new Map<string, number[]>();
  for (const p of map.world) {
    if (!p.fog || p.vertexAlpha || p.alphaPass || p.alternate || /sky|shadow|glow|flare|water|beam/i.test(p.textureName ?? '')) continue;
    let tex = [1, 1, 1];
    if (p.textureName && map.textures[p.textureName]) {
      let mean = means.get(p.textureName);
      if (!mean) {
        const data = map.textures[p.textureName]!.data;
        mean = [0, 0, 0]; let n = 0;
        // At most ~4096 texels per texture. Transparent texels contribute no surface.
        const step = Math.max(1, Math.floor(data.length / 4 / 4096)) * 4;
        for (let i = 0; i < data.length; i += step) if (data[i + 3]! >= 128) {
          for (let c = 0; c < 3; c++) mean[c]! += data[i + c]! / 255;
          n++;
        }
        mean = n ? mean.map(v => v / n) : [0, 0, 0];
        means.set(p.textureName, mean);
      }
      tex = mean;
    }
    const colours = new Float32Array(p.colors.length);
    applyLighting(p, { ...DEFAULT_LIGHTING, rig: map.lightRig }, colours);
    for (let i = 0; i < p.indices.length; i += 3) {
      const a = p.indices[i]!, b = p.indices[i+1]!, c = p.indices[i+2]!;
      const ps = p.positions;
      const ux=ps[b*3]!-ps[a*3]!, uy=ps[b*3+1]!-ps[a*3+1]!, uz=ps[b*3+2]!-ps[a*3+2]!;
      const vx=ps[c*3]!-ps[a*3]!, vy=ps[c*3+1]!-ps[a*3+1]!, vz=ps[c*3+2]!-ps[a*3+2]!;
      const area = Math.hypot(uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx) / 2;
      if (!(area > 0)) continue;
      let y = 0;
      for (let k = 0; k < 3; k++) {
        const v = Math.min(1, Math.max(0, tex[k]! * (colours[a*4+k]!+colours[b*4+k]!+colours[c*4+k]!) / 3));
        y += v * [0.2126, 0.7152, 0.0722][k]!;
      }
      if (y <= 0.001) continue;
      bins[Math.min(1023, Math.floor(y*1024))]! += area;
      total += area; triangles++;
    }
  }
  const quantile = (q: number) => {
    if (!total) return 0.18;
    let n=0;
    for (let i=0; i<bins.length; i++) { n+=bins[i]!; if (n >= total*q) return (i+0.5)/1024; }
    return 0.18;
  };
  return { median: quantile(0.5), p10: quantile(0.1), p90: quantile(0.9), triangles };
}
