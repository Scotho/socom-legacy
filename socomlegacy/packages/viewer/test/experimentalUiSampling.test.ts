import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { integerFit, sharpenBitmap, parseMenuSampling, menuPreviewUrl, mountMenuSampling, UI_SAMPLING_DEFAULTS } from '../src/experimentalUiSampling';

describe('optional UI sampling math and address boundary', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it.each([[1920,1080,1280,896,2],[2560,1440,1920,1344,3],[1920,1080,1280,896,2]])('fits the 640x448 menu inside %ix%i without cropping', (w,h,fw,fh,s) => {
    expect(integerFit(640,448,w,h)).toEqual({width:fw,height:fh,scale:s});
  });
  it('quantizes steps without enlarging a box and fits undersized boxes proportionally', () => {
    expect(integerFit(640,448,2560,1440,2)).toEqual({width:1280,height:896,scale:2});
    expect(integerFit(640,448,320,224,4)).toEqual({width:320,height:224,scale:.5});
    expect(integerFit(640,448,1920,1080,4)).toEqual({width:1280,height:896,scale:2});
  });
  it('sharpens RGB without resizing, mutating the source, changing alpha or bleeding hidden colours', () => {
    const data=Uint8ClampedArray.from([255,0,0,0, 100,100,100,255, 50,50,50,255]);
    const src={width:3,height:1,data}; const before=Array.from(data);
    const out=sharpenBitmap(src,1);
    expect([out.width,out.height]).toEqual([3,1]); expect(Array.from(src.data)).toEqual(before);
    expect([out.data[3],out.data[7],out.data[11]]).toEqual([0,255,255]);
    expect(out.data[4]).toBeGreaterThan(100);expect(out.data[4]).toBe(out.data[5]);expect(out.data[5]).toBe(out.data[6]);
    expect(sharpenBitmap(src,0)).toBe(src);
    expect(sharpenBitmap(src,1)).toBe(out);
  });
  it('preserves constant colour and alpha, including edges', () => {
    const src={width:3,height:2,data:Uint8ClampedArray.from({length:24},(_,i)=>[87,121,17,128][i%4]!)};
    expect(sharpenBitmap(src,1).data).toEqual(src.data);
  });
  it.each(['?expMenu=nearest','?devmode&expMenu=bad','?devmode&expMenu=sharpen&expMenuSharp=NaN','?devmode&expMenu=integer&expMenuSnap=0','?devmode&expMenu=nearest&expMenu=bilinear','?devmode&expMenu=nearest&expMenuSharp=2','?devmode&expMenu=integer&expMenuSnap=1.5','?devmode&expMenu=nearest&expMenuSharp='])('ignores invalid or non-dev query %s', q=>expect(parseMenuSampling(q)).toBeNull());
  it('a release build reads none of it: ?devmode&expMenu=... is ignored when import.meta.env.DEV is false (CX-9a fix round, the B2 ruling)', () => {
    vi.stubEnv('DEV', false);
    expect(parseMenuSampling('?devmode&expMenu=nearest')).toBeNull();
    vi.stubEnv('DEV', true);
    expect(parseMenuSampling('?devmode&expMenu=nearest')).not.toBeNull();
    expect(parseMenuSampling('?devtools&expMenu=nearest')).not.toBeNull();
    expect(parseMenuSampling('?served&expMenu=nearest')).toBeNull();
    expect(parseMenuSampling('?flyok&expMenu=nearest')).toBeNull();
  });
  it('round trips only explicit local menu preferences in a dev link', () => {
    const settings={...UI_SAMPLING_DEFAULTS,enabled:true,mode:'sharpen' as const,sharpness:.75,snap:2};
    const url=new URL(menuPreviewUrl('http://localhost:5410/sub/testroom?online=off&map=MP51',settings));
    expect(url.pathname).toBe('/sub/');expect(url.searchParams.has('devmode')).toBe(true);expect(url.searchParams.has('map')).toBe(false);
    expect(parseMenuSampling(url.search)).toEqual(settings);
    const off=new URL(menuPreviewUrl(url.href,{...settings,enabled:false})); expect(parseMenuSampling(off.search)).toBeNull();
  });
  it('a trailing testroom slash still links to the front end under the same deployment prefix',()=>{
    expect(new URL(menuPreviewUrl('http://localhost:5410/sub/testroom/?devmode',UI_SAMPLING_DEFAULTS)).pathname).toBe('/sub/');
  });
  it('uses whole physical pixels on high-DPI displays and restores canvas styles/listener', () => {
    const dom=new JSDOM('<canvas style="position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain"></canvas>');
    const win=dom.window;Object.defineProperties(win,{innerWidth:{value:1280,configurable:true},innerHeight:{value:720,configurable:true},devicePixelRatio:{value:2}});
    const c=win.document.querySelector('canvas')!;const before=c.style.cssText;
    const clear=mountMenuSampling(c,{...UI_SAMPLING_DEFAULTS,enabled:true,mode:'integer'});
    expect(c.style.width).toBe('960px');expect(c.style.height).toBe('672px');expect(c.style.imageRendering).toBe('pixelated');
    Object.defineProperties(win,{innerWidth:{value:960},innerHeight:{value:540}});win.dispatchEvent(new win.Event('resize'));
    expect(c.style.width).toBe('640px');expect(c.style.height).toBe('448px');
    clear();expect(c.style.cssText).toBe(before);win.dispatchEvent(new win.Event('resize'));expect(c.style.cssText).toBe(before);dom.window.close();
  });
  it('does nothing to a normal canvas when the experiment is off',()=>{
    const dom=new JSDOM('<canvas style="width:100vw"></canvas>');const c=dom.window.document.querySelector('canvas')!;const before=c.outerHTML;
    mountMenuSampling(c,null)();expect(c.outerHTML).toBe(before);dom.window.close();
  });
});
