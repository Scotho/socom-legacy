import {createXXHash3} from 'hash-wasm';
import {blockOffset} from '@s2u/gs';

/**
 * OT.R92 (HD-5, plan 2026-10-31-hd-texture-pack-parity): the name PCSX2 (texture replacement, the naming before
 * 2024-03-10 that the SCUS-97275 HD pack uses) gives a texture, recomputed from a disc texture record.
 * `<tex>-<clut>-<bits>` or `<tex>-<bits>`: XXH3-64 (seed 0) of the texture's GS blocks (or its expanded texels when
 * smaller than a block or not a block format) and of the CLUT in logical order; `bits` packs PSM, TW, TH, TCC and,
 * for an unpalettised 16-bit texture, TEXA. The block layouts are the GS User's Manual's column structure, written
 * as bit permutations (PSMT8 is `@s2u/gs`'s `blockOffset`), and checked against an independent reconstruction
 * (test/pcsx2Names.test.ts). A browser adaptation's tool; no PCSX2 code is copied.
 */
export interface HashRecord {
  psm:number;tw:number;th:number;tcc:number;csa:number;csm:number;width:number;height:number;
  /** The record's texels as stored (raster order); 4-bit texels two to a byte, low nibble first. */
  pixels:Uint8Array;
  /** The palette's raw `buf` and its format (0 CT32, else CT16), or null for a direct-colour texture. */
  pal:Uint8Array|null;palFormat:number|null;
}
export type Texa=readonly [ta0:number,aem:number,ta1:number];
export const PSM={CT32:0x00,CT24:0x01,CT16:0x02,CT16S:0x0a,T8:0x13,T4:0x14} as const;
/** The TEXA values a 16-bit texel or CLUT is expanded with that the pack's names were seen with (most first). */
export const TEXA_TRIES:readonly Texa[]=[[0,0,0x80],[0,1,0x80],[0x80,0,0x80],[0x80,1,0x80],[0,0,0]];

const bit=(v:number,n:number)=>(v>>>n)&1;
/** PSMCT32: the 32-bit word of texel (x, y) in its 8x8 block. */
export const word32=(x:number,y:number)=>bit(x,0)|(bit(y,0)<<1)|(bit(x,1)<<2)|(bit(x,2)<<3)|(bit(y,1)<<4)|(bit(y,2)<<5);
/** PSMT4: the nibble of texel (x, y) in its 32x16 block -- four 32x4 columns, the half-column swap as PSMT8's. */
export const nibble4=(x:number,y:number)=>bit(y,1)|(bit(x,3)<<1)|(bit(x,4)<<2)|(bit(x,0)<<3)|(bit(y,0)<<4)|(bit(x,1)<<5)
  |((bit(x,2)^bit(y,1)^bit(y,2))<<6)|(bit(y,2)<<7)|(bit(y,3)<<8);
const csm1=(i:number)=>(i&0xe7)|((i&0x08)<<1)|((i&0x10)>>1);
const csm1x4=(i:number)=>(i&7)|((i&8)<<1);

const expand16=(c:number,[ta0,aem,ta1]:Texa,o:Uint8Array,at:number)=>{
  o[at]=(c&31)<<3;o[at+1]=((c>>5)&31)<<3;o[at+2]=((c>>10)&31)<<3;o[at+3]=c&0x8000?ta1:aem&&(c&0x7fff)===0?0:ta0;
};

