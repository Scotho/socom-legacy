import {describe,expect,it,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import type {UiDrawItem,UiModelTriangle} from '@s2u/ui';
import {rasterizeUiDrawList} from '../src/uiCompositorView';
import {mountFrontEnd} from '../src/frontEnd';
import {UI_SAMPLING_DEFAULTS} from '../src/experimentalUiSampling';
import {createHash} from 'node:crypto';
import original from './experimentalMenuOriginal.json';
import {menuFixture} from './experimentalMenuFixture';
const texture={width:2,height:1,data:Uint8ClampedArray.from([40,40,40,255,200,200,200,255])};
const quad:UiDrawItem={kind:'sprite',node:'synthetic',texture:'t',x0:0,y0:0,x1:4,y1:2,u0:0,v0:0,u1:1,v1:1,rgba:[128,128,128,128],clip:null};
const pixel=(f:Uint8ClampedArray,x:number,y=0)=>Array.from(f.slice((y*640+x)*4,(y*640+x)*4+4));
const bytes=(f:Uint8ClampedArray)=>Buffer.from(f.buffer,f.byteOffset,f.byteLength);
const equalFrames=(a:ReturnType<typeof rasterizeUiDrawList>,b:ReturnType<typeof rasterizeUiDrawList>)=>{
  expect([a.frame.width,a.frame.height,a.undrawn]).toEqual([b.frame.width,b.frame.height,b.undrawn]);
  expect(Buffer.compare(bytes(a.frame.data),bytes(b.frame.data))).toBe(0);
};
describe('menu-only raster sampling',()=>{
  it('nearest uses discrete texels while bilinear/OFF retain the existing interpolation',()=>{
    const base=rasterizeUiDrawList([quad],()=>texture).frame.data;
    const render=(mode:'nearest'|'bilinear'|'integer'|'sharpen',enabled=true)=>rasterizeUiDrawList([quad],()=>texture,{uiSampling:{...UI_SAMPLING_DEFAULTS,enabled,mode}}).frame.data;
    expect(pixel(base,0)).toEqual([120,120,120,255]);expect(pixel(base,2)).toEqual([120,120,120,255]);
    const nearest=render('nearest');
    expect(pixel(nearest,0)).toEqual([40,40,40,255]);expect(pixel(nearest,2)).toEqual([200,200,200,255]);
    expect(Buffer.compare(bytes(render('bilinear')),bytes(base))).toBe(0);
    expect(Buffer.compare(bytes(render('nearest',false)),bytes(base))).toBe(0);
    expect(Buffer.compare(bytes(render('integer')),bytes(nearest))).toBe(0);
    expect(pixel(render('sharpen'),0)[0]).toBeLessThan(40);
    expect(Array.from(texture.data)).toEqual([40,40,40,255,200,200,200,255]);
  });
  it('glyphs use the same selected sampler and preserve clipping',()=>{
    const glyph:UiDrawItem={kind:'glyphs',node:'synthetic',clip:{x0:1,y0:0,x1:2,y1:1},quads:[{code:65,texture:'t',shadow:false,left:0,top:0,right:4,bottom:2,u0:0,v0:0,u1:2,v1:1,rgba:[128,128,128,128]}]};
    const f=rasterizeUiDrawList([glyph],()=>texture,{uiSampling:{...UI_SAMPLING_DEFAULTS,enabled:true}}).frame.data;
    expect(pixel(f,0)).toEqual([0,0,0,255]);expect(pixel(f,1)).toEqual([40,40,40,255]);expect(pixel(f,2)).toEqual([200,200,200,255]);expect(pixel(f,3)).toEqual([0,0,0,255]);
  });
  it('does not sharpen/sample menu 3D models or movie pixels',()=>{
    const tri:UiModelTriangle={node:'t',texture:'t',cull:false,a:{x:0,y:0,u:0,v:0,invW:1,rgba:[128,128,128,128]},b:{x:10,y:0,u:1,v:0,invW:1,rgba:[128,128,128,128]},c:{x:0,y:10,u:0,v:1,invW:1,rgba:[128,128,128,128]}};
    const items:UiDrawItem[]=[{kind:'models',triangles:[tri]}];
    equalFrames(rasterizeUiDrawList(items,()=>texture,{uiSampling:{...UI_SAMPLING_DEFAULTS,enabled:true,mode:'sharpen'}}),rasterizeUiDrawList(items,()=>texture));
    const picture={width:2,height:1,image:texture};const movie:UiDrawItem={kind:'movie',picture,x0:0,y0:0,x1:640,y1:448};
    const f=rasterizeUiDrawList([movie],()=>null,{movie:()=>texture,uiSampling:{...UI_SAMPLING_DEFAULTS,enabled:true,mode:'sharpen'}}).frame.data;
    expect(pixel(f,0)).toEqual([40,40,40,255]);expect(pixel(f,1)).toEqual([200,200,200,255]);
  });
  it('absent and OFF match the fixed original 8181ebab7 compositor frame and metadata',()=>{
    const {items,textures,movie}=menuFixture();
    for(const uiSampling of [undefined,{...UI_SAMPLING_DEFAULTS,enabled:false,mode:'sharpen' as const,sharpness:1}]){
      const {frame,undrawn}=rasterizeUiDrawList(items,textures,{movie,uiSampling});
      expect({width:frame.width,height:frame.height,undrawn,sha256:createHash('sha256').update(bytes(frame.data)).digest('hex')}).toEqual(original.frame);
    }
  });
  it.each(['?expMenu=integer','?devmode&expMenu=bad',''])('ordinary or invalid query retains exact canvas style: %s',query=>{
    const dom=new JSDOM('<body></body>',{url:'http://localhost/'});vi.spyOn(dom.window.HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
    const base=mountFrontEnd('',null,dom.window.document)!;const css=base.canvas.style.cssText;base.stop();
    const mount=mountFrontEnd(query,null,dom.window.document)!;expect(mount.canvas.style.cssText).toBe(css);mount.stop();dom.window.close();
  });
  it('the actual front-end mount reads only a valid dev address and keeps the logical frame',()=>{
    const dom=new JSDOM('<body></body>',{url:'http://localhost/'});vi.spyOn(dom.window.HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
    Object.defineProperties(dom.window,{innerWidth:{value:1920},innerHeight:{value:1080},devicePixelRatio:{value:1}});
    const mount=mountFrontEnd('?devmode&expMenu=integer',null,dom.window.document)!;
    expect([mount.canvas.width,mount.canvas.height]).toEqual([640,448]);expect(mount.canvas.style.width).toBe('1280px');expect(mount.canvas.style.height).toBe('896px');mount.stop();dom.window.close();
  });
});
