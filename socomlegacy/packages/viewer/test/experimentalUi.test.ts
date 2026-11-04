import {describe,expect,it} from 'vitest';
import {LinearFilter,NearestFilter,type MeshBasicMaterial} from 'three';
import original from './experimentalUiOriginal.json';
import {layers,draw,snapshot,textureOf} from './experimentalUiFixture';
import {UI_SAMPLING_DEFAULTS,type UiSamplingSettings} from '../src/experimentalUiSampling';

/** The commit of main whose HUD/reticle OFF submission the json pins (H135, research 260: OFF equals main as it is);
 * a re-pin regenerates the json from that commit's sources and changes only its `sourceCommit`. */
const UI_BASELINE_COMMIT=original.sourceCommit;
describe('HUD and reticle sampling experiment',()=>{
  it.each([1080,1440])(`OFF pins main ${UI_BASELINE_COMMIT}'s draw calls, geometry and samplers at %ip`,h=>{
    const l=layers();try{for(const name of ['hud','reticle'] as const)expect(snapshot(l[name],h*16/9,h)).toBe(original.hashes[`${name}/${h}` as keyof typeof original.hashes]);}finally{l.dispose();}
  });
  it.each(['nearest','bilinear','integer','sharpen'] as const)(`%s changes only display sampling and OFF restores main ${UI_BASELINE_COMMIT}'s exact objects and pixels`,mode=>{
    const l=layers();try{
      for(const name of ['hud','reticle'] as const){
        const layer=l[name];const before=draw(layer);const state=l.reticle.state();
        const refs=before.meshes.map(m=>({geometry:m.geometry,material:m.material,position:m.position.toArray(),scale:m.scale.toArray(),map:textureOf(m),image:textureOf(m)?.image}));
        expect(typeof (layer as unknown as {setExperimentalSampling?:unknown}).setExperimentalSampling).toBe('function');
        layer.setExperimentalSampling({...UI_SAMPLING_DEFAULTS,enabled:true,mode});
        const after=draw(layer);expect(after.scenes.length).toBe(before.scenes.length);expect(after.meshes.length).toBe(before.meshes.length);
        expect(l.reticle.state()).toEqual(state);
        after.meshes.forEach((m,i)=>{const old=refs[i]!;expect(m.position.toArray()).toEqual(old.position);expect(m.scale.toArray()).toEqual(old.scale);expect(m.material).toBe(old.material);const map=textureOf(m);if(map)expect(map.magFilter).toBe(mode==='bilinear'?LinearFilter:NearestFilter);});
        layer.setExperimentalSampling({...UI_SAMPLING_DEFAULTS});
        expect(snapshot(layer,1920,1080)).toBe(original.hashes[`${name}/1080`]);
        draw(layer).meshes.forEach((m,i)=>{expect(m.geometry).toBe(refs[i]!.geometry);expect(textureOf(m)).toBe(refs[i]!.map);expect(textureOf(m)?.image).toBe(refs[i]!.image);});
      }
    }finally{l.dispose();}
  });
  it('integer mode letterboxes reticle content at 2x/3x without changing aim layout or accumulating resize error',()=>{
    const l=layers();try{
      expect(typeof (l.reticle as unknown as {setExperimentalSampling?:unknown}).setExperimentalSampling).toBe('function');
      l.reticle.setExperimentalSampling({...UI_SAMPLING_DEFAULTS,enabled:true,mode:'integer'});
      for(const h of [1080,1440,1080]){
        const {meshes}=draw(l.reticle,h*16/9,h);const ring=meshes[0]!;const p=ring.geometry.getAttribute('position');const xs=Array.from({length:p.count},(_,i)=>p.getX(i));
        expect((Math.max(...xs)-Math.min(...xs))*ring.scale.x).toBeCloseTo(64*(h===1080?2:3),4);
      }
    }finally{l.dispose();}
  });
  it('does not upload again each frame, releases fitted geometry, and applies to newly loaded bitmaps',()=>{
    const l=layers();try{
      l.reticle.setExperimentalSampling({...UI_SAMPLING_DEFAULTS,enabled:true,mode:'sharpen'});
      const first=draw(l.reticle).meshes[0]!,map=textureOf(first)!;const version=map.version,image=map.image;
      draw(l.reticle);expect(map.version).toBe(version);expect(map.image).toBe(image);
      l.reticle.setExperimentalSampling({...UI_SAMPLING_DEFAULTS,enabled:true,mode:'integer'});
      const fitted=draw(l.reticle).meshes[0]!.geometry;let disposed=0;fitted.addEventListener('dispose',()=>disposed++);
      l.reticle.setExperimentalSampling({...UI_SAMPLING_DEFAULTS});expect(disposed).toBe(1);
      l.reticle.setExperimentalSampling({...UI_SAMPLING_DEFAULTS,enabled:true,mode:'bilinear'});
      const bitmap={width:4,height:4,data:new Uint8ClampedArray(64).fill(255)};
      l.reticle.setBitmaps({fixed:bitmap,floating:bitmap,accuracy:null});
      const replacement=textureOf(draw(l.reticle).meshes[0]!)!;expect(replacement).not.toBe(map);expect(replacement.magFilter).toBe(LinearFilter);
      l.reticle.setExperimentalSampling({...UI_SAMPLING_DEFAULTS});expect(replacement.magFilter).toBe(NearestFilter);expect(replacement.image.data).toBe(bitmap.data);
    }finally{l.dispose();}
  });
});
