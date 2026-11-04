import {describe,expect,it} from 'vitest';
import type {Mesh,Material} from 'three';
import {layers,draw} from './experimentalUiFixture';
import {UI_SAMPLING_DEFAULTS} from '../src/experimentalUiSampling';

function boxes(mesh:Mesh){
 const p=mesh.geometry.getAttribute('position');const count=mesh.geometry.drawRange.count/6;
 return Array.from({length:count},(_,q)=>{
  const x=[0,1,2,3].map(k=>p.getX(q*4+k)),y=[0,1,2,3].map(k=>p.getY(q*4+k));
  return {x:Math.min(...x),y:Math.min(...y),w:Math.max(...x)-Math.min(...x),h:Math.max(...y)-Math.min(...y)};
 });
}
function selected(meshes:Mesh[],texture:string){return meshes.filter(m=>(m.material as Material).name.endsWith(' '+texture)).flatMap(boxes);}
describe('integer sampling preserves stretched HUD coverage',()=>{
 it.each([0,.25,.5,.75,1])('keeps the real health bar and fader boxes at health %s, including resize and step changes',health=>{
  const l=layers();try{
   for(const [h,snap]of [[1080,1],[1440,2],[1080,4]]){
    l.hud.setExperimentalSampling({...UI_SAMPLING_DEFAULTS});l.hud.patch({health,roundTime:0,frozen:true});
    const before=selected(draw(l.hud,h!*16/9,h!).meshes,'white');
    expect(before.some(b=>b.x===0&&b.y===0&&b.w===h!*16/9&&b.h===h)).toBe(true);
    l.hud.setExperimentalSampling({...UI_SAMPLING_DEFAULTS,enabled:true,mode:'integer',snap:snap!});l.hud.patch({roundTime:0});
    expect(selected(draw(l.hud,h!*16/9,h!).meshes,'white')).toEqual(before);
   }
  }finally{l.dispose();}
 });
 it('keeps stretched panel boxes while integer-fitting normal bitmap content',()=>{
  const l=layers();try{
   const before=draw(l.hud);const panels=selected(before.meshes,'newweapnbkrnd.tif'),compass=selected(before.meshes,'compass_lo.tif');
   expect(panels.length).toBeGreaterThan(0);expect(compass.length).toBe(1);
   l.hud.setExperimentalSampling({...UI_SAMPLING_DEFAULTS,enabled:true,mode:'integer'});
   const after=draw(l.hud);expect(selected(after.meshes,'newweapnbkrnd.tif')).toEqual(panels);
   const fit=selected(after.meshes,'compass_lo.tif')[0]!;expect(fit.w).toBeLessThan(compass[0]!.w);
   // Submitted positions are Float32: test the intended integer multiple within its storage precision.
   expect(fit.w/32).toBeCloseTo(Math.round(fit.w/32),4);expect(fit.h).toBeCloseTo(fit.w,4);
   expect(fit.x+fit.w/2).toBeCloseTo(compass[0]!.x+compass[0]!.w/2,3);
  }finally{l.dispose();}
 });
});
