import { UI_GPU_TOLERANCE_PIN } from './uiGpuToleranceData';

/**
 * GM-27 (the GPU menus plan, row GM-27; GM.R5; research 380 §1 and §5): the tolerance of the equality contract's class B
 * -- how far a frame our GPU menu drawer draws may sit from our own software drawer's (`rasterizeUiDrawList`) -- pinned
 * on real GPU classes. Its data (`./uiGpuToleranceData.ts`) is written by `tools/gm-pin-tolerance.ts` from the parity
 * spec's records; this module holds its shape and the guard every load passes. Byte identity with the GS stays LATER
 * `GS_INTEGER_RASTER` (research 380, the head): nothing here is a value of the original.
 */

/** B statistics (research 380 §1, "B"): max |Δ| per channel (R, G, B, A), and the pixels whose largest |Δ| is >= 1, 2, 3. */
export interface UiGpuToleranceStats { maxAbs: readonly [number, number, number, number]; atLeast: readonly [number, number, number] }

/** One parity record a pin was taken from: where it ran, on what, at which head. */
export interface UiGpuToleranceSource {
  label: string;
  /** `NVIDIA` (a real GPU), or the software rasteriser: `SwiftShader`, `llvmpipe`. */
  vendor: string;
  /** ANGLE's backend: `D3D11`, `Vulkan`, `OpenGL`. */
  backend: string;
  host: string;
  /** The page's `UNMASKED_RENDERER_WEBGL`, as the record's `renderer.json` holds it. */
  unmasked: string;
  /** The tree's commit the run was at. */
  sha: string;
  /** The day it ran (UTC). */
  date: string;
  /** Its `summary.jsonl`, relative to the evidence root the generator is given. */
  summary: string;
  /** How many of its runs the GPU drew (each folded into the pin). */
  runs: number;
}

/** The two classes a pin holds (GM-27 review finding 1): the software rasterisers (SwiftShader, llvmpipe) and the GPUs. */
export type UiGpuToleranceClass = 'software' | 'gpu';
export const UI_GPU_TOLERANCE_CLASSES: readonly UiGpuToleranceClass[] = ['software', 'gpu'];

/**
 * A pin: the day it was taken, the vendor matrix in words, its sources, and per class the bound per run key
 * (`case@scale/mode/blend`): `software` the twin and the software rasterisers' records; `gpu` the twin and every record
 * (a software record only where it exceeds the hardware's). The two classes hold the same keys.
 */
export interface UiGpuTolerancePin {
  pinned: string;
  vendors: string;
  sources: readonly UiGpuToleranceSource[];
  software: Readonly<Record<string, UiGpuToleranceStats>>;
  gpu: Readonly<Record<string, UiGpuToleranceStats>>;
}

/**
 * The largest |Δ| a pin may hold on any channel of any key: the lane holder's ruling (GM-27, 2026-11-09) that the
 * contract allows rounding-class differences only. A pin past it is refused, never taken as a wider bound (GM.R5).
 */
export const UI_GPU_TOLERANCE_MAX_ABS = 1;

/**
 * Refuses a pin with an empty class, classes holding different keys, a malformed key, or a key past rounding class
 * (|Δ| over 1, or pixels counted at |Δ| >= 2 or 3), naming the class and the key. Both classes are checked.
 */
export function checkTolerancePin(pin: UiGpuTolerancePin): UiGpuTolerancePin {
  const counts = (v: unknown, n: number): v is number[] =>
    Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0);
  for (const cls of UI_GPU_TOLERANCE_CLASSES) {
    const runs = pin[cls];
    const keys = runs ? Object.keys(runs) : [];
    if (!keys.length) throw Error(`GPU_RASTER_TOLERANCE_ADAPTATION: the pin's ${cls} class holds no run`);
    const other = pin[cls === 'gpu' ? 'software' : 'gpu'] ?? {};
    const lone = keys.filter((k) => !(k in other));
    if (lone.length) throw Error(`GPU_RASTER_TOLERANCE_ADAPTATION: ${cls} holds ${lone.join(', ')}, the other class does not`);
    for (const key of keys) {
      const r = runs[key] as { maxAbs?: unknown; atLeast?: unknown } | undefined;
      if (!r || !counts(r.maxAbs, 4) || !counts(r.atLeast, 3)) {
        throw Error(`GPU_RASTER_TOLERANCE_ADAPTATION: ${cls} ${key} is not B statistics (maxAbs: 4 counts, atLeast: 3)`);
      }
      r.maxAbs.forEach((v, i) => {
        if (v > UI_GPU_TOLERANCE_MAX_ABS) {
          throw Error(`GPU_RASTER_TOLERANCE_ADAPTATION: ${cls} ${key} max |Δ| ${'RGBA'[i]} ${v} is over ${UI_GPU_TOLERANCE_MAX_ABS}: past rounding class, refused (re-read the run; never a wider bound, GM.R5)`);
        }
      });
      r.atLeast.forEach((v, i) => {
        if (i > 0 && v > 0) throw Error(`GPU_RASTER_TOLERANCE_ADAPTATION: ${cls} ${key} counts ${v} pixels at |Δ| >= ${i + 1}: past rounding class, refused`);
      });
    }
  }
  return pin;
}

/**
 * `GPU_RASTER_TOLERANCE_ADAPTATION` -- [adaptation] no original; bounds the browser's GPU menu drawer against our own
 * software drawer (class B, GM.R5): per class -- the software rasterisers and the GPUs, the parity spec choosing by the
 * run's renderer (`isSoftwareAdapter`) -- and per run key, field by field, the max of the f32 twin and that class's
 * parity records (`software`: SwiftShader and llvmpipe; `gpu`: every record), `sources` named, dated `pinned`. Checked by `checkTolerancePin` wherever
 * it is loaded -- the parity spec (`pinnedBound`, `e2e/uiGpuParityRecord.ts`) before any page opens, and the generator
 * before it writes -- not at this module's import, so a pin the guard refuses can still be re-pinned.
 */
export const GPU_RASTER_TOLERANCE_ADAPTATION: UiGpuTolerancePin = UI_GPU_TOLERANCE_PIN;
