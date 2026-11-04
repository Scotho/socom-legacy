// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Zar } from '@s2u/archive';
import { parseAnimSets, type ZAnimAnimation, type ZAnimSet } from '@s2u/scene';
import { SHELL_STEP_CLAMP_SECONDS, UiClock, type Rate } from '../src/clock';
import { ValveStore } from '../src/valves';
import {
  conditionTokens, UI_SET_RT, ZAnimRuntime, ZCMD_RT, zanimImplements, zanimUnsupported,
  type ZAnimNode, type ZAnimNodeTree, type ZAnimRtAnimation, type ZAnimRtSet,
} from '../src/zanimRuntime';

/**
 * TA-FRONTEND's golden pins of the disc's zAnim UI scripts (web research 106 §2, §4-§6, 110 §6, 115 §5; TA.R3).
 * `golden/zanimInventory.json`: per archive (`RUN/UIZANIM.ZAR`, `EXTZANIM.ZAR`, `MPZANIM.ZAR`) the sets, animations and
 * priorities, every command and condition token by set:cmd with its count, the ui::UI_COMMANDs, the auto-start
 * animations (flags & 7 == 1) and the activation guards (an activation sequence), and the 14 scripted 0.5 s MENUFADER
 * fades. `golden/menuScripts.json`: `UIanim.rdr`'s `menu_fade_up` and `dlgMenu.rdr`'s `UiAttractMode`, `UiStopAttract`
 * and `PulseArrows` in the runtime's `ZAnimRtSet` shape. The unit half runs the runtime and the clock on them with no
 * game data (CI); the disc half re-derives both pins and compares them whole (it skips without `SOCOM_DISC` /
 * `SOCOM_PC_ROOT`). `zanimRuntimeDisc.test.ts` and `clock.test.ts`'s disc block hold the same claims on the disc only.
 */
interface Inventory {
  sets: number; anims: number; priorities: Record<string, number>; commands: Record<string, number>; conditions: Record<string, number>;
  uiCommands: { total: number; noNode: number }; autoStart: string[]; guards: string[];
}
interface InventoryPin { _source: string; archives: Record<string, Inventory>; menufaderFades: string[] }
interface HexCommand { offset: number; set: number; cmd: number; timeless: boolean; size: number; bytes: string }
interface HexAnim extends Omit<ZAnimRtAnimation, 'sequences'> { sequences: { offset: number; name: string; word: number; size: number; commands: HexCommand[] }[] }
interface ScriptsPin { _source: string; sets: { name: string; anims: HexAnim[] }[] }

const golden = <T>(name: string): T => JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden', name), 'utf8')) as T;
const INVENTORY = golden<InventoryPin>('zanimInventory.json');
const SCRIPTS = golden<ScriptsPin>('menuScripts.json');
const ARCHIVES = ['UIZANIM.ZAR', 'EXTZANIM.ZAR', 'MPZANIM.ZAR'] as const;

const fromHex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const hydrate = (s: ScriptsPin['sets'][number]): ZAnimRtSet => ({
  name: s.name,
  anims: s.anims.map((a) => ({ ...a, sequences: a.sequences.map((q) => ({ ...q, commands: q.commands.map((c) => ({ ...c, bytes: fromHex(c.bytes) })) })) })),
});
const set = (name: string): ZAnimRtSet => hydrate(SCRIPTS.sets.find((s) => s.name === name)!);

/** A tree that makes a node for any name, active unless named in `inactive`. */
function anyTree(inactive: readonly string[] = []): ZAnimNodeTree & { nodes: Map<string, ZAnimNode> } {
  const nodes = new Map<string, ZAnimNode>();
  return {
    nodes,
    node(name: string): ZAnimNode {
      let n = nodes.get(name);
      if (!n) { n = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 1, active: !inactive.includes(name) }; nodes.set(name, n); }
      return n;
    },
  };
}

