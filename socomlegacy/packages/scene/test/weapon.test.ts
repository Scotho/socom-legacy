import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { DEFAULT_SIDEARM, DEFAULT_WEAPON, UI_MODEL_FILES, UI_MODEL_FORM_READING, weaponLibrary, type WeaponLibrary } from '../src/index';

/**
 * The weapons (W2.4; socomlegacy/docs/research/79 §2): `COMMON/WEAP_GEO.ZED`'s `models` and `WEAP_MDL.ZED`'s chains, the
 * props' shape (research 72 §2-§3), decoded with the scale form of the position (`ITOF15 x TOP+3.w`, command
 * `0x70`, research 15 §0). Fixture-backed: skipped where `npm run extract-maps` has not been run.
 */

const opened = new Map<string, WeaponLibrary>();
function open(stem: string): WeaponLibrary {
  const known = opened.get(stem);
  if (known) return known;
  const bytes = fixture(`RUN/${stem}.ZDB`);
  if (!bytes) throw new Error(`${FIXTURES_ABSENT} (RUN/${stem}.ZDB)`);
  const toc = parseZdb(bytes);
  const lib = weaponLibrary(Zar.parse(zdbMember(bytes, toc, 'WEAP_GEO.ZED')), Zar.parse(zdbMember(bytes, toc, 'WEAP_MDL.ZED')));
  opened.set(stem, lib);
  return lib;
}

const MP2 = fixture('RUN/MP2.ZDB'), MP6 = fixture('RUN/MP6.ZDB'), MP72 = fixture('RUN/MP72.ZDB');

