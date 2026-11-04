import { Mesh, PerspectiveCamera, Scene, type Material } from 'three';
import { GLSLNodeBuilder, WGSLNodeBuilder, WebGPURenderer } from 'three/webgpu';
import { DEFAULT_GRID_PARAMS } from '@s2u/scene';
import type { LoadedMap, LoadedMesh } from '../src/loadMap';
import type { LoadedBody } from '../src/body';
import { buildWorld } from '../src/world';
import { buildBody } from '../src/bodyView';
import { DEFAULT_LIGHTING } from '../src/lighting';

/** Synthetic geometry only; the mipmapped base/detail and textured/plain body cover each changed graph. */
export function graphicMeshes(worldBuilder = buildWorld, bodyBuilder = buildBody) {
  const part = {positions: new Float32Array([0,0,0,1,0,0,0,0,1]), uvs: new Float32Array(6),
    colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0,1,2]),
    textureName:'ground',fog:false,lit:false,order:0,orderEnd:0,cull:true,alternate:false,scroll:null,
    centroids:new Float32Array(9)} as LoadedMesh;
  const rgba = {data:new Uint8ClampedArray(16).fill(128),width:2,height:2};
  const flags = {bilinear:true,transparent:false,graded:false,opaque:true,
    gs:{bilinear:true,mipmaps:true,lodK:-10,lodL:0,levels:1,wrapS:'repeat',wrapT:'repeat',alphaTest:null}};
  const map = {archive:'SYN',camera:null,path:'SYN.ZDB',name:'synthetic',world:[part],lines:null,props:[],
    textures:{ground:rgba,grain:rgba,skin:rgba},textureFlags:{ground:flags,grain:flags},
    metersPerUnit:0.1,lightRig:null,origin:[0,0,0],detail:{ground:{name:'grain',uv:4,range:202500,bmode:'COLORBLEND'}},
    grid:DEFAULT_GRID_PARAMS,collision:{positions:new Float32Array(0),colors:new Uint8Array(0),polygons:0},slots:[],
    diagnostics:[],loadMs:0,timings:{fetch:0,decode:0,postedAt:0}} as unknown as LoadedMap;
  const world = worldBuilder(map); for(const reveal of world.revealWorld)reveal();
  const identity=Float32Array.from([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const sub=(textureName:string|null)=>({textureName,fog:false,positions:part.positions,
    normals:Float32Array.from([0,1,0,0,1,0,0,1,0]),uvs:part.uvs,indices:part.indices,
    skinIndex:new Uint16Array(12),skinWeight:Float32Array.from([1,0,0,0,1,0,0,0,1,0,0,0])});
  const body = bodyBuilder({character:null,model:'tiny',dressedBy:'test',
    parts:[{name:'root',parent:-1,bindLocal:identity,bindWorld:identity}],subMeshes:[sub(null),sub('skin')],
    fittings:[],missing:[],at:null,height:1,eye:null,
    stats:{vertices:3,triangles:1,parts:1,subMeshes:2,batches:2,maxInfluences:1,droppedWeight:0,fittings:0}
  } as unknown as LoadedBody,map,DEFAULT_LIGHTING);
  const meshes:Record<string,Mesh>={};
  world.group.traverse(o=>{if(o instanceof Mesh)meshes[o.material && (o.material as Material).userData.detailGate?'detail':'map']=o;});
  body.group.traverse(o=>{if(o instanceof Mesh)meshes[o.name.endsWith('untextured')?'bodyPlain':'bodyTextured']=o;});
  return {meshes,world,body,dispose:()=>{world.dispose();body.dispose();}};
}

export function graphicShader(mesh:Mesh, kind:'GLSL'|'WGSL') {
  const renderer=new WebGPURenderer({canvas:{style:{},width:1,height:1,addEventListener(){},removeEventListener(){},getContext:()=>null} as unknown as HTMLCanvasElement,forceWebGL:true});
  renderer.hasFeature=()=>false;
  Object.assign(renderer.backend,{utils:{getTextureSampleData:()=>({primarySamples:1})},capabilities:{getUniformBufferLimit:()=>16384}});
  const Builder=kind==='GLSL'?GLSLNodeBuilder:WGSLNodeBuilder;
  const b=new Builder(mesh,renderer as never) as unknown as {
    material:Material;camera:PerspectiveCamera;scene:Scene;build():void;vertexShader:string;fragmentShader:string;
  };
  b.material=mesh.material as Material;b.camera=new PerspectiveCamera();b.scene=new Scene();b.build();
  // three names skinning buffers with process-global node IDs, unrelated to the shader graph.
  // Rename only those generated identifiers consistently; preserve every operation and binding.
  const buffers = new Map<string, number>();
  return (b.vertexShader+'\n'+b.fragmentShader).replace(/\b(NodeBuffer_|buffer)(\d+)(Struct)?\b/g, (_, prefix: string, id: string, suffix: string | undefined) => {
    if (!buffers.has(id)) buffers.set(id, buffers.size);
    return prefix + 'fixture' + buffers.get(id) + (suffix ?? '');
  });
}
