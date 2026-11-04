import {beforeEach,describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Material} from 'three';
import {graphicMeshes,graphicShader} from './experimentalShaderFixture';
import {updateExperimentalAssets} from '../src/experimentalAssets';
import {EXPERIMENTAL_DEFAULTS} from '../src/experimentalGraphics';

// Captured from unmodified world.ts/bodyView.ts/rigShading.ts at the recorded base, with this synthetic fixture.
// Both stages, both backends, same installed three.js. No renderer/device or original game assets are loaded.
const original=JSON.parse(readFileSync(new URL('./experimentalOriginal.json',import.meta.url),'utf8')) as {sourceCommit:string;hashes:Record<string,string>};
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
describe('ordinary shader source equals the base apart from generated buffer identifiers',()=>{
  beforeEach(()=>updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS,enabled:false}));
  for(const backend of ['GLSL','WGSL'] as const)it(backend,()=>{
    const v=graphicMeshes();
    const materials=Object.values(v.meshes).map(m=>m.material as Material);
    const nodes=materials.map(m=>(m as Material & {colorNode:unknown}).colorNode);
    const checkOriginal=()=>{for(const [name,m] of Object.entries(v.meshes))expect(hash(graphicShader(m,backend)),name+' @ '+original.sourceCommit).toBe(original.hashes[backend+'/'+name]);};
    try{
      checkOriginal();
      updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS,enabled:true,textureBias:true,detailAdjust:true,characterLight:true});
      for(const [name,m] of Object.entries(v.meshes))expect(hash(graphicShader(m,backend)),name).not.toBe(original.hashes[backend+'/'+name]);
      const versions=materials.map(m=>m.version);
      updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS,enabled:true,textureBias:true,detailAdjust:true,characterLight:true,mipBias:-2,detailStrength:2,characterAmbient:0.4});
      expect(materials.map(m=>m.version)).toEqual(versions); // slider motion updates uniforms, not material graphs
      updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS,enabled:false});
      checkOriginal();
      expect(Object.values(v.meshes).map(m=>m.material)).toEqual(materials);
      expect(materials.map(m=>(m as Material & {colorNode:unknown}).colorNode)).toEqual(nodes);
    }finally{v.dispose();updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS,enabled:false});}
    const disposedVersions=materials.map(m=>m.version);
    updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS,enabled:true,textureBias:true,detailAdjust:true,characterLight:true});
    expect(materials.map(m=>m.version)).toEqual(disposedVersions); // disposed views unsubscribed
    updateExperimentalAssets({...EXPERIMENTAL_DEFAULTS,enabled:false});
  });
});