describe('the weapon library: WEAP_GEO + WEAP_MDL', () => {
  it.skipIf(!MP2)('holds 59 weapons on Frostfire, the M4A1 SD and the kit\'s Mark 23 among them (W2.R4)', () => {
    const names = open('MP2').names();
    expect(names).toHaveLength(59);
    expect(DEFAULT_WEAPON).toBe('m4Acarbine_sd');
    expect(DEFAULT_SIDEARM).toBe('a_mark23');
    expect(names).toContain('baretta_m9');
    expect(names).toContain(DEFAULT_WEAPON);
    expect(names).toContain(DEFAULT_SIDEARM);
  });

  for (const [stem, bytes] of [['MP2', MP2], ['MP6', MP6], ['MP72', MP72]] as const) {
    it.skipIf(!bytes)(`decodes every weapon on ${stem}, both LODs, with no diagnostic: 212 chunks, 19,961 triangles`, () => {
      const lib = open(stem);
      let chunks = 0, triangles = 0;
      const diagnostics: string[] = [];
      for (const name of lib.names()) {
        const w = lib.decode(name, 'all');
        chunks += w.chunks;
        triangles += w.triangles;
        diagnostics.push(...w.diagnostics.map((d) => `${name}: ${d}`));
      }
      expect(diagnostics).toEqual([]);
      expect(chunks).toBe(212);
      expect(triangles).toBe(19961);
    });

    it.skipIf(!bytes)(`puts every drawn vertex on ${stem} inside its node's nparams bbox: the scale form, not the bias form`, () => {
      const lib = open(stem);
      const outside: string[] = [];
      let nodes = 0;
      for (const name of lib.names()) {
        for (const part of lib.decode(name, 'all').parts) {
          nodes++;
          const b = part.bbox, slack = (a: number) => 1e-3 * Math.max(1, b[a + 3]! - b[a]!);
          for (const mesh of part.meshes) {
            for (let i = 0; i < mesh.positions.length; i += 3) {
              for (let a = 0; a < 3; a++) {
                const v = mesh.positions[i + a]!;
                if (v < b[a]! - slack(a) || v > b[a + 3]! + slack(a)) outside.push(`${name}/${part.node} axis ${a}: ${v}`);
              }
            }
          }
        }
      }
      expect(nodes).toBe(102);
      expect(outside.slice(0, 5)).toEqual([]);
    });
  }

  it.skipIf(!MP2)('draws the M4A1 SD from m4_high at the high LOD: 688 vertices, 395 triangles, two textures', () => {
    const w = open('MP2').decode(DEFAULT_WEAPON, 'high');
    expect(w.parts.map((p) => p.node)).toEqual(['m4_high']);
    expect(w.chunks).toBe(2);
    expect(w.vertices).toBe(688);
    expect(w.triangles).toBe(395);
    expect(w.textures).toEqual(['m4.tif', 'mark03.tif']);
    const all = open('MP2').decode(DEFAULT_WEAPON, 'all');
    expect(all.parts.map((p) => p.node)).toEqual(['m4_high', 'm4_low']);
    expect([all.vertices, all.triangles]).toEqual([688 + 419, 395 + 258]);
  });

  it.skipIf(!MP2)('names the M4A1 SD\'s own nodes: the muzzle, the shell port, the sight and the pickup box', () => {
    const at = Object.fromEntries(open('MP2').decode(DEFAULT_WEAPON).points.map((p) => [p.name, p.at.map((v) => Number(v.toFixed(4)) + 0)]));
    expect(at).toEqual({
      firepoint: [7.7854, 0.8338, 0], firepoint_shell: [0.9817, 0.0703, 0.0178], aimpoint: [-0.2146, 0.8338, 0], Gun_box: [0, 0, 0],
    });
  });

  it.skipIf(!MP2)('names the M9\'s: its muzzle 1.40 ahead of the grip, its sight point 5.60 behind it', () => {
    const w = open('MP2').decode('baretta_m9', 'high');
    expect(w.parts.map((p) => p.node)).toEqual(['sig226_high']);
    expect([w.vertices, w.triangles]).toEqual([133, 86]);
    const at = Object.fromEntries(w.points.map((p) => [p.name, p.at.map((v) => Number(v.toFixed(4)) + 0)]));
    expect(at.firepoint).toEqual([1.3959, 0.5831, 0]);
    expect(at.aimpoint).toEqual([-5.6041, 0.5831, 0]);
  });

  it.skipIf(!MP2)('names the Mark 23\'s (the kit\'s sidearm): its muzzle 1.47 ahead of the grip, its sight 5.53 behind', () => {
    const w = open('MP2').decode(DEFAULT_SIDEARM, 'high');
    expect(w.parts.map((p) => p.node)).toEqual(['mark23_high']);
    expect([w.vertices, w.triangles]).toEqual([129, 78]);
    expect(w.textures).toEqual(['mark03.tif', 'mark23.tif']);
    const at = Object.fromEntries(w.points.map((p) => [p.name, p.at.map((v) => Number(v.toFixed(4)) + 0)]));
    expect(at.firepoint).toEqual([1.4723, 0.5647, -0.0044]);
    expect(at.aimpoint).toEqual([-5.5277, 0.5647, -0.0044]);
  });

  it.skipIf(!MP6 || !MP72)('is the same model on MP72 and a repacked one on MP6: same triangles, fewer vertices', () => {
    const on = (stem: string) => { const w = open(stem).decode(DEFAULT_WEAPON, 'all'); return [w.vertices, w.triangles]; };
    expect(on('MP72')).toEqual([1107, 653]);
    expect(on('MP6')).toEqual([1067, 653]);
  });

  it.skipIf(!MP2)('refuses a weapon the library does not hold', () => {
    expect(() => open('MP2').decode('railgun')).toThrow(/railgun/);
  });
});

/**
 * Step 1 of W2.4 stopped here (socomlegacy/docs/research/79 §1): `CTFireWeapon_Parse` is the AI script's `FireWeapon`
 * task, not a weapon table's reader, and the owner's `READERC.ZAR` holds no weapon table. These pin the second fact:
 * none of the SOCOM 1 weapon reader's distinctive keys (reCOM `zWeapon/zwep_global.cpp:27-92`) is in the file.
 */
const READERC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/maps/RUN/READERC.ZAR');
const readerc = existsSync(READERC) ? new Uint8Array(readFileSync(READERC)) : null;

