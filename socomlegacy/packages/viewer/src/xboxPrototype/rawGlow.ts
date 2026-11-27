import type { PayloadBudget } from './budget';

const VERTEX = `#version 300 es
out vec2 at;
void main() { at = vec2(gl_VertexID == 1 ? 2.0 : 0.0, gl_VertexID == 2 ? 2.0 : 0.0); gl_Position = vec4(at * 2.0 - 1.0, 0.0, 1.0); }`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D frame;
uniform float gain;
in vec2 at;
out vec4 result;
void main() { result = vec4(texture(frame, at).rgb * gain, 1.0); }`;

/** The flashbang's glow (`../flashRules`; `BLUR3D`, research 85 section 9.5): each pass the frame drawn into a half-size
 * buffer, bilinear, and drawn back over the whole frame additively, `Cs x FIX / 128 + Cd`. The copy is a framebuffer
 * blit on the GPU, never a readback. Its buffer is made at the first flash, so a match without one holds nothing.
 */
export class RawGlow {
  private program: WebGLProgram | null = null;
  private target: WebGLFramebuffer | null = null;
  private texture: WebGLTexture | null = null;
  private gain: WebGLUniformLocation | null = null;
  private size: [number, number] = [0, 0];
  private readonly cleanup: (() => void)[] = [];
  readonly stats = { passes: 0, made: false };
  constructor(private readonly gl: WebGL2RenderingContext, private readonly budget: PayloadBudget) {}
  private make(width: number, height: number): void {
    const gl = this.gl, half: [number, number] = [Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2))];
    if (this.program && this.size[0] === half[0] && this.size[1] === half[1]) return;
    this.dispose();
    const shader = (kind: number, source: string) => {
      const value = gl.createShader(kind)!; gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) ?? 'Glow shader compile failed');
      return value;
    };
    const program = gl.createProgram()!, vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Glow program link failed');
    const release = this.budget.reserve(half[0] * half[1] * 4);
    const texture = gl.createTexture()!, target = gl.createFramebuffer()!;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, half[0], half[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [name, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, name!, value!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cleanup.push(() => { gl.deleteProgram(program); gl.deleteTexture(texture); gl.deleteFramebuffer(target); release(); });
    if (!complete) { this.dispose(); throw new Error('Glow buffer incomplete'); }
    this.program = program; this.texture = texture; this.target = target; this.size = half; this.gain = gl.getUniformLocation(program, 'gain');
    gl.useProgram(program); gl.uniform1i(gl.getUniformLocation(program, 'frame'), 0); this.stats.made = true;
  }
  /** `passes` passes at `fix` (the FIX byte, 0..255) over the drawn frame of `width` x `height`. */
  draw(width: number, height: number, passes: number, fix: number): void {
    this.stats.passes = 0;
    if (passes <= 0 || fix <= 0) return;
    this.make(width, height);
    const gl = this.gl;
    gl.bindVertexArray(null); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.colorMask(true, true, true, false);
    gl.activeTexture(gl.TEXTURE0);
    for (let pass = 0; pass < passes; pass++) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.target);
      gl.disable(gl.BLEND); gl.colorMask(true, true, true, true);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, this.size[0], this.size[1], gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height); gl.colorMask(true, true, true, false);
      gl.useProgram(this.program); gl.uniform1f(this.gain, fix / 128); gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, 3); this.stats.passes++;
    }
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
  }
  dispose(): void { for (const release of this.cleanup.reverse()) release(); this.cleanup.length = 0; this.program = null; this.texture = null; this.target = null; this.size = [0, 0]; }
}
