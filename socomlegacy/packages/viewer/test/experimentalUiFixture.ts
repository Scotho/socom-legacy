import {createHash} from 'node:crypto';
import {Mesh,Vector2,type MeshBasicMaterial,type Scene,type DataTexture} from 'three';
import type {MeshBasicNodeMaterial,Node,TextureNode} from 'three/webgpu';
import {Reticle} from '../src/reticle';
import {Hud} from '../src/hud';
import {HUD_LIBRARIES} from '../src/hudAssets';
export const rgba=(w=4,h=w)=>({width:w,height:h,data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:((i*37)%240)+8)});
export const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
export function textureOf(mesh:Mesh):DataTexture|null{
 const material=mesh.material as MeshBasicMaterial & MeshBasicNodeMaterial;let map=material.map;
 material.colorNode?.traverse((node:Node)=>{if((node as TextureNode).isTextureNode)map=(node as TextureNode).value;});return map as DataTexture|null;
}
export function layers(){
 const reticle=new Reticle();reticle.setBitmaps({fixed:rgba(64),floating:rgba(32),accuracy:null});reticle.setVisible(true);reticle.setSize(4,[3,2]);
 const hud=new Hud();hud.setBitmaps(Object.fromEntries(Object.values(HUD_LIBRARIES).flat().map(n=>[n,rgba(n==='font_text_01.tif'?512:32,n==='font_text_01.tif'?128:32)])));hud.setVisible(true);hud.patch({settled:true,frozen:true,roundTime:10});
 return {reticle,hud,dispose(){reticle.setBitmaps(null);hud.dispose();}};
}
export function draw(layer:Reticle|Hud,w=1920,h=1080){
 const scenes:Scene[]=[];layer.render({autoClear:true,getDrawingBufferSize:(v:Vector2)=>v.set(w,h),render(s){scenes.push(s);}});
 const meshes:Mesh[]=[];for(const s of scenes)s.traverse(o=>{if(o instanceof Mesh&&o.visible)meshes.push(o);});return {scenes,meshes};
}
export function snapshot(layer:Reticle|Hud,w:number,h:number):string{
 const {scenes,meshes}=draw(layer,w,h);
 return hash(JSON.stringify({drawCalls:scenes.length,meshes:meshes.map(m=>{
  const material=m.material as MeshBasicMaterial,map=textureOf(m);
  return {position:m.position.toArray(),scale:m.scale.toArray(),rotation:m.rotation.toArray(),order:m.renderOrder,range:m.geometry.drawRange,
   attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,a])=>[k,Array.from(a.array)])),index:m.geometry.index?Array.from(m.geometry.index.array):null,
   material:{type:material.type,opacity:material.opacity,colour:material.color?.toArray(),depthTest:material.depthTest,depthWrite:material.depthWrite,transparent:material.transparent},
   sampler:map?{mag:map.magFilter,min:map.minFilter,wrapS:map.wrapS,wrapT:map.wrapT,flip:map.flipY,colour:map.colorSpace,width:map.image.width,height:map.image.height,bytes:hash(new Uint8Array(map.image.data!.buffer,map.image.data!.byteOffset,map.image.data!.byteLength))}:null};
 })}));
}
