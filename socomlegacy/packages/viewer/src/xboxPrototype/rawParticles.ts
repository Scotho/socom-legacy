import { Mesh, Vector3, type BufferAttribute, type Group, type Matrix4, type Object3D, type PerspectiveCamera } from 'three';
import { MAX_PARTICLES } from '../particleGeometry';
import type { LoadedMap } from '../loadMap';
import type { Factor } from '../materialSpec';
import { EFFECT_MESH_INDICES, EFFECT_MESH_VERTICES, ParticleStyle, type EffectMeshFrame, type EffectMeshStyle } from './particleStyle';
import type { PayloadBudget } from './budget';

const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec2 uv;
layout(location=2) in vec4 colour;
uniform mat4 projection, view;
out vec2 texcoord;
out vec4 vertexColour;
out float viewDepth, worldHeight;
void main() {
  vec4 eye = view * vec4(position, 1.0);
  gl_Position = projection * eye;
  texcoord = uv; vertexColour = colour;
  viewDepth = -eye.z; worldHeight = position.y;
}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D bitmap;
uniform bool sprite, destinationBlend;
uniform float brighten;
uniform vec3 fogColour;
uniform vec4 fogRange;
uniform bool fogged;
in vec2 texcoord;
in vec4 vertexColour;
in float viewDepth, worldHeight;
out vec4 result;
void main() {
  // effectMaterials.UNtextured sprite: vertex RGB * 128/255, alpha unchanged.
  vec4 c = sprite ? vec4(clamp(vertexColour.rgb*(128.0/255.0),0.0,1.0),clamp(vertexColour.a,0.0,1.0))
    : clamp(texture(bitmap,texcoord)*vertexColour,0.0,1.0);
  // Current effectMaterial leaves material.alphaTest at zero, even when its
  // numeric GS spec selects cutout draw state. Preserve that effective behavior.
  c.rgb = destinationBlend ? vec3(c.a) : c.rgb * brighten;
  // The current fog node applies both clamps in the fragment stage.
  float fogKeep = fogged ? clamp(viewDepth*fogRange.x+fogRange.y,0.0,255.0)
    * clamp((worldHeight-fogRange.z)*fogRange.w,0.0,1.0)/255.0 : 1.0;
  result = vec4(mix(c.rgb,fogColour,1.0-fogKeep),c.a);
}`;

/** Fixed particle draw pass. Geometry is borrowed synchronously from the shared
 * particle core. One bounded streaming vertex buffer and one index buffer cover
 * its MAX_PARTICLES, regardless of texture buckets. CPU staging is counted
 * separately; PayloadBudget counts requested GPU payload, not driver residency.
 * World/particle alpha interleave is a caller responsibility, not provided here.
 * The core emits world-space geometry: group/mesh world transforms must remain
 * identity. Visibility is honored through every parent. The caller selects the
 * framebuffer/viewport and clears it before this pass.
 */
export class RawParticles {
  private readonly cleanup: (() => void)[] = [];
  private readonly textures = new Map<ParticleStyle | EffectMeshStyle, { texture: WebGLTexture; release(): void }>();
  private meshVao: WebGLVertexArrayObject | null = null;
  private meshVertex: WebGLBuffer | null = null;
  private meshIndex: WebGLBuffer | null = null;
  private staging = new Float32Array(0);
  private readonly at = new Vector3();
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private vertex!: WebGLBuffer;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private disposed = false;
  readonly stats = { programs: 1, buffers: 2, textures: 0, drawCalls: 0, particles: 0, meshDrawCalls: 0, meshTriangles: 0,
    cpuStagingBytes: 0, gpuBufferBytes: MAX_PARTICLES * (4 * 9 * 4 + 6 * 2) };

  constructor(private readonly gl: WebGL2RenderingContext, private readonly budget: PayloadBudget) {
    try {
      const reservation = budget.reserve(this.stats.gpuBufferBytes); this.cleanup.push(reservation);
      this.staging = new Float32Array(MAX_PARTICLES * 4 * 9); this.stats.cpuStagingBytes = this.staging.byteLength;
      const shader = (kind: number, source: string) => {
        const value = gl.createShader(kind); if (!value) throw new Error('Particle shader allocation failed');
        this.cleanup.push(() => gl.deleteShader(value)); gl.shaderSource(value, source); gl.compileShader(value);
        if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) ?? 'Particle shader compile failed');
        return value;
      };
      const program = gl.createProgram(); if (!program) throw new Error('Particle program allocation failed');
      this.program = program; this.cleanup.push(() => gl.deleteProgram(program));
      gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Particle program link failed');
      this.uniforms = Object.fromEntries(['projection', 'view', 'fogRange', 'fogged', 'bitmap', 'sprite', 'destinationBlend', 'brighten', 'fogColour']
        .map(name => [name, gl.getUniformLocation(program, name)]));
      const vao = gl.createVertexArray(); if (!vao) throw new Error('Particle VAO allocation failed');
      this.vao = vao; this.cleanup.push(() => gl.deleteVertexArray(vao)); gl.bindVertexArray(vao);
      const vertex = gl.createBuffer(); if (!vertex) throw new Error('Particle vertex allocation failed');
      this.vertex = vertex; this.cleanup.push(() => gl.deleteBuffer(vertex));
      gl.bindBuffer(gl.ARRAY_BUFFER, vertex); gl.bufferData(gl.ARRAY_BUFFER, this.staging.byteLength, gl.DYNAMIC_DRAW);
      for (const [location, size, offset] of [[0, 3, 0], [1, 2, 12], [2, 4, 20]]) {
        gl.enableVertexAttribArray(location!); gl.vertexAttribPointer(location!, size!, gl.FLOAT, false, 36, offset!);
      }
      const index = gl.createBuffer(); if (!index) throw new Error('Particle index allocation failed');
      this.cleanup.push(() => gl.deleteBuffer(index));
      const indices = new Uint16Array(MAX_PARTICLES * 6);
      for (let q = 0; q < MAX_PARTICLES; q++) indices.set([q*4, q*4+1, q*4+2, q*4, q*4+2, q*4+3], q*6);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null); this.check(true);
    } catch (error) { this.dispose(); throw error; }
  }

  private check(upload = false) {
    // Context loss is observable without adding synchronous error queries for
    // every particle pass. Check allocation/upload errors at those boundaries.
    if (this.disposed || this.gl.isContextLost() || (upload && this.gl.getError() !== this.gl.NO_ERROR)) throw new Error('Particle graphics unavailable');
  }

  private textureFor(style: ParticleStyle | EffectMeshStyle): WebGLTexture {
    const held = this.textures.get(style); if (held) return held.texture;
    const gl = this.gl, spec = style.spec;
    const rgba = style.texture?.rgba ?? { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };
    let bytes = rgba.width * rgba.height * 4;
    if (spec.mipmaps) for (let w = rgba.width, h = rgba.height; w > 1 || h > 1;) {
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); bytes += w*h*4;
    }
    const reservation = this.budget.reserve(bytes), texture = gl.createTexture();
    if (!texture) { reservation(); throw new Error('Particle texture allocation failed'); }
    let released = false;
    const release = () => {
      if (released) return; released = true; style.removeEventListener('dispose', release);
      gl.deleteTexture(texture); reservation(); this.textures.delete(style); this.stats.textures = this.textures.size;
    };
    this.textures.set(style, { texture, release }); style.addEventListener('dispose', release);
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rgba.width, rgba.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba.data);
      if (spec.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, spec.bilinear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, spec.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : spec.bilinear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, spec.wrapS === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, spec.wrapT === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT);
      this.check(true); this.stats.textures = this.textures.size; return texture;
    } catch (error) { release(); throw error; }
  }

  draw(group: Group, camera: PerspectiveCamera, fog: LoadedMap['camera'], brighten = 1): void {
    this.check();
    this.stats.particles = 0; this.stats.drawCalls = 0;
    for (let owner: Object3D | null = group; owner; owner = owner.parent) if (!owner.visible) return;
    group.updateWorldMatrix(true, true);
    const identity = (matrix: Matrix4) => {
      for (let i = 0; i < 16; i++) if (matrix.elements[i] !== Number(i % 5 === 0)) return false;
      return true;
    };
    if (!identity(group.matrixWorld)) throw new Error('Particle geometry must remain in world space');
    const gl = this.gl, u = this.uniforms;
    const batches: { mesh: Mesh; style: ParticleStyle; depth: number; count: number; offset: number }[] = [];
    for (const child of group.children) {
      if (!(child instanceof Mesh) || !child.visible) continue;
      if (!identity(child.matrixWorld)) throw new Error('Particle geometry must remain in world space');
      if (!(child.material instanceof ParticleStyle)) throw new Error('Unsupported particle material');
      const count = child.geometry.drawRange.count;
      if (child.geometry.drawRange.start !== 0 || !Number.isInteger(count) || count < 0 || count % 6 !== 0) throw new Error('Unsupported particle draw range');
      this.at.copy(child.geometry.boundingSphere?.center ?? child.position).applyMatrix4(camera.matrixWorldInverse);
      batches.push({ mesh: child, style: child.material, depth: this.at.z, count, offset: 0 });
    }
    batches.sort((a, b) => Number(a.style.state.transparent)-Number(b.style.state.transparent)
      || a.mesh.renderOrder-b.mesh.renderOrder
      // Current WebGPURenderer's common RenderList sorts opaque items by depth,
      // not by the legacy WebGL renderer's material ID.
      || (a.style.state.transparent ? a.depth-b.depth : b.depth-a.depth)
      || a.mesh.id-b.mesh.id);
    let quads = 0;
    for (const batch of batches) {
      const count = batch.count / 6;
      if (count > MAX_PARTICLES-quads) throw new Error('Particle geometry exceeds shared manager capacity');
      batch.offset = quads*6*2;
      const positions = batch.mesh.geometry.getAttribute('position') as BufferAttribute;
      const uvs = batch.mesh.geometry.getAttribute('uv') as BufferAttribute;
      const colours = batch.mesh.geometry.getAttribute('color') as BufferAttribute;
      if (!positions || !uvs || !colours || Math.min(positions.count, uvs.count, colours.count) < count*4) throw new Error('Incomplete particle geometry');
      for (let i = 0; i < count*4; i++) {
        const at = (quads*4+i)*9;
        this.staging[at] = positions.getX(i); this.staging[at+1] = positions.getY(i); this.staging[at+2] = positions.getZ(i);
        this.staging[at+3] = uvs.getX(i); this.staging[at+4] = uvs.getY(i);
        this.staging[at+5] = colours.getX(i); this.staging[at+6] = colours.getY(i);
        this.staging[at+7] = colours.getZ(i); this.staging[at+8] = colours.getW(i);
      }
      quads += count;
    }
    this.stats.particles = quads; this.stats.drawCalls = 0;
    if (!quads) return;
    gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.vertex);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.staging.subarray(0, quads*4*9));
    gl.uniformMatrix4fv(u.projection!, false, camera.projectionMatrix.elements);
    gl.uniformMatrix4fv(u.view!, false, camera.matrixWorldInverse.elements);
    const colour = fog?.fogColor.map(v => v/255) ?? [0, 0, 0];
    const fogOn = !!fog?.fogEnabled && fog.fogFar > fog.fogNear;
    // fog.fogParams: the same numeric uniforms, without importing its TSL graph.
    const scale = fogOn ? -255/(fog!.fogFar-fog!.fogNear) : 0;
    const band = !!fog?.fogAltitude && fog.fogTop > fog.fogBottom;
    gl.uniform3fv(u.fogColour!, colour); gl.uniform1i(u.fogged!, Number(fogOn));
    gl.uniform4f(u.fogRange!, scale, 255-(fog?.fogNear ?? 0)*scale,
      band ? fog!.fogBottom : -10000, band ? 1/(fog!.fogTop-fog!.fogBottom) : 0.001);
    gl.uniform1f(u.brighten!, brighten); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.bitmap!, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.colorMask(true, true, true, false);
    const factor = (f: Factor) => ({ zero: gl.ZERO, one: gl.ONE, srcAlpha: gl.SRC_ALPHA, oneMinusSrcAlpha: gl.ONE_MINUS_SRC_ALPHA, dstColor: gl.DST_COLOR })[f];
    for (const batch of batches) {
      if (!batch.count) continue;
      const { spec, state } = batch.style;
      gl.bindTexture(gl.TEXTURE_2D, this.textureFor(batch.style));
      gl.uniform1i(u.sprite!, Number(!batch.style.texture)); gl.uniform1i(u.destinationBlend!, Number(spec.blend === 'destination'));
      gl.depthMask(state.depthWrite);
      if (state.factors) { gl.enable(gl.BLEND); gl.blendFuncSeparate(factor(state.factors.src), factor(state.factors.dst), gl.ZERO, gl.ONE); }
      else gl.disable(gl.BLEND);
      gl.drawElements(gl.TRIANGLES, batch.count, gl.UNSIGNED_SHORT, batch.offset); this.stats.drawCalls++;
    }
    gl.bindVertexArray(null); this.check();
  }

  /** The frame's effect-model triangles (`EffectMeshFrame`), with this pass's program: opaque styles first (they write
   * depth), then the blended ones in the frame's order. Its buffers are made at the first frame that carries any. */
  drawMeshes(frame: EffectMeshFrame, camera: PerspectiveCamera, fog: LoadedMap['camera'], brighten = 1): void {
    this.check(); this.stats.meshDrawCalls = 0; this.stats.meshTriangles = 0;
    if (!frame.indexCount) return;
    const gl = this.gl, u = this.uniforms;
    if (!this.meshVao) {
      const bytes = EFFECT_MESH_VERTICES * 36 + EFFECT_MESH_INDICES * 2, reservation = this.budget.reserve(bytes);
      this.cleanup.push(reservation); this.stats.gpuBufferBytes += bytes; this.stats.buffers += 2;
      const vao = gl.createVertexArray(), vertex = gl.createBuffer(), index = gl.createBuffer();
      if (!vao || !vertex || !index) throw new Error('Effect mesh buffer allocation failed');
      this.cleanup.push(() => { gl.deleteVertexArray(vao); gl.deleteBuffer(vertex); gl.deleteBuffer(index); });
      this.meshVao = vao; this.meshVertex = vertex; this.meshIndex = index;
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vertex); gl.bufferData(gl.ARRAY_BUFFER, EFFECT_MESH_VERTICES * 36, gl.DYNAMIC_DRAW);
      for (const [location, size, offset] of [[0, 3, 0], [1, 2, 12], [2, 4, 20]]) {
        gl.enableVertexAttribArray(location!); gl.vertexAttribPointer(location!, size!, gl.FLOAT, false, 36, offset!);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, EFFECT_MESH_INDICES * 2, gl.DYNAMIC_DRAW);
      gl.bindVertexArray(null); this.check(true);
    }
    gl.useProgram(this.program); gl.bindVertexArray(this.meshVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.meshVertex);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame.vertices.subarray(0, frame.vertexCount * 9));
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, frame.indices.subarray(0, frame.indexCount));
    gl.uniformMatrix4fv(u.projection!, false, camera.projectionMatrix.elements);
    gl.uniformMatrix4fv(u.view!, false, camera.matrixWorldInverse.elements);
    const fogOn = !!fog?.fogEnabled && fog.fogFar > fog.fogNear, scale = fogOn ? -255/(fog!.fogFar-fog!.fogNear) : 0;
    const band = !!fog?.fogAltitude && fog.fogTop > fog.fogBottom;
    gl.uniform3fv(u.fogColour!, fog?.fogColor.map(v => v/255) ?? [0, 0, 0]);
    gl.uniform4f(u.fogRange!, scale, 255-(fog?.fogNear ?? 0)*scale, band ? fog!.fogBottom : -10000, band ? 1/(fog!.fogTop-fog!.fogBottom) : 0.001);
    gl.uniform1f(u.brighten!, brighten); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.bitmap!, 0); gl.uniform1i(u.sprite!, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.colorMask(true, true, true, false);
    const factor = (f: Factor) => ({ zero: gl.ZERO, one: gl.ONE, srcAlpha: gl.SRC_ALPHA, oneMinusSrcAlpha: gl.ONE_MINUS_SRC_ALPHA, dstColor: gl.DST_COLOR })[f];
    for (const blended of [false, true]) for (const batch of frame.batches) {
      const { spec, state } = batch.style;
      if (state.transparent !== blended || !batch.count) continue;
      gl.bindTexture(gl.TEXTURE_2D, this.textureFor(batch.style));
      gl.uniform1i(u.fogged!, Number(fogOn && batch.style.fogged)); gl.uniform1i(u.destinationBlend!, Number(spec.blend === 'destination'));
      gl.depthMask(state.depthWrite);
      if (batch.style.cull) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE);
      if (state.factors) { gl.enable(gl.BLEND); gl.blendFuncSeparate(factor(state.factors.src), factor(state.factors.dst), gl.ZERO, gl.ONE); }
      else gl.disable(gl.BLEND);
      gl.drawElements(gl.TRIANGLES, batch.count, gl.UNSIGNED_SHORT, batch.first * 2);
      this.stats.meshDrawCalls++; this.stats.meshTriangles += batch.count / 3;
    }
    gl.disable(gl.CULL_FACE); gl.bindVertexArray(null); this.check();
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const held of [...this.textures.values()]) held.release();
    for (const release of this.cleanup.reverse()) release(); this.cleanup.length = 0;
    this.staging = new Float32Array(0); this.stats.cpuStagingBytes = 0; this.stats.gpuBufferBytes = 0;
    this.stats.programs = 0; this.stats.buffers = 0;
  }
}
