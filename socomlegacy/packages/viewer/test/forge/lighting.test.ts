import { describe, expect, it, vi } from 'vitest';
import { AdditiveBlending, CustomBlending, Group, Mesh, OneFactor, OneMinusSrcAlphaFactor, Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { createForgeLighting, forgeLightingOptions, lightingFog, liftForgeFog } from '../../src/forge/lighting';
import { extendFog, fogUniforms } from '../../src/fog';
import { DEFAULT_LIGHTING } from '../../src/lighting';
import type { LoadedMap } from '../../src/loadMap';

describe('Forge lighting output adaptation', () => {
  const options = { timeOfDay: 0.8, baseline: 0.06 };
  const mesh = (m = new MeshBasicNodeMaterial()) => new Mesh(undefined, m);
  it('Original is an exact material identity, and disposal restores own/inherited methods without disposing materials', () => {
    const m = new MeshBasicNodeMaterial(), group = new Group(); group.add(mesh(m));
    const before = Object.getOwnPropertyDescriptors(m), dispose = vi.spyOn(m, 'dispose');
    const h = createForgeLighting();
    h.update([group], null);
    expect(m.setupOutput).toBe(before['setupOutput']?.value ?? MeshBasicNodeMaterial.prototype.setupOutput);
    expect(Object.hasOwn(m, 'setupOutput')).toBe(false);
    h.update([group], options);
    expect(Object.hasOwn(m, 'setupOutput')).toBe(true);
    h.update([group], null);
    expect(Object.hasOwn(m, 'setupOutput')).toBe(false);
    expect(Object.hasOwn(m, 'customProgramCacheKey')).toBe(false);
    const original = m.setupOutput, key = m.customProgramCacheKey;
    h.update([group], options); h.dispose();
    expect(m.setupOutput).toBe(original); expect(m.customProgramCacheKey).toBe(key);
    expect(dispose).not.toHaveBeenCalled();
  });
  it('grades output before native fog/premultiplication, preserving alpha and the original color graph across LOD copies', () => {
    const m = new MeshBasicNodeMaterial(); m.colorNode = vec4(0.1, 0.2, 0.3, 0.4);
    const graph = m.colorNode, native = vi.fn((_b, out) => out); m.setupOutput = native;
    const key = () => 'owned'; m.customProgramCacheKey = key;
    const h = createForgeLighting(); const group = new Group(); group.add(mesh(m), mesh(m));
    h.update([group], options);
    const wrapper = m.setupOutput, cache = m.customProgramCacheKey();
    h.update([group], { ...options, timeOfDay: 0 });
    expect(m.setupOutput).toBe(wrapper); expect(m.customProgramCacheKey()).toBe(cache);
    expect(m.colorNode).toBe(graph);
    const twin = new MeshBasicNodeMaterial(); twin.colorNode = m.colorNode; group.add(mesh(twin));
    h.update([group], options);
    expect(twin.colorNode).toBe(graph); expect(twin.setupOutput).not.toBe(MeshBasicNodeMaterial.prototype.setupOutput);
    const output = vec4(0.2, 0.3, 0.4, 0.25);
    m.setupOutput({} as never, output);
    const graded = native.mock.calls[0]![1];
    expect(graded).not.toBe(output);
    // vec4 builds a join with RGB and the unchanged alpha channel of the input.
    expect(graded.node.nodes[1].node).toBe(output);
    expect(graded.node.nodes[1].components).toBe('w');
    h.dispose(); expect(m.setupOutput).toBe(native); expect(m.customProgramCacheKey).toBe(key);
  });
  it('covers late bodies/held objects in the scene, excluding additive, destination and shadow carriers', () => {
    const scene = new Scene(), h = createForgeLighting(); h.update([scene], options);
    const body = mesh(), held = mesh(), shadow = mesh(), additive = mesh(), destination = mesh();
    shadow.name = 'drop-shadow'; additive.material.blending = AdditiveBlending;
    destination.material.blending = CustomBlending; destination.material.blendDst = OneFactor;
    scene.add(body, held, shadow, additive, destination); h.update([scene], options);
    for (const o of [body, held]) expect(Object.hasOwn(o.material, 'setupOutput')).toBe(true);
    for (const o of [shadow, additive, destination]) expect(Object.hasOwn(o.material, 'setupOutput')).toBe(false);
    h.dispose();
  });
  it('only replaces atmosphere colour, preserving authored distance/altitude before scope/lens composition', () => {
    const fog = { enabled: true, near: 600, far: 3000, color: [120, 100, 80] as [number, number, number], altitude: { top: 20, bottom: 0 } };
    expect(lightingFog(fog, null)).toBe(fog);
    const result = lightingFog(fog, 0);
    expect(result).toMatchObject({ near: 600, far: 3000, altitude: fog.altitude });
    expect(result.color).toEqual([0.012 * 255, 0.019 * 255, 0.035 * 255]);
    expect(fog.color).toEqual([120, 100, 80]);
  });
  it('releases a previously graded material if a view toggle changes its blend or shadow role', () => {
    const group = new Group(), m = new MeshBasicNodeMaterial(), h = createForgeLighting(); group.add(mesh(m));
    const original = m.setupOutput;
    h.update([group], options); expect(m.setupOutput).not.toBe(original);
    m.blending = AdditiveBlending; h.update([group], options); expect(m.setupOutput).toBe(original);
    m.blending = CustomBlending; m.blendDst = OneFactor; h.update([group], options); expect(m.setupOutput).toBe(original);
    m.blendDst = OneMinusSrcAlphaFactor; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
    h.update([group], options); expect(m.setupOutput).toBe(original);
    h.dispose();
  });
  it('keeps the base-world baseline fixed across cameras, props and composed match content; Original never calibrates', () => {
    const base = { world: [], props: [], textures: {} } as unknown as LoadedMap;
    expect(forgeLightingOptions({ timeOfDay: null }, {} as LoadedMap)).toBeNull();
    const editor = forgeLightingOptions({ timeOfDay: 0 }, base);
    base.world.push({} as never); // cached base calibration must not follow later scene changes
    expect(forgeLightingOptions({ timeOfDay: 0 }, base)).toEqual(editor);
    expect(forgeLightingOptions({ timeOfDay: 0 }, null)).toEqual(editor);
  });
  it('retains the fog lens and scope extension through render-helper updates', () => {
    const scene = new Scene(), h = createForgeLighting(), clear = vi.fn();
    const fog = { enabled: true, near: 200, far: 1000, color: [120, 100, 80] as [number, number, number], altitude: null };
    liftForgeFog(scene, fog, DEFAULT_LIGHTING, [0.5, 1, 0.25], clear, 0);
    expect(clear).toHaveBeenLastCalledWith([0.012 * 255 * 0.5, 0.019 * 255, 0.035 * 255 * 0.25]);
    extendFog(scene, 500);
    const scale = fogUniforms(scene)!.scale.value;
    h.update([scene], options); h.update([scene], options);
    expect(fogUniforms(scene)!.scale.value).toBe(scale);
    expect(scale).toBeCloseTo(-255 / (1500 - 200));
    liftForgeFog(scene, { ...fog, enabled: false }, DEFAULT_LIGHTING, [0.5, 1, 0.25], clear, 0);
    expect(clear).toHaveBeenLastCalledWith([0.012 * 255 * 0.5, 0.019 * 255, 0.035 * 255 * 0.25]);
    h.dispose();
  });
});
