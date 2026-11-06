// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { applyR0004MapPatch, collisionOwners, flattenScene, parseClutter, parseSceneGraph, placeClutter, placeInstances, worldDi, type SceneNode } from '../src/index';

/**
 * LATER 707 (research 383 §5, research 318 §1.2), dev-disc: what the draw walk's `m_active` gate hides, counted on every
 * map of the disc, with r0004's patch and without it. The gate is `FUN_003389c0`'s first test (D:L236069-236074: the
 * node's `+0x5c` bit 0, before its visuals at D:L236189-236192 and its children at D:L236208-236219), the draw's twin of
 * the probe's (`FUN_002d3030` D:L175073-175074); `flattenScene` carries it down the subtree (`SceneInstance.flags`) and
 * `placeInstances` keeps only what it lets through.
 *
 * - As read (no patch): nothing. No node of any map's GEO archive has bit 0 clear (research 318 §3.1's B0 survey, re-taken
 *   here), so the gate changes no map r0004 does not touch.
 * - With r0004's patch: exactly G1's switch-offs -- MP71's `b1` (and its two barrels with it), MP72's basket, MP73's six
 *   `room_chair01` -- every visual-bearing placement under them, and nothing else.
 *
 * Skipped without `SOCOM_DISC`, a skip being said.
 */
const RUN = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC, 'RUN') : '';
const MAPS = RUN && existsSync(RUN) ? readdirSync(RUN).filter((n) => /\.ZDB$/i.test(n)).sort() : [];

interface Read { models: SceneNode[]; clutter: ReturnType<typeof parseClutter> | null }

function read(file: string, patch: boolean): Read & { stem: string } {
  const bytes = new Uint8Array(readFileSync(resolve(RUN, file)));
  const toc = parseZdb(bytes);
  const stem = file.replace(/\.ZDB$/i, '').toUpperCase();
  const geo = Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`));
  const models = parseSceneGraph(geo);
  if (patch) applyR0004MapPatch(models, stem);
  let clutter: Read['clutter'] = null;
  try { clutter = parseClutter(Zar.parse(zdbMember(bytes, toc, 'CLUTTER.ZAR'))); } catch { clutter = null; }
  return { stem, models, clutter };
}

/** Every node of every model with bit 0 clear, by model and name. */
function inactiveNodes(models: SceneNode[]): string[] {
  const out: string[] = [];
  const walk = (model: string, n: SceneNode): void => {
    if ((n.flags & 1) === 0) out.push(`${model}:${n.name}`);
    for (const c of n.children) walk(model, c);
  };
  for (const m of models) walk(m.name, m);
  return out;
}

/** The world's realised visual-bearing nodes the gate refuses (themselves or an ancestor off), by path. */
const gated = (models: SceneNode[]): string[] =>
  flattenScene(models, 'worldmodel').filter((f) => f.node.visuals > 0 && (f.flags & 1) === 0).map((f) => f.path);

describe.skipIf(MAPS.length === 0)(`LATER 707: the draw gate on every map of the disc${MAPS.length ? '' : ' (SOCOM_DISC absent: skipped)'}`, () => {
  it(`as read, hides nothing (${MAPS.length} maps): no node off, no placement or clutter part gated`, () => {
    const off: string[] = [];
    let placements = 0, clutterParts = 0;
    for (const file of MAPS) {
      const { stem, models, clutter } = read(file, false);
      for (const n of inactiveNodes(models)) off.push(`${stem} node ${n}`);
      for (const p of gated(models)) off.push(`${stem} placement ${p}`);
      placements += placeInstances(models, 'worldmodel').length;
      if (clutter) clutterParts += placeClutter(models, clutter).placed.length;
    }
    expect(off).toEqual([]);
    expect(placements).toBeGreaterThan(0);
    expect(clutterParts).toBeGreaterThan(0);
  }, 600_000);

  it('with r0004\'s patch, hides exactly G1\'s switch-offs: MP71 b1, MP72\'s basket, MP73\'s six room_chair01', () => {
    const hidden = new Map<string, string[]>();
    const wrong: string[] = [], disagree: string[] = [];
    for (const file of MAPS) {
      const { stem, models } = read(file, true);
      const g = gated(models);
      if (g.length) hidden.set(stem, g);
      // By realised instance, not by path (MP72 places several baskets at one path, r0004 hides one): `placeInstances` is
      // `flattenScene`'s visual-bearing nodes that the gate lets through, in order.
      const flat = flattenScene(models, 'worldmodel');
      const want = flat.filter((f) => f.node.visuals > 0 && (f.flags & 1) !== 0);
      const placed = placeInstances(models, 'worldmodel');
      if (placed.length !== want.length || placed.some((p, i) => p.path !== want[i]!.path || p.rowMajor.some((v, k) => v !== want[i]!.world[k]))) wrong.push(stem);
      // The page's WorldState and the draw agree on which owners are active: the world's children (the grid's atoms,
      // contiguous in the walk) holding an owner it keeps off (`switchedOff`) are those holding a gated placement.
      let atom = -1;
      const atomOf = flat.map((f) => (/^worldmodel\/[^/=]+$/.test(f.path) ? ++atom : atom));
      const owners = collisionOwners(models, 'worldmodel');
      const withDi = flat.map((f, i) => [f, i] as const).filter(([f]) => worldDi(f).length > 0);
      const offAtoms = new Set(owners.flatMap((o, k) => (o.switchedOff ? [atomOf[withDi[k]![1]]!] : [])));
      const gatedAtoms = new Set(flat.flatMap((f, i) => (f.node.visuals > 0 && (f.flags & 1) === 0 ? [atomOf[i]!] : [])));
      if ([...offAtoms].sort().join() !== [...gatedAtoms].sort().join()) disagree.push(`${stem} owners off in ${[...offAtoms]}, placements gated in ${[...gatedAtoms]}`);
      if (owners.some((o, k) => o.path !== withDi[k]![0].path)) disagree.push(`${stem} owners out of the walk's order`);
    }
    // The counts, for the report.
    console.log(`LATER 707 draw gate, patched: ${[...hidden].map(([s, g]) => `${s} ${g.length}`).join(', ')}\n${[...hidden].map(([s, g]) => g.map((p) => `  ${s} ${p}`).join('\n')).join('\n')}`);
    expect(wrong).toEqual([]);
    expect(disagree).toEqual([]);
    expect([...hidden.keys()]).toEqual(['MP71', 'MP72', 'MP73']);
    const roots = (stem: string, re: RegExp): string[] => hidden.get(stem)!.filter((p) => !re.test(p));
    // Every hidden placement lies under one of the switched-off nodes.
    expect(roots('MP71', /(^|\/)b1(\/|=|$)/)).toEqual([]);
    expect(roots('MP72', /basket/)).toEqual([]);
    expect(roots('MP73', /room_chair01/)).toEqual([]);
    // The counts as read: MP71 b1's two barrels, MP72's one basket, MP73's six chairs (one placement each: its `good`) --
    // under comm_low (1), mywc20 (4) and wall_breaker/good (1), not comm_hi's.
    expect(hidden.get('MP71')).toEqual(Array(2).fill('worldmodel/b1/barrel_green_closed=barrel_green_closed'));
    expect(hidden.get('MP72')).toEqual(['worldmodel/basket_open_up=basket_open_up']);
    const chairs = hidden.get('MP73')!.map((p) => p.replace(/\/room_chair01=room_chair01\/good$/, ''));
    expect(chairs.sort()).toEqual(['worldmodel/comm_low', ...Array(4).fill('worldmodel/mywc20'), 'worldmodel/wall_breaker/good']);
  }, 600_000);
});
