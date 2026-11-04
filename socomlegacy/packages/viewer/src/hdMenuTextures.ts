import type {Rgba} from '@s2u/gs';
import {HdTextureRegistry,hdKeyOf,reverseRows,type HdManifest} from './hdTexturePack';
import {HdServedPack} from './hdTexturePackServed';
import {pageHdStore} from './hdTexturePackStore';
import {HD_MENU_SCALE_LIMIT,UiQuadRasterCache,type UiHdTextures} from './uiCompositorView';

/**
 * HD-3 (OT.R92, HD.R8; plan 2026-10-31-hd-texture-pack-parity): the menus under HD (GoE Soul) -- a browser adaptation,
 * off unless the HD pack is on, changing only the texels the menus' CPU compositor samples and the resolution it draws
 * at, never what the menus do or where anything sits. The menus have no DataTexture for the pack's runtime to swap, so
 * each bitmap the compositor samples is looked up here: its HD image when the pack names it, at its own larger size.
 */

/**
 * The menus' scale from the pack: the commonest whole, square ratio of a replacement to its source over the manifest
 * (SOCOM II HD Textures: 3193 of 3392 entries are 4x), capped by `HD_MENU_SCALE_LIMIT` (4: a 2560 x 1792 frame, the
 * software raster's budget); 1 when no entry is a whole square ratio.
 */
export function hdMenuScale(m:Pick<HdManifest,'entries'>):number{
  const n=new Map<number,number>();
  for(const e of m.entries){
    const r=e.outWidth/e.width;
    if(Number.isInteger(r)&&r>1&&e.outHeight===e.height*r)n.set(r,(n.get(r)??0)+1);
  }
  let best=1,count=0;
  for(const [r,c] of n)if(c>count||(c===count&&r<best)){best=r;count=c;}
  return Math.min(best,HD_MENU_SCALE_LIMIT);
}

/** Browser budget, not a game value: the decoded HD images the menus keep (a 512 x 512 background is 16 MiB at 4x). */
export const HD_MENU_BYTES=384*1024*1024;
/**
 * Browser budget, not a game value: the quad cache the menus draw with while the pack is on. At 4x a full-frame
 * background's samples are 2560 x 1792 x 32 bytes (147 MiB), past the default 32 MiB cache, and re-sampling it every
 * frame doubled the frame's time (measured in Node: 169 ms against 87 ms for a background, six panels and 200 glyphs).
 */
export const HD_MENU_QUAD_CACHE_BYTES=384*1024*1024;

export interface HdReplacer {replacement(src:Rgba):Promise<Rgba|null>}

/**
 * The lookup the compositor takes (`RasterOptions.hd`). A bitmap is the page's top-row-first copy of a decode
 * (`./frontEndAssets`, `./armoryData`: `flipRows`); the pack is keyed by the decode as stored (HD.R3), so the bitmap's
 * rows are turned back to ask and the answer is turned top row first (`reverseRows`, as the registry does for a
 * `rowsReversed` texture). Keyed by the bytes, never by where the bitmap came from (a worker's copy keys alike). The
 * first ask starts the load and answers null (the original draws meanwhile). Each replacement is kept once, by the
 * pack's key, and counted once against the budget (review F2): a bank read again -- new objects, the same bytes --
 * takes the kept image, nothing fetched or counted again. The per-object memo only saves the hash.
 */
export class HdMenuTextures {
  private got=new WeakMap<Rgba,Rgba|null>();
  private kept=new Map<string,Rgba>();
  private loading=new Map<string,Promise<Rgba|null>>();
  private pending=new Set<Promise<void>>();
  private bytes=0;
  private answers=0;
  /** `changed`: a replacement kept (the status line's count). */
  constructor(private source:HdReplacer,readonly budget=HD_MENU_BYTES,private changed:()=>void=()=>undefined){ }
  /** How many of the pack's entries the menus hold. */
  get replaced():number{return this.kept.size;}
  /** HD-4 review F1: moves each time a bitmap's answer changes (null to its HD image), so a drawer can tell a frame is stale. */
  get version():number{return this.answers;}
  readonly lookup:UiHdTextures=(bitmap)=>{
    const hit=this.got.get(bitmap);if(hit!==undefined)return hit;
    this.got.set(bitmap,null);
    const turned=reverseRows(bitmap);
    const p=hdKeyOf(turned).then(async(key)=>{
      let image=this.kept.get(key)??null;
      if(!image){
        let load=this.loading.get(key);
        if(!load){
          load=this.source.replacement(turned).then(r=>{
            if(!r||this.bytes+r.data.length>this.budget)return null;
            this.bytes+=r.data.length;const t=reverseRows(r);this.kept.set(key,t);this.changed();return t;
          },()=>null).finally(()=>{this.loading.delete(key);});
          this.loading.set(key,load);
        }
        image=await load;
      }
      if(image){this.got.set(bitmap,image);this.answers++;}
    }).catch(()=>undefined).finally(()=>{this.pending.delete(p);});
    this.pending.add(p);
    return null;
  };
  /** Every load asked so far has finished. */
  async settled():Promise<void>{while(this.pending.size)await Promise.all([...this.pending]);}
}