const sum = (k: string): number => ARCHIVES.reduce((s, a) => s + (INVENTORY.archives[a]!.commands[k] ?? 0), 0);

describe('the disc\'s zAnim inventory from its golden pin (no game data)', () => {
  it('95 sets in each archive; 1,525 / 61 / 130 animations, every one at priority 3 (research 106 R106.2: one list, 1,716)', () => {
    expect(INVENTORY._source).toMatch(/^disc RUN\/UIZANIM\.ZAR/);
    expect(ARCHIVES.map((a) => [INVENTORY.archives[a]!.sets, INVENTORY.archives[a]!.anims])).toEqual([[95, 1525], [95, 61], [95, 130]]);
    for (const a of ARCHIVES) expect(INVENTORY.archives[a]!.priorities, a).toEqual({ 3: INVENTORY.archives[a]!.anims });
  });

  it('the commands and condition tokens are research 106 §4\'s by set:cmd, and the runtime implements every one', () => {
    const ids = new Set<string>();
    for (const a of ARCHIVES) for (const k of [...Object.keys(INVENTORY.archives[a]!.commands), ...Object.keys(INVENTORY.archives[a]!.conditions)]) ids.add(k);
    expect([...ids].filter((k) => { const [s, c] = k.split(':').map(Number); return !zanimImplements(s!, c!); })).toEqual([]);
    const set0 = (rec: Record<string, number>): number[] => Object.keys(rec).filter((k) => k.startsWith('0:')).map((k) => Number(k.slice(2))).sort((x, y) => x - y);
    const ui = INVENTORY.archives['UIZANIM.ZAR']!;
    // R106.8's command list but EXPRESSION (43), which §4's table counts as a token only.
    expect(set0(ui.commands)).toEqual([1, 2, 3, 4, 5, 11, 14, 15, 17, 22, 25, 30, 39, 40, 44, 45, 46, 47, 48, 50, 51, 52, 61]);
    expect([...new Set(ARCHIVES.flatMap((a) => set0(INVENTORY.archives[a]!.conditions)))].sort((x, y) => x - y)).toEqual([7, 10, 43, 61]);
    // §4's table: uses UI / EXT / MP.
    const row = (k: string, rec: 'commands' | 'conditions' = 'commands'): number[] => ARCHIVES.map((a) => INVENTORY.archives[a]![rec][k] ?? 0);
    expect(row('0:1')).toEqual([872, 0, 0]);
    expect(row('0:7', 'conditions')).toEqual([18, 0, 0]);
    expect(row('0:10', 'conditions')).toEqual([7, 0, 0]);
    expect(row('0:11')).toEqual([16, 0, 0]);
    expect(row('0:14')).toEqual([56, 6, 13]);
    expect(row('0:15')).toEqual([576, 29, 60]);
    expect(row('0:17')).toEqual([4420, 94, 159]);
    expect(row('0:22')).toEqual([1068, 0, 0]);
    expect(row('0:25')).toEqual([247, 23, 18]);
    expect(row('0:30')).toEqual([373, 14, 12]);
    expect(row('0:43', 'conditions')).toEqual([1817, 34, 62]);
    expect(row('0:45')).toEqual([1163, 15, 33]);
    expect(row('0:46')).toEqual([376, 29, 31]);
    expect(row('0:50')).toEqual([260, 33, 58]);
    expect(row('0:52')).toEqual([12, 0, 0]);
    expect(row('0:61')).toEqual([3245, 54, 61]);
    expect(ARCHIVES.reduce((s, a) => s + INVENTORY.archives[a]!.conditions['0:61']!, 0)).toBe(4732);
    expect(row(`${UI_SET_RT}:1`)).toEqual([5678, 165, 287]);
    expect(ARCHIVES.reduce((s, a) => s + (INVENTORY.archives[a]!.conditions['1:1'] ?? 0), 0)).toBe(579);
    // IF ELSEIF ELSE ENDIF in UI; an IF and its ENDIF pair in every archive.
    expect(['0:2', '0:3', '0:4', '0:5'].map((k) => ui.commands[k])).toEqual([2195, 1851, 761, 2195]);
    expect(sum('0:2')).toBe(sum('0:5'));
    expect([sum('0:39'), sum('0:40')]).toEqual([sum('0:40'), 372 + 13 + 27]);
    expect(ui.commands['0:44']).toBe(280);
    // No ui::UI_APP_COMMAND (set 1, 2) anywhere.
    expect(ARCHIVES.some((a) => '1:2' in INVENTORY.archives[a]!.commands || '1:2' in INVENTORY.archives[a]!.conditions)).toBe(false);
    // The 6,130 ui::UI_COMMANDs, 3,145 with no node (research 107 §6).
    expect(ARCHIVES.map((a) => INVENTORY.archives[a]!.uiCommands)).toEqual([{ total: 5678, noNode: 2829 }, { total: 165, noNode: 118 }, { total: 287, noNode: 198 }]);
  });

  it('17 animations start with their set\'s activation (flags & 7 == 1), menu_fade_up among them; 14 UIZANIM ones carry an activation guard', () => {
    expect(ARCHIVES.reduce((s, a) => s + INVENTORY.archives[a]!.autoStart.length, 0)).toBe(17);
    for (const a of ARCHIVES) expect(INVENTORY.archives[a]!.autoStart, a).toContain('UIanim.rdr/menu_fade_up');
    expect(INVENTORY.archives['UIZANIM.ZAR']!.guards).toHaveLength(14);
    expect([INVENTORY.archives['EXTZANIM.ZAR']!.guards, INVENTORY.archives['MPZANIM.ZAR']!.guards]).toEqual([[], []]);
    // R106.7: each guard is IF <cond> FAIL ENDIF; FAIL occurs 16 times, all in the guards.
    expect(INVENTORY.archives['UIZANIM.ZAR']!.commands['0:11']).toBe(16);
  });

  it('14 OBJECT_OPACITY_FROM_TO fade MENUFADER from 0 to 0.99 at 1.98 a second for 0.5 s; dlgMenu.rdr UiAttractMode one of them', () => {
    expect(INVENTORY.menufaderFades).toHaveLength(14);
    expect(INVENTORY.menufaderFades).toContain('dlgMenu.rdr/UiAttractMode');
  });
});

