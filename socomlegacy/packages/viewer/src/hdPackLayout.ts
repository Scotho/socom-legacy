import type {HdEntry,HdManifest} from './hdTexturePack';
import {readControllerLabels} from './controllerLabels';
import {padFamily} from './padFamily';

/**
 * WM-32 (a browser adaptation, product track, no original; mechanism only -- the pack author's permission pending): one
 * HD pack for both button layouts. The pack's author ships it as two archives, PlayStation-button and Xbox-button, that
 * differ only in their button glyph textures; here the PlayStation pack is the base and the Xbox glyphs its layout
 * overlay (`HdManifest.layouts.xbox`), applied when the player's controller labels are Xbox. Nothing here changes what
 * the game does: it picks which of the pack's images replace a decoded texture.
 */
export type HdLayout='playstation'|'xbox';

/**
 * WM-32 (a browser adaptation; mechanism only, the pack author's permission pending): the entries the runtime applies
 * under `layout` -- the base entries, with each overlaid key's whole entry replaced by its layout entry under 'xbox'
 * (placement entries kept as they are); under 'playstation', or for a pack with no overlay, the base entries themselves.
 */
export function hdEntriesFor(manifest:Pick<HdManifest,'entries'|'layouts'>,layout:HdLayout):HdEntry[]{
  const overlay=layout==='xbox'?manifest.layouts?.xbox:undefined;
  if(!overlay?.length)return manifest.entries;
  const byKey=new Map(overlay.map(e=>[e.key,e] as [string,HdEntry]));
  return manifest.entries.map(e=>!e.placements&&byKey.get(e.key)||e);
}

/**
 * WM-32 (a browser adaptation; mechanism only, the pack author's permission pending): every entry whose file is stored
 * or zipped -- the base's and every layout's -- one entry per file, so a pack's overlay files are kept beside its base.
 */
export function hdPackFiles(manifest:Pick<HdManifest,'entries'|'layouts'>):HdEntry[]{
  const byFile=new Map<string,HdEntry>();
  for(const e of [...manifest.entries,...manifest.layouts?.xbox??[]])if(!byFile.has(e.file))byFile.set(e.file,e);
  return [...byFile.values()];
}

/**
 * WM-32 (a browser adaptation; mechanism only, the pack author's permission pending): the layout the player's controller
 * labels ask for (`controllerLabels.ts` `readControllerLabels`): 'xbox' when the labels are Xbox, or Automatic with the
 * first connected pad an Xbox pad (`padFamily`); 'playstation' otherwise. An adaptation default: Steam Controller and
 * Steam Deck labels stay on the PlayStation files -- whether they should take the Xbox glyphs (Steam Input presents
 * its pads as Xbox) is an OPEN QUESTION for the owner.
 */
export function currentHdLayout():HdLayout{
  const labels=readControllerLabels();
  if(labels==='xbox')return 'xbox';
  if(labels!=='auto')return 'playstation';
  let pads:ReadonlyArray<{id:string;connected:boolean}|null>|undefined;
  try{pads=typeof navigator==='undefined'?undefined:navigator.getGamepads?.();}catch{pads=undefined;}   // a refused read: no pad
  const pad=[...pads??[]].find(p=>p?.connected);
  return pad&&padFamily(pad.id)==='xbox'?'xbox':'playstation';
}
