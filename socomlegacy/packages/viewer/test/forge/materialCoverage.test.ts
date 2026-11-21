import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { materialTable } from '@s2u/scene';
import { coverageWords, MATERIAL_COVERAGE } from '../../src/forge/materialCoverage';
import { materialLabel } from '../../src/forge/hull';

/**
 * The Material lists' labels (the owner, 2026-11-20: "for each one that is broken or doesn't have sound or hit effects,
 * label it"): what each material lacks on the disc (`../../src/forge/materialCoverage`), held to the disc below.
 */
describe('the materials\' labels', () => {
  it('every material of the table has a row', () => {
    expect(materialTable().map((m) => m.name).filter((n) => !MATERIAL_COVERAGE[n])).toEqual([]);
  });
  it('says what is missing, broken first', () => {
    expect(coverageWords('BROKEN GLASS')).toBe('broken: its footstep sounds are not on the disc; no bullet hits');
    expect(coverageWords('GLASS')).toBe('no footsteps');
    expect(coverageWords('MUD')).toBe('no bullet mark');
    expect(coverageWords('METAL_GRATE')).toBe('no bullet hits');
    expect(coverageWords('STONE')).toBe('');
  });
  it('a list entry: the name, then what it lacks; material 0 by the map\'s default', () => {
    const i = materialTable().findIndex((m) => m.name === 'BROKEN GLASS');
    expect(materialLabel(i)).toBe('BROKEN GLASS · broken: its footstep sounds are not on the disc; no bullet hits');
    expect(materialLabel(materialTable().findIndex((m) => m.name === 'STONE'))).toBe('STONE');
    expect(materialLabel(0, 'GLASS')).toBe('Map default (GLASS) · no footsteps');
    expect(materialLabel(0, 'SAND')).toBe('Map default (SAND)');
  });
});

const ISO = process.env['SOCOM_ISO'];
describe.skipIf(!ISO || !existsSync(ISO))('the labels against the disc (SOCOM_ISO)', () => {
  it('each material\'s steps, hit effect, hit sound and mark as the disc has them', async () => {
    const { IsoAssetSource, readZarMembers, parseRdr, Zar } = await import('@s2u/archive');
    const { fsBlob } = await import('../../../../tools/fmv-spike');
    const { parseBankFile } = await import('@s2u/sound');
    const { parseSoils } = await import('@s2u/sound');
    const { effectProgramsFromDisc, effectsFromDisc } = await import('../../src/effectData');
    const { soundFromDisc } = await import('../../src/soundData');
    const src = new IsoAssetSource(fsBlob(ISO!));
    // Every bank's names.
    const zar = Zar.parse(await src.read('RUN/SOUNDS/BNKSTORE.ZAR'));
    const walk = (k: { name: string; children?: unknown[] }): { name: string }[] => (k.children?.length ? (k.children as typeof k[]).flatMap(walk) : [k]);
    const held = new Set<string>();
    for (const k of walk(zar.root as never)) {
      if (!/\.bnk$/i.test(k.name)) continue;
      try { for (const n of parseBankFile(zar.data(k as never)).names.keys()) held.add(n.trim()); } catch { /* not a bank */ }
    }
    const mats = parseSoils(parseRdr((await readZarMembers(src, 'RUN/READERC.ZAR', ['materials.rdr'])).get('materials.rdr')!));
    const { all } = await effectProgramsFromDisc(src, 'RUN/MP6.ZDB');
    const effects = new Set(all.map((p) => p.name.toLowerCase()));
    const marks = new Set((await effectsFromDisc(src, 'RUN/MP6.ZDB', 'MP6')).marks.map((r) => r.material.toUpperCase()));
    const sounds = new Set((await soundFromDisc(src, 'RUN/MP6.ZDB', 'MP6')).callbacks.map(([cb]) => cb.toLowerCase()));
    for (const m of mats) {
      const names = [m.step, m.stealthStep, m.crawl, m.land].filter((n): n is string => !!n);
      const steps = names.length === 0 ? 'none' : names.every((n) => held.has(n.trim())) ? 'yes' : 'missing';
      const k = `bullet_hit_${m.name.toLowerCase()}`;
      expect({ steps, hitEffect: effects.has(k), hitSound: sounds.has(k), mark: marks.has(m.name.toUpperCase()) }, m.name).toEqual(MATERIAL_COVERAGE[m.name]);
    }
  }, 300_000);
});
