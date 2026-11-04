import type {LoadedMap} from './loadMap';
import {bodyTextureNames} from './body';
import {packMap,validateSource,type PackRoles,type PackSource} from './texturePack';
import {isWorldFacadeProp} from './worldFacadeProps';

/**
 * Lazily computed only when pack loading is enabled. Shared non-world uses make a name ineligible.
 *
 * `roles` (GX-1b, research 260 section 9): 'world' is the first slice's set -- static, fogged, unblended world (any `MP<n>` map, GX.R9)
 * bases, no name a prop also draws. 'wide' also admits prop textures and world draws whose vertices blend
 * (`vertexAlpha`) or that are the alpha pass's (`alphaPass`): the texture must still be opaque at every level
 * (`validateSource`), so only texels change, never the draw's blending. Both keep characters, weapons, grenades, detail
 * layers, environment maps and lines out, and every sky (unfogged), scrolling or reflective draw, world or prop.
 */
export function packSourcesFor(map:LoadedMap,roles:PackRoles='world'):Map<string,PackSource>{
  const out=new Map<string,PackSource>();if(!packMap(map.archive))return out;
  const wide=roles==='wide';
  const excluded=new Set<string>();const ban=(name:string|null|undefined)=>{if(name)excluded.add(name);};
  // FACADES-2: the world model's own facade nodes are drawn as props since LATER 112 (`loadMap`'s `place`); they were world
  // draws and share their textures with the world's alone (MP52's `mp52_rusty_pipe.tif`), so they ban nothing.
  if(!wide)for(const p of map.props)if(!isWorldFacadeProp(p))for(const part of p.parts)ban(part.textureName);
  for(const line of map.lines??[])ban(line.textureName);
  for(const d of Object.values(map.detail))ban(d.name);
  for(const e of map.envMaterials??[])ban(e.texture);
  for(const w of Object.values(map.weapons??{}))for(const p of w.parts)ban(p.textureName);
  for(const g of map.grenade?.models??[])for(const p of g.parts)ban(p.textureName);
  for(const body of [map.body,map.terrorist,...(map.types?.seal??[]),...(map.types?.terrorist??[]),...(map.types?.escortees??[])])if(body)for(const name of bodyTextureNames(body))ban(name);
  const draws=wide?[...map.world,...map.props.flatMap(p=>p.parts)]:map.world;
  // Sky, animated and reflective draws are out of both sets; blended and alpha-pass draws only out of 'world'.
  // FACADES-2 (review F2): those facade parts' own draw state bans as a world draw's, as it did while they were world draws.
  const states=wide?draws:[...draws,...map.props.filter(isWorldFacadeProp).flatMap(p=>p.parts)];
  for(const p of states)if(!p.fog||p.scroll||p.reflect||(!wide&&(p.vertexAlpha||p.alphaPass)))ban(p.textureName);
  for(const p of draws){
    const key=p.textureName;if(!key||excluded.has(key)||out.has(key)||!Object.hasOwn(map.textures,key)||!Object.hasOwn(map.textureFlags,key))continue;
    const s:PackSource={key,flags:map.textureFlags[key]!,levels:[map.textures[key]!,...(map.textureMips?.[key]??[])]};
    try{validateSource(s);out.set(key,s);}catch{/* Leave every unsupported source original. */}
  }
  return out;
}
