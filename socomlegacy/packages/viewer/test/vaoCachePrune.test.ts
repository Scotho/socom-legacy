import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WebGLBackend } from 'three/webgpu';
import { installVaoCachePrune } from '../src/vaoCachePrune';

/**
 * LATER 1225 (product track, a renderer memory fix like LATER 1168's override; no picture changed): three r186's WebGL2
 * backend caches every VAO it makes in `vaoCache`, a plain object keyed by its attributes' backend ids
 * (`WebGLBackend._getVaoKey`, `':' + id` per attribute), and never removes one -- a geometry disposed (a round's
 * scorches, a body view's parts) leaves its VAOs there, each holding the GL buffers three has just deleted (PC 3's census,
 * 2026-11-18: every new VAO stays, 53-65 WebGLBuffers kept only by the cache). The override: when three destroys an
 * attribute's GPU buffer (`destroyAttribute`, from a geometry's dispose), the cached VAOs whose key holds that attribute's
 * id are deleted and dropped first. Every render object of that geometry drops its attributes (and its cached VAO) on the
 * same dispose (`RenderObject.onGeometryDispose`), so none still binds one.
 */
const backend = (vaoCache: Record<string, object>, ids: Map<object, number>) => {
  const deleted: object[] = [];
  const destroyed: object[] = [];
  return {
    self: {
      vaoCache, gl: { deleteVertexArray: (v: object) => { deleted.push(v); } },
      get: (a: object) => ({ id: ids.get(a) }), attributeUtils: { destroyAttribute: (a: object) => { destroyed.push(a); } },
    },
    deleted, destroyed,
  };
};

describe('LATER 1225: a destroyed attribute takes its cached VAOs with it', () => {
  it('the VAOs whose key holds the attribute’s id are deleted and dropped; the others stay; three’s own destroy still runs', () => {
    installVaoCachePrune();
    const pos = {}, uv = {}, other = {};
    const ids = new Map<object, number>([[pos, 3], [uv, 12], [other, 31]]);
    const v1 = { v: 1 }, v2 = { v: 2 }, v3 = { v: 3 }, v4 = { v: 4 };
    const cache: Record<string, object> = { ':3:12': v1, ':12:3': v2, ':31:12': v3, ':33:12': v4 };
    const b = backend(cache, ids);
    (WebGLBackend.prototype as unknown as { destroyAttribute(this: unknown, a: object): void }).destroyAttribute.call(b.self, pos);
    expect(b.deleted).toEqual([v1, v2]);                              // id 3 exactly, never 33 or 31
    expect(Object.keys(cache).sort()).toEqual([':31:12', ':33:12']);
    expect(b.destroyed).toEqual([pos]);
  });

  it('installed once (a second install wraps nothing twice); an attribute three never uploaded deletes nothing', () => {
    installVaoCachePrune(); installVaoCachePrune();
    const unknown = {};
    const v1 = { v: 1 };
    const cache: Record<string, object> = { ':3:12': v1 };
    const b = backend(cache, new Map());
    (WebGLBackend.prototype as unknown as { destroyAttribute(this: unknown, a: object): void }).destroyAttribute.call(b.self, unknown);
    expect(b.deleted).toEqual([]);
    expect(b.destroyed).toEqual([unknown]);
  });

  it('pins three r186’s lines it relies on (an upgrade that changes them fails here)', () => {
    const req = createRequire(import.meta.url);
    const root = dirname(dirname(req.resolve('three')));              // as LATER 1168's pins find it
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('0.186.0');
    const src = readFileSync(join(root, 'src/renderers/webgl-fallback/WebGLBackend.js'), 'utf8');
    expect(src).toContain('this.vaoCache = {};');
    expect(src).toContain("key += ':' + attributeData.id;");
    expect(src).toMatch(/destroyAttribute\( attribute \) \{\s*this\.attributeUtils\.destroyAttribute\( attribute \);/);
    expect(src).toContain('this.vaoCache[ vaoKey ] = vaoGPU;');
    const ro = readFileSync(join(root, 'src/renderers/common/RenderObject.js'), 'utf8');
    expect(ro).toMatch(/this\.onGeometryDispose = \(\) => \{[\s\S]{0,200}this\.attributes = null;/);
    expect(ro).toContain("this.geometry.addEventListener( 'dispose', this.onGeometryDispose );");   // its review's F3
    expect(src).toMatch(/vaoGPU = this\.vaoCache\[ vaoKey \];\s*if \( vaoGPU === undefined \) \{\s*vaoGPU = this\._createVao\( attributes \);\s*this\.vaoCache\[ vaoKey \] = vaoGPU;\s*attributesData\.vaoGPU = vaoGPU;/);
    const au = readFileSync(join(root, 'src/renderers/webgl-fallback/utils/WebGLAttributeUtils.js'), 'utf8');
    expect(au).toContain('id: _id ++');                                // numeric ids: the key's tokens
  });

  it('installed by the renderer’s module, beside LATER 1168’s', () => {
    const r = readFileSync(new URL('../src/renderer.ts', import.meta.url), 'utf8');
    expect(r).toMatch(/import '\.\/vaoCachePrune';/);
  });
});
