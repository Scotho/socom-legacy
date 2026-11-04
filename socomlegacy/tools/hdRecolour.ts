import type {DiscTextureRecord} from './discTextureRecords';

/**
 * OT.R92 (HD-5, plan 2026-10-31-hd-texture-pack-parity): palette transfer for a pack file whose texels are a disc
 * record's but whose palette is not (tier C) -- the HD art's colours and opacity moved onto the record's own, its HD
 * detail kept. Per palette index i used by the record: pc[i], the mean colour of the HD image (box-resized to the
 * record's size) over the record's texels of index i, against oc[i], the record's decoded colour. Each HD pixel is
 * shifted by the inverse-squared-distance weighted (oc - pc) of its four nearest pc in RGBA. Our alpha is taken on the
 * pack's PS2 scale (0x80 opaque; the decode's 255 x 128/255), so the payload keeps the pack's scale and the runtime
 * rescales it with every other (viewer `fullAlpha`). A browser adaptation's tool.
 */
export interface Image4 {width:number;height:number;data:Uint8ClampedArray}

/** Area-average resize (each output pixel the mean of the source area it covers, fractional edges weighted). */
export function boxResize(src:Image4,w:number,h:number):Image4{
  const out=new Uint8ClampedArray(w*h*4),sx=src.width/w,sy=src.height/h,acc=new Float64Array(4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const x0=x*sx,x1=x0+sx,y0=y*sy,y1=y0+sy;acc.fill(0);let area=0;
    for(let yy=Math.floor(y0);yy<Math.ceil(y1);yy++){const wy=Math.min(y1,yy+1)-Math.max(y0,yy);
      for(let xx=Math.floor(x0);xx<Math.ceil(x1);xx++){const wx=Math.min(x1,xx+1)-Math.max(x0,xx),a=wx*wy,s=(yy*src.width+xx)*4;
        for(let c=0;c<4;c++)acc[c]!+=src.data[s+c]!*a;area+=a;}}
    for(let c=0;c<4;c++)out[(y*w+x)*4+c]=Math.round(acc[c]!/area);
  }
  return {width:w,height:h,data:out};
}

/** A paletted record's indices in raster order (T4: two a byte, low nibble first). */
export function indicesOf(r:DiscTextureRecord,n=r.width*r.height):Uint8Array{
  if(r.psm===0x13)return r.pixels.slice(0,n);
  const out=new Uint8Array(n);for(let i=0;i<n;i++)out[i]=(r.pixels[i>>1]!>>((i&1)*4))&15;return out;
}

/** Every texel the same value: a texel hash of it names any flat texture of that size, so it binds nothing alone. */
export function uniformTexels(r:DiscTextureRecord):boolean{
  const n=r.width*r.height;
  if(r.psm===0x13||r.psm===0x14){const ix=indicesOf(r,n);return ix.every(v=>v===ix[0]);}
  const step=r.psm===0x00?4:r.psm===0x01?3:2,px=r.pixels;
  for(let i=step;i<n*step;i++)if(px[i]!==px[i%step])return false;
  return true;
}

export function recolour(hd:Image4,r:DiscTextureRecord):Image4{
  const w=r.width,h=r.height,idx=indicesOf(r),small=boxResize(hd,w,h);
  const sum=new Float64Array(256*4),cnt=new Float64Array(256),oc=new Float64Array(256*4);
  for(let i=0;i<w*h;i++){const k=idx[i]!;cnt[k]!++;for(let c=0;c<4;c++){sum[k*4+c]!+=small.data[i*4+c]!;oc[k*4+c]=c===3?(r.rgba[i*4+3]!*128)/255:r.rgba[i*4+c]!;}}
  const used:number[]=[];for(let k=0;k<256;k++)if(cnt[k])used.push(k);
  const pc=used.map(k=>[0,1,2,3].map(c=>sum[k*4+c]!/cnt[k]!)),shift=used.map((k,j)=>[0,1,2,3].map(c=>oc[k*4+c]!-pc[j]![c]!));
  const out=new Uint8ClampedArray(hd.data.length),best=[0,0,0,0],bd=[0,0,0,0];
  for(let p=0;p<hd.width*hd.height;p++){
    const s=p*4;bd.fill(Infinity);
    for(let j=0;j<pc.length;j++){
      const q=pc[j]!;const d=(hd.data[s]!-q[0]!)**2+(hd.data[s+1]!-q[1]!)**2+(hd.data[s+2]!-q[2]!)**2+(hd.data[s+3]!-q[3]!)**2;
      if(d<bd[3]!){let at=3;while(at>0&&d<bd[at-1]!){bd[at]=bd[at-1]!;best[at]=best[at-1]!;at--;}bd[at]=d;best[at]=j;}
    }
    let wsum=0;const add=[0,0,0,0];
    // Inverse squared distance: a colour on a palette entry takes that entry's shift; colours between blend.
    for(let t=0;t<Math.min(4,pc.length);t++){const wt=1/(bd[t]!+1);wsum+=wt;for(let c=0;c<4;c++)add[c]!+=shift[best[t]!]![c]!*wt;}
    for(let c=0;c<4;c++)out[s+c]=Math.round(hd.data[s+c]!+add[c]!/wsum);
  }
  return {width:hd.width,height:hd.height,data:out};
}
