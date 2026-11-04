import {FsAssetSource} from '@s2u/archive/node';
import {open,stat} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
/** Local inspection only. Stream archives require ranges, as the browser's ISO reader supplies. */
export class GameplayAudioSource extends FsAssetSource {
 constructor(private readonly directory:string){super(directory);}
 private path(p:string):string {
  const root=resolve(this.directory),file=resolve(root,p);
  const child=relative(root,file);
  if(!child||child==='..'||child.startsWith('..'+sep)||isAbsolute(child))throw Error('Disc path outside supplied directory');
  return file;
 }
 async size(p:string):Promise<number>{return (await stat(this.path(p))).size;}
 async readRange(p:string,offset:number,length:number):Promise<Uint8Array>{
  const file=await open(this.path(p),'r');
  try{
   const bytes=new Uint8Array(length);let read=0;
   while(read<length){const r=await file.read(bytes,read,length-read,offset+read);if(!r.bytesRead)throw Error(`Short disc read: ${p}`);read+=r.bytesRead;}
   return bytes;
  }finally{await file.close();}
 }
}
