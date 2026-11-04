import {describe,expect,it} from 'vitest';
import {DataTexture,LinearFilter,Mesh,PlaneGeometry,Scene,Vector2} from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {positionGeometry,uniform,uv,vec4} from 'three/tsl';
import {graphicShader} from './experimentalShaderFixture';
import {postShader} from './experimentalPostFixture';
import {experimentalPass} from '../src/experimentalPass';
import {experimentalFxaa} from '../src/experimentalFxaa';
import {resolveSample} from '../src/experimentalResolve';
const screen=(colour:ReturnType<typeof vec4>)=>{
 const material=new MeshBasicNodeMaterial();material.colorNode=colour;material.vertexNode=vec4(positionGeometry.xy,0,1);
 material.depthTest=false;material.depthWrite=false;material.fog=false;
 const scene=new Scene();scene.add(new Mesh(new PlaneGeometry(2,2),material));return scene;
};
describe('GX-24 offline shader generation (no GPU execution)',()=>{
 for(const backend of ['GLSL','WGSL'] as const){
  it(backend+' compiles every resolve filter with and without bloom',()=>{
   for(const mode of ['nearest','bilinear','bicubic'] as const)for(const bloom of [false,true]){
    const shader=postShader(backend,bloom,false,(a,b,c,d)=>experimentalPass(a,b,c,d,mode));
    expect(shader).not.toMatch(/NaN|Infinity|undefined/);
    if(mode==='bilinear')expect(shader).toBe(postShader(backend,bloom,false));
    else expect(shader).not.toBe(postShader(backend,bloom,false));
   }
  });
  it(backend+' compiles the actual FXAA node and opaque final output',()=>{
   const aa=experimentalFxaa(screen);aa.acquire(640,360);
   const mesh=aa.scene.children[0] as Mesh;
   const shader=graphicShader(mesh,backend);
   expect(shader).toMatch(/texture/);expect(shader).toMatch(/0.063/);expect(shader).not.toMatch(/NaN|Infinity|undefined/);
   aa.release();(mesh.material as MeshBasicNodeMaterial).dispose();mesh.geometry.dispose();
  });
  it(backend+' builds sixteen source-centred bicubic taps',()=>{
   const source=new DataTexture(new Uint8Array(64),4,4);source.minFilter=source.magFilter=LinearFilter;
   const scene=screen(vec4(resolveSample(source,uv(),uniform(new Vector2(0.25,0.25)),'bicubic').rgb,1));
   const mesh=scene.children[0] as Mesh,shader=graphicShader(mesh,backend);
   expect((shader.match(backend==='GLSL'?/textureLod\(/g:/textureSampleLevel\(/g)??[]).length).toBe(16);
   (mesh.material as MeshBasicNodeMaterial).dispose();mesh.geometry.dispose();source.dispose();
  });
 }
});
