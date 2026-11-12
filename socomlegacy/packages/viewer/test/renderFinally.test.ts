import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PerspectiveCamera,RenderTarget,Scene} from 'three';

/**
 * RENDER-FINALLY (product track, a renderer adaptation: nothing the game draws changes while renders do not throw).
 * `drawFrame`'s PS2 path and its native glow path set a render target of their own (the PS2 frame, the glow target)
 * around the world's render and the glow's passes; a throw there (a failed GPU allocation; the match's frame guard keeps
 * the loop going) used to leave that target set, so the next frame's blit sampled `frame` into `frame` -- a feedback
 * loop on WebGL2 and a frozen canvas with no later throw. The target now goes back in a `finally`, as the experimental
 * path's already did, and the error still reaches the caller. Driven through the same fake WebGPURenderer as
 * `experimentalRenderer.test.ts`, whose `render` throws on demand.
 */
const seen=vi.hoisted(()=>({draws:[] as {scene:unknown;target:RenderTarget|null}[],failAt:-1,calls:0,failure:null as Error|null}));
vi.mock('three/webgpu',async importOriginal=>{
  const actual=await importOriginal<typeof import('three/webgpu')>();
  class FakeRenderer {
    samples=4;stencil=false;outputColorSpace='';autoClear=true;target:RenderTarget|null=null;
    backend={isWebGLBackend:true,createRenderPipeline(){}};
    async init(){} setPixelRatio(){} setSize(){} setClearColor(){}
    getRenderTarget(){return this.target;} setRenderTarget(t:RenderTarget|null){this.target=t;}
    getDrawingBufferSize(v:{set(x:number,y:number):unknown}){return v.set(640,360);}
    render(scene:unknown){
      const call=seen.calls++;
      if(call===seen.failAt){seen.failAt=-1;throw seen.failure;}
      seen.draws.push({scene,target:this.target});
    }
    async compileAsync(){} async dispose(){}
  }
  return {...actual,WebGPURenderer:FakeRenderer};
});
import {createRenderer} from '../src/renderer';

const here=dirname(fileURLToPath(import.meta.url));
const src=(f:string):string=>readFileSync(resolve(here,'../src',f),'utf-8');

/** The renderer's render throws on its `n`th call (0-based) from now. */
const failOn=(n:number,message='GPU allocation failed'):Error=>{
  seen.failure=new Error(message);seen.failAt=seen.calls+n;return seen.failure;
};

