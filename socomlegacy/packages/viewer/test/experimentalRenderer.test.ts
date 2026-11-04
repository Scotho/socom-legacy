import {beforeEach,describe,expect,it,vi} from 'vitest';
import {PerspectiveCamera,RenderTarget,Scene} from 'three';
import {EXPERIMENTAL_DEFAULTS} from '../src/experimentalGraphics';

const seen=vi.hoisted(()=>({passes:0,bloom:0,disposed:0,draws:[] as {scene:unknown;target:RenderTarget|null}[]}));
vi.mock('three/webgpu',async importOriginal=>{
  const actual=await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples=4;stencil=false;outputColorSpace='';autoClear=true;target:RenderTarget|null=null;
    backend={isWebGLBackend:true,createRenderPipeline(){}};
    async init(){} setPixelRatio(){} setSize(){} setClearColor(){}
    getRenderTarget(){return this.target;} setRenderTarget(t:RenderTarget|null){this.target=t;}
    getDrawingBufferSize(v:{set(x:number,y:number):unknown}){return v.set(640,360);}
    render(scene:unknown){seen.draws.push({scene,target:this.target});}
    async compileAsync(){} async dispose(){seen.disposed++;}
  }
  return {...actual,WebGPURenderer:FakeRenderer};
});
vi.mock('../src/experimentalPass',async importOriginal=>{
  const actual=await importOriginal<typeof import('../src/experimentalPass')>();
  return {...actual,experimentalPass:(...args:Parameters<typeof actual.experimentalPass>)=>{seen.passes++;return actual.experimentalPass(...args);}};
});
vi.mock('../src/experimentalBloom',async importOriginal=>{
  const actual=await importOriginal<typeof import('../src/experimentalBloom')>();
  return {...actual,experimentalBloom:(...args:Parameters<typeof actual.experimentalBloom>)=>{
    const b=actual.experimentalBloom(...args);return {...b,render:(...a:Parameters<typeof b.render>)=>{seen.bloom++;b.render(...a);}};
  }};
});
import {createRenderer} from '../src/renderer';

