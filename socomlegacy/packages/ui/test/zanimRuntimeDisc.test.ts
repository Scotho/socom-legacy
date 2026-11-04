import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets, type ZAnimArchive } from '@s2u/scene';
import { ValveStore } from '../src/valves';
import { ZAnimRuntime, zanimUnsupported, type ZAnimNode, type ZAnimNodeTree } from '../src/zanimRuntime';

/**
 * Web research 106 §4 and §6 on the disc's own scripts (PLAT-07's acceptance: "a vitest decodes all 95 UIZANIM sets plus
 * EXTZANIM's and MPZANIM's and fails on an unimplemented command id"). A dev-disc test (W6.R8): the disc tree is
 * `SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; it skips itself when the
 * archives are absent, as on CI. Counts and names only; no game bytes.
 */
// The desktop checkout (SOCOM_PC_ROOT) holds game/disc; the repository's root no longer does (the restructure).
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const ARCHIVES = ['UIZANIM.ZAR', 'EXTZANIM.ZAR', 'MPZANIM.ZAR'] as const;
const HAVE_DISC = DISC !== '' && ARCHIVES.every((a) => existsSync(join(DISC, 'RUN', a)));

const cache = new Map<string, ZAnimArchive>();
const archive = (name: string): ZAnimArchive => {
  let a = cache.get(name);
  if (!a) { a = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN', name))))); cache.set(name, a); }
  return a;
};

/** A tree that makes a node for any name. */
function anyTree(): ZAnimNodeTree & { nodes: Map<string, ZAnimNode> } {
  const nodes = new Map<string, ZAnimNode>();
  return {
    nodes,
    node(name: string): ZAnimNode {
      let n = nodes.get(name);
      if (!n) { n = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 1, active: true }; nodes.set(name, n); }
      return n;
    },
  };
}

describe.skipIf(!HAVE_DISC)('the disc\'s zAnim scripts under the runtime (research 106 §4; SOCOM_DISC)', () => {
  it.each(ARCHIVES)('%s: 95 sets, no command or condition token the runtime does not implement or model', (name) => {
    const a = archive(name);
    expect(a.sets.length).toBe(95);
    const bad = a.sets.flatMap((s) => zanimUnsupported(s).map((u) => `${s.name}/${u.anim}/${u.sequence}: ${u.set}:${u.cmd} ${u.why}`));
    expect(bad).toEqual([]);
  });

  it.each(ARCHIVES)('%s: every animation starts and runs 60 frames without a throw (a host that answers true)', (name) => {
    const a = archive(name);
    for (const set of a.sets) {
      let seed = 1;
      const random = (): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed; };   // any source: the test is that nothing throws
      const rt = new ZAnimRuntime({ sets: [set], valves: new ValveStore(), nodes: anyTree(), host: { uiCommand: () => true }, random });
      rt.activate();   // a start needs its set active (FUN_002734b0 D:L120734-120737)
      for (const anim of set.anims) rt.start(anim.name);
      for (let i = 0; i < 60; i++) rt.tick(1 / 60);
    }
  });

  it('UIanim.rdr menu_fade_up: not before the set is active, started by its activation; MENUFADER from 1 at -2/3 a second, 0 at 1.5 s (FUN_0025f880 D:L108814-108831)', () => {
    const set = archive('UIZANIM.ZAR').sets.find((s) => s.name.toLowerCase() === 'uianim.rdr');
    expect(set).toBeDefined();
    const tree = anyTree();
    const rt = new ZAnimRuntime({ sets: [set!], valves: new ValveStore(), nodes: tree, host: { uiCommand: () => true } });
    expect(rt.start('menu_fade_up')).toBeNull();   // the set is not active yet (FUN_002734b0 D:L120734-120737)
    rt.activate('UIanim.rdr');                     // its flags' activation bits are 1: the activation starts it (FUN_002713f0 D:L119328-119331)
    expect(rt.isRunning('menu_fade_up')).toBe(true);
    for (let i = 0; i < 30; i++) rt.tick(1 / 60);
    expect(tree.nodes.get('MENUFADER')?.opacity).toBeCloseTo(1 - (2 / 3) * 0.5, 4);
    for (let i = 0; i < 62; i++) rt.tick(1 / 60);
    expect(tree.nodes.get('MENUFADER')?.opacity).toBe(0);
    expect(rt.isRunning('menu_fade_up')).toBe(false);
  });
});
