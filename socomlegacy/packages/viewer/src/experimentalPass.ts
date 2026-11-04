import { Vector2, Vector3, type Texture } from 'three';
import { exp2, mix, smoothstep, texture, uniform, uv, float, vec2, vec3, vec4 } from 'three/tsl';
import type { ExperimentalSettings } from './experimentalGraphics';
import {resolveSample, type ResolveFilter} from './experimentalResolve';
import { experimentalColourGains, POST_COLOUR } from './experimentalColour';

/** A single five-tap display-space pass. The existing GS colour convention is intentionally unchanged. */
export function experimentalPass(source: Texture, bloom?: Texture, rollOff = false, features = 0, resolve: ResolveFilter | null = null) {
  const texel = uniform(new Vector2(1, 1));
  const sharpness = uniform(0), exposure = uniform(1), contrast = uniform(1), saturation = uniform(1);
  const bloomStrength = uniform(0);
  const highlightStrength = rollOff ? uniform(0) : null;
  const colourGain = features & POST_COLOUR.whiteBalance ? uniform(new Vector3(1, 1, 1)) : null;
  const toneStops = features & POST_COLOUR.toneBalance ? uniform(new Vector2(0, 0)) : null;
  const bloomColour = bloom && features & POST_COLOUR.bloomTint ? uniform(new Vector3(1, 1, 1)) : null;
  // Null keeps the exact prior graph; no new samples or operations when GX-24 is OFF.
  const sample = (x: number, y: number) => resolve
    ? resolveSample(source, uv().add(vec2(x, y).mul(texel)), texel, resolve).rgb
    : texture(source, uv().add(vec2(x, y).mul(texel))).rgb;
  const centre = sample(0, 0);
  const neighbours = sample(-1, 0).add(sample(1, 0)).add(sample(0, -1)).add(sample(0, 1)).mul(0.25);
  const sharpened = centre.add(centre.sub(neighbours).mul(sharpness)).clamp(0, 1);
  const glow = bloom ? texture(bloom, uv()).rgb.mul(bloomStrength) : null;
  const detail = (glow ? sharpened.add(bloomColour ? glow.mul(bloomColour) : glow) : sharpened).mul(exposure);
  const luma = detail.dot(vec3(0.2126, 0.7152, 0.0722));
  const graded = mix(vec3(luma), detail, saturation).sub(0.5).mul(contrast).add(0.5);
  let output = graded;
  if (colourGain) output = output.mul(colourGain);
  if (toneStops) {
    // Smooth, disjoint tonal weights meet at middle grey. Hand-picked browser adaptation (research 260).
    const luminance = output.dot(vec3(0.2126, 0.7152, 0.0722)).clamp(0, 1);
    const shadowWeight = float(1).sub(smoothstep(0, 0.5, luminance));
    const highlightWeight = smoothstep(0.5, 1, luminance);
    output = output.mul(exp2(shadowWeight.mul(toneStops.x).add(highlightWeight.mul(toneStops.y))));
  }
  if (highlightStrength) {
    // Browser adaptation (H135), not an original reading: a hand-picked shoulder above 0.75.
    // Compress the peak channel from k+x to k+x/(1+x/(1-k)), then scale RGB together.
    // Below the knee the scale is exactly one; at full strength the peak approaches one.
    // This is display-value shaping, not HDR recovery: the input target has already clamped.
    const peak = output.r.max(output.g).max(output.b).max(0.0001);
    const excess = peak.sub(0.75).max(0);
    const reduction = excess.sub(excess.div(excess.mul(4).add(1)));
    output = output.mul(float(1).sub(reduction.div(peak).mul(highlightStrength)));
  }
  const colour = output.clamp(0, 1);
  return {
    colour: vec4(colour, 1),
    resize: (width: number, height: number): void => { texel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height)); },
    update: (s: ExperimentalSettings): void => {
      bloomStrength.value = s.bloom ? s.bloomStrength : 0;
      if (colourGain) colourGain.value.fromArray(s.whiteBalance ? experimentalColourGains(s.warmth, s.tint) : [1, 1, 1]);
      if (toneStops) toneStops.value.set(s.toneBalance ? Math.max(-1, Math.min(1, s.shadows)) : 0, s.toneBalance ? Math.max(-1, Math.min(1, s.highlights)) : 0);
      if (bloomColour) bloomColour.value.fromArray(s.bloomTint ? [s.bloomRed, s.bloomGreen, s.bloomBlue].map(v => Math.max(0, Math.min(2, v))) : [1, 1, 1]);
      sharpness.value = s.sharpen ? s.sharpness : 0;
      exposure.value = s.grade ? 2 ** s.exposure : 1;
      contrast.value = s.grade ? s.contrast : 1;
      saturation.value = s.grade ? s.saturation : 1;
      if (highlightStrength) highlightStrength.value = s.highlightRollOff ? Math.max(0, Math.min(1, s.highlightStrength)) : 0;
    },
  };
}