describe('experimental renderer lifetime, without a browser or GPU',()=>{
  // A fixture that runs one effect alone turns FXAA and the resolve filter off by name: both are on by the owner's
  // defaults since 2026-10-11 (H135).
  beforeEach(()=>{seen.passes=0;seen.bloom=0;seen.disposed=0;seen.draws=[];});
  it('creates no effect graphs for ordinary/off/asset-only use and skips them after bypass or PS2 selection',async()=>{
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    expect(seen.passes).toBe(0);
    v.setExperimental({...EXPERIMENTAL_DEFAULTS,enabled:false});
    v.setExperimental({...EXPERIMENTAL_DEFAULTS,enabled:true,sharpen:false,bloom:false,grade:false,renderScale:1,fxaa:false,resolveFiltering:false,characterLight:true});
    v.render(scene,camera);expect(seen.passes).toBe(0);expect(seen.draws).toEqual([{scene,target:null}]);
    v.setExperimental({...EXPERIMENTAL_DEFAULTS,enabled:true});v.render(scene,camera);
    expect(seen.passes).toBe(2);expect(seen.bloom).toBe(1);
    v.setExperimental({...EXPERIMENTAL_DEFAULTS,enabled:false});seen.draws=[];
    v.render(scene,camera);expect(seen.draws).toEqual([{scene,target:null}]);expect(seen.bloom).toBe(1);
    v.setExperimental({...EXPERIMENTAL_DEFAULTS,enabled:true});v.setPresentation('ps2');seen.draws=[];
    v.render(scene,camera);expect(seen.draws[0]?.target?.width).toBe(640);expect(seen.bloom).toBe(1);
    await v.renderer.dispose();
  });
  it('suppresses bloom during flash glow and releases the half-frame even if native glowFrame was never acquired',async()=>{
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    v.setExperimental({...EXPERIMENTAL_DEFAULTS,enabled:true});v.setGlow({passes:1,fix:64});
    v.render(scene,camera);expect(seen.bloom).toBe(0);
    const half=seen.draws.find(d=>d.target?.width===480&&d.target?.height===270)?.target;
    expect(half).toBeDefined();const disposed=vi.spyOn(half!,'dispose');
    v.setGlow({passes:0,fix:0});expect(disposed).toHaveBeenCalledOnce();
    v.render(scene,camera);expect(seen.bloom).toBe(1);
    await v.renderer.dispose();
  });
  it('retains the ordinary PS2 half-frame between flashes as the base did', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = new Scene(), camera = new PerspectiveCamera();
    v.setPresentation('ps2'); v.setGlow({passes: 1, fix: 64}); v.render(scene, camera);
    const half = seen.draws.find(d => d.target?.width === 320 && d.target?.height === 224)?.target;
    expect(half).toBeDefined(); const disposed = vi.spyOn(half!, 'dispose');
    v.setGlow({passes: 0, fix: 0}); expect(disposed).not.toHaveBeenCalled();
    v.setGlow({passes: 1, fix: 64}); v.render(scene, camera);
    v.setGlow({passes: 0, fix: 0}); expect(disposed).not.toHaveBeenCalled();
    await v.renderer.dispose(); expect(disposed).toHaveBeenCalledOnce();
  });
  it('runs roll-off alone and reuses the exact prior pass scene when it is switched off or zeroed', async () => {
    const v = await createRenderer({} as HTMLCanvasElement), scene = new Scene(), camera = new PerspectiveCamera();
    const settings = {...EXPERIMENTAL_DEFAULTS,enabled:true,sharpen:false,bloom:false,grade:false,renderScale:1,fxaa:false,resolveFiltering:false,highlightRollOff:true,highlightStrength:0.5};
    v.setExperimental(settings); v.render(scene,camera);
    expect(seen.draws).toHaveLength(2); const rolled = seen.draws.at(-1)!.scene;
    // Keep an ordinary experiment pass active so structural on/off selection is observable.
    settings.renderScale = 1.5; settings.highlightRollOff = false;
    v.setExperimental(settings); seen.draws=[]; v.render(scene,camera);
    const ordinary = seen.draws.at(-1)!.scene; expect(ordinary).not.toBe(rolled);
    settings.highlightRollOff = true; v.setExperimental(settings); seen.draws=[]; v.render(scene,camera);
    expect(seen.draws.at(-1)!.scene).toBe(rolled);
    settings.highlightStrength = 0; v.setExperimental(settings); seen.draws=[]; v.render(scene,camera);
    expect(seen.draws.at(-1)!.scene).toBe(ordinary);
    expect(seen.passes).toBe(4);
    settings.renderScale = 1; v.setExperimental(settings); seen.draws=[]; v.render(scene,camera);
    expect(seen.draws).toEqual([{scene,target:null}]);
    await v.renderer.dispose();
  });
  it.each([
    {whiteBalance:true,warmth:0.5}, {toneBalance:true,shadows:0.5},
  ])('runs a non-neutral colour group alone and restores its prior cached scene on zero: %j',async(extra)=>{
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    const base={...EXPERIMENTAL_DEFAULTS,enabled:true,sharpen:false,bloom:false,grade:false,renderScale:1,fxaa:false,resolveFiltering:false};
    v.setExperimental({...base,...extra});v.render(scene,camera);expect(seen.draws).toHaveLength(2);
    const active=seen.draws.at(-1)!.scene;
    v.setExperimental({...base,...extra,warmth:0,shadows:0});seen.draws=[];v.render(scene,camera);
    expect(seen.draws).toEqual([{scene,target:null}]);
    v.setExperimental({...base,...extra});seen.draws=[];v.render(scene,camera);expect(seen.draws.at(-1)!.scene).toBe(active);
    v.setExperimental({...base,...extra,enabled:false});seen.draws=[];v.render(scene,camera);expect(seen.draws).toEqual([{scene,target:null}]);
    await v.renderer.dispose();
  });
  it('ignores tint without bloom, switches its cached bloom scene and retains flash suppression',async()=>{
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    const base={...EXPERIMENTAL_DEFAULTS,enabled:true,sharpen:false,bloom:false,grade:false,renderScale:1,fxaa:false,resolveFiltering:false,bloomTint:true,bloomRed:1.5};
    v.setExperimental(base);v.render(scene,camera);expect(seen.draws).toEqual([{scene,target:null}]);
    v.setExperimental({...base,bloom:true});seen.draws=[];v.render(scene,camera);const tinted=seen.draws.at(-1)!.scene;
    v.setExperimental({...base,bloom:true,bloomRed:1});seen.draws=[];v.render(scene,camera);expect(seen.draws.at(-1)!.scene).not.toBe(tinted);
    v.setExperimental({...base,bloom:true});seen.draws=[];v.render(scene,camera);expect(seen.draws.at(-1)!.scene).toBe(tinted);
    const count=seen.bloom;v.setGlow({passes:1,fix:64});v.render(scene,camera);expect(seen.bloom).toBe(count);
    await v.renderer.dispose();
  });
  it('slider motion inside active colour groups retains their cached scene objects',async()=>{
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    for(const extra of [{whiteBalance:true,warmth:0.2},{toneBalance:true,shadows:0.2},{bloomTint:true,bloomRed:1.2}]){
      const settings={...EXPERIMENTAL_DEFAULTS,enabled:true,...extra};v.setExperimental(settings);seen.draws=[];v.render(scene,camera);
      const pass=seen.draws.at(-1)!.scene,count=seen.passes;
      v.setExperimental({...settings,warmth:0.7,shadows:0.7,bloomRed:1.7});seen.draws=[];v.render(scene,camera);
      expect(seen.draws.at(-1)!.scene).toBe(pass);expect(seen.passes).toBe(count);
    }
    await v.renderer.dispose();
  });
  it('grade to a colour variant and back returns the exact variant-zero pass',async()=>{
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    const base={...EXPERIMENTAL_DEFAULTS,enabled:true,grade:true,fxaa:false};v.setExperimental(base);v.render(scene,camera);const ordinary=seen.draws.at(-1)!.scene;
    v.setExperimental({...base,whiteBalance:true,warmth:0.5});seen.draws=[];v.render(scene,camera);expect(seen.draws.at(-1)!.scene).not.toBe(ordinary);
    v.setExperimental(base);seen.draws=[];v.render(scene,camera);expect(seen.draws.at(-1)!.scene).toBe(ordinary);
    await v.renderer.dispose();
  });
  it('disposes every acquired experiment/bloom target with the underlying renderer',async()=>{
    const v=await createRenderer({} as HTMLCanvasElement);
    v.setExperimental({...EXPERIMENTAL_DEFAULTS,enabled:true});v.render(new Scene(),new PerspectiveCamera());
    const targets=[...new Set(seen.draws.map(d=>d.target).filter((t):t is RenderTarget=>t!==null))];
    expect(targets).toHaveLength(4); // the owner's defaults (2026-10-11, H135) add FXAA's display-sized intermediate
    const spies=targets.map(t=>vi.spyOn(t,'dispose'));
    await v.renderer.dispose();for(const spy of spies)expect(spy).toHaveBeenCalled();
    expect(seen.disposed).toBe(1);
  });
});

