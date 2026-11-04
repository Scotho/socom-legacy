import {DataTexture, Mesh, PlaneGeometry} from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {positionGeometry, vec4} from 'three/tsl';
import {experimentalPass} from '../src/experimentalPass';
import {EXPERIMENTAL_DEFAULTS} from '../src/experimentalGraphics';
import {graphicShader} from './experimentalShaderFixture';

/** Identical synthetic inputs for the pinned pre-roll-off pass and the current pass. No GPU. */
export function postShader(kind: 'GLSL' | 'WGSL', bloom: boolean, rollOff: boolean, factory = experimentalPass, features = 0, settings: Partial<typeof EXPERIMENTAL_DEFAULTS> = {}) {
  const source = new DataTexture(new Uint8Array([128,128,128,255]),1,1);
  const glow = new DataTexture(new Uint8Array([32,16,8,255]),1,1);
  const pass = factory(source, bloom ? glow : undefined, rollOff, features);
  pass.update({...EXPERIMENTAL_DEFAULTS, enabled: true, highlightRollOff: rollOff, ...settings});
  pass.resize(1280,720);
  const material = new MeshBasicNodeMaterial();
  material.colorNode = pass.colour; material.vertexNode = vec4(positionGeometry.xy,0,1);
  material.depthTest = false; material.depthWrite = false; material.fog = false;
  const mesh = new Mesh(new PlaneGeometry(2,2),material);
  const shader = graphicShader(mesh,kind);
  material.dispose(); mesh.geometry.dispose(); source.dispose(); glow.dispose();
  return shader;
}