describe('READERC.ZAR holds no weapon table', () => {
  it.skipIf(!readerc)('lists 56 compiled scripts, none of them a weapon record', () => {
    const zar = Zar.parse(readerc!);
    expect(zar.keyCount).toBe(56);
    expect(zar.root.children.filter((k) => /weap|ammo|firearm/i.test(k.name))).toEqual([]);
  });

  it.skipIf(!readerc)('carries none of the weapon reader\'s keys anywhere in its bytes', () => {
    const text = new TextDecoder('latin1').decode(readerc!);
    for (const key of ['WEAPON_ZAR_VERSION', 'AMMO:NumEntries', 'ImpactDamage', 'ArmorPierce', 'ExplosionRadius']) {
      expect(text.includes(key), key).toBe(false);
    }
  });
});

/**
 * The ARMORY's 3D previews (web sprint 5, S1; socomlegacy/docs/research/95 §5.3): `RUN/UI/UI_GEO.ZED` + `UI_MDL.ZED`
 * through the same library, in the world's `'bias'` form (`UI_MODEL_FORM_READING`) -- chosen by the fit of each visual
 * node to its `nparams` bbox, which this pins: 84 of 85 nodes within 0.1 unit read as `'bias'`, none read as `'scale'`.
 */
const UI_GEO = fixture(UI_MODEL_FILES.geo), UI_MDL = fixture(UI_MODEL_FILES.mdl);

describe.skipIf(!UI_GEO || !UI_MDL)(`the UI models: UI_GEO + UI_MDL${!UI_GEO || !UI_MDL ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const lib = (form = UI_MODEL_FORM_READING): WeaponLibrary => weaponLibrary(Zar.parse(UI_GEO!), Zar.parse(UI_MDL!), form);
  /** Each visual node's decoded extent against its bbox: the largest gap on any axis. */
  const misfits = (l: WeaponLibrary): { nodes: number; off: string[] } => {
    const off: string[] = [];
    let nodes = 0;
    for (const name of l.names()) {
      for (const part of l.decode(name, 'all').parts) {
        nodes++;
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const m of part.meshes) for (let i = 0; i < m.positions.length; i += 3) for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a]!, m.positions[i + a]!); hi[a] = Math.max(hi[a]!, m.positions[i + a]!);
        }
        let gap = 0;
        for (let a = 0; a < 3; a++) gap = Math.max(gap, Math.abs(lo[a]! - part.bbox[a]!), Math.abs(hi[a]! - part.bbox[a + 3]!));
        if (gap > 0.1) off.push(`${name}/${part.node}`);
      }
    }
    return { nodes, off };
  };

  it('decodes all 64 models with no diagnostic: 133 chunks, 25,873 vertices, 17,148 triangles, 67 textures', () => {
    const l = lib();
    expect(l.names()).toHaveLength(64);
    let chunks = 0, vertices = 0, triangles = 0;
    const diagnostics: string[] = [], textures = new Set<string>();
    for (const name of l.names()) {
      const w = l.decode(name, 'all');
      chunks += w.chunks; vertices += w.vertices; triangles += w.triangles;
      diagnostics.push(...w.diagnostics);
      w.textures.forEach((t) => textures.add(t));
    }
    expect(diagnostics).toEqual([]);
    expect([chunks, vertices, triangles, textures.size]).toEqual([133, 25873, 17148, 67]);
  });

  it("fits every visual node to its bbox read as 'bias' but RPG7UI's group node g15, and none read as 'scale'", () => {
    expect(UI_MODEL_FORM_READING).toBe('bias');
    expect(misfits(lib('bias'))).toEqual({ nodes: 85, off: ['RPG7UI/g15'] });
    expect(misfits(lib('scale')).off).toHaveLength(85);
  });

  it("draws the M16A2 preview from m16_high_1 (422 vertices, 274 triangles) and keeps the 552's named points", () => {
    const m16 = lib().decode('m16a2UI', 'high');
    expect([m16.parts.map((p) => p.node), m16.vertices, m16.triangles, m16.textures]).toEqual([['m16_high_1'], 422, 274, ['m16.tif', 'mark03.tif']]);
    expect(lib().decode('sig_commandoUI', 'high').points.map((p) => p.name)).toEqual(['firepoint', 'firepoint_shell', 'aimpoint', 'Gun_box']);
  });
});
