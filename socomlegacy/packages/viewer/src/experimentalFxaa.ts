import {LinearFilter, RenderTarget, type Scene} from 'three';
import type {Node} from 'three/webgpu';
import {texture, vec4} from 'three/tsl';
import {fxaa} from 'three/addons/tsl/display/FXAANode.js';

/** Final display-value FXAA, using three r186's node. GS values already are display values; no gamma conversion. */
export function experimentalFxaa(screen: (colour: ReturnType<typeof vec4>) => Scene) {
  const target = new RenderTarget(1, 1, {samples:0, depthBuffer:false, minFilter:LinearFilter, magFilter:LinearFilter});
  const scene = screen(vec4((fxaa(texture(target.texture)) as unknown as Node<'vec4'>).rgb, 1));
  let held = false;
  return {
    target, scene,
    acquire(width: number, height: number): void { held = true; target.setSize(width, height); },
    release(): void { if (held) {target.dispose(); held = false;} },
  };
}
