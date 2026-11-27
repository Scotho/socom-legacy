import { Matrix4, type Sphere } from 'three';
import { staticBounds } from './bounds';
import { frameVisibility } from './visibility';
import { placementOpacity } from './lod';
import { facingPlacement } from './facing';
import { fadeMaterial, type FadeMaterial } from '../lodFade';
import { reticleDrawSet, reticleQuads, reticleTextures } from './reticleFrame';
import type { LoadedMap } from '../loadMap';
import type { LoadedBody } from '../body';
import { FALLBACK_RIG } from '../lighting';
import { mipChain, type Factor } from '../materialSpec';
import { PayloadBudget } from './budget';
import { prototypeDraws, PROTOTYPE_BONE_LIMIT_ADAPTATION, type PrototypeDraw } from './model';
import { uploadBufferArena, type ArenaInput } from './bufferArena';
import { actorsOf, bodyModel, gearVisible, type SceneFrame } from './sceneFrame';
import { worldPlacement } from './worldPlacement';
import { worldChanges } from './worldFrame';
import { extendFar } from '../viewRange';
import { RawParticles } from './rawParticles';
import { RawGlow } from './rawGlow';

/**
 * Two builds of one shader (a browser memory adaptation; the picture is the same). A program's default uniforms live in
 * one constant buffer a stage on the D3D11 backend, re-sent whole at every draw that changed any of them. With the 48
 * bone matrices in the only program, each of a frame's several hundred static draws re-sent about 3.6 KB; on the
 * console that short-lived driver storage grew the GPU process by about 90 MiB a second (the Developer Mode run of
 * 2026-11-19). Static geometry now draws with a program that has no bone array, and a uniform already holding its
 * value is not sent again.
 *
 * The same day's match run showed the rest of it: the GPU process jumped about 450 MiB the moment sixteen bodies drew,
 * posed or not -- each body part is a draw with its own model matrix, so each still re-sent a constant buffer. A draw's
 * own values now travel without one: a lone draw's model matrix rides the instance-matrix attribute's constant (the
 * `model` uniform is identity for these; the product is the same matrix), and the actors' bone matrices sit in one
 * float texture written once a frame, a draw naming its actor's row by an attribute constant.
 */
