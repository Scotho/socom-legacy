/**
 * OT.R92 (HD-4, plan 2026-10-31-hd-texture-pack-parity): DirectDraw Surface payloads of a PCSX2 replacement pack,
 * decoded to RGBA on the CPU -- the base level only. BC1 (DXT1), BC2 (DXT3), BC3 (DXT5) and BC7, legacy or DX10 header,
 * and uncompressed 32-bit RGBA/BGRA. A browser adaptation with no original; the decode is checked block for block
 * against Pillow's (test/dds.test.ts). BC2/BC3 colour blocks always decode four colours, as Direct3D does.
 */
export interface DdsImage {width:number;height:number;data:Uint8ClampedArray}
export class DdsError extends Error {constructor(m:string){super(`DDS: ${m}`);this.name='DdsError';}}
type Kind='bc1'|'bc2'|'bc3'|'bc7'|'rgba'|'bgra';
const DXGI:Record<number,Kind>={71:'bc1',72:'bc1',74:'bc2',75:'bc2',77:'bc3',78:'bc3',98:'bc7',99:'bc7',28:'rgba',29:'rgba',87:'bgra',91:'bgra'};

/** The header's base-level size and format, or an error naming what is not supported. */
export function ddsInfo(b:Uint8Array):{width:number;height:number;kind:Kind;offset:number;alpha:boolean}{
  if(b.length<128||b[0]!==0x44||b[1]!==0x44||b[2]!==0x53||b[3]!==0x20)throw new DdsError('not a DDS file');
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const height=v.getUint32(12,true),width=v.getUint32(16,true),pfFlags=v.getUint32(80,true),four=String.fromCharCode(b[84]!,b[85]!,b[86]!,b[87]!);
  if(!width||!height||width>16384||height>16384)throw new DdsError(`size ${width}x${height} out of bounds`);
  let kind:Kind|undefined,offset=128,alpha=true;
  if(pfFlags&4){
    if(four==='DX10'){if(b.length<148)throw new DdsError('truncated DX10 header');kind=DXGI[v.getUint32(128,true)];offset=148;if(!kind)throw new DdsError(`DXGI format ${v.getUint32(128,true)} not supported`);}
    else kind=({DXT1:'bc1',DXT2:'bc2',DXT3:'bc2',DXT4:'bc3',DXT5:'bc3'} as Record<string,Kind>)[four];
    if(!kind)throw new DdsError(`FourCC ${JSON.stringify(four)} not supported`);
  }else if((pfFlags&0x40)&&v.getUint32(88,true)===32){
    const r=v.getUint32(92,true),g=v.getUint32(96,true),bl=v.getUint32(100,true);
    if(r===0xff&&g===0xff00&&bl===0xff0000)kind='rgba';else if(r===0xff0000&&g===0xff00&&bl===0xff)kind='bgra';
    if(!kind)throw new DdsError('32-bit masks not supported');
    // Alpha only where the header says so (DDPF_ALPHAPIXELS and a mask); else the fourth byte is padding, opaque.
    alpha=(pfFlags&1)!==0&&v.getUint32(104,true)===0xff000000;
  }else throw new DdsError('pixel format not supported');
  return {width,height,kind,offset,alpha};
}

/**
 * `expect`: the size the caller's entry declares; a header naming another size is refused before anything is
 * allocated, as is data shorter than its header says (a review finding: the header alone could ask for 1 GiB).
 */
export function decodeDds(b:Uint8Array,expect?:{width:number;height:number}):DdsImage{
  const {width,height,kind,offset,alpha}=ddsInfo(b);
  if(expect&&(expect.width!==width||expect.height!==height))throw new DdsError(`size ${width}x${height}, the entry says ${expect.width}x${expect.height}`);
  const bw=Math.ceil(width/4),bh=Math.ceil(height/4),size=kind==='bc1'?8:16;
  if(b.length<offset+(kind==='rgba'||kind==='bgra'?width*height*4:bw*bh*size))throw new DdsError('truncated image data');
  const out=new Uint8ClampedArray(width*height*4);
  if(kind==='rgba'||kind==='bgra'){
    const n=width*height*4;
    for(let i=0;i<n;i+=4){const s=offset+i;out[i]=b[s+(kind==='bgra'?2:0)]!;out[i+1]=b[s+1]!;out[i+2]=b[s+(kind==='bgra'?0:2)]!;out[i+3]=alpha?b[s+3]!:255;}
    return {width,height,data:out};
  }
  const px=new Uint8Array(64);
  for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){
    const at=offset+(by*bw+bx)*size;
    if(kind==='bc1')colorBlock(b,at,px,true);
    else if(kind==='bc2'){colorBlock(b,at+8,px,false);for(let i=0;i<16;i++){const n=(b[at+(i>>1)]!>>((i&1)*4))&15;px[i*4+3]=n*17;}}
    else if(kind==='bc3'){colorBlock(b,at+8,px,false);alphaBlock(b,at,px);}
    else bc7Block(b,at,px);
    for(let y=0;y<4;y++){const oy=by*4+y;if(oy>=height)break;
      for(let x=0;x<4;x++){const ox=bx*4+x;if(ox>=width)break;out.set(px.subarray((y*4+x)*4,(y*4+x)*4+4),(oy*width+ox)*4);}}
  }
  return {width,height,data:out};
}

