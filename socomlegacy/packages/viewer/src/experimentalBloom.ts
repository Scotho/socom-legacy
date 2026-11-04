import { LinearFilter, LinearSRGBColorSpace, RenderTarget, Vector2, type Camera, type Scene, type Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { smoothstep, texture, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import type { ExperimentalSettings } from './experimentalGraphics';

/** Bright-area bloom in two quarter-resolution buffers. No depth, relighting, or HUD input. */
export function experimentalBloom(source: Texture, screen: (colour: ReturnType<typeof vec4>) => Scene, camera: Camera) {
  const target = () => new RenderTarget(1, 1, {
    samples: 0, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter,
    generateMipmaps: false, colorSpace: LinearSRGBColorSpace,
  });
  const a = target(), b = target();
  const sourceTexel = uniform(new Vector2(1, 1)), blurTexel = uniform(new Vector2(1, 1));
  const threshold = uniform(0.82), radius = uniform(1);
  const bright = (x: number, y: number) => {
    const colour = texture(source, uv().add(vec2(x, y).mul(sourceTexel))).rgb;
    // The owner's chosen bloom knee, not a reading of the original.
    return colour.mul(smoothstep(threshold, threshold.add(0.12), colour.dot(vec3(0.2126, 0.7152, 0.0722))));
  };
  const extract = screen(vec4(bright(-1, -1).add(bright(1, -1)).add(bright(-1, 1)).add(bright(1, 1)).mul(0.25), 1));
  const blur = (input: Texture, x: number, y: number): Scene => {
    const step = vec2(x, y).mul(blurTexel).mul(radius);
    const sample = (offset: number) => texture(input, uv().add(step.mul(offset))).rgb;
    return screen(vec4(sample(-2).add(sample(-1).mul(4)).add(sample(0).mul(6)).add(sample(1).mul(4)).add(sample(2)).mul(1 / 16), 1));
  };
  const horizontal = blur(a.texture, 1, 0), vertical = blur(b.texture, 0, 1);
  let allocated = false;
  return {
    texture: a.texture,
    update(settings: ExperimentalSettings): void {
      threshold.value = settings.bloomThreshold;
      radius.value = settings.bloomRadius;
    },
    render(renderer: WebGPURenderer, width: number, height: number): void {
      const w = Math.max(1, Math.ceil(width / 4)), h = Math.max(1, Math.ceil(height / 4));
      if (a.width !== w || a.height !== h) { a.setSize(w, h); b.setSize(w, h); }
      sourceTexel.value.set(1 / width, 1 / height); blurTexel.value.set(1 / w, 1 / h);
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      allocated = true;
      try {
        renderer.autoClear = true;
        renderer.setRenderTarget(a); renderer.render(extract, camera);
        renderer.setRenderTarget(b); renderer.render(horizontal, camera);
        renderer.setRenderTarget(a); renderer.render(vertical, camera);
      } finally {
        renderer.setRenderTarget(previous); renderer.autoClear = autoClear;
      }
    },
    release(): void {
      if (allocated) { a.dispose(); b.dispose(); allocated = false; }
    },
  };
}