/** Draw-error queries are asked once in this many frames (two seconds at the match's rate): each is a synchronous trip to the GPU process. */
export const ERROR_CHECK_EVERY = 60;
const vertexSource = (bones: boolean): string => `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;
layout(location=3) in vec4 colour;
layout(location=4) in vec4 joints;
layout(location=5) in vec4 weights;
layout(location=6) in mat4 instanceMatrix;
uniform mat4 projection, view, model;
${bones ? 'layout(location=10) in float boneRow;\nuniform highp sampler2D boneTexture;\nuniform bool skinned;' : ''}
uniform bool lit, fogged, hasNormals;
uniform vec3 ambient, directions[3], lights[3];
uniform vec4 fogRange, wash;
uniform vec2 scrollOffset;
out vec2 texcoord;
out vec4 vertexColour;
out float fogKeep;
${bones ? `mat4 bone(float joint) {
  int x = int(joint) * 4, y = int(boneRow);
  return mat4(texelFetch(boneTexture, ivec2(x, y), 0), texelFetch(boneTexture, ivec2(x + 1, y), 0), texelFetch(boneTexture, ivec2(x + 2, y), 0), texelFetch(boneTexture, ivec2(x + 3, y), 0));
}` : ''}
void main() {
  mat4 skin = mat4(1.0);
  ${bones ? 'if (skinned) skin = weights.x*bone(joints.x) + weights.y*bone(joints.y) + weights.z*bone(joints.z) + weights.w*bone(joints.w);' : ''}
  mat4 transform = model * instanceMatrix;
  vec4 world = transform * skin * vec4(position,1.0);
  vec4 eye = view * world;
  gl_Position = projection * eye;
  vec3 n = normalize(transpose(inverse(mat3(transform))) * mat3(skin) * normal);
  vec3 light = ambient;
  // Same missing-normal fallback as lighting.applyLighting.
  for (int i=0;i<3;i++) light += lights[i]*(hasNormals ? max(dot(directions[i],n),0.0) : 0.5);
  // The flashbang's wash on every lit colour (TRUE_COLOR_SCALE, trueColourScale.ts): c x rgb + w; the identity (1, 1, 1, 0) with none.
  vertexColour = vec4(colour.rgb * (lit ? light : vec3(1.0)) * wash.rgb + wash.a, colour.a);
  texcoord = uv + scrollOffset;
  fogKeep = fogged ? clamp((fogRange.y + eye.z) / max(fogRange.y-fogRange.x,0.0001),0.0,1.0)
    * clamp((world.y-fogRange.z) / max(fogRange.w-fogRange.z,0.0001),0.0,1.0) : 1.0;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D bitmap;
uniform float alphaTest, opacity;
uniform int fadeMode;
uniform bool destinationBlend;
uniform vec3 fogColour;
in vec2 texcoord;
in vec4 vertexColour;
in float fogKeep;
out vec4 result;
void main() {
  vec4 c = clamp(texture(bitmap,texcoord)*vertexColour,0.0,1.0);
  if (alphaTest > 0.0 && c.a <= alphaTest) discard;
  if (destinationBlend) c.rgb = vec3(c.a);
  // Test the original alpha above, before applying the existing LOD fade.
  if (fadeMode == 1) c.a = opacity;
  else if (fadeMode == 2) c.a *= opacity;
  else if (fadeMode == 3) c.rgb *= opacity;
  result = vec4(mix(fogColour,c.rgb,fogKeep),c.a);
}`;
/** Fixed shader experiment. Uploads are bounded and all handles have one explicit owner. No TSL/WebGPU imports. */
export async function rawPrototype(canvas: HTMLCanvasElement, map: LoadedMap, body: LoadedBody | readonly LoadedBody[], limitBytes: number, weapons: readonly string[] = [], withHud = false) {
  const modelCount = Array.isArray(body) ? body.length : 1;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  const budget = new PayloadBudget(limitBytes), cleanup: (() => void)[] = [];
  const textures = new Map<string, WebGLTexture>();
  // Keep GPU draw metadata only after upload, not the geometry's CPU arrays.
  type Draw = Pick<PrototypeDraw, 'model' | 'lit' | 'skinned' | 'actor' | 'modelIndex' | 'fitting' | 'spec' | 'state' | 'weapon' | 'scroll' | 'order' | 'lod' | 'objectModel'>;
  type Placement = ReturnType<typeof worldPlacement>;
  const placementWrites = new Map<Placement, (byteOffset: number, next: ArrayBufferView) => void>();
  const placements = new Set<Placement>();
  const batches: { draw: Draw; hasNormals: boolean; bounds: Sphere | null; vao: WebGLVertexArrayObject; texture: WebGLTexture; count: number;
    instanced: boolean; indexCount: number; indexOffset: number; ordinal: number; opacity: number; fade?: FadeMaterial; facing?: ReturnType<typeof facingPlacement>; world?: Placement }[] = [];
  let disposed = false, lost = false, sinceYield = 0;
  const onLost = (event: Event) => { event.preventDefault(); lost = true; };
  canvas.addEventListener('webglcontextlost', onLost);
  const dispose = () => {
    if (disposed) return;
    disposed = true; canvas.removeEventListener('webglcontextlost', onLost);
    for (const release of cleanup.reverse()) release(); cleanup.length = 0;
    textures.clear(); batches.length = 0; placements.clear(); placementWrites.clear();
    // The context itself let go now, not at some later collection (a browser memory adaptation): a match behind the real
    // menus makes a new canvas and context every launch, and the old ones' buffers otherwise stand until the page's
    // collector reaches them -- the tab grew a few MiB a match over ten matches on the console (2026-11-19).
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  const check = () => { if (lost || gl.isContextLost()) throw new Error('Prototype WebGL context lost'); };
  try {
    const draws = prototypeDraws(map, body, weapons), inputs: ArenaInput[] = [];
    for (const draw of draws) {
      for (const data of [draw.positions, draw.normals, draw.uvs, draw.colors, draw.skinIndex, draw.skinWeight, draw.instances]) {
        if (data) inputs.push({ target: 'vertex', data });
      }
      inputs.push({ target: 'index', data: draw.indices });
    }
    const arena = await uploadBufferArena(gl, budget, inputs);
    cleanup.push(arena.dispose); inputs.length = 0;
    const shader = (kind: number, source: string) => {
      const result = gl.createShader(kind); if (!result) throw new Error('Cannot create shader');
      cleanup.push(() => gl.deleteShader(result)); gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? 'Shader compile failed');
      return result;
    };
    const UNIFORMS = ['projection','view','model','boneTexture','skinned','lit','fogged','hasNormals','ambient','directions','lights','fogRange','bitmap','alphaTest','destinationBlend','fogColour','scrollOffset','opacity','fadeMode','wash'] as const;
    type UniformName = typeof UNIFORMS[number];
    const link = (bones: boolean) => {
      const program = gl.createProgram(); if (!program) throw new Error('Cannot create program');
      cleanup.push(() => gl.deleteProgram(program));
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource(bones))); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed');
      const uniforms = Object.fromEntries(UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)])) as Record<UniformName, WebGLUniformLocation | null>;
      // The values last sent to this program: a uniform is program state, so one already holding the value is left alone.
      return { program, uniforms, sent: new Map<string, number>(), sentB: new Map<string, number>(), model: new Float32Array(16).fill(NaN) };
    };
    type Linked = ReturnType<typeof link>;
    const staticProgram = link(false), skinnedProgram = link(true);
    const u1i = (p: Linked, name: UniformName, v: number) => { if (p.sent.get(name) === v) return; p.sent.set(name, v); gl.uniform1i(p.uniforms[name], v); };
    const u1f = (p: Linked, name: UniformName, v: number) => { if (p.sent.get(name) === v) return; p.sent.set(name, v); gl.uniform1f(p.uniforms[name], v); };
    const u2f = (p: Linked, name: UniformName, x: number, y: number) => {
      if (p.sent.get(name) === x && p.sentB.get(name) === y) return;
      p.sent.set(name, x); p.sentB.set(name, y); gl.uniform2f(p.uniforms[name], x, y);
    };
    const uModel = (p: Linked, m: ArrayLike<number>) => {
      let same = true; for (let i = 0; i < 16; i++) if (p.model[i] !== m[i]) { same = false; break; }
      if (same) return;
      for (let i = 0; i < 16; i++) p.model[i] = m[i]!;
      gl.uniformMatrix4fv(p.uniforms.model, false, p.model);
    };
    // The actors' bone matrices: one row an actor, four texels a matrix; written once a frame.
    const BONE_ROWS = 64, BONE_WIDTH = PROTOTYPE_BONE_LIMIT_ADAPTATION * 4;
    const boneTexture = gl.createTexture(); if (!boneTexture) throw new Error('Cannot allocate the bone texture');
    cleanup.push(() => gl.deleteTexture(boneTexture));
    gl.bindTexture(gl.TEXTURE_2D, boneTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BONE_WIDTH, BONE_ROWS, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const boneFloats = new Float32Array(BONE_WIDTH * 4 * BONE_ROWS), boneRows = new Map<object, number>();
    // The instance-matrix attribute's constant, as last set (context state): a lone draw's model matrix.
    const constantModel = new Float32Array(16).fill(NaN);
    const setConstantModel = (m: ArrayLike<number>) => {
      for (let c = 0; c < 4; c++) {
        const i = c * 4;
        if (constantModel[i] === m[i] && constantModel[i+1] === m[i+1] && constantModel[i+2] === m[i+2] && constantModel[i+3] === m[i+3]) continue;
        constantModel[i] = m[i]!; constantModel[i+1] = m[i+1]!; constantModel[i+2] = m[i+2]!; constantModel[i+3] = m[i+3]!;
        gl.vertexAttrib4f(6 + c, m[i]!, m[i+1]!, m[i+2]!, m[i+3]!);
      }
    };
    const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    let constantRow = -1;
    let uploadMap: LoadedMap | null = map;
    const textureFor = (draw: PrototypeDraw) => {
      const spec = draw.spec, name = draw.textureName ?? '';
      const key = `${name}|${spec.bilinear}|${spec.mipmaps}|${spec.wrapS}|${spec.wrapT}`;
      const cached = textures.get(key); if (cached) return cached;
      const rgba = uploadMap!.textures[name] ?? { width: 1, height: 1, data: new Uint8ClampedArray([255,255,255,255]) };
      const authored = spec.mipmaps ? uploadMap!.textureMips?.[name] : undefined;
      const levels = authored?.length ? mipChain(rgba, authored) : [rgba];
      let bytes = levels.reduce((sum, level) => sum + level.width * level.height * 4, 0);
      if (spec.mipmaps && levels.length === 1) {
        let w = rgba.width, h = rgba.height;
        while (w > 1 || h > 1) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); bytes += w*h*4; }
      }
      const release = budget.reserve(bytes), texture = gl.createTexture();
      if (!texture) { release(); throw new Error('Cannot allocate texture'); }
      cleanup.push(() => { gl.deleteTexture(texture); release(); }); textures.set(key, texture);
      gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      levels.forEach((level, i) => gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA, level.width, level.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, level.data));
      if (spec.mipmaps && levels.length === 1) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, spec.bilinear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, spec.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : spec.bilinear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, spec.wrapS === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, spec.wrapT === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Prototype texture upload failed');
      sinceYield += bytes;
      return texture;
    };
    // Parts sharing one instance range share its numeric mutable state and one
    // GPU write. Drop this source-keyed cache once upload bindings are closed.
    const placementCache = new Map<ArrayBufferLike, Map<string, Placement>>();
    const placementFor = (draw: PrototypeDraw): Placement | undefined => {
      if (!draw.world) return undefined;
      if (!draw.instances) { const state = worldPlacement(draw.world); placements.add(state); return state; }
      const source = draw.instances;
      let ranges = placementCache.get(source.buffer);
      if (!ranges) { ranges = new Map(); placementCache.set(source.buffer, ranges); }
      const key = `${source.byteOffset}:${source.byteLength}`;
      let state = ranges.get(key);
      if (!state) {
        state = worldPlacement({ ...draw.world, matrices: source }); ranges.set(key, state); placements.add(state);
        const write = arena.writer(source, 'vertex'); placementWrites.set(state, write);
        if (draw.world.alternate) write(0, state.matrices);
      }
      return state;
    };
    for (const draw of draws) {
      check();
      const vao = gl.createVertexArray(); if (!vao) throw new Error('Cannot allocate vertex array');
      cleanup.push(() => gl.deleteVertexArray(vao)); gl.bindVertexArray(vao);
      const attribute = (location: number, data: Float32Array | Uint16Array | null | undefined, size: number) => {
        if (!data) return;
        const offset = arena.bind(data, 'vertex'); gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, data instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.FLOAT, false, 0, offset);
      };
      attribute(0, draw.positions, 3); attribute(1, draw.normals, 3); attribute(2, draw.uvs, 2);
      attribute(3, draw.colors, 4); attribute(4, draw.skinIndex, 4); attribute(5, draw.skinWeight, 4);
      if (draw.instances) {
        const offset = arena.bind(draw.instances, 'vertex');
        for (let i=0;i<4;i++) { gl.enableVertexAttribArray(6+i); gl.vertexAttribPointer(6+i,4,gl.FLOAT,false,64,offset+i*16); gl.vertexAttribDivisor(6+i,1); }
      }
      const indexOffset = arena.bind(draw.indices, 'index');
      const { model, lit, skinned, actor, modelIndex, fitting, spec, state, weapon, scroll, order, lod, objectModel } = draw;
      const world = placementFor(draw);
      batches.push({ draw: { model, lit, skinned, actor, modelIndex, fitting, spec, state, weapon, scroll, order, lod, objectModel }, hasNormals: draw.normals !== null, ordinal: batches.length, facing: draw.facade ? facingPlacement(model, draw.facade) : undefined, opacity: 1, fade: lod ? fadeMaterial(spec, false) : undefined, bounds: staticBounds(draw), vao, texture: textureFor(draw),
        count: draw.instances ? draw.instances.length / 16 : 1, instanced: !!draw.instances, indexCount: draw.indices.length, indexOffset, world });
      // A test instrument's upload pacing, not a claimed browser RAM budget. Never queue another asset class here.
      if (sinceYield >= 4*1024*1024) { sinceYield = 0; await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    arena.finishBindings(); placementCache.clear(); draws.length = 0; uploadMap = null;
    gl.bindVertexArray(null); check();
    const rig = map.lightRig ?? FALLBACK_RIG, fog = map.camera;
    const hud = withHud ? new (await import('./rawHud')).RawHud(gl, budget) : undefined;
    if (hud) { cleanup.push(() => hud.dispose()); hud.setBitmaps({ ...map.hud, ...reticleTextures(map.reticle) }); }
    let drawnReticleSet = 1;
    const visibility = frameVisibility();
    const changes = worldChanges();
    const modelScratch = new Matrix4(), boneScratch = new Matrix4(), actorScratch = new Matrix4(), matrixFloats = new Float32Array(16);
    const factor = (f: Factor) => ({ zero: gl.ZERO, one: gl.ONE, srcAlpha: gl.SRC_ALPHA, oneMinusSrcAlpha: gl.ONE_MINUS_SRC_ALPHA, dstColor: gl.DST_COLOR })[f];
    // The effects' particle pass: made at the first frame that carries particles, so a match without them holds nothing.
    let particlePass: RawParticles | null = null;
    cleanup.push(() => { particlePass?.dispose(); particlePass = null; });
    const glowPass = new RawGlow(gl, budget); cleanup.push(() => glowPass.dispose());
    let inFlight: WebGLSync | null = null, drawnFrames = 0;
    cleanup.push(() => { if (inFlight) gl.deleteSync(inFlight); });
    const gpuBytes = budget.current;
    const stats = { programs: 2 + (hud?.stats.programs ?? 0), buffers: arena.buffers + (hud?.stats.buffers ?? 0),
        geometryBuffers: arena.buffers, hud: hud?.stats, bufferSourceRanges: arena.sourceRanges, geometryPayloadBytes: arena.payloadBytes,
        textures: textures.size + (hud?.stats.textures ?? 0), batches: batches.length,
        drawCalls: batches.length, culledBatches: 0, lodHiddenBatches: 0, fadingBatches: 0, collapsedFacades: 0, triangles: batches.reduce((sum, b) => sum + b.indexCount / 3 * b.count, 0),
        actors: 0, heldFrames: 0, particles: 0, particleDrawCalls: 0, particleTextures: 0, effectMeshDrawCalls: 0, glowPasses: 0, cpuSetupMs: 0, cpuWorldMs: 0, cpuEffectsMs: 0, cpuHudMs: 0, cpuErrorCheckMs: 0, worldPlacementCpuBytes: [...placements].reduce((sum, item) => sum + item.cpuPayloadBytes, 0),
        gpuPayloadBytes: gpuBytes, gpuPayloadLimitBytes: limitBytes };
    return { stats, hud,
      /**
       * One frame in flight (a browser memory adaptation): false while the GPU has not finished the frame before, and a
       * live loop then leaves this animation frame alone. On the console, frames queued behind a busy GPU process -- a
       * hitch at the launch, a screenshot, an uncapped rate -- each held driver memory the process never gave back: a
       * step of 170-450 MiB (Developer Mode, 2026-11-19). `render` itself always draws (a capture's frames are counted).
       */
      ready(): boolean {
        if (!inFlight || disposed) return true;
        if (gl.clientWaitSync(inFlight, 0, 0) === gl.TIMEOUT_EXPIRED) { stats.heldFrames++; return false; }
        gl.deleteSync(inFlight); inFlight = null;
        return true;
      },
      render(frame: SceneFrame) {
        if (disposed) throw new Error('Prototype renderer disposed'); check();
        const t0 = performance.now();
        const { camera } = frame, actors = actorsOf(frame, modelCount);
        extendFar(camera, frame.farExtra ?? 0);
        const operations = changes.take(frame.world);
        for (const placement of placements) if (placement.apply(operations)) placementWrites.get(placement)?.(0, placement.matrices);
        stats.actors = actors.length; stats.drawCalls = 0; stats.triangles = 0; stats.culledBatches = 0; stats.lodHiddenBatches = 0; stats.fadingBatches = 0; stats.collapsedFacades = 0;
        visibility.frame(camera);
        for (const batch of batches) {
          batch.opacity = batch.world?.visible === false ? 0 : placementOpacity(batch.draw.lod, camera.position, frame.magnification ?? 1) * (batch.world?.opacity ?? 1);
          if (batch.world?.moved) batch.bounds = null; // A changed leaf cannot use its closed-position bound.
          if (batch.opacity < 1 && batch.opacity > 0 && !batch.fade) batch.fade = fadeMaterial(batch.draw.spec, false);
        }
        // Preserve the existing walk-order approximation within each list. A
        // fading opaque placement must join the blended list without writing depth.
        batches.sort((a, b) => Number(a.draw.state.transparent || a.opacity < 1) - Number(b.draw.state.transparent || b.opacity < 1)
          || a.draw.order - b.draw.order || a.ordinal - b.ordinal);
        gl.viewport(0,0,canvas.width,canvas.height); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true); gl.colorMask(true,true,true,true);
        // The wash lifts the fog colour too (`washFogColour`: c x rgb + w, in 0..255).
        const washRow = frame.wash ?? null;
        const color = (fog?.fogColor ?? [0,0,0]).map((v, i) => Math.min(1, (washRow ? v * washRow[i]! + washRow[3] : v) / 255));
        gl.clearColor(color[0]!,color[1]!,color[2]!,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.colorMask(true,true,true,false);
        gl.activeTexture(gl.TEXTURE0);
        for (const linked of [staticProgram, skinnedProgram]) {
          gl.useProgram(linked.program);
          gl.uniformMatrix4fv(linked.uniforms.projection!,false,camera.projectionMatrix.elements);
          gl.uniformMatrix4fv(linked.uniforms.view!,false,camera.matrixWorldInverse.elements);
          gl.uniform3fv(linked.uniforms.ambient!,rig.ambient); gl.uniform3fv(linked.uniforms.directions!,rig.directions.flat()); gl.uniform3fv(linked.uniforms.lights!,rig.colours.flat());
          gl.uniform3fv(linked.uniforms.fogColour!,color);
          gl.uniform4f(linked.uniforms.wash!, washRow?.[0] ?? 1, washRow?.[1] ?? 1, washRow?.[2] ?? 1, washRow ? washRow[3] / 128 : 0);
          gl.uniform4f(linked.uniforms.fogRange!,fog?.fogNear ?? 0,(fog?.fogFar ?? 100000) + (frame.farExtra ?? 0),fog?.fogAltitude ? fog.fogBottom : -10000,fog?.fogAltitude ? fog.fogTop : -9000);
          u1i(linked, 'bitmap', 0);
        }
        gl.useProgram(skinnedProgram.program); u1i(skinnedProgram, 'boneTexture', 1);
        boneRows.clear();
        const posed = Math.min(actors.length, BONE_ROWS);
        for (let row = 0; row < posed; row++) {
          const palette = actors[row]!.palette;
          boneFloats.set(palette.length > BONE_WIDTH * 4 ? palette.subarray(0, BONE_WIDTH * 4) : palette, row * BONE_WIDTH * 4);
          boneRows.set(actors[row]!, row);
        }
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, boneTexture);
        if (posed) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BONE_WIDTH, posed, gl.RGBA, gl.FLOAT, boneFloats, 0);
        gl.activeTexture(gl.TEXTURE0);
        const t1 = performance.now(); stats.cpuSetupMs += t1 - t0;
        let bound: Linked | null = null;
        // Constants for disabled attributes are context state, not VAO state.
        gl.vertexAttrib3f(1,0,1,0); gl.vertexAttrib4f(3,1,1,1,1); gl.vertexAttrib4f(4,0,0,0,0); gl.vertexAttrib4f(5,1,0,0,0);
        constantModel.fill(NaN); setConstantModel(IDENTITY); constantRow = -1;
        for (const { draw, hasNormals, bounds, vao, texture, count, instanced, indexCount, indexOffset, opacity, fade, facing, world } of batches) {
          if (facing && !facing.frame(camera.position)) { stats.collapsedFacades++; continue; }
          if (opacity <= 0) { stats.lodHiddenBatches++; continue; }
          const fading = opacity < 1 && !!fade, state = fading ? fade.state : draw.state;
          if (fading) stats.fadingBatches++;
          if (!visibility.visible(bounds)) { stats.culledBatches++; continue; }
          const skinning = draw.skinned;
          const linked = skinning ? skinnedProgram : staticProgram;
          if (bound !== linked) { gl.useProgram(linked.program); bound = linked; }
          gl.bindVertexArray(vao); gl.bindTexture(gl.TEXTURE_2D,texture);
          if (skinning) u1i(linked, 'skinned', 1);
          u1i(linked, 'lit', Number(draw.lit));
          u1i(linked, 'hasNormals', Number(hasNormals));
          u1i(linked, 'fogged', Number(draw.spec.fog && draw.spec.blend !== 'destination' && !!fog?.fogEnabled));
          u1f(linked, 'alphaTest', draw.spec.alphaTest); u1i(linked, 'destinationBlend', Number(draw.spec.blend === 'destination'));
          // Same authored widths/second as world.frame (research 82 section 8); fixed comparisons stay at time zero.
          u2f(linked, 'scrollOffset', ((draw.scroll?.[0] ?? 0) * (frame.seconds ?? 0)) % 1 + (world?.uv[0] ?? 0),
            ((draw.scroll?.[1] ?? 0) * (frame.seconds ?? 0)) % 1 + (world?.uv[1] ?? 0));
          u1f(linked, 'opacity', opacity);
          u1i(linked, 'fadeMode', fading ? ({ solid: 1, alpha: 2, carrier: 3 }[fade.mode]) : 0);
          gl.depthMask(state.depthWrite);
          if (draw.spec.cull) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE);
          if (state.factors) { gl.enable(gl.BLEND); gl.blendFuncSeparate(factor(state.factors.src),factor(state.factors.dst),gl.ZERO,gl.ONE); }
          else gl.disable(gl.BLEND);
          const submit = (actor: SceneFrame['body'] | null, held?: Float32Array, object?: Float32Array) => {
            let model = object ? actorScratch.fromArray(object) : actor ? bodyModel(actor, actorScratch) : draw.model;
            if (actor && skinning) { const row = boneRows.get(actor) ?? 0; if (row !== constantRow) { constantRow = row; gl.vertexAttrib1f(10, row); } }
            if (draw.fitting && actor) model = modelScratch.copy(model).multiply(boneScratch.fromArray(actor.world[draw.fitting.bone]!)).multiply(draw.fitting.offset);
            if (held) model = modelScratch.copy(model).multiply(boneScratch.fromArray(held));
            // An instanced batch keeps its own model uniform; a lone draw's matrix is the attribute constant.
            if (instanced) uModel(linked, model.toArray(matrixFloats));
            else { uModel(linked, IDENTITY); setConstantModel(model.toArray(matrixFloats)); }
            if (instanced) gl.drawElementsInstanced(gl.TRIANGLES,indexCount,gl.UNSIGNED_INT,indexOffset,count);
            else gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_INT,indexOffset);
            stats.drawCalls++; stats.triangles += indexCount / 3 * count;
          };
          if (draw.weapon) { for (const actor of actors) for (const held of actor.held ?? []) if (held.name === draw.weapon) submit(actor, held.matrix); }
          else if (draw.objectModel) { for (const object of frame.objects ?? []) if (object.model === draw.objectModel) submit(null, undefined, object.matrix); }
          else if (draw.actor) { for (const actor of actors) if (actor.modelIndex === draw.modelIndex && (!draw.fitting || gearVisible(draw.fitting.name, actor.gear))) submit(actor); }
          else submit(null);
        }
        const t2 = performance.now(); stats.cpuWorldMs += t2 - t1;
        gl.bindVertexArray(null);
        // After the world's lists (their own blended order is approximate, `PROTOTYPE_OMISSIONS`), before the fence and the HUD.
        if (frame.particles || frame.effectMeshes) {
          if (!particlePass) { particlePass = new RawParticles(gl, budget); stats.programs++; }
          // A multiplayer frame is not brightened (`../lighting`). The models first: a casing writes depth, a flash is under its smoke.
          if (frame.effectMeshes) {
            particlePass.drawMeshes(frame.effectMeshes, camera, fog, 1);
            stats.effectMeshDrawCalls = particlePass.stats.meshDrawCalls; stats.drawCalls += particlePass.stats.meshDrawCalls; stats.triangles += particlePass.stats.meshTriangles;
          }
          if (frame.particles) {
            particlePass.draw(frame.particles, camera, fog, 1);
            stats.particles = particlePass.stats.particles; stats.particleDrawCalls = particlePass.stats.drawCalls;
            stats.drawCalls += particlePass.stats.drawCalls; stats.triangles += particlePass.stats.particles * 2;
          }
          stats.particleTextures = particlePass.stats.textures;
          gl.disable(gl.BLEND); gl.depthMask(true); gl.activeTexture(gl.TEXTURE0);
        }
        const t3 = performance.now(); stats.cpuEffectsMs += t3 - t2;
        // The flashbang's glow over the world's frame, before the HUD (`../flash`'s reading of where it falls).
        if (frame.glow && frame.glow.passes > 0) { glowPass.draw(canvas.width, canvas.height, frame.glow.passes, frame.glow.fix); stats.glowPasses = glowPass.stats.passes; stats.drawCalls += glowPass.stats.passes; }
        else stats.glowPasses = 0;
        if (inFlight) gl.deleteSync(inFlight);
        inFlight = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
        if (hud) {
          if (frame.reticle) drawnReticleSet = reticleDrawSet(frame.reticle.set, drawnReticleSet, hud.sizes());
          const sight = frame.reticle ? { ...frame.reticle, set: drawnReticleSet } : undefined;
          hud.render(canvas.width, canvas.height, frame.realDeltaSeconds ?? frame.deltaSeconds ?? 0,
            reticleQuads({ width: canvas.width, height: canvas.height }, sight, hud.sizes()));
        }
        stats.drawCalls += hud?.stats.drawCalls ?? 0; stats.triangles += (hud?.stats.vertices ?? 0) / 3;
        stats.gpuPayloadBytes = budget.current;
        const t4 = performance.now(); stats.cpuHudMs += t4 - t3;
        // getError is a synchronous round trip to the GPU process (about 2.6 ms a call on the console, 2026-11-19): asked on
        // the first frames and once in ERROR_CHECK_EVERY after, never every frame; a lost context is known at `check`.
        if (++drawnFrames <= 3 || drawnFrames % ERROR_CHECK_EVERY === 0) { if (gl.getError() !== gl.NO_ERROR) throw new Error('Prototype draw failed'); }
        stats.cpuErrorCheckMs += performance.now() - t4;
      }, dispose,
    };
  } catch (error) { dispose(); throw error; }
}