/** The bytes PCSX2 hashes for the texture, or null when the record is not the TW x TH extent or not a format named. */
export function texBytes(r:HashRecord,texa:Texa=[0,0,0]):Uint8Array|null{
  const tw=1<<r.tw,th=1<<r.th,px=r.pixels;
  if(r.width!==tw||r.height!==th)return null;
  if(r.psm===PSM.T8){
    if(tw<16||th<16)return px.slice(0,tw*th);
    const out=new Uint8Array(tw*th);let at=0;
    for(let by=0;by<th;by+=16)for(let bx=0;bx<tw;bx+=16,at+=256)
      for(let y=0;y<16;y++)for(let x=0;x<16;x++)out[at+blockOffset(x,y)]=px[(by+y)*tw+bx+x]!;
    return out;
  }
  if(r.psm===PSM.T4){
    const idx=(i:number)=>(px[i>>1]!>>((i&1)*4))&15;
    if(tw<32||th<16){const out=new Uint8Array(tw*th);for(let i=0;i<out.length;i++)out[i]=idx(i);return out;}
    const out=new Uint8Array(tw*th/2);let at=0;
    for(let by=0;by<th;by+=16)for(let bx=0;bx<tw;bx+=32,at+=256)
      for(let y=0;y<16;y++)for(let x=0;x<32;x++){const n=nibble4(x,y);out[at+(n>>1)]!|=idx((by+y)*tw+bx+x)<<((n&1)*4);}
    return out;
  }
  if(r.psm===PSM.CT32){
    if(tw<8||th<8)return px.slice(0,tw*th*4);
    const out=new Uint8Array(tw*th*4);let at=0;
    for(let by=0;by<th;by+=8)for(let bx=0;bx<tw;bx+=8,at+=256)
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const s=((by+y)*tw+bx+x)*4;out.set(px.subarray(s,s+4),at+word32(x,y)*4);}
    return out;
  }
  if(r.psm===PSM.CT16||r.psm===PSM.CT16S){
    const out=new Uint8Array(tw*th*4);
    for(let i=0;i<tw*th;i++)expand16(px[2*i]!|(px[2*i+1]!<<8),texa,out,i*4);
    return out;
  }
  return null;
}

/** The CLUT bytes PCSX2 hashes: 256 (T8) or 16 (T4) 32-bit entries in logical order, CT16 expanded with `texa`. */
export function clutBytes(r:HashRecord,texa:Texa=[0,0,0x80]):Uint8Array|null{
  const buf=r.pal;if(!buf)return null;
  const n=r.psm===PSM.T8?256:16,out=new Uint8Array(n*4);
  const put=(src:number,i:number)=>{
    if(r.palFormat===0)out.set(buf.subarray(src*4,src*4+4),i*4);
    else expand16(buf[2*src]!|(buf[2*src+1]!<<8),texa,out,i*4);
  };
  if(r.psm===PSM.T8)for(let i=0;i<256;i++)put(r.csm===0?csm1(i):i,i);
  else for(let j=0;j<16;j++)put(r.csa*16+(r.csm===0?csm1x4(j):j),j);
  return out;
}

let hasher:Awaited<ReturnType<typeof createXXHash3>>|null=null;
/** XXH3-64, seed 0, printed as PCSX2 prints it (`%x`: no leading zeros). */
export async function xxh3(bytes:Uint8Array):Promise<string>{
  hasher??=await createXXHash3(0,0);hasher.init();hasher.update(bytes);
  return hasher.digest('hex').replace(/^0+(?=.)/,'');
}
export const bitsOf=(r:HashRecord,texa:Texa=[0,0,0])=>{
  let b=r.psm|(r.tw<<6)|(r.th<<10)|(r.tcc<<14);
  if(r.psm!==PSM.T8&&r.psm!==PSM.T4&&r.psm!==PSM.CT32)b|=(texa[0]<<15)|(texa[1]<<23)|(texa[2]<<24);
  return b>>>0;
};
export interface Pcsx2Name {name:string;tex:string;clut:string|null}
/** Every name the record can carry: one per TEXA tried (16-bit texels or CLUT), the most likely first. */
export async function pcsx2Names(r:HashRecord):Promise<Pcsx2Name[]>{
  const out:Pcsx2Name[]=[],pal=r.psm===PSM.T8||r.psm===PSM.T4,direct16=r.psm===PSM.CT16||r.psm===PSM.CT16S;
  for(const texa of direct16?TEXA_TRIES:[[0,0,0] as Texa]){
    const tb=texBytes(r,texa);if(!tb)return out;
    const tex=await xxh3(tb),bits=bitsOf(r,texa).toString(16).padStart(8,'0');
    if(!pal){out.push({name:`${tex}-${bits}`,tex,clut:null});continue;}
    for(const ct of r.palFormat===0?[[0,0,0x80] as Texa]:TEXA_TRIES){
      const cb=clutBytes(r,ct);if(!cb)continue;
      const clut=await xxh3(cb);out.push({name:`${tex}-${clut}-${bits}`,tex,clut});
    }
  }
  return out;
}
