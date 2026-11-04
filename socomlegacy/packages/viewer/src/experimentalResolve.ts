import type {Texture} from 'three';
import type {Node} from 'three/webgpu';
import {float, Fn, texture, vec2, vec4} from 'three/tsl';
export type ResolveFilter = 'nearest' | 'bilinear' | 'bicubic';

/** Catmull-Rom reconstruction at source texel centres; browser adaptation, not an area downsampler. */
export function resolveSample(source: Texture, at: Node<'vec2'>, texel: Node<'vec2'>, mode: ResolveFilter): Node<'vec4'> {
  if (mode === 'bilinear') return texture(source, at) as unknown as Node<'vec4'>;
  const p = at.div(texel).sub(0.5);
  if (mode === 'nearest') return texture(source, p.add(0.5).floor().add(0.5).mul(texel)).level(float(0)) as unknown as Node<'vec4'>;
  return Fn(() => {
    const base = p.floor().toVar(), f = p.sub(base).toVar();
    const weights = (t: Node<'float'>) => {
      const t2 = t.mul(t), t3 = t2.mul(t);
      return [t.mul(-0.5).add(t2).sub(t3.mul(0.5)), float(1).sub(t2.mul(2.5)).add(t3.mul(1.5)),
        t.mul(0.5).add(t2.mul(2)).sub(t3.mul(1.5)), t3.sub(t2).mul(0.5)];
    };
    const wx = weights(f.x), wy = weights(f.y), result = vec4(0).toVar();
    for (let y=0;y<4;y++) for (let x=0;x<4;x++) {
      const coord = base.add(vec2(x-1,y-1)).add(0.5).mul(texel);
      result.addAssign(texture(source, coord).level(float(0)).mul(wx[x]!).mul(wy[y]!));
    }
    return result;
  })() as unknown as Node<'vec4'>;
}