// GX-24 CPU submission assertions; no rendered proof.
describe('GX-24 renderer wiring', () => {
  beforeEach(() => {seen.passes=0;seen.bloom=0;seen.draws=[];});
  const base = {...EXPERIMENTAL_DEFAULTS, enabled:true, sharpen:false, bloom:false, grade:false, renderScale:1, fxaa:false, resolveFiltering:false};
  it('runs FXAA alone after a display-sized post image, then frees it and bypasses exactly', async () => {
    const v=await createRenderer({} as HTMLCanvasElement), scene=new Scene(), camera=new PerspectiveCamera();
    v.setExperimental({...base, fxaa:true}); v.render(scene,camera);
    expect(seen.draws).toHaveLength(3);
    const intermediate=seen.draws[1]!.target!;
    expect([intermediate.width,intermediate.height,intermediate.samples,intermediate.depthBuffer]).toEqual([640,360,0,false]);
    expect(seen.draws[2]!.target).toBeNull();
    const disposed=vi.spyOn(intermediate,'dispose');
    v.setExperimental({...base, fxaa:false}); seen.draws=[]; v.render(scene,camera);
    expect(seen.draws).toEqual([{scene,target:null}]);expect(disposed).toHaveBeenCalledOnce();
    await v.renderer.dispose();
  });
  it('selects resolve graphs only while supersampling and returns the exact OFF scene', async () => {
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    const scaled={...base,renderScale:2};
    v.setExperimental(scaled);v.render(scene,camera);const original=seen.draws.at(-1)!.scene;
    for(const resolveFilter of ['nearest','bilinear','bicubic'] as const){
      seen.draws=[];v.setExperimental({...scaled,resolveFiltering:true,resolveFilter});v.render(scene,camera);
      expect(seen.draws).toHaveLength(2);expect(seen.draws.at(-1)!.scene).not.toBe(original);
    }
    seen.draws=[];v.setExperimental(scaled);v.render(scene,camera);expect(seen.draws.at(-1)!.scene).toBe(original);
    seen.draws=[];v.setExperimental({...base,resolveFiltering:true,resolveFilter:'bicubic'});v.render(scene,camera);
    expect(seen.draws).toEqual([{scene,target:null}]);
    await v.renderer.dispose();
  });
});
