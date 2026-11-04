// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FsAssetSource } from '@s2u/archive/node';
import { BombPage, worldPulse } from '../src/bombPage';
import { loadMap, type LoadedMap } from '../src/loadMap';
import { buildWorld } from '../src/world';
import { buildPageWorld } from '../src/matchWorld';
import { simMapFromBytes } from '../src/simMap';
import type { BombWire } from '../src/net/objective';
import type { ServerEvent } from '../src/net/protocol';

/**
 * PB-9b (PARITY-2; research 284 s8 RED 3; rulings PB2.R5, PB2.R3): both pages wire the bases' pulse -- the room's `bomb`
 * event reaches the drawing's `setNodeActive` and `setNodeOpacity` with the outline's path. The front end's match builds
 * its world in `./matchWorld` (`buildPageWorld`, run here on MP72's fixture with the page's hooks recorded) and lends the
 * bomb its pulse (`worldPulse`); `/testroom` (`./main`) builds its `pageWorld` with the same hooks. The pages' own lines
 * are read off their sources: neither page has a seam that mounts without a browser.
 */

const MP72 = fixture('RUN/MP72.ZDB');
const TERR = 'worldmodel/terrorist_base/crates_weapons=crates_weapons/terrorist_pulse';
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(here, '../../../test-fixtures'));
const src = (f: string): string => readFileSync(resolve(here, '../src', f), 'utf8');

describe.skipIf(MP72 === null)(`the match's world (./matchWorld) on MP72${MP72 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('a SEAL pickup reaches setNodeActive(terrorist_pulse, true) and setNodeOpacity(terrorist_pulse, 0.2); a drop setNodeActive(.., false)', () => {
    const sim = simMapFromBytes(MP72!, 'RUN/MP72.ZDB');
    const calls: string[] = [];
    const pw = buildPageWorld({ ground: sim.ground, meta: sim.meta } as unknown as LoadedMap, {
      setNodeActive: (path, on) => { if (/_pulse$/.test(path)) calls.push(`active ${path} ${on}`); },
      setNodeOpacity: (path, f) => { calls.push(`opacity ${path} ${f.toFixed(3)}`); },
      sound: () => {}, effect: () => {}, log: () => {},
    })!;
    const listeners = new Set<(ev: ServerEvent) => void>();
    new BombPage({ on: (l) => { listeners.add(l); return () => listeners.delete(l); } }, {
      id: () => 2, team: () => 'seal', alive: () => true, feet: () => null, actions: () => [], look: () => null, serverTick: () => 0,
      teamOf: () => 'seal',
    }, { pulse: worldPulse(() => pw.world) });
    const bomb = (b: Partial<BombWire>): void => {
      const ev = { type: 'bomb', state: 1, pos: [0, 0, 0], carrier: null, planter: null, plantingTeam: null, defuser: null, detonateTick: null, pickupAfterTick: 0, ...b };
      for (const l of listeners) l(ev as ServerEvent);
    };
    calls.length = 0;                                         // the opening state's hides (applyInitial) aside
    bomb({ state: 1 });
    bomb({ state: 2, carrier: 2 });
    pw.world.step(0.5);
    bomb({ state: 1 });
    expect(calls).toEqual([`active ${TERR} true`, `opacity ${TERR} 0.200`, `opacity ${TERR} 0.125`, `active ${TERR} false`]);
  });

  it('the drawn map: each outline is a placement of its own (base_red / base_green, additive, the alpha pass), which setNodeActive and setNodeOpacity reach', async () => {
    const map = await loadMap(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    const outlines = map.props.flatMap((p) => (p.paths ?? []).filter((path) => /_pulse$/.test(path)).map((path) => ({ path, p })));
    expect(outlines.map((o) => [o.path, o.p.matrices.length / 16, o.p.parts.map((x) => [x.textureName, x.alphaPass, map.textureFlags[x.textureName!]?.gs?.blend])]))
      .toEqual([
        [TERR, 1, [['base_red.tif', true, 'additive']]],
        ['worldmodel/seal_base/crates_hospital=crates_hospital/seal_pulse', 1, [['base_green.tif', true, 'additive']]],
      ]);
    const view = buildWorld(map);
    try {
      for (const { path } of outlines) {
        expect(view.setNodeActive(path, true), path).toBe(1);
        expect(view.setNodeOpacity(path, 0.2), path).toBe(1);
        expect(view.setNodeOpacity(path, 1), path).toBe(1);
      }
    } finally {
      view.dispose();
    }
  }, 120_000);
});

describe("both pages' lines (main.ts, matchMount.ts)", () => {
  it('/testroom: its pageWorld hands a program\'s opacity to the view, and its bomb lends the world\'s pulse', () => {
    const main = src('main.ts');
    expect(main).toMatch(/opacity: \(path, f\) => \{ view\?\.setNodeOpacity\(path, f\); \}/);
    expect(main).toMatch(/pulse: worldPulse\(\(\) => pageWorld\)/);
  });
  it('the front end\'s match: its buildPageWorld hooks hand the opacity to the view, and its bomb lends the world\'s pulse', () => {
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/setNodeOpacity: \(path, f\) => \{ view\?\.setNodeOpacity\(path, f\); \}/);
    expect(mount).toMatch(/pulse: worldPulse\(\(\) => world\?\.world \?\? null\)/);
    expect(src('matchWorld.ts')).toMatch(/opacity: \(path, f\) => \{ hooks\.setNodeOpacity\?\.\(path, f\); \}/);
  });
  it('the development read basePulse() (`./hook`): declared once, and each page reads its own world\'s (`WorldState.basePulse`)', () => {
    expect(src('hook.ts')).toMatch(/basePulse\(\): \{ running: string\[\]; opacity: Record<string, number> \} \| null;/);
    expect(src('main.ts')).toMatch(/basePulse: \(\) => pageWorld\?\.basePulse\(\) \?\? null,/);
    const mount = src('matchMount.ts');
    expect(mount).toMatch(/basePulse: ViewerHook\['basePulse'\];/);
    expect(mount).toMatch(/basePulse: \(\) => world\?\.world\.basePulse\(\) \?\? null,/);
  });
});
