import type {ExperimentalSettings} from './experimentalGraphics';

/** Browser adaptation, research 260. Bits select graphs, never original-game flags. */
export const POST_COLOUR = {rollOff: 1, whiteBalance: 2, toneBalance: 4, bloomTint: 8} as const;
export function experimentalPostVariant(s: ExperimentalSettings): number {
  if (!s.enabled) return 0;
  return (s.highlightRollOff && s.highlightStrength > 0 ? POST_COLOUR.rollOff : 0)
    | (s.whiteBalance && (s.warmth !== 0 || s.tint !== 0) ? POST_COLOUR.whiteBalance : 0)
    | (s.toneBalance && (s.shadows !== 0 || s.highlights !== 0) ? POST_COLOUR.toneBalance : 0)
    | (s.bloomTint && s.bloom && s.bloomStrength > 0 && (s.bloomRed !== 1 || s.bloomGreen !== 1 || s.bloomBlue !== 1) ? POST_COLOUR.bloomTint : 0);
}

/** Display-value gains, not a calibrated Kelvin white balance; deliberately mild at one quarter stop per axis. */
export function experimentalColourGains(warmth: number, tint: number): [number, number, number] {
  const w = Math.max(-1, Math.min(1, warmth)), t = Math.max(-1, Math.min(1, tint));
  return [2 ** ((w + t) * 0.25), 2 ** (-t * 0.25), 2 ** ((t - w) * 0.25)];
}
