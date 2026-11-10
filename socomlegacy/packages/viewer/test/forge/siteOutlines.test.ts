import { describe, expect, it } from 'vitest';
import type { LoadedMap } from '../../src/loadMap';
import type { BombSite } from '../../src/forge/layout';
import { SITE_OUTLINE_LIFT_ADAPTATION, withSiteOutlines } from '../../src/forge/siteOutlines';
import { SITE_PULSE_CYCLE, sitePulseOpacity, worldPulse } from '../../src/bombPage';
import type { WorldState } from '../../src/worldState';

// A browser adaptation's contract (FG.R2; `withSiteOutlines`' doc): a map with outlines of its own keeps each copy on
// the node's path, so its own `pulse_*` programs light it, and lists nothing in `forgeSiteOutlines`; only a donor's
// copies take a `forge/outline_<i>/<node>` path of their own.
const IDENTITY = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const band = (path: string): LoadedMap['props'][number] => ({
  modelName: 'band', matrices: IDENTITY, order: 0, alternate: false, facade: 0, lod: null, paths: [path],
  parts: [{ positions: Float32Array.from([-2, 0, -1, 2, 0, -1, 2, 0, 1, -2, 0, 1]), textureName: null }],
} as unknown as LoadedMap['props'][number]);
const mapOf = (archive: string, props: LoadedMap['props']): LoadedMap =>
  ({ archive, props, textures: {}, textureFlags: {} } as unknown as LoadedMap);
const site: BombSite = { team: 1, at: [10, 0, 20], yaw: 0, range: 4, elevation: -1 };

describe('withSiteOutlines', () => {
  it("keeps a map's own outline node path on its copies and drives none itself", () => {
    const own = mapOf('MP72', [band('world/base/seal_pulse')]);
    const out = withSiteOutlines(own, [site]);
    expect(out.props).toHaveLength(1);
    expect(out.props[0]!.paths).toEqual(['world/base/seal_pulse']);
    expect(out.forgeSiteOutlines).toBeUndefined();
  });

  it("gives a donor's copies a path of their own, listed for the page to light", () => {
    const blank = mapOf('MP01', []);
    const donor = mapOf('MP72', [band('world/base/seal_pulse')]);
    const out = withSiteOutlines(blank, [site], donor);
    expect(out.props[0]!.paths).toEqual(['forge/outline_0/seal_pulse']);
    expect(out.forgeSiteOutlines).toEqual([{ path: 'forge/outline_0/seal_pulse', side: 'terrorist' }]);
  });
});

describe('the outlines pulse and feed the match map (siteOutlines, bombPage)', () => {
  it('a map with no placed sites, or no outline anywhere, is returned itself', () => {
    const own = mapOf('MP72', [band('world/base/seal_pulse')]);
    expect(withSiteOutlines(own, [])).toBe(own);
    const bare = mapOf('MP01', []);
    expect(withSiteOutlines(bare, [site])).toBe(bare);
    expect(withSiteOutlines(bare, [site], mapOf('MP72', []))).toBe(bare);
  });

  it("takes the tents' outlines out and lifts each copy SITE_OUTLINE_LIFT_ADAPTATION over its site, fitted to its range", () => {
    const own = mapOf('MP72', [band('world/base/seal_pulse'), band('world/base/terrorist_pulse')]);
    const out = withSiteOutlines(own, [site, { ...site, team: 0, at: [-5, 2, 0] }]);
    expect(out.props.map((p) => p.paths)).toEqual([['world/base/seal_pulse'], ['world/base/terrorist_pulse']]);
    const m = out.props[0]!.matrices;
    // The band's half-width is 2; the range 4 scales it twice; its centre on the site, 1 u up.
    expect(m[0]).toBeCloseTo(2, 6);
    expect([m[12], m[13], m[14]]).toEqual([10, 0 + SITE_OUTLINE_LIFT_ADAPTATION, 20]);
    expect(out.props[1]!.matrices[13]).toBeCloseTo(2 + SITE_OUTLINE_LIFT_ADAPTATION, 6);
  });

  it("a donor outline's pulse runs SITE_PULSE_CYCLE (research 284 s3) on the carrier's side's paths, put out at the drop", () => {
    expect(SITE_PULSE_CYCLE).toEqual({ high: 0.2, low: 0.05, fadeS: 1.0, riseS: 0.2 });
    expect(sitePulseOpacity(0)).toBeCloseTo(0.2, 9);
    expect(sitePulseOpacity(0.5)).toBeCloseTo(0.125, 9);
    expect(sitePulseOpacity(1.0)).toBeCloseTo(0.05, 9);
    expect(sitePulseOpacity(1.1)).toBeCloseTo(0.125, 9);
    expect(sitePulseOpacity(1.2)).toBeCloseTo(0.2, 9);
    const calls: string[] = [];
    const world = {
      program: () => null, runDisplay: () => undefined, stopProgram: () => undefined,
      displayNode: (path: string, on: boolean) => calls.push(`${path} ${on ? 'on' : 'off'}`),
      displayOpacity: (path: string, f: number) => calls.push(`${path} ${f}`),
    } as unknown as WorldState;
    const blank = withSiteOutlines(mapOf('MP01', []), [site, { ...site, team: 0 }], mapOf('MP72', [band('a/seal_pulse'), band('a/terrorist_pulse')]));
    const pulse = worldPulse(() => world, () => blank.forgeSiteOutlines ?? []);
    pulse.pickup('terrorist');
    expect(calls).toEqual(['forge/outline_0/seal_pulse on', 'forge/outline_0/seal_pulse 0.2']);
    calls.length = 0;
    pulse.drop();
    expect(calls).toEqual(['forge/outline_0/seal_pulse 1', 'forge/outline_0/seal_pulse off']);
  });
});
