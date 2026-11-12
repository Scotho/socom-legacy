/**
 * B206 ML-3 (plan 2026-11-06-mods-loader, ML.R5, R8, R9; OT.R110): a texture pack applied on every page -- the front
 * end's match, the Forge and the test room -- from the one MODS state (ML-1's `./modsState`), never from the picture.
 * A browser adaptation (ML.R2: product track): it changes what this player's screen draws, never the game's data, the
 * simulation or the wire. Only texture packs apply everywhere (ML.R5, H414); the data mods and model packs stay the test
 * room's (MODS_SCOPE_ADAPTATION).
 *
 * - **The choice keeper** (`textureChoiceKeeper`, the page's `pageTextureChoice`): the chosen texture pack's id
 *   (`hd:<id>`, `texture:<map>:<id>`, or null for Original, ML.R8), read from the record when the hint
 *   (`PACKS_ENABLED_KEY`) is set -- with no hint nothing is read and no database opened (the lazy contract, ML.R7) --
 *   and read again at each change notice (`MODS_CHANNEL`), so a choice made on Home, or in the console's overlay over
 *   this very match, is heard at once (ML.R9).
 * - **The applier** (`PackApplier`): the HD runtime on while the HD pack is chosen; a GX per-map pack on its own map only
 *   (ML.R8); the two never at once. A pack first chosen on a page whose texture registry was inert makes it collect and
 *   registers the live map's textures from its own decodes (`registerDecodes`, ML.R9) before it applies; textures the
 *   page made outside the map's world (the HUD's, the effects') are known from the next map.
 * - **The page boot** (`collectOnHint`): the registry collects from the boot whenever the hint is set, so a world built
 *   before the first choice is known in full; a page with no pack keeps the registry inert (the HD review's finding 6).
 */
import type {DataTexture} from 'three';
import type {Rgba} from '@s2u/gs';
import type {HdTextureRegistry} from '../hdTexturePack';
import {pageIndexedDb,pageSettings} from '../pageStore';
import {MODS_CHANNEL,PACKS_ENABLED_KEY,browserChannel,modsStateStore,type ChannelFactory,type ModsChannel,type PackFlags} from './modsState';

export type TextureChoice = {kind:'hd';id:string}|{kind:'texture';map:string;id:string}|null;
/** The MODS state's texture id read as a choice; anything else is Original. */
export function parseTextureChoice(id:string|null|undefined):TextureChoice{
  if(!id)return null;
  let m=/^hd:([a-f0-9]{64})$/.exec(id);if(m)return {kind:'hd',id:m[1]!};
  m=/^texture:([A-Za-z0-9]{1,16}):([a-f0-9]{64})$/.exec(id);if(m)return {kind:'texture',map:m[1]!,id:m[2]!};
  return null;
}
const hinted=(flags:PackFlags):boolean=>{try{return flags.get(PACKS_ENABLED_KEY)==='1';}catch{return false;}};

/** ML.R9: the page's texture registry collects from the boot whenever a pack is enabled; else it stays inert. */
export function collectOnHint(flags:PackFlags,registry:Pick<HdTextureRegistry,'collect'>):void{if(hinted(flags))registry.collect();}

/**
 * ML.R9: a live map's textures registered from the decodes they were made from (`world.ts` `makeTexture`: the world's
 * texture of a name is made from `LoadedMap.textures[name]`), for a pack first enabled on a page that did not collect.
 * A texture already registered is left as it is.
 */
export function registerDecodes(registry:Pick<HdTextureRegistry,'register'|'source'|'isCollecting'>,textures:ReadonlyMap<string,unknown>,
  decodes:Readonly<Record<string,Rgba|undefined>>):number{
  if(!registry.isCollecting)return 0;
  let n=0;
  for(const [name,t] of textures){
    const d=decodes[name],tex=t as DataTexture;
    if(!d||!(tex as {isDataTexture?:boolean}).isDataTexture||registry.source(tex))continue;
    registry.register(tex,d);n++;
  }
  return n;
}

export interface TextureChoiceKeeper {
  /** The chosen texture pack's id, or null (Original). */
  get():string|null;
  /** The first read has answered. */
  readonly ready:Promise<void>;
  /** Called at each change of the choice; the returned function stops it. */
  observe(f:(id:string|null)=>void):()=>void;
  /** Read the record again (the notice's own path). */
  refresh():Promise<void>;
  dispose():void;
}
export interface ChoiceKeeperDeps {
  flags:PackFlags;
  /** The stored choice (the record's `texture`); asked only while the hint is set. */
  read():Promise<string|null>;
  channel?:ChannelFactory;
}
export function textureChoiceKeeper(deps:ChoiceKeeperDeps):TextureChoiceKeeper{
  let id:string|null=null,seq=0,open:ModsChannel|null=null;
  const heard=new Set<(id:string|null)=>void>();
  const set=(v:string|null):void=>{if(v===id)return;id=v;for(const f of [...heard]){try{f(v);}catch{/* an observer's fault is its own */}}};
  const refresh=async():Promise<void>=>{
    const n=++seq;
    if(!hinted(deps.flags)){set(null);return;}
    let next:string|null=null;
    try{next=await deps.read();}catch{next=null;}
    if(n===seq)set(next);
  };
  try{open=(deps.channel??browserChannel)(MODS_CHANNEL);}catch{open=null;}
  if(open)open.onmessage=()=>{void refresh();};
  const ready=refresh();
  return {
    get:()=>id,ready,refresh,
    observe(f){heard.add(f);return ()=>{heard.delete(f);};},
    dispose(){heard.clear();seq++;if(open){try{open.close();}catch{/* closed */}open=null;}},
  };
}

