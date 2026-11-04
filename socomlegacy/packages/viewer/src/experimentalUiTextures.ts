import { LinearFilter, NearestFilter, type BufferGeometry, type DataTexture, type Mesh, type MeshBasicMaterial } from 'three';
import type { Rgba } from '@s2u/gs';
import { integerFit, sharpenBitmap, uiSampling, UI_SAMPLING_DEFAULTS, type UiSamplingSettings } from './experimentalUiSampling';
import { hdTextures } from './hdTexturePack';

/** Per-layer texture ownership. OFF does no registration/upload; restoration keeps the original objects. */
export class UiTextureExperiment {
  settings: UiSamplingSettings = {...UI_SAMPLING_DEFAULTS};
  private originals = new Map<DataTexture, {image:DataTexture['image']; min:DataTexture['minFilter'];mag:DataTexture['magFilter'];key:string}>();
  private geometry = new Map<Mesh, {original:BufferGeometry; fitted:BufferGeometry}>();
  set(settings:UiSamplingSettings):void { this.settings=uiSampling(settings); if(!this.settings.enabled)this.restore(); }
  apply(textures:readonly DataTexture[]):void {
    if(!this.settings.enabled)return;
    const {mode,sharpness}=this.settings,key=`${mode}/${mode==='sharpen'?sharpness:0}`;
    for(const texture of textures) {
      let old=this.originals.get(texture);
      // One owner a texture: a texture the HD pack (OT.R92) holds keeps the pack's image and is not sampled.
      if(!old&&!hdTextures.claim(texture,'ui-sampling'))continue;
      if(!old){old={image:texture.image,min:texture.minFilter,mag:texture.magFilter,key:''};this.originals.set(texture,old);}
      if(old.key===key)continue;
      const bitmap: Rgba=old.image as Rgba;
      texture.image=mode==='sharpen'?sharpenBitmap(bitmap,sharpness):old.image;
      texture.minFilter=texture.magFilter=mode==='bilinear'?LinearFilter:NearestFilter;
      texture.needsUpdate=true;old.key=key;
    }
  }
  /** Letterbox bitmap content within the original mesh transform. Coverage masks deliberately keep their full box. */
  fit(meshes:readonly Mesh[]):void {
    if(!this.settings.enabled||this.settings.mode!=='integer'){this.restoreGeometry();return;}
    for(const mesh of meshes) {
      const map=(mesh.material as MeshBasicMaterial).map;if(!map||!mesh.visible)continue;
      let entry=this.geometry.get(mesh);
      if(!entry){entry={original:mesh.geometry,fitted:mesh.geometry.clone()};this.geometry.set(mesh,entry);mesh.geometry=entry.fitted;}
      const bitmap = map.image as Rgba;
      const w=Math.abs(mesh.scale.x),h=Math.abs(mesh.scale.y),fit=integerFit(bitmap.width,bitmap.height,w,h,this.settings.snap);
      const src=entry.original.getAttribute('position'),dst=entry.fitted.getAttribute('position');
      for(let i=0;i<src.count;i++)dst.setXYZ(i,src.getX(i)*(w?fit.width/w:1),src.getY(i)*(h?fit.height/h:1),src.getZ(i));
      dst.needsUpdate=true;entry.fitted.computeBoundingSphere();
    }
  }
  private restoreGeometry():void { for(const [mesh,e]of this.geometry){mesh.geometry=e.original;e.fitted.dispose();}this.geometry.clear(); }
  private restore():void {
    this.restoreGeometry();
    for(const [texture,old]of this.originals){texture.image=old.image;texture.minFilter=old.min;texture.magFilter=old.mag;texture.needsUpdate=true;hdTextures.release(texture,'ui-sampling');}
    this.originals.clear();
  }
  clear():void { this.restore(); }
}
