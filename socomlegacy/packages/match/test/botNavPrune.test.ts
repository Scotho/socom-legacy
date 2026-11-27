import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadKitSource, simMapFromBytes } from '../../viewer/src/sim';
import { FsAssetSource } from '@s2u/archive/node';
import { pruneUnenterable, WalkingNavigation, type NavigationData, type Point } from '../src/bots/navigation';

/**
 * WM-28 task 4 (OT.R81, the bots' graph only; the controller's ruling of 2026-11-15 on LATER 1069): the prepared graph
 * keeps a node only where a body stands AND some kept neighbour walks into it (a start or respawn slot's own node
 * excepted), and `mayReach` refuses a goal outside the start's DIRECTED reach. On MP2's segment-body graph (sha256
 * 0e3de995...) 491 nodes of the largest weak component had no incoming edge and 1421 were reached from neither spawn;
 * `mayReach` trusted the weak component, so an A* to one of them burned its whole expansion budget.
 */
describe('WM-28 task 4: the builder prunes nodes no body can walk into', () => {
  const graph = (edges: number[][]): { at: Point; edges: number[] }[] => edges.map((e, i) => ({ at: [i * 10, 0, 0], edges: e }));

  it('removes a node with no incoming edge, and to a fixpoint the nodes only it entered', () => {
    // 0 <-> 1; 2 -> 0 (nothing enters 2); 3 entered only from 2; 4 -> 3.
    const { kept } = pruneUnenterable(graph([[1], [0], [0, 3], [0], [3]]), new Set(), () => true);
    expect(kept).toEqual([0, 1]);
  });

  it('keeps an exempt node (a slot\'s own) and what it enters, and drops a node that fails the stand test', () => {
    const { kept } = pruneUnenterable(graph([[1], [0], [0, 3], [0], [0]]), new Set([2]), (i) => i !== 1);
    // 1 fails the stand test: gone; 0 is then entered only by 2 (exempt) and 3; 3 is entered by 2; 4 by nothing.
    expect(kept).toEqual([0, 2, 3]);
  });

  it('re-indexes the kept edges and drops every edge to a removed node; the same input in any node order keeps the same set', () => {
    const nodes = graph([[1, 2], [0], [0], [1]]);   // 3 -> 1, nothing enters 3
    const { kept, data } = pruneUnenterable(nodes, new Set(), () => true);
    expect(kept).toEqual([0, 1, 2]);
    expect(data.map((n) => n.edges)).toEqual([[1, 2], [0], [0]]);
    // The kept set is the greatest set in which every node stands and is entered from inside it (or is exempt): a
    // removal only lowers other nodes' in-degree, so the result cannot depend on the order the fixpoint visits nodes.
    const reversed = [...nodes].reverse().map((n) => ({ at: n.at, edges: n.edges.map((e) => nodes.length - 1 - e) }));
    expect(pruneUnenterable(reversed, new Set(), () => true).kept.map((i) => nodes.length - 1 - i).sort()).toEqual([0, 1, 2]);
  });
});

const ROOT = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const READY = !!fixture('RUN/MP2.ZDB') && !!fixture('RUN/READERC.ZAR');

describe.skipIf(!READY)(`WM-28 task 4: mayReach refuses a goal outside the start's directed reach${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it('a one-way pocket in the same weak component: refused before any A* expansion', async () => {
    const source = await loadKitSource(new FsAssetSource(ROOT));
    const map = simMapFromBytes(new Uint8Array(readFileSync(resolve(ROOT, 'RUN/MP2.ZDB'))), 'RUN/MP2.ZDB', source);
    // Three MP2 AI cell centres on the yard floor (y 100): A and B a cell apart, C 150 north. A <-> B; C -> A only --
    // one weak component, but nothing walks into C (the shape of 9367 and 8535 on 0e3de995).
    const A: Point = [805.730224609375, 100, 593.5714111328125], B: Point = [805.730224609375, 100, 603.5714111328125];
    const C: Point = [795.730224609375, 100, 743.5714111328125];
    const data: NavigationData = { version: 2, map: 'MP2', nodes: [{ at: A, edges: [1], component: 0 }, { at: B, edges: [0], component: 0 },
      { at: C, edges: [0], component: 0 }], spawnable: { start: [], respawn: [] } } as unknown as NavigationData;
    const nav = new WalkingNavigation(map, data);
    expect(nav.mayReach(2, 0), 'C walks to A').toBe(true);
    expect(nav.mayReach(0, 1)).toBe(true);
    expect(nav.mayReach(0, 2), 'nothing walks into C').toBe(false);
    // The expansions counted: attachments first (cached), then the route's own work -- an expansion is 1/16 of a unit.
    expect(nav.nearest(A)).toBe(0);
    expect(nav.nearest(C)).toBe(2);
    const before = nav.work;
    expect(nav.route(A, C)).toEqual([]);
    expect((nav.work - before) * 16, 'A* expansions spent on a goal outside the directed reach').toBe(0);
  });
});
