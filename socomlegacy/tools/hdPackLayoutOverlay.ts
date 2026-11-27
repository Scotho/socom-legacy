import {validateHdManifest,type HdEntry,type HdManifest} from '../packages/viewer/src/hdTexturePack';

/**
 * WM-32 (a browser adaptation's tool, product track, no original; mechanism only -- the pack author's permission
 * pending): the HD pack's two archives, PlayStation-button and Xbox-button, made one -- the PlayStation manifest as the
 * base and, as `layouts.xbox`, every Xbox whole entry whose key is a PlayStation whole key with another payload
 * (sha256), its file renumbered past the PlayStation files' highest number. `overlay` maps each overlaid key's Xbox file
 * (`from`) to its file in the one pack (`to`), so a caller copies the payloads; one Xbox file serving several overlaid
 * keys is one file in the pack. Refused, in words: two packs for different games, a whole key in one pack only, the
 * placement entries differing (compared field by field in order, their file names aside: the two archives may number
 * files apart), a pack already carrying layouts. The result is checked by `validateHdManifest`.
 * `packedBytes` (review L1): the one pack's download is the PlayStation pack's plus the overlay's files, so it is kept
 * only when the PlayStation pack has one AND `opts.sizeOf` gives each overlay file's size as written (an Xbox file's
 * bytes); otherwise it is left out (optional), never a number that leaves the overlay out.
 */
export function layoutOverlay(ps:HdManifest,xbox:HdManifest,opts:{sizeOf?:(xboxFile:string)=>number}={}):{manifest:HdManifest;overlay:{key:string;from:string;to:string}[]}{
  ps=validateHdManifest(ps);xbox=validateHdManifest(xbox);
  if(ps.layouts||xbox.layouts)throw new Error('a pack already carries layouts');
  if(ps.game!==xbox.game)throw new Error(`the two packs are for different games (${ps.game}, ${xbox.game})`);
  const wholes=(m:HdManifest)=>new Map(m.entries.filter(e=>!e.placements).map(e=>[e.key,e] as [string,HdEntry]));
  const psWhole=wholes(ps),xbWhole=wholes(xbox);
  for(const k of psWhole.keys())if(!xbWhole.has(k))throw new Error(`key ${k} is in the PlayStation pack only`);
  for(const k of xbWhole.keys())if(!psWhole.has(k))throw new Error(`key ${k} is in the Xbox pack only`);
  const placed=(m:HdManifest)=>m.entries.filter(e=>e.placements).map(({file:_file,...rest})=>JSON.stringify(rest));
  const psPlaced=placed(ps),xbPlaced=placed(xbox);
  if(psPlaced.length!==xbPlaced.length)
    throw new Error(`the two packs' placement entries differ (the PlayStation pack has ${psPlaced.length}, the Xbox pack ${xbPlaced.length})`);
  psPlaced.forEach((p,i)=>{if(p!==xbPlaced[i])throw new Error(`the two packs' placement entries differ (placement entry ${i+1})`);});
  let next=Math.max(...ps.entries.map(e=>parseInt(e.file,10)))+1;
  const files=new Map<string,string>(),overlay:{key:string;from:string;to:string}[]=[],entries:HdEntry[]=[];let layoutBytes=0;
  for(const e of xbox.entries){
    if(e.placements||e.sha256===psWhole.get(e.key)!.sha256)continue;
    let to=files.get(e.file);
    if(to===undefined){to=`${next++}.${e.format}`;files.set(e.file,to);layoutBytes+=e.bytes;}
    overlay.push({key:e.key,from:e.file,to});entries.push({...e,file:to});
  }
  const {packedBytes:psPacked,...base}=ps;
  let packedBytes:number|undefined;
  if(psPacked!==undefined&&opts.sizeOf){packedBytes=psPacked;for(const from of files.keys())packedBytes+=opts.sizeOf(from);}
  const manifest=validateHdManifest({...base,layouts:{xbox:entries},layoutBytes,...(packedBytes!==undefined?{packedBytes}:{})});
  return {manifest,overlay};
}