const c565=(c:number,o:number[],i:number)=>{const r=(c>>11)&31,g=(c>>5)&63,bl=c&31;o[i]=(r<<3)|(r>>2);o[i+1]=(g<<2)|(g>>4);o[i+2]=(bl<<3)|(bl>>2);o[i+3]=255;};
function colorBlock(b:Uint8Array,at:number,px:Uint8Array,bc1:boolean):void{
  const c0=b[at]!|(b[at+1]!<<8),c1=b[at+2]!|(b[at+3]!<<8),p:number[]=new Array(16);
  c565(c0,p,0);c565(c1,p,4);
  if(!bc1||c0>c1)for(let k=0;k<3;k++){p[8+k]=((2*p[k]!+p[4+k]!)/3)|0;p[12+k]=((p[k]!+2*p[4+k]!)/3)|0;}
  else for(let k=0;k<3;k++){p[8+k]=(p[k]!+p[4+k]!)>>1;p[12+k]=0;}
  p[11]=255;p[15]=bc1&&c0<=c1?0:255;
  const idx=b[at+4]!|(b[at+5]!<<8)|(b[at+6]!<<16)|(b[at+7]!<<24);
  for(let i=0;i<16;i++){const s=((idx>>>(i*2))&3)*4;px[i*4]=p[s]!;px[i*4+1]=p[s+1]!;px[i*4+2]=p[s+2]!;px[i*4+3]=p[s+3]!;}
}
function alphaBlock(b:Uint8Array,at:number,px:Uint8Array):void{
  const a0=b[at]!,a1=b[at+1]!,a=[a0,a1,0,0,0,0,0,0];
  if(a0>a1)for(let k=1;k<7;k++)a[k+1]=(((7-k)*a0+k*a1)/7)|0;
  else{for(let k=1;k<5;k++)a[k+1]=(((5-k)*a0+k*a1)/5)|0;a[6]=0;a[7]=255;}
  // 48 index bits in two 24-bit halves, eight texels each.
  const lo=b[at+2]!|(b[at+3]!<<8)|(b[at+4]!<<16),hi=b[at+5]!|(b[at+6]!<<8)|(b[at+7]!<<16);
  for(let i=0;i<8;i++){px[i*4+3]=a[(lo>>(3*i))&7]!;px[(i+8)*4+3]=a[(hi>>(3*i))&7]!;}
}

// BC7 (the Direct3D 11 block format). Per mode: subsets, partition bits, rotation bits, index-selection bit, colour
// bits, alpha bits, endpoint p-bits, shared p-bits, index bits, second index bits.
const MODES=[[3,4,0,0,4,0,1,0,3,0],[2,6,0,0,6,0,0,1,3,0],[3,6,0,0,5,0,0,0,2,0],[2,6,0,0,7,0,1,0,2,0],
  [1,0,2,1,5,6,0,0,2,3],[1,0,2,0,7,8,0,0,2,2],[1,0,0,0,7,7,1,0,4,0],[2,6,0,0,5,5,1,0,2,0]] as const;
/** Two-subset partitions: bit i set puts texel i in subset 1. */
const P2=[0xcccc,0x8888,0xeeee,0xecc8,0xc880,0xfeec,0xfec8,0xec80,0xc800,0xffec,0xfe80,0xe800,0xffe8,0xff00,0xfff0,0xf000,
  0xf710,0x008e,0x7100,0x08ce,0x008c,0x7310,0x3100,0x8cce,0x088c,0x3110,0x6666,0x366c,0x17e8,0x0ff0,0x718e,0x399c,
  0xaaaa,0xf0f0,0x5a5a,0x33cc,0x3c3c,0x55aa,0x9696,0xa55a,0x73ce,0x13c8,0x324c,0x3bdc,0x6996,0xc33c,0x9966,0x0660,
  0x0272,0x04e4,0x4e40,0x2720,0xc936,0x936c,0x39c6,0x639c,0x9336,0x9cc6,0x817e,0xe718,0xccf0,0x0fcc,0x7744,0xee22];