describe('RENDER-FINALLY: drawFrame puts its render target back when a render throws',()=>{
  beforeEach(()=>{seen.draws=[];seen.failAt=-1;seen.calls=0;seen.failure=null;});
  const setup=async()=>{
    const v=await createRenderer({} as HTMLCanvasElement),scene=new Scene(),camera=new PerspectiveCamera();
    const outer=new RenderTarget(8,8);
    v.renderer.setRenderTarget(outer);                     // the caller's target, which every path must hand back
    return {v,scene,camera,outer};
  };
  const thrown=(fn:()=>void):unknown=>{try{fn();}catch(e){return e;}return null;};

  it('PS2 picture: the world\'s render throws -- the error reaches the caller and the target is the caller\'s again',async()=>{
    const {v,scene,camera,outer}=await setup();
    v.setPresentation('ps2');
    const failure=failOn(0);
    expect(thrown(()=>v.render(scene,camera))).toBe(failure);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    // the next frame as normal: the world into the PS2 frame, the blit onto the caller's target, never frame into frame
    seen.draws=[];v.render(scene,camera);
    expect(seen.draws).toHaveLength(2);
    expect(seen.draws[0]!.scene).toBe(scene);
    const frame=seen.draws[0]!.target;
    expect(frame).not.toBeNull();expect(frame).not.toBe(outer);
    expect(seen.draws[1]!.target).toBe(outer);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    await v.renderer.dispose();
  });

  it('PS2 picture with the glow: a throw inside the glow\'s passes puts back the target and autoClear',async()=>{
    const {v,scene,camera,outer}=await setup();
    v.setPresentation('ps2');v.setGlow({passes:1,fix:64});
    const failure=failOn(2);                               // world, the glow's downsample, then its additive pass
    expect(thrown(()=>v.render(scene,camera))).toBe(failure);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    expect(v.renderer.autoClear).toBe(true);
    seen.draws=[];v.render(scene,camera);
    expect(seen.draws.at(-1)!.target).toBe(outer);         // the blit lands on the caller's target
    expect(seen.draws.slice(0,-1).every(d=>d.target!==outer)).toBe(true);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    await v.renderer.dispose();
  });

  it('native picture with the glow: the world\'s render into the glow target throws -- the target goes back',async()=>{
    const {v,scene,camera,outer}=await setup();
    v.setGlow({passes:1,fix:64});
    const failure=failOn(0);
    expect(thrown(()=>v.render(scene,camera))).toBe(failure);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    seen.draws=[];v.render(scene,camera);
    expect(seen.draws[0]!.scene).toBe(scene);
    expect(seen.draws[0]!.target).not.toBe(outer);         // the world into the glow target
    expect(seen.draws.at(-1)!.target).toBe(outer);         // the glow's blit onto the caller's target
    expect(v.renderer.getRenderTarget()).toBe(outer);
    await v.renderer.dispose();
  });

  it('native picture with the glow: a throw inside the glow\'s passes puts back the target',async()=>{
    const {v,scene,camera,outer}=await setup();
    v.setGlow({passes:1,fix:64});
    const failure=failOn(1);
    expect(thrown(()=>v.render(scene,camera))).toBe(failure);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    expect(v.renderer.autoClear).toBe(true);
    await v.renderer.dispose();
  });

  // Review F1: `warm`'s change held by behaviour, not a source pin -- the PS2 frame is set, then a fading twin's
  // traversal throws (before the base's narrow try): the warm rejects with that error and the target is the caller's.
  it('warm in the PS2 picture: a throw after it set the PS2 frame -- the warm rejects with it, the target is the caller\'s again',async()=>{
    const {v,scene,camera,outer}=await setup();
    v.setPresentation('ps2');
    const failure=new Error('twin traversal failed');
    const twin={traverse(){throw failure;}};                // a fading twin whose traversal throws
    await expect(v.warm(scene,camera,[twin as never])).rejects.toBe(failure);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    await v.renderer.dispose();
  });

  it('nothing throwing: the same draws, the same targets, as before',async()=>{
    const {v,scene,camera,outer}=await setup();
    v.setPresentation('ps2');
    v.render(scene,camera);
    expect(seen.draws.map(d=>d.target===outer)).toEqual([false,true]);
    expect(v.renderer.getRenderTarget()).toBe(outer);
    await v.renderer.dispose();
  });
});

describe('RENDER-FINALLY: the source keeps each restore in a finally',()=>{
  const r=src('renderer.ts');
  const body=(start:string,end:string):string=>{
    const i=r.indexOf(start);expect(i).toBeGreaterThan(-1);
    const j=r.indexOf(end,i);expect(j).toBeGreaterThan(i);
    return r.slice(i,j);
  };
  it('drawFrame\'s PS2 path and native glow path put the target back in a finally',()=>{
    const draw=body('const drawFrame = (scene: Scene, camera: Camera): void => {','const shown = <T>(');
    expect(draw).toMatch(/renderer\.setRenderTarget\(frame\);\r?\n\s+renderer\.render\(scene, camera\);\r?\n\s+if \(glowing\) glowOver\(frame, downPs2\);\r?\n\s+\} finally \{ renderer\.setRenderTarget\(previous\); \}/);
    expect(draw).toMatch(/renderer\.setRenderTarget\(target\);\r?\n\s+renderer\.render\(scene, camera\);\r?\n\s+glowOver\(target, downNative\);\r?\n\s+\} finally \{ renderer\.setRenderTarget\(previous\); \}/);
    // no straight-line restore is left in drawFrame
    expect(draw).not.toMatch(/\r?\n\s+renderer\.setRenderTarget\(previous\);\r?\n/);
  });
  it('charShadow.ts restores the map\'s state in the render\'s finally',()=>{
    const c=src('charShadow.ts');
    expect(c).toMatch(/\} finally \{\r?\n\s+scene\.matrixWorldAutoUpdate = autoUpdate;\r?\n\s+renderer\.setClearColor\(previousClear, previousAlpha\);\r?\n\s+renderer\.setRenderTarget\(previousTarget\);\r?\n\s+scene\.overrideMaterial = previousOverride;\r?\n\s+scene\.background = previousBackground;\r?\n\s+\}/);
  });
});
