import {expect,it} from 'vitest';
import {readSelectedMapTextures} from '../src/mapTextures';
import {packSourcesFor} from '../src/texturePackSources';
import {worldSamplingNames} from '../src/experimentalWorldSampling';
import type {LoadedMap} from '../src/loadMap';

type Key={name:string;data?:Uint8Array;children?:Key[]};
/** Synthetic v2 ZAR and ZDB, matching archive/test's hand-built container layouts; no disc bytes. */
function zar(children:Key[]):Uint8Array{
 const nodes:Key[]=[];const walk=(k:Key)=>{nodes.push(k);k.children?.forEach(walk);};walk({name:'',children});
 const names=new TextEncoder().encode(nodes.map(k=>k.name+'\0').join(''));const keysAt=100+names.length,dataAt=Math.ceil((keysAt+nodes.length*16)/16)*16;
 const out=new Uint8Array(dataAt+nodes.reduce((n,k)=>n+(k.data?.length??0),0)),dv=new DataView(out.buffer);
 dv.setUint32(4,nodes.length,true);dv.setUint32(8,names.length,true);dv.setUint32(12,0x1000,true);dv.setUint32(16,16,true);dv.setUint32(84,out.length-dataAt,true);dv.setUint32(96,0x20002,true);out.set(names,100);
 let name=0,data=0;nodes.forEach((k,i)=>{const o=keysAt+i*16;dv.setUint32(o,i===0?0:0x1000+name,true);dv.setUint32(o+4,data,true);dv.setUint32(o+8,k.data?.length??0,true);dv.setUint32(o+12,k.children?.length??0,true);if(k.data){out.set(k.data,dataAt+data);data+=k.data.length;}name+=k.name.length+1;});return out;
}
function zdb(members:Record<string,Uint8Array>):Uint8Array{
 const entries=Object.entries(members),out=new Uint8Array(2048*(entries.length+1)),dv=new DataView(out.buffer);dv.setUint32(0x98,entries.length,true);dv.setUint32(0x9c,0x5c,true);
 entries.forEach(([name,bytes],i)=>{const o=0xa0+i*0x5c;dv.setUint32(o,0x5c,true);out.set(new TextEncoder().encode(name),o+4);dv.setUint32(o+68,2048*(i+1),true);dv.setUint32(o+72,bytes.length,true);out.set(bytes,2048*(i+1));});return out;
}
function record(n:number,red:number,address:number,mip?:number):Uint8Array{
 const pixels=n*n*4,out=new Uint8Array(32+pixels+(mip===undefined?0:32)),d=new DataView(out.buffer);
 d.setUint16(0,n,true);d.setUint16(2,n,true);d.setUint32(4,pixels,true);d.setUint32(8,address,true);d.setUint32(12,32|(1<<28),true);
 for(let i=32;i<32+pixels;i+=4)out.set([red,40,60,128],i);
 if(mip!==undefined){d.setBigUint64(32+pixels,4n|32n|128n,true);d.setBigUint64(40+pixels,0x14n,true);d.setBigUint64(48+pixels,BigInt(mip),true);d.setBigUint64(56+pixels,0x34n,true);}return out;
}
const texture=(name:string,data:Uint8Array):Key=>({name,children:[{name:'texdat',data}]});
it('selected decode respects first-library ownership and resolves authored mip addresses within that library',()=>{
 const bytes=zdb({'MP51.ZED':zar([{name:'assetlibs',children:[{name:'common/shared'},{name:'mp/mp51'}]}]),
 'SHAR_TXR.ZED':zar([{name:'textures',children:[texture('wall',record(2,30,5,10)),texture('small',record(1,90,10))]}]),
 'MP51_TXR.ZED':zar([{name:'textures',children:[texture('wall',record(2,200,5))]}])});
 const [s]=readSelectedMapTextures(bytes,['wall']);expect(s!.library).toBe('SHAR');expect(s!.levels.map(l=>[l.width,l.data[0],l.data[3]])).toEqual([[2,30,255],[1,90,255]]);
 expect(()=>readSelectedMapTextures(bytes,['missing'])).toThrow();
});
it('unresolved authored mip is refused rather than silently generated into a different provenance',()=>{
 const bytes=zdb({'MP51_TXR.ZED':zar([{name:'textures',children:[texture('wall',record(2,30,5,10))]}])});
 expect(()=>readSelectedMapTextures(bytes,['wall'])).toThrow();
});
it('only opaque static MP51 world bases qualify; shared excluded roles and other maps never do',()=>{
 const rgba={width:1,height:1,data:new Uint8ClampedArray([30,40,60,255])};
 const map={archive:'MP51',world:[{textureName:'wall',fog:true,scroll:null}],props:[],lines:null,detail:{},textures:{wall:rgba},textureFlags:{wall:{bilinear:true,transparent:false,graded:false,opaque:true,gs:null}}} as unknown as LoadedMap;
 expect([...packSourcesFor(map).keys()]).toEqual(['wall']);map.detail={wall:{name:'wall'} as never};expect(packSourcesFor(map).size).toBe(0);map.detail={};
 map.weapons={gun:{parts:[{textureName:'wall'}]} as never};expect(packSourcesFor(map).size).toBe(0);delete map.weapons;
 map.world[0]!.alphaPass=true;expect(packSourcesFor(map).size).toBe(0);map.world[0]!.alphaPass=false;
 rgba.data[3]=254;expect(packSourcesFor(map).size).toBe(0);rgba.data[3]=255;map.archive='UI';expect(packSourcesFor(map).size).toBe(0);
});
it('GX-1b roles: "wide" admits opaque prop and blended-ground textures that "world" bans; sky, scroll, reflect and shared roles stay out',()=>{
 const solid=()=>({width:1,height:1,data:new Uint8ClampedArray([30,40,60,255])});
 const flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
 const names=['wall','ground','crate','water','sky','glass','gun','cutout','pass'];
 const world=(textureName:string,extra={})=>({textureName,fog:true,scroll:null,...extra});
 const map={archive:'MP51',lines:null,detail:{},
  world:[world('wall'),world('ground',{vertexAlpha:true}),world('water',{scroll:[0,1]}),world('sky',{fog:false}),world('glass',{reflect:1}),world('pass',{alphaPass:true})],
  props:[{parts:[world('crate'),world('gun'),world('cutout')]}],weapons:{gun:{parts:[{textureName:'gun'}]}},
  textures:Object.fromEntries(names.map(n=>[n,solid()])),textureFlags:Object.fromEntries(names.map(n=>[n,flags]))} as unknown as LoadedMap;
 map.textures.cutout!.data[3]=0;
 expect([...packSourcesFor(map).keys()]).toEqual(['wall']);
 expect([...packSourcesFor(map,'world').keys()]).toEqual(['wall']);
 expect([...packSourcesFor(map,'wide').keys()].sort()).toEqual(['crate','ground','pass','wall']);
});
it('GX-1e: any MP<n> map qualifies, and a map with no props or fittings (nothing optional present) computes its wide set',()=>{
 const rgba={width:1,height:1,data:new Uint8ClampedArray([30,40,60,255])},flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
 const map={archive:'MP13',world:[{textureName:'wall',fog:true,scroll:null,vertexAlpha:true}],props:[],detail:{},textures:{wall:rgba},textureFlags:{wall:flags}} as unknown as LoadedMap;
 expect([...packSourcesFor(map,'wide').keys()]).toEqual(['wall']);expect(packSourcesFor(map,'world').size).toBe(0);
 map.archive='MP81';expect(packSourcesFor(map,'wide').size).toBe(1);
});
it('FACADES-2: a texture the world still draws stays in the world sets though the world model\'s own facade nodes, drawn as props, draw it too',()=>{
 // MP52's `mp52_rusty_pipe.tif`: 12 world draws, and the world model's four facade pipes, props since FACADES-2 (LATER 112;
 // `loadMap`'s `place`). A texture only those props draw (MP7's `moon.tif`) is in no world set; one a prop of another
 // model draws (a crate's) stays out, as before: a shared texture object must not change another role.
 const rgba=()=>({width:1,height:1,data:new Uint8ClampedArray([30,40,60,255])}),flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
 const world=(textureName:string)=>({textureName,fog:true,scroll:null});
 const map={archive:'MP52',lines:null,detail:{},world:[world('pipe'),world('wall')],
  props:[{modelName:'worldmodel',facade:1,parts:[world('pipe'),world('moon')]},{modelName:'crate',facade:0,parts:[world('wall')]}],
  textures:{pipe:rgba(),wall:rgba(),moon:rgba()},textureFlags:{pipe:flags,wall:flags,moon:flags}} as unknown as LoadedMap;
 expect([...packSourcesFor(map,'world').keys()]).toEqual(['pipe']);
 expect([...worldSamplingNames(map)]).toEqual(['pipe']);
});
it('FACADES-2 F2: the world model\'s facade parts\' own draw state bans their texture from the "world" role as a world draw\'s does',()=>{
 // A texture shared by an opaque world draw and a world-model facade node drawn in the alpha pass (a prop since LATER 112)
 // is banned from "world" as it was when the node was a world draw; so are its unfogged, scrolling and reflective ones.
 const rgba=()=>({width:1,height:1,data:new Uint8ClampedArray([30,40,60,255])}),flags={bilinear:true,transparent:false,graded:false,opaque:true,gs:null};
 const world=(textureName:string,extra={})=>({textureName,fog:true,scroll:null,...extra});
 const names=['glow','sky','smoke','chrome','pipe'];
 const map={archive:'MP52',lines:null,detail:{},world:names.map((n)=>world(n)),
  props:[{modelName:'worldmodel',facade:2,parts:[world('glow',{alphaPass:true}),world('sky',{fog:false}),world('smoke',{scroll:[0,-0.15]}),world('chrome',{reflect:1}),world('pipe')]}],
  textures:Object.fromEntries(names.map((n)=>[n,rgba()])),textureFlags:Object.fromEntries(names.map((n)=>[n,flags]))} as unknown as LoadedMap;
 expect([...packSourcesFor(map,'world').keys()]).toEqual(['pipe']);
});