/** Three-subset partitions, two bits a texel (texel i at bits 2i). */
const P3=[0xaa685050,0x6a5a5040,0x5a5a4200,0x5450a0a8,0xa5a50000,0xa0a05050,0x5555a0a0,0x5a5a5050,0xaa550000,0xaa555500,
  0xaaaa5500,0x90909090,0x94949494,0xa4a4a4a4,0xa9a59450,0x2a0a4250,0xa5945040,0x0a425054,0xa5a5a500,0x55a0a0a0,
  0xa8a85454,0x6a6a4040,0xa4a45000,0x1a1a0500,0x0050a4a4,0xaaa59090,0x14696914,0x69691400,0xa08585a0,0xaa821414,
  0x50a4a450,0x6a5a0200,0xa9a58000,0x5090a0a8,0xa8a09050,0x24242424,0x00aa5500,0x24924924,0x24499224,0x50a50a50,
  0x500aa550,0xaaaa4444,0x66660000,0xa5a0a5a0,0x50a050a0,0x69286928,0x44aaaa44,0x66666600,0xaa444444,0x54a854a8,
  0x95809580,0x96969600,0xa85454a8,0x80959580,0xaa141414,0x96960000,0xaaaa1414,0xa05050a0,0xa0a5a5a0,0x96000000,
  0x40804080,0xa9a8a9a8,0xaaaaaa44,0x2a4a5254];
const A2=[15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,2,8,2,2,8,8,15,2,8,2,2,8,8,2,2,
  15,15,6,8,2,8,15,15,2,8,2,2,2,15,15,6,6,2,6,8,15,15,2,2,15,15,15,15,15,2,2,15];
const A3a=[3,3,15,15,8,3,15,15,8,8,6,6,6,5,3,3,3,3,8,15,3,3,6,10,5,8,8,6,8,5,15,15,
  8,15,3,5,6,10,8,15,15,3,15,5,15,15,15,15,3,15,5,5,5,8,5,10,5,10,8,13,15,12,3,3];
const A3b=[15,8,8,3,15,15,3,8,15,15,15,15,15,15,15,8,15,8,15,3,15,8,15,8,3,15,6,10,15,15,10,8,
  15,3,15,10,10,8,9,10,6,15,8,15,3,6,6,8,15,3,15,15,15,15,15,15,15,15,15,15,3,15,15,8];
const W2=[0,21,43,64],W3=[0,9,18,27,37,46,55,64],W4=[0,4,9,13,17,21,26,30,34,38,43,47,51,55,60,64];
const weights=(n:number)=>n===2?W2:n===3?W3:W4;
function subsetOf(ns:number,part:number,i:number):number{return ns===1?0:ns===2?(P2[part]!>>i)&1:(P3[part]!>>>(2*i))&3;}
function anchor(ns:number,part:number,i:number):boolean{
  if(i===0)return true;
  return ns===2?A2[part]===i:ns===3?A3a[part]===i||A3b[part]===i:false;
}
function bc7Block(b:Uint8Array,at:number,px:Uint8Array):void{
  let pos=0;const bit=(n:number)=>{let v=0;for(let k=0;k<n;k++,pos++)v|=((b[at+(pos>>3)]!>>(pos&7))&1)<<k;return v;};
  let mode=0;while(mode<8&&!bit(1))mode++;
  if(mode===8){px.fill(0);return;}
  const [ns,pb,rb,isb,cb,ab,epb,spb,ib,ib2]=MODES[mode]!;
  const part=bit(pb),rot=bit(rb),sel=bit(isb);
  const ep:number[][]=Array.from({length:ns*2},()=>[0,0,0,0]);
  for(let c=0;c<3;c++)for(let e=0;e<ns*2;e++)ep[e]![c]=bit(cb);
  if(ab)for(let e=0;e<ns*2;e++)ep[e]![3]=bit(ab);
  const p:number[]=[];
  if(epb)for(let e=0;e<ns*2;e++)p.push(bit(1));
  if(spb)for(let s=0;s<ns;s++){const v=bit(1);p.push(v,v);}
  const hasP=epb||spb;
  for(let e=0;e<ns*2;e++){
    for(let c=0;c<4;c++){
      const bits=c<3?cb:ab;if(!bits){ep[e]![3]=255;continue;}
      let v=ep[e]![c]!,n=bits;if(hasP){v=(v<<1)|p[e]!;n++;}
      ep[e]![c]=(v<<(8-n))|(v>>(2*n-8));
    }
  }
  const i1:number[]=[],i2:number[]=[];
  for(let i=0;i<16;i++)i1.push(bit(anchor(ns,part,i)?ib-1:ib));
  if(ib2)for(let i=0;i<16;i++)i2.push(bit(i===0?ib2-1:ib2));
  for(let i=0;i<16;i++){
    const s=subsetOf(ns,part,i),e0=ep[s*2]!,e1=ep[s*2+1]!;
    let ci=i1[i]!,cw=weights(ib),ai=ci,aw=cw;
    if(ib2){const j=i2[i]!;if(sel){ci=j;cw=weights(ib2);}else{ai=j;aw=weights(ib2);}}
    const o=i*4;
    for(let c=0;c<3;c++)px[o+c]=((64-cw[ci]!)*e0[c]!+cw[ci]!*e1[c]!+32)>>6;
    px[o+3]=((64-aw[ai]!)*e0[3]!+aw[ai]!*e1[3]!+32)>>6;
    if(rot){const k=rot-1,t=px[o+k]!;px[o+k]=px[o+3]!;px[o+3]=t;}
  }
}
