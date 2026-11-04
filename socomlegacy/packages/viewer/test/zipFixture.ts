import {crc32 as zlibCrc32,deflateRawSync} from 'node:zlib';

/**
 * GX-27 (a test helper, not a test): zips made in the test, by hand -- stored (0) or deflated (8) members, and the
 * malformed variants the reader must refuse (`flags`, `method`, a lying `size` or `crc`, a zip64 marker).
 */
export interface ZipItem {name:string;data:Uint8Array|string;method?:number;flags?:number;size?:number;crc?:number}
export function makeZip(items:readonly ZipItem[],options:{comment?:string;zip64?:boolean}={}):Uint8Array<ArrayBuffer>{
 const enc=new TextEncoder(),locals:Uint8Array[]=[],centrals:Uint8Array[]=[];let offset=0;
 for(const it of items){
  const data=typeof it.data==='string'?enc.encode(it.data):it.data,method=it.method??8,name=enc.encode(it.name);
  const body=method===8?new Uint8Array(deflateRawSync(data)):data,crc=it.crc??zlibCrc32(data),size=it.size??data.length,flags=(it.flags??0)|0x0800;
  const local=new Uint8Array(30+name.length+body.length),l=new DataView(local.buffer);
  l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,flags,true);l.setUint16(8,method,true);l.setUint16(12,0x21,true);
  l.setUint32(14,crc,true);l.setUint32(18,body.length,true);l.setUint32(22,size,true);l.setUint16(26,name.length,true);local.set(name,30);local.set(body,30+name.length);
  const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,flags,true);c.setUint16(10,method,true);c.setUint16(14,0x21,true);
  c.setUint32(16,crc,true);c.setUint32(20,body.length,true);c.setUint32(24,size,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
  locals.push(local);centrals.push(central);offset+=local.length;
 }
 const comment=enc.encode(options.comment??''),cdSize=centrals.reduce((n,c)=>n+c.length,0);
 const locator=options.zip64?new Uint8Array(20):new Uint8Array(0);if(options.zip64)new DataView(locator.buffer).setUint32(0,0x07064b50,true);
 const end=new Uint8Array(22+comment.length),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,options.zip64?0xffff:items.length,true);e.setUint16(10,options.zip64?0xffff:items.length,true);
 e.setUint32(12,cdSize,true);e.setUint32(16,offset,true);e.setUint16(20,comment.length,true);end.set(comment,22);
 const parts=[...locals,...centrals,locator,end],out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
 return out;
}
