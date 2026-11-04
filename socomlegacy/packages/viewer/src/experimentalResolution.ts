/** Requested scale can exceed four at small viewport sizes; preserve the experiment's allocation ceiling. */
export const EXPERIMENTAL_MAX_SCALE = 6;
export const EXPERIMENTAL_MAX_DIMENSION = 4096;
export function experimentalFrameSize(width: number, height: number, requested: number) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const wanted = Math.max(1, Math.min(EXPERIMENTAL_MAX_SCALE, requested));
  const scale = Math.min(wanted, EXPERIMENTAL_MAX_DIMENSION / w, EXPERIMENTAL_MAX_DIMENSION / h);
  return {width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale, limited: scale < wanted - 0.001};
}
