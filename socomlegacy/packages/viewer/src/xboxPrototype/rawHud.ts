import type { Rgba } from '@s2u/gs';
import { NOT_ICONS } from '../hudAssets';
import { FONT_TEXT_01 } from '../hudFont';
import { GS_SAMPLE_OFFSET, PS2_H, WHITE, type HudQuad, type HudTri } from '../hudLayout';
import { HudState } from '../hudState';
import { ROUND_SCREEN_BITMAPS } from '../roundScreens';
import { PayloadBudget } from './budget';
import type { ReticleQuad } from './reticleFrame';

const VERTEX = `#version 300 es
layout(location=0) in vec2 position;
layout(location=1) in vec2 texcoord;
layout(location=2) in vec4 colour;
uniform vec2 frame;
out vec2 uv; out vec4 tint;
void main(){gl_Position=vec4(position.x/frame.x*2.-1.,1.-position.y/frame.y*2.,0.,1.);uv=texcoord;tint=colour;}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D bitmap;
in vec2 uv; in vec4 tint; out vec4 pixel;
void main(){pixel=clamp(texture(bitmap,uv)*tint,0.,1.);}`;
const QUAD_CORNERS = [0, 1, 2, 0, 2, 3] as const;

/** Same HUD state/layout, GS sample offset, bitmap order and colour modulation as
 * Hud. Only submission changes: one reusable interleaved buffer and one shader.
 * No node materials, scene graph, or per-bitmap geometry/program allocation.
 */
/** Draw-error queries are asked once in this many HUD passes (two a frame: about two seconds at the match's rate). */
const ERROR_CHECK_EVERY = 120;
export class RawHud extends HudState {
  readonly stats = { programs: 0, buffers: 0, textures: 0, gpuPayloadBytes: 0, drawCalls: 0, vertices: 0 };
  private readonly bitmaps = new Map<string, { texture: WebGLTexture; width: number; height: number }>();
  private readonly releases: (() => void)[] = [];
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffer: WebGLBuffer | null = null;
  private frameUniform: WebGLUniformLocation | null = null;
  private bitmapUniform: WebGLUniformLocation | null = null;
  private vertices = new Float32Array(0);
  private dimensions: Record<string, { width: number; height: number }> = {};

