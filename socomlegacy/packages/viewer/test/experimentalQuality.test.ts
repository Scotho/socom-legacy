import {afterEach, describe, expect, it} from 'vitest';
import {DataTexture, LinearFilter, LinearMipmapLinearFilter, NearestFilter} from 'three';
import {setWorldSamplingMaximum, WorldTextureSampling, worldSamplingNames} from '../src/experimentalWorldSampling';
import {buildWorld} from '../src/world';
import {EXPERIMENTAL_DEFAULTS, EXPERIMENTAL_GROUPS} from '../src/experimentalGraphics';
import {updateExperimentalAssets} from '../src/experimentalAssets';
import {graphicMeshes, graphicShader} from './experimentalShaderFixture';

const off = {...EXPERIMENTAL_DEFAULTS, enabled: false, textureBias: false, detailAdjust: false, characterLight: false};
afterEach(() => {updateExperimentalAssets(off);setWorldSamplingMaximum(1);});
/** GX-24: browser adaptations under H135. With the Experimental view not selected they must not change existing draws. */
describe('GX-24 opt-in contract', () => {
  it('starts the world sampling switches OFF', () => {
    expect(EXPERIMENTAL_DEFAULTS).toMatchObject({worldAnisotropy: false, worldTrilinear: false,
      worldLodBias: false, worldLodBiasValue: 0});
  });
  it("starts FXAA and the bicubic resolve filter ON inside the Experimental view (the owner's defaults, 2026-10-11, H135)", () => {
    expect(EXPERIMENTAL_DEFAULTS).toMatchObject({fxaa: true, resolveFiltering: true, resolveFilter: 'bicubic'});
    // the resolve filter's prerequisite (render scale above 1) holds at the default scale
    expect(EXPERIMENTAL_DEFAULTS.renderScale).toBeGreaterThan(1);
  });
  it('offers each renderer option as an Experimental group with an explicit OFF value', () => {
    for (const id of ['fxaa', 'resolveFiltering']) {
      const group = EXPERIMENTAL_GROUPS.find(g => g.id === id);
      expect(group, id).toBeDefined();
      expect(group?.off, id).toEqual({[id]: false});
    }
    // B206 ML-7 (ML.R14): the three world-sampling switches and the mip bias are one Texture filtering group; its OFF is all four off.
    expect(EXPERIMENTAL_GROUPS.find(g => g.id === 'textureFiltering')?.off).toEqual({textureBias: false, worldAnisotropy: false, worldTrilinear: false, worldLodBias: false});
  });
  it.each(['GLSL', 'WGSL'] as const)('changes only world base sampling and restores its exact graph: %s', backend => {
    updateExperimentalAssets(off);
    const view = graphicMeshes();
    const before = Object.fromEntries(Object.entries(view.meshes).map(([k,m]) => [k,graphicShader(m,backend)]));
    const material = view.meshes.map!.material as import('three/webgpu').MeshBasicNodeMaterial;
    const originalNode = material.colorNode, originalMap = material.map;
    try {
      updateExperimentalAssets({...off, enabled: true, worldTrilinear: true});
      expect(graphicShader(view.meshes.map!, backend)).not.toBe(before.map);
      for (const k of ['detail','bodyPlain','bodyTextured']) expect(graphicShader(view.meshes[k]!,backend)).toBe(before[k]);
      expect(material.map).toBe(originalMap);
      updateExperimentalAssets({...off, enabled: true, worldTrilinear: true, worldLodBias: true, worldLodBiasValue: -1});
      expect(graphicShader(view.meshes.map!,backend)).toMatch(backend === 'GLSL' ? /texture\(/ : /textureSampleBias/);
      updateExperimentalAssets(off);
      expect(material.colorNode).toBe(originalNode);
      for (const [k,m] of Object.entries(view.meshes)) expect(graphicShader(m,backend)).toBe(before[k]);
    } finally {view.dispose();}
  });
});
describe('GX-24 world sampler ownership', () => {
  it('uses the device max per texture and restores original sampler and image identities without OFF uploads', () => {
    setWorldSamplingMaximum(16);updateExperimentalAssets(off);
    const t=new DataTexture(new Uint8Array(16),2,2);t.minFilter=LinearMipmapLinearFilter;t.magFilter=NearestFilter;
    const image=t.image,mips=t.mipmaps,version=t.version;
    let updates=0,disposes=0;t.addEventListener('dispose',()=>disposes++);
    const owner=new WorldTextureSampling(()=>updates++);owner.add(t);
    expect(t.version).toBe(version);
    updateExperimentalAssets({...off,enabled:true,worldAnisotropy:true});
    expect(t.anisotropy).toBe(16);expect(t.magFilter).toBe(LinearFilter);expect(owner.key(t)).toBe(1);
    const activeVersion=t.version;
    updateExperimentalAssets({...off,enabled:true,worldAnisotropy:true,worldLodBias:true,worldLodBiasValue:-1});
    const biasedUpdates=updates;
    updateExperimentalAssets({...off,enabled:true,worldAnisotropy:true,worldLodBias:true,worldLodBiasValue:1});
    expect(updates).toBe(biasedUpdates);expect(t.version).toBe(activeVersion);
    updateExperimentalAssets(off);
    expect([t.minFilter,t.magFilter,t.anisotropy]).toEqual([LinearMipmapLinearFilter,NearestFilter,1]);
    expect(t.image).toBe(image);expect(t.mipmaps).toBe(mips);expect(disposes).toBe(2);
    const restoredVersion=t.version;updateExperimentalAssets(off);expect(t.version).toBe(restoredVersion);
    owner.dispose();updateExperimentalAssets({...off,enabled:true,worldTrilinear:true});expect(t.version).toBe(restoredVersion);
  });
  it('does not claim unsupported anisotropy or activate derivative bias on its own', () => {
    updateExperimentalAssets(off);setWorldSamplingMaximum(1);
    const owner=new WorldTextureSampling(()=>{}),t=new DataTexture();owner.add(t);const version=t.version;
    updateExperimentalAssets({...off,enabled:true,worldAnisotropy:true,worldLodBias:true,worldLodBiasValue:-2});
    expect(owner.key(t)).toBe(0);expect(t.anisotropy).toBe(1);expect(t.version).toBe(version);owner.dispose();
  });
  it('excludes names used by props, lines, details, reflections, weapons, grenades or bodies', () => {
    let eligible:Set<string>|undefined;
    const view=graphicMeshes(map=>{
      const names=['ground','prop','line','detail','env','weapon','grenade','skin'];
      map.world=names.map(textureName=>({...map.world[0]!,textureName}));
      map.props=[{parts:[{textureName:'prop'}]}] as typeof map.props;
      map.lines=[{textureName:'line'}] as typeof map.lines;
      map.detail={ground:{name:'detail',uv:1,range:1,bmode:'COLORBLEND'}} as typeof map.detail;
      map.envMaterials=[{texture:'env'}] as typeof map.envMaterials;
      map.weapons={w:{parts:[{textureName:'weapon'}]}} as unknown as typeof map.weapons;
      map.grenade={models:[{parts:[{textureName:'grenade'}]}]} as typeof map.grenade;
      // bodyTextureNames reads these exact loaded-body arrays.
      map.body={subMeshes:[{textureName:'skin'}],fittings:[]} as unknown as typeof map.body;
      eligible=worldSamplingNames(map);
      map.world=[map.world[0]!];map.props=[];map.lines=null;map.detail={};map.envMaterials=[];map.weapons={};map.grenade=undefined;map.body=undefined;
      return buildWorld(map);
    });
    expect([...eligible!]).toEqual(['ground']);view.dispose();
  });
  it('keeps no-mip world textures on their original shader', () => {
    updateExperimentalAssets(off);
    const view=graphicMeshes(map=>{map.textureFlags.ground!.gs!.mipmaps=false;return buildWorld(map);});
    const before=graphicShader(view.meshes.map!,'WGSL');
    updateExperimentalAssets({...off,enabled:true,worldTrilinear:true});
    expect(graphicShader(view.meshes.map!,'WGSL')).toBe(before);view.dispose();
  });
});
