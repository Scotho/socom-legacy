import type { Rgba } from '@s2u/gs';
import { devSwitches } from './source';
export type UiSamplingMode = 'nearest' | 'bilinear' | 'integer' | 'sharpen';
export interface UiSamplingSettings { enabled: boolean; mode: UiSamplingMode; sharpness: number; snap: number }
export const UI_SAMPLING_DEFAULTS: UiSamplingSettings = { enabled: false, mode: 'nearest', sharpness: 0.5, snap: 1 };
const MODES: readonly string[] = ['nearest', 'bilinear', 'integer', 'sharpen'];
/** Owner's optional display experiment, no original (research 260). This module stays THREE-free for OT.R12. */
export function uiSampling(settings: UiSamplingSettings): UiSamplingSettings {
  return { enabled: !!settings.enabled, mode: MODES.includes(settings.mode) ? settings.mode : 'nearest',
    sharpness: Number.isFinite(settings.sharpness) ? Math.min(1, Math.max(0, settings.sharpness)) : 0.5,
    snap: Number.isFinite(settings.snap) ? Math.min(4, Math.max(1, Math.round(settings.snap))) : 1 };
}
/** Largest whole multiple inside the existing box. Too-small boxes fit proportionally; never crop or enlarge. */
export function integerFit(w: number, h: number, boxW: number, boxH: number, snap = 1): {width:number;height:number;scale:number} {
  if (!(w > 0 && h > 0 && boxW > 0 && boxH > 0)) return {width:boxW,height:boxH,scale:1};
  const fit = Math.min(boxW / w, boxH / h), step = Math.min(4, Math.max(1, Math.round(snap)));
  const whole = Math.floor(fit + 1e-9), scale = whole < 1 ? fit : whole < step ? whole : Math.floor(whole / step) * step;
  return {width:w * scale,height:h * scale,scale};
}
const sharpened = new WeakMap<Rgba, {amount:number; bitmap:Rgba}>();
/** Source-size RGB unsharp mask; alpha and transparent pixels unchanged. One cached variant per live bitmap. */
export function sharpenBitmap(bitmap: Rgba, amount: number): Rgba {
  amount = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  if (amount === 0) return bitmap;
  const cached = sharpened.get(bitmap); if (cached?.amount === amount) return cached.bitmap;
  const {width:w,height:h,data:src} = bitmap, data = new Uint8ClampedArray(src);
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*4; if(src[i+3]===0) continue;
    const neighbours=[(y*w+Math.max(0,x-1))*4,(y*w+Math.min(w-1,x+1))*4,(Math.max(0,y-1)*w+x)*4,(Math.min(h-1,y+1)*w+x)*4];
    const weight=neighbours.reduce((n,j)=>n+src[j+3]!,0); if(weight===0) continue;
    for(let ch=0;ch<3;ch++) {
      const blur=neighbours.reduce((n,j)=>n+src[j+ch]!*src[j+3]!,0)/weight;
      data[i+ch]=src[i+ch]!+amount*(src[i+ch]!-blur);
    }
  }
  const result={width:w,height:h,data}; sharpened.set(bitmap,{amount,bitmap:result}); return result;
}
/**
 * An invalid experiment is ignored as a whole; ordinary players never enter this branch: a development build's only
 * (`import.meta.env.DEV`, the other `devmode` readers' rule -- CX-9a fix round: the console now hands `devmode` on).
 */
export function parseMenuSampling(search: string): UiSamplingSettings | null {
  const q=new URLSearchParams(search);
  if(!import.meta.env.DEV || !devSwitches(search).tools || q.getAll('expMenu').length!==1 || !MODES.includes(q.get('expMenu')!)) return null;
  const numeric=(key:string,fallback:number,min:number,max:number,whole=false):number|null=>{
    if(!q.has(key)) return fallback;
    if(q.getAll(key).length!==1 || !q.get(key)!.trim()) return null;
    const v=Number(q.get(key)); return Number.isFinite(v)&&v>=min&&v<=max&&(!whole||Number.isInteger(v))?v:null;
  };
  const sharpness=numeric('expMenuSharp',.5,0,1),snap=numeric('expMenuSnap',1,1,4,true);
  return sharpness===null||snap===null?null:{enabled:true,mode:q.get('expMenu') as UiSamplingMode,sharpness,snap};
}
export function menuPreviewUrl(base: string, settings: UiSamplingSettings): string {
  const source=new URL(base);source.pathname=source.pathname.replace(/\/testroom\/?$/,'/');
  const url=new URL('.',source),s=uiSampling(settings);url.searchParams.set('devmode','');
  if(s.enabled){url.searchParams.set('expMenu',s.mode);url.searchParams.set('expMenuSharp',String(s.sharpness));url.searchParams.set('expMenuSnap',String(s.snap));}
  return url.href;
}
/** Final menu frame scaling in physical display pixels; its logical 640x448 canvas and input coordinates stay fixed. */
export function mountMenuSampling(canvas: HTMLCanvasElement, settings: UiSamplingSettings | null): () => void {
  const win=canvas.ownerDocument.defaultView;if(!settings?.enabled||!win)return()=>{};
  const s=uiSampling(settings),original=canvas.style.cssText;
  const resize=():void=>{
    canvas.style.imageRendering=s.mode==='bilinear'?'auto':'pixelated';
    if(s.mode==='integer') {
      const dpr=Number.isFinite(win.devicePixelRatio)&&win.devicePixelRatio>0?win.devicePixelRatio:1;
      const fit=integerFit(640,448,win.innerWidth*dpr,win.innerHeight*dpr,s.snap);
      canvas.style.width=`${fit.width/dpr}px`;canvas.style.height=`${fit.height/dpr}px`;
      canvas.style.inset='0';canvas.style.margin='auto';
    }
  };
  resize();win.addEventListener('resize',resize);
  return()=>{win.removeEventListener('resize',resize);canvas.style.cssText=original;};
}