  constructor(private readonly gl: WebGL2RenderingContext, private readonly budget: PayloadBudget) { super(); }
  protected hasDrawables(): boolean { return this.bitmaps.size > 0; }
  sizes() { return this.dimensions; }
  protected clear(): void {
    for (const release of this.releases.splice(0).reverse()) release();
    this.bitmaps.clear(); this.dimensions = {}; this.vertices = new Float32Array(0);
    this.program = null; this.vao = null; this.buffer = null;
    this.frameUniform = null; this.bitmapUniform = null;
    Object.assign(this.stats, { programs: 0, buffers: 0, textures: 0, gpuPayloadBytes: 0, drawCalls: 0, vertices: 0 });
  }
  protected build(): void {
    this.clear(); if (!this.base) return;
    const gl = this.gl;
    try {
      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind); if (!shader) throw new Error('HUD shader allocation failed');
        this.releases.push(() => gl.deleteShader(shader)); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'HUD shader compile failed');
        return shader;
      };
      const program = gl.createProgram(); if (!program) throw new Error('HUD program allocation failed');
      this.program = program; this.releases.push(() => gl.deleteProgram(program));
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'HUD link failed');
      this.frameUniform = gl.getUniformLocation(program, 'frame'); this.bitmapUniform = gl.getUniformLocation(program, 'bitmap');
      const vao = gl.createVertexArray(), buffer = gl.createBuffer();
      if (vao) this.releases.push(() => gl.deleteVertexArray(vao));
      if (buffer) this.releases.push(() => gl.deleteBuffer(buffer));
      if (!vao || !buffer) throw new Error('HUD buffer allocation failed');
      this.vao = vao; this.buffer = buffer;
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [location, size, offset] of [[0, 2, 0], [1, 2, 8], [2, 4, 16]]) {
        gl.enableVertexAttribArray(location!); gl.vertexAttribPointer(location!, size!, gl.FLOAT, false, 32, offset!);
      }
      gl.bindVertexArray(null);
      const source = { ...this.extra, ...this.base }, names = Object.keys(source);
      // Identical ordering to Hud.build; Map iteration is the submission order.
      const order = [ROUND_SCREEN_BITMAPS.background, ROUND_SCREEN_BITMAPS.panel, 'newweapnbkrnd.tif', WHITE,
        ...names.filter(n => !NOT_ICONS.has(n)), 'firemode.tif', 'compass_lo.tif', ...names.filter(n => n.startsWith('action_')), FONT_TEXT_01.texture];
      const all: Record<string, Rgba> = { ...source, [WHITE]: { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } };
      for (const name of new Set([...order, ...names])) {
        const image = all[name]; if (!image) continue;
        const bytes = image.width * image.height * 4, release = this.budget.reserve(bytes);
        this.releases.push(release); this.stats.gpuPayloadBytes += bytes;
        const texture = gl.createTexture(); if (!texture) throw new Error('HUD texture allocation failed');
        this.releases.push(() => gl.deleteTexture(texture));
        gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.bitmaps.set(name, { texture, width: image.width, height: image.height });
        this.dimensions[name] = { width: image.width, height: image.height };
      }
      this.stats.programs = 1; this.stats.buffers = 1; this.stats.textures = this.bitmaps.size;
      this.check(true);
    } catch (error) { this.clear(); throw error; }
  }
  private unchecked = 0;
  private check(now = false): void {
    // getError is a synchronous round trip to the GPU process (about 2.6 ms a call on the console, 2026-11-19): asked at an
    // upload (`now`) and once in ERROR_CHECK_EVERY draws, never every frame. A lost context is known without the trip.
    if (this.gl.isContextLost()) throw new Error('HUD graphics failed');
    if (!now && ++this.unchecked < ERROR_CHECK_EVERY) return;
    this.unchecked = 0;
    if (this.gl.getError() !== this.gl.NO_ERROR) throw new Error('HUD graphics failed');
  }
  private capacity(need: number): void {
    if (need <= this.vertices.length) return;
    const floats = Math.max(need, this.vertices.length * 2, 48), extra = (floats - this.vertices.length) * 4;
    const release = this.budget.reserve(extra);
    this.releases.push(release); this.stats.gpuPayloadBytes += extra;
    this.vertices = new Float32Array(floats);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices.byteLength, this.gl.DYNAMIC_DRAW);
  }
  private submit(name: string, floats: number): void {
    if (!floats) return;
    const texture = this.bitmaps.get(name); if (!texture) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture.texture); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, floats));
    gl.drawArrays(gl.TRIANGLES, 0, floats / 8); this.stats.drawCalls++; this.stats.vertices += floats / 8;
  }
  private quads(name: string, quads: readonly Omit<HudQuad, 'element'>[], half: number): void {
    const bitmap = this.bitmaps.get(name); if (!bitmap || !quads.length) return;
    this.capacity(quads.length * 6 * 8);
    let offset = 0;
    for (const q of quads) {
      const c = Math.cos(q.turn), s = Math.sin(q.turn);
      const du = ((-half * c - half * s) / q.w) * (q.u1 - q.u0), dv = ((half * s - half * c) / q.h) * (q.v1 - q.v0);
      // Same triangles and clockwise y-down rotation as Hud.fill/quadGeometry.
      for (const k of QUAD_CORNERS) {
        const right = k === 1 || k === 2, bottom = k >= 2;
        const x = (right ? 0.5 : -0.5) * q.w, y = (bottom ? 0.5 : -0.5) * q.h;
        this.vertices[offset++] = q.x + x * c - y * s; this.vertices[offset++] = q.y + x * s + y * c;
        this.vertices[offset++] = ((right ? q.u1 : q.u0) + du) / bitmap.width;
        this.vertices[offset++] = ((bottom ? q.v1 : q.v0) + dv) / bitmap.height;
        this.vertices[offset++] = q.rgba[0]; this.vertices[offset++] = q.rgba[1]; this.vertices[offset++] = q.rgba[2];
        this.vertices[offset++] = right ? q.alphaRight ?? q.rgba[3] : q.rgba[3];
      }
    }
    this.submit(name, offset);
  }
  private triangles(tris: readonly HudTri[]): void {
    if (!tris.length) return;
    this.capacity(tris.length * 3 * 8);
    let offset = 0;
    for (const t of tris) for (let i = 0; i < 3; i++) {
      this.vertices[offset++] = t.p[i * 2]!; this.vertices[offset++] = t.p[i * 2 + 1]!;
      this.vertices[offset++] = 0; this.vertices[offset++] = 0;
      for (const value of t.rgba) this.vertices[offset++] = value;
    }
    this.submit(WHITE, offset);
  }
  render(width: number, height: number, dt: number, reticle: readonly ReticleQuad[] = []): void {
    const frame = this.layoutFrame({ width, height }, dt), gl = this.gl;
    this.stats.drawCalls = 0; this.stats.vertices = 0;
    // MatchMount paints the reticle before the HUD's faders/messages/overlays.
    // Reset once so counters include both passes.
    this.renderReticle(reticle, width, height);
    if (!this.program || (!frame.quads.length && !frame.tris.length)) return;
    gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.viewport(0, 0, width, height); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.colorMask(true, true, true, false); gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.uniform2f(this.frameUniform, width, height); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.bitmapUniform, 0);
    try {
      const groups = new Map<string, HudQuad[]>();
      for (const quad of frame.quads) {
        const key = `${quad.layer ?? 0}:${quad.texture}`, group = groups.get(key);
        if (group) group.push(quad); else groups.set(key, [quad]);
      }
      for (let layer = 0; layer < 2; layer++) {
        this.triangles(frame.tris.filter(t => t.layer === layer));
        for (const name of this.bitmaps.keys()) {
          const group = groups.get(`${layer}:${name}`);
          if (group) this.quads(name, group, GS_SAMPLE_OFFSET * height / PS2_H);
        }
      }
      this.check();
    } finally { gl.bindVertexArray(null); }
  }

  /** Reticle pass: native filtering (scope masks bilinear), no HUD half-texel offset. Reuses the
   * already-owned program and buffer; input order is the reticle's painter order.
   */
  renderReticle(quads: readonly ReticleQuad[], width: number, height: number): void {
    if (!this.program || !quads.length) return;
    const gl = this.gl;
    gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.viewport(0, 0, width, height); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.colorMask(true, true, true, false); gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.uniform2f(this.frameUniform, width, height); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.bitmapUniform, 0);
    try {
      for (const quad of quads) {
        const bitmap = this.bitmaps.get(quad.texture); if (!bitmap) continue;
        gl.bindTexture(gl.TEXTURE_2D, bitmap.texture);
        const filter = quad.linear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        try { this.quads(quad.texture, [quad], 0); }
        finally {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
      }
      this.check();
    } finally { gl.bindVertexArray(null); }
  }
}
