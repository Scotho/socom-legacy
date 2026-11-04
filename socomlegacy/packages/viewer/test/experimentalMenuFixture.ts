import type {UiDrawItem,UiModelTriangle} from '@s2u/ui';
import type {UiBitmap} from '../src/uiCompositorView';

/** Fabricated pixels only; also run against git-show 8181ebab7's original compositor to pin its OFF result. */
export function menuFixture(){
  const texture:UiBitmap={width:4,height:3,data:Uint8ClampedArray.from({length:48},(_,i)=>i%4===3?(i%12===3?96:255):(i*41+17)%256)};
  const additive:UiBitmap={...texture,blend:'additive'};
  const tri:UiModelTriangle={node:'model',texture:'t',cull:false,
    a:{x:40,y:20,u:0,v:0,invW:1,rgba:[128,128,128,128]},
    b:{x:75,y:25,u:1,v:0,invW:.8,rgba:[128,90,128,128]},
    c:{x:45,y:60,u:0,v:1,invW:1.2,rgba:[90,128,128,128]}};
  const items:UiDrawItem[]=[
    {kind:'sprite',node:'fill',texture:null,x0:0,y0:0,x1:640,y1:448,u0:0,v0:0,u1:1,v1:1,rgba:[23,41,62,128],clip:null},
    {kind:'sprite',node:'sprite',texture:'t',x0:-2.5,y0:5.25,x1:32,y1:29,u0:.01,v0:.01,u1:.99,v1:.99,rgba:[110,128,90,100],clip:{x0:1,y0:7,x1:27,y1:24}},
    {kind:'glyphs',node:'glyph',clip:{x0:10,y0:15,x1:33,y1:38},quads:[{code:65,texture:'add',shadow:false,left:8,top:13,right:36,bottom:40,u0:0,v0:0,u1:4,v1:3,rgba:[128,100,128,112]}]},
    {kind:'models',triangles:[tri]},
    {kind:'movie',picture:{width:4,height:3,image:texture},x0:100,y0:70,x1:108,y1:76},
    {kind:'sprite',node:'missing',texture:'missing',x0:200,y0:100,x1:220,y1:120,u0:0,v0:0,u1:1,v1:1,rgba:[128,128,128,128],clip:null},
  ];
  return {items,textures:(name:string)=>name==='t'?texture:name==='add'?additive:null,movie:()=>texture};
}