/** Runs `sets`' animation `name` on the clock (a 60 Hz display feeding now()) for `ticks` ticks; MENUFADER's opacity after each. */
function fadeOnClock(sets: readonly ZAnimRtSet[], name: string, ticks: number, rate?: Rate, inactive: readonly string[] = []): number[] {
  const tree = anyTree(inactive);
  const rt = new ZAnimRuntime({ sets, valves: new ValveStore(), nodes: tree, host: { uiCommand: () => true } });
  rt.activate();
  expect(rt.start(name)).not.toBeNull();
  const clock = new UiClock(rate ? { rate } : {});
  const seen: number[] = [];
  let frame = 0;
  clock.advance(0);
  while (clock.ticks < ticks && frame < 10 * ticks) {
    clock.advance(++frame * (1000 / 60), (_tick, dt) => {
      rt.tick(Math.min(dt, SHELL_STEP_CLAMP_SECONDS));                             // the shell's step (FUN_003654c0 A2, D:L262270-262273)
      seen.push(tree.nodes.get('MENUFADER')?.opacity ?? Number.NaN);
    });
  }
  expect(clock.ticks).toBe(ticks);
  return seen;
}
const F32_099 = Math.fround(0.99);

describe('the menu\'s scripts from their golden pin, run (no game data)', () => {
  it('UIanim.rdr menu_fade_up: not before the set is active, started by its activation; MENUFADER from 1 at -2/3 a second, 0 at 1.5 s (FUN_0025f880 D:L108814-108831)', () => {
    const ui = set('UIanim.rdr');
    expect(zanimUnsupported(ui)).toEqual([]);
    const tree = anyTree();
    const rt = new ZAnimRuntime({ sets: [ui], valves: new ValveStore(), nodes: tree, host: { uiCommand: () => true } });
    expect(rt.start('menu_fade_up')).toBeNull();
    rt.activate('UIanim.rdr');
    expect(rt.isRunning('menu_fade_up')).toBe(true);
    for (let i = 0; i < 30; i++) rt.tick(1 / 60);
    expect(tree.nodes.get('MENUFADER')?.opacity).toBeCloseTo(1 - (2 / 3) * 0.5, 4);
    for (let i = 0; i < 62; i++) rt.tick(1 / 60);
    expect(tree.nodes.get('MENUFADER')?.opacity).toBe(0);
    expect(rt.isRunning('menu_fade_up')).toBe(false);
  });

  // Its two sequences each open on IF NODE_ACTIVE POPUP OR NODE_ACTIVE SavedGames: with both hidden the second fades MENUFADER.
  const HIDDEN = ['POPUP', 'SavedGames'];

  it('dlgMenu.rdr UiAttractMode on the clock (no popup, no list; a host answering true): MENUFADER at 0.99 on tick 15 at 29.97 Hz, on tick 30 at 60 Hz', () => {
    const menu = [set('dlgMenu.rdr')];
    expect(zanimUnsupported(menu[0]!)).toEqual([]);
    const seen = fadeOnClock(menu, 'UiAttractMode', 600, undefined, HIDDEN);
    expect(seen.findIndex((o) => o === F32_099) + 1).toBe(15);
    const at60 = fadeOnClock(menu, 'UiAttractMode', 600, { num: 60, den: 1 }, HIDDEN);
    expect(at60[29]).toBeCloseTo(0.99, 5);
    expect(at60[28]).toBeLessThan(0.98);
  });

  it('dlgMenu.rdr UiAttractMode: with no popup and no list it fades out and switches to dlgAttractCinematic; with the list shown it does neither', () => {
    const run = (inactive: string[]): { calls: string[]; fader: number | undefined } => {
      const calls: string[] = [];
      const tree = anyTree(inactive);
      const rt = new ZAnimRuntime({ sets: [set('dlgMenu.rdr')], valves: new ValveStore(), nodes: tree, host: { uiCommand: (c) => { calls.push(`${c.fn} ${c.arg}`); return true; } } });
      rt.activate();
      rt.start('UiAttractMode');
      for (let i = 0; i < 60; i++) rt.tick(1 / 30);
      return { calls, fader: tree.nodes.get('MENUFADER')?.opacity };
    };
    const attract = run(HIDDEN);
    expect(attract.calls).toEqual(['SuspendMenuInput 1.75', 'FadeAllSounds NA', 'VagStreaming OFF', 'SWITCHMENU dlgAttractCinematic.rdr']);
    expect(attract.fader).toBe(F32_099);
    const list = run(['POPUP']);
    expect(list.calls.some((c) => /^(FadeAllSounds|SWITCHMENU)/.test(c))).toBe(false);
    expect(list.fader === undefined || list.fader === 1).toBe(true);
  });

  it('dlgMenu.rdr PulseArrows: two opacity motions on the arrows and a LOOP, run forever', () => {
    const menu = set('dlgMenu.rdr');
    const pulse = menu.anims.find((a) => a.name === 'PulseArrows')!;
    const cmds = pulse.sequences.flatMap((q) => q.commands.map((c) => c.cmd));
    expect(cmds.filter((c) => c === ZCMD_RT.OBJECT_OPACITY_FROM_TO)).toHaveLength(2);
    expect(cmds).toContain(ZCMD_RT.LOOP);
    const rt = new ZAnimRuntime({ sets: [menu], valves: new ValveStore(), nodes: anyTree(), host: { uiCommand: () => true } });
    rt.activate();
    rt.start('PulseArrows');
    for (let i = 0; i < 300; i++) rt.tick(1 / 30);
    expect(rt.isRunning('PulseArrows')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc half: both pins re-derived.

const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && ARCHIVES.every((a) => existsSync(join(DISC, 'RUN', a)));

const rtAnim = (a: ZAnimAnimation): HexAnim => ({
  name: a.name, names: a.names, nodeRefs: a.nodeRefs.map((r) => ({ name: r.name })),
  params: { flags: a.params.flags, priority: a.params.priority, seqOffsets: a.params.seqOffsets, state: a.params.state },
  sequences: a.sequences.map((q) => ({
    offset: q.offset, name: q.name, word: q.word, size: q.size,
    commands: q.commands.map((c) => ({ offset: c.offset, set: c.set, cmd: c.cmd, timeless: c.timeless, size: c.size, bytes: toHex(c.bytes) })),
  })),
});

describe.skipIf(!HAVE_DISC)('the zAnim pins re-derived from the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  const archives = new Map<string, ZAnimSet[]>();
  const sets = (a: string): ZAnimSet[] => {
    let s = archives.get(a);
    if (!s) { s = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(join(DISC, 'RUN', a))))).sets; archives.set(a, s); }
    return s;
  };

  it('the inventory of the three archives and the 14 MENUFADER fades equal the pin whole', () => {
    const fades: string[] = [];
    for (const name of ARCHIVES) {
      const bump = (c: Record<string, number>, k: string): void => { c[k] = (c[k] ?? 0) + 1; };
      const inv: Inventory = { sets: 0, anims: 0, priorities: {}, commands: {}, conditions: {}, uiCommands: { total: 0, noNode: 0 }, autoStart: [], guards: [] };
      inv.sets = sets(name).length;
      for (const s of sets(name)) for (const a of s.anims) {
        inv.anims++;
        bump(inv.priorities, String(a.params.priority));
        if ((a.params.flags & 7) === 1) inv.autoStart.push(`${s.name}/${a.name}`);
        if (a.params.seqOffsets[1]) inv.guards.push(`${s.name}/${a.name}`);
        for (const q of a.sequences) for (const c of q.commands) {
          bump(inv.commands, `${c.set}:${c.cmd}`);
          for (const t of conditionTokens(c)) bump(inv.conditions, `${t.set}:${t.cmd}`);
          if (c.set === 1 && c.cmd === 1) { inv.uiCommands.total++; if ((c.bytes[4]! | (c.bytes[5]! << 8)) === 0) inv.uiCommands.noNode++; }
          if (name === 'UIZANIM.ZAR' && c.set === 0 && c.cmd === ZCMD_RT.OBJECT_OPACITY_FROM_TO) {
            const v = new DataView(c.bytes.buffer, c.bytes.byteOffset, c.bytes.byteLength);
            if (a.nodeRefs[v.getUint16(4, true)]?.name === 'MENUFADER' && v.getFloat32(8, true) === 0 && v.getFloat32(0xc, true) === F32_099
              && v.getFloat32(0x10, true) === Math.fround(1.98) && v.getFloat32(0x14, true) === 0.5) fades.push(`${s.name}/${a.name}`);
          }
        }
      }
      expect(inv, name).toEqual(INVENTORY.archives[name]);
    }
    expect(fades).toEqual(INVENTORY.menufaderFades);
  }, 120_000);

  it('the pinned animations are UIZANIM\'s, field for field and byte for byte', () => {
    for (const s of SCRIPTS.sets) {
      const disc = sets('UIZANIM.ZAR').find((x) => x.name === s.name)!;
      expect(s.anims.map((a) => rtAnim(disc.anims.find((x) => x.name === a.name)!)), s.name).toEqual(s.anims);
    }
  }, 120_000);
});