/**
 * The front end's switch: on, the pack (its own `HdServedPack`, over a registry that collects nothing -- the match's
 * DataTextures are the match's pack's) read, the scale taken from its manifest and the lookup made; off, the frame is
 * the original's (scale 1, no lookup) and nothing is fetched.
 */
export class HdMenus {
  private pack:HdServedPack|null=null;
  private textures:HdMenuTextures|null=null;
  private scale=1;
  private generation=0;
  private cache:UiQuadRasterCache|null=null;
  /** `maxScale`: a lower cap than the pack's (the page's `?hdMenuScale=`, for a slower machine); a browser adaptation. */
  constructor(private make:()=>HdServedPack,private maxScale=HD_MENU_SCALE_LIMIT){ }
  options():{scale:number;hd?:UiHdTextures;quadCache?:UiQuadRasterCache;version?:number}{
    return this.textures&&this.cache?{scale:this.scale,hd:this.textures.lookup,quadCache:this.cache,version:this.textures.version}:{scale:1};
  }
  /** Every replacement asked so far has finished (a test's wait). */
  async settled():Promise<void>{await this.textures?.settled();}
  /**
   * On or off. Scale 1 -- `?hdMenuScale=1`, or a pack with no whole ratio -- is the original menus: no lookup, nothing
   * fetched (review F3: a 4x image bilinear-shrunk to 1x by one sample is neither the original nor the pack's art).
   */
  async set(on:boolean):Promise<void>{
    const g=++this.generation;
    this.textures=null;this.scale=1;this.cache?.clear();this.cache=null;
    if(!on||Math.floor(this.maxScale)<2){this.pack?.setMenuCount(null);await this.pack?.setEnabled(false);return;}
    this.pack??=this.make();
    await this.pack.setEnabled(true);
    const m=this.pack.manifest,pack=this.pack;
    if(g!==this.generation||!m)return;
    const scale=Math.min(hdMenuScale(m),Math.floor(this.maxScale));
    if(scale<2){await pack.setEnabled(false);return;}
    const textures=new HdMenuTextures(pack.runtime,HD_MENU_BYTES,()=>{if(this.textures===textures)pack.setMenuCount(textures.replaced);});
    this.scale=scale;this.textures=textures;this.cache=new UiQuadRasterCache(HD_MENU_QUAD_CACHE_BYTES);
    pack.setMenuCount(0);
  }
}

/** A status line's state for the page's log: its numbers masked, but the menus' own count kept, so each change of it logs. */
export const menuStatusKey=(text:string):string=>text.replace(/\d+(?![\d ]*in the menus)/g,'#');

/** The page's: the pack this browser imported, else the served one (as the match's, `./matchMount`); its status logged once a state. */
export function pageHdMenus(maxScale=HD_MENU_SCALE_LIMIT):HdMenus{
  let logged='';
  return new HdMenus(()=>new HdServedPack(undefined,(text)=>{const k=menuStatusKey(text);if(k!==logged){logged=k;console.info(`[hd] menus: ${text}`);}},
    new HdTextureRegistry(false),pageHdStore()),maxScale);
}

/** The page's `?hdMenuScale=1..4` (a browser adaptation for the test run): a lower cap on the menus' scale; absent, the pack's. */
export function parseHdMenuScale(search:string):number{
  const v=Number(new URLSearchParams(search).get('hdMenuScale'));
  return Number.isInteger(v)&&v>=1&&v<=HD_MENU_SCALE_LIMIT?v:HD_MENU_SCALE_LIMIT;
}