/** The page's hint store: the page's settings (`../pageStore` `pageSettings`, which lists the hint's key). */
export const pageHintFlags:PackFlags=pageSettings;
let shared:TextureChoiceKeeper|null=null;
/**
 * The page's one keeper: the page's settings for the hint, the record read through `./storage` (imported only when the
 * hint is set), the browser's `BroadcastChannel`.
 */
export function pageTextureChoice():TextureChoiceKeeper{
  if(shared)return shared;
  const flags=pageHintFlags;
  const stored=async():Promise<string|null>=>{
    const {idbPackDatabase}=await import('./storage');
    return (await modsStateStore(idbPackDatabase(pageIndexedDb),flags,()=>null).read()).texture;
  };
  return shared=textureChoiceKeeper({flags,read:stored});
}

/** What the applier switches: `HdServedPack` (store-only, ML.R4) and `LocalTexturePacks`, or a test's fakes. */
export interface HdSwitch {setEnabled(on:boolean):Promise<void>;
  /** PR #729's Codex P2: off and its decoders' worker ended (`HdServedPack.dispose`); `dispose` below calls it when present. */
  dispose?():Promise<void>}
export interface GxSwitch<T> {setTarget(target:T|null):void;choose(id:string|null):void;setEnabled(on:boolean):void}
/** A world's pack target as `world.ts` makes it (`TexturePackTarget`): its map and its textures by name. */
export interface PackTargetLike {readonly map:string;readonly textures:ReadonlyMap<string,unknown>}
export interface PackApplierDeps<T extends PackTargetLike> {
  choice:TextureChoiceKeeper;
  registry:Pick<HdTextureRegistry,'collect'|'isCollecting'|'register'|'source'>;
  /** Made at the first HD choice. */
  hd:()=>HdSwitch;
  /** Made at the first GX choice; absent or null, a GX pack is not applied on this page. */
  gx?:()=>GxSwitch<T>|null;
  /** Told each choice as it is applied (the menus' HD, ML.R11). */
  applied?:(choice:TextureChoice)=>void;
}
export class PackApplier<T extends PackTargetLike=PackTargetLike> {
  readonly ready:Promise<void>;
  private hd:HdSwitch|null=null;
  private hdId:string|null=null;
  private gx:GxSwitch<T>|null=null;
  private gxMade=false;
  private target:T|null=null;
  private decodes:Readonly<Record<string,Rgba|undefined>>|null=null;
  private off:()=>void;
  private gone=false;
  constructor(private deps:PackApplierDeps<T>){
    this.off=deps.choice.observe(()=>{void this.apply();});
    this.ready=deps.choice.ready.then(()=>this.apply());
  }
  get choice():TextureChoice{return parseTextureChoice(this.deps.choice.get());}
  /** A new world (a map loaded, a base changed) or none: its pack target and its decodes (ML.R9's late registration). */
  setWorld(world:{texturePack?:T|undefined}|null,decodes:Readonly<Record<string,Rgba|undefined>>|null):void{
    this.target=world?.texturePack??null;this.decodes=decodes;
    if(this.gx)this.gx.setTarget(this.target);
    void this.apply();
  }
  private ensureGx():GxSwitch<T>|null{
    if(!this.gxMade){this.gxMade=true;this.gx=this.deps.gx?.()??null;this.gx?.setTarget(this.target);}
    return this.gx;
  }
  apply():Promise<void>{
    if(this.gone)return Promise.resolve();
    const c=this.choice;
    if(c&&!this.deps.registry.isCollecting){
      this.deps.registry.collect();
      if(this.target&&this.decodes)registerDecodes(this.deps.registry,this.target.textures,this.decodes);
    }
    // ML.R8: one pack on a texture -- the GX pack off before the HD pack goes on, and the other way round.
    const gxOn=c?.kind==='texture'&&this.target?.map===c.map;
    if(gxOn){const gx=this.ensureGx();gx?.choose(c.id);gx?.setEnabled(true);}
    else this.gx?.setEnabled(false);
    const hdOn=c?.kind==='hd';
    let done:Promise<void>=Promise.resolve();
    if(hdOn){
      this.hd??=this.deps.hd();
      if(this.hdId!==null&&this.hdId!==c.id){const hd=this.hd;done=hd.setEnabled(false).then(()=>hd.setEnabled(true));}   // a replaced HD pack: reloaded
      else done=this.hd.setEnabled(true);
      this.hdId=c.id;
    }else if(this.hd){done=this.hd.setEnabled(false);this.hdId=null;}
    this.deps.applied?.(c);
    return done;
  }
  /** Every original back; the choice no longer followed; the HD switch disposed (its decode worker ended) when it can be. */
  dispose():Promise<void>{
    if(this.gone)return Promise.resolve();
    this.gone=true;this.off();
    this.gx?.setEnabled(false);this.gx?.setTarget(null);
    return this.hd?(this.hd.dispose?this.hd.dispose():this.hd.setEnabled(false)):Promise.resolve();
  }
}
