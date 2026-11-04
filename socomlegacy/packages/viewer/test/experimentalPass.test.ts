import { describe, expect, it } from 'vitest';
import { experimentalBloom } from '../src/experimentalBloom';
import { DataTexture, Mesh, PlaneGeometry, PerspectiveCamera, Scene, type Material } from 'three';
import { GLSLNodeBuilder, WGSLNodeBuilder, MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { positionGeometry, vec4 } from 'three/tsl';
import { experimentalPass } from '../src/experimentalPass';
import { EXPERIMENTAL_DEFAULTS } from '../src/experimentalGraphics';

describe('offline experimental shaders generate GLSL and WGSL (no GPU device)', () => {
  for (const [name, Builder] of [['WebGL2', GLSLNodeBuilder], ['WebGPU', WGSLNodeBuilder]] as const) {
    it(name, () => {
      const renderer = new WebGPURenderer({canvas: {style:{},width:1,height:1,addEventListener(){},removeEventListener(){},getContext:()=>null} as unknown as HTMLCanvasElement, forceWebGL:true});
      // Offline node generation: assume no optional GPU capabilities, without initialising a device.
      renderer.hasFeature = () => false;
      // WGSL needs texture sample metadata even though this fixture has no initialized backend.
      (renderer.backend as unknown as {utils: unknown}).utils = {getTextureSampleData: () => ({primarySamples: 1})};
      const source = new DataTexture(new Uint8Array([128,128,128,255]),1,1);
      const camera = new PerspectiveCamera();
      const scenes: Scene[] = [];
      const screen = (colour: ReturnType<typeof vec4>): Scene => {
        const material = new MeshBasicNodeMaterial();
        material.colorNode=colour; material.vertexNode=vec4(positionGeometry.xy,0,1);
        material.depthTest=false; material.depthWrite=false; material.fog=false;
        const scene = new Scene(); scene.add(new Mesh(new PlaneGeometry(2,2),material));
        scenes.push(scene); return scene;
      };
      const bloom = experimentalBloom(source, screen, camera);
      for (const input of [undefined, bloom.texture]) {
        const pass = experimentalPass(source, input);
        pass.update({...EXPERIMENTAL_DEFAULTS, enabled:true, bloom:true}); pass.resize(1280,720);
        screen(pass.colour);
      }
      for (const scene of scenes) {
        const mesh = scene.children[0] as Mesh;
        const builder = new Builder(mesh,renderer as never) as unknown as {material:Material;camera:PerspectiveCamera;scene:Scene;build():void;fragmentShader:string};
        builder.material=mesh.material as Material;builder.camera=camera;builder.scene=scene;
        expect(()=>builder.build()).not.toThrow();
        expect(builder.fragmentShader).toMatch(/texture/);
        (mesh.material as Material).dispose(); mesh.geometry.dispose();
      }
      source.dispose();

    });
  }
});
