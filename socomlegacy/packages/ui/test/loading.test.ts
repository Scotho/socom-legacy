import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseRdrTyped, parseZdb, rdrGet, zdbMember, Zar, type RdrNode, type RdrTypedNode } from '@s2u/archive';
import { decodeUiProgram, parseAnimSets, type UiProgram } from '@s2u/scene';
import {
  LOAD_STATE_FADE_SECONDS, LOADING_SCRIPTS, loadingBinding, loadingFade, loadingFaderAlpha, loadingSpin, loadStateFaderAlpha, spinScale,
  type LoadingSpin,
} from '../src/loading';

/**
 * The loading screen's readers (INT-LOADING; socomlegacy/docs/research/125): which picture, title and asset library a
 * map's `mission.rdr` binds for `dlgLoad`, and the disc's spin out of the map's own `LDZANIM.ZAR` (`SpinLoadingCD`).
 * Synthetic records first, then every multiplayer map of the dev disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`;
 * skipped without one).
 */

/** A `mission.rdr` as `parseRdr` returns it (a key string, then the list of its values); the records are made up. */
const mission = (vars: [string, string][], assets?: string): RdrNode => [
  'UiVars', vars.map(([n, v]) => ['NAME', [n], 'VALUE', [v]]),
  ...(assets === undefined ? [] : ['Mission', ['LoadingScreenAssets', [assets]]]),
];

describe('loadingBinding: mission.rdr\'s loading picture, title and library', () => {
  it('reads the UiVars and the LoadingScreenAssets library, wherever it sits (a depth-first lookup), to its file stem', () => {
    const b = loadingBinding(mission([['mission_title', 'FROSTFIRE'], ['load_picture', 'ld_mp2_prog.tif'], ['mission_description', ' ']], 'ui/assetlib/ld/om02'));
    expect(b).toMatchObject({ title: 'FROSTFIRE', picture: 'ld_mp2_prog.tif', description: ' ', library: 'ui/assetlib/ld/om02', stem: 'OM02' });
    expect(loadingBinding(mission([['load_picture', 'ld_mp72_prog.tif']], 'ui/assetlib/ld/lp72')).stem).toBe('LP72');
  });

  it('leaves what the script does not bind null: no library, no stem, no picture', () => {
    expect(loadingBinding(mission([['mission_title', 'X']]))).toMatchObject({ title: 'X', picture: null, description: null, library: null, stem: null });
  });
});

/** A `SpinLoadingCD`-shaped program: two scale motions on one node, then `LOOP` (research 125 §3). */
function spinProgram(): UiProgram {
  return {
    name: 'SpinLoadingCD', nodes: ['NA', 'load_CD_Parent'],
    sequences: [{
      name: 'NA', activation: 1, ops: [
        { op: 'move', node: 'load_CD_Parent', flags: 0x300, seconds: 0.75, scale: { from: [1.1, 1.1, 0], to: [0, 1, 0], rate: [-1.1 / 0.75, -0.1 / 0.75, 0] } },
        { op: 'move', node: 'load_CD_Parent', flags: 0x300, seconds: 0.75, scale: { from: [0, 1, 0], to: [1.1, 1.1, 0], rate: [1.1 / 0.75, 0.1 / 0.75, 0] } },
        { op: 'loop', count: null },
      ],
    }],
  };
}

describe('loadingSpin / spinScale: the disc\'s scale keys, played as the engine plays them', () => {
  it('reads the node, the two segments and the loop', () => {
    const spin = loadingSpin(spinProgram());
    expect(spin).not.toBeNull();
    expect(spin!.node).toBe('load_CD_Parent');
    expect(spin!.loops).toBe(true);
    expect(spin!.segments.map((s) => s.seconds)).toEqual([0.75, 0.75]);
    expect(spin!.period).toBeCloseTo(1.5, 9);
  });

  it('moves linearly at the stored rate and snaps to "to" at each segment\'s end (FUN_0025f9b0), looping', () => {
    const spin = loadingSpin(spinProgram()) as LoadingSpin;
    const at = (t: number): number[] => spinScale(spin, t).slice(0, 2).map((v) => Math.round(v * 1e6) / 1e6);
    expect(at(0)).toEqual([1.1, 1.1]);
    expect(at(0.375)).toEqual([0.55, 1.05]);
    expect(at(0.75)).toEqual([0, 1]);
    expect(at(1.125)).toEqual([0.55, 1.05]);
    expect(at(1.5)).toEqual([1.1, 1.1]);
    expect(at(1.5 + 0.375)).toEqual([0.55, 1.05]);   // the LOOP
  });

  it('a program with no scale motion has no spin; an unlooped one holds its last "to"', () => {
    expect(loadingSpin({ name: 'x', nodes: [], sequences: [{ name: 'NA', activation: 1, ops: [{ op: 'wait', seconds: 1 }] }] })).toBeNull();
    const once = spinProgram();
    once.sequences[0]!.ops.pop();
    const spin = loadingSpin(once) as LoadingSpin;
    expect(spin.loops).toBe(false);
    expect(spinScale(spin, 9).slice(0, 2)).toEqual([1.1, 1.1]);
  });
});

/** An `OnMenuStart`-shaped program: MENUFADER 1 -> 0 in 1.5 s first, then the rest (research 125 §3). */
function fadeProgram(): UiProgram {
  return {
    name: 'OnMenuStart', nodes: ['NA', 'MENUFADER', 'RateLevel'],
    sequences: [{
      name: 'NA', activation: 1, ops: [
        { op: 'opacity', node: 'MENUFADER', from: 1, to: 0, rate: -1 / 1.5, seconds: 1.5 },
        { op: 'active', node: 'RateLevel', on: false },
      ],
    }],
  };
}

describe('loadingFade / loadingFaderAlpha: the screen\'s fade from black (LOADING_FADE_READING, review F1)', () => {
  it('reads OnMenuStart\'s MENUFADER opacity motion; a program without one has none', () => {
    expect(loadingFade(fadeProgram())).toEqual({ node: 'MENUFADER', from: 1, to: 0, rate: -1 / 1.5, seconds: 1.5 });
    expect(loadingFade(spinProgram())).toBeNull();
  });

  it('the load state\'s own ramp alone: (1 - t/0.5) x 128, clamped (FUN_001f5e70)', () => {
    expect(LOAD_STATE_FADE_SECONDS).toBe(0.5);
    expect([0, 0.25, 0.5, 2].map((t) => loadStateFaderAlpha(t))).toEqual([128, 64, 0, 0]);
    expect([0, 0.25, 0.5].map((t) => loadingFaderAlpha(null, t))).toEqual([128, 64, 0]);
  });

  it('with OnMenuStart the drawn fader is MENUFADER\'s opacity x 128 once under 127/128 (R112.3): 1.5 s, not 0.5 s', () => {
    const fade = loadingFade(fadeProgram());
    const at = (t: number): number => Math.round(loadingFaderAlpha(fade, t) * 1000) / 1000;
    expect(at(0)).toBe(128);                // opacity 1: no push, the load state's 128 stands
    expect(at(0.25)).toBeCloseTo(106.667, 2);
    expect(at(0.75)).toBe(64);
    expect(at(1.5)).toBe(0);
    expect(at(9)).toBe(0);                  // held at "to": the load state's fade-out ramp is overwritten too
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The dev disc.

const DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const RUN = DISC ? resolve(DISC, 'RUN') : undefined;
const MAPS = RUN && existsSync(RUN) ? readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/i.test(f)).sort((a, b) => Number(a.slice(2, -4)) - Number(b.slice(2, -4))) : [];

describe.skipIf(MAPS.length === 0)(`every multiplayer map's loading binding and disc spin${MAPS.length ? '' : ' (no SOCOM_DISC)'}`, () => {
  it('finds the 22 MP maps', () => { expect(MAPS.length).toBe(22); });

  it('binds ld_mp<n>_prog.tif in the library LoadingScreenAssets names: OMnn on MP1-MP12, LPnn on 51-83; a title on each', () => {
    for (const file of MAPS) {
      const n = Number(file.slice(2, -4));
      const bytes = new Uint8Array(readFileSync(resolve(RUN as string, file)));
      const readerm = Zar.parse(zdbMember(bytes, parseZdb(bytes), 'READERM.ZAR'));
      const key = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr');
      expect(key, file).toBeDefined();
      const b = loadingBinding(parseRdr(readerm.data(key!)));
      expect(b.picture, file).toBe(`ld_mp${n}_prog.tif`);
      expect(b.stem, file).toBe(`${n <= 12 ? 'OM' : 'LP'}${String(n).padStart(2, '0')}`);
      expect(b.library, file).toBe(`ui/assetlib/ld/${b.stem!.toLowerCase()}`);
      expect(b.title?.trim().length, file).toBeGreaterThan(0);
      // The description: a blank " " on 21 maps, empty on MP64 (research 125 R125.6); neither draws anything.
      expect(b.description, file).toBe(n === 64 ? '' : ' ');
    }
  });

  // LOBBY-MAPNAME (research 165 §9): `FUN_002acc10` adds each entry at its `CUIVariableSpec`'s longevity (`FUN_00386ff0`
  // D:L280328-280346: TEMPORARY unless a LONGEVITY names another) and value (a one-element VALUE list taken as its
  // element, D:L280305-280312, the node copied with its type, D:L280324). The raw node types, read with `parseRdrTyped`
  // (`parseRdr` flattens ints and floats to text): every VALUE one string node but LOAD_PROGRESS, one FLOAT node (type 2)
  // on the 12 maps that carry it; no entry names a LONGEVITY.
  it('LOBBY-MAPNAME: every map\'s UiVars entries are NAME and a one-node VALUE -- a string, LOAD_PROGRESS a float on 12 maps -- none naming a LONGEVITY', () => {
    const floats: string[] = [];
    for (const file of MAPS) {
      const bytes = new Uint8Array(readFileSync(resolve(RUN as string, file)));
      const readerm = Zar.parse(zdbMember(bytes, parseZdb(bytes), 'READERM.ZAR'));
      const key = readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr')!;
      const typed = parseRdrTyped(readerm.data(key));
      expect(typed, file).toBeTruthy();
      const flat = rdrGet(parseRdr(readerm.data(key)), 'UiVars') as RdrNode[];
      expect(flat.length, file).toBeGreaterThan(0);
      // The typed walk mirrors the flat one: the root's record, then UiVars' list of { NAME (..) VALUE (..) } records.
      const root = typed as readonly RdrTypedNode[];
      const record = (root.length === 1 && Array.isArray(root[0]) ? root[0] : root) as readonly RdrTypedNode[];
      const at = record.findIndex((n) => !Array.isArray(n) && (n as { value: unknown }).value === 'UiVars');
      const entries = record[at + 1] as readonly (readonly RdrTypedNode[])[];
      expect(entries.length, file).toBe(flat.length);
      for (const e of entries) {
        expect(e.filter((_, i) => i % 2 === 0), file).toEqual([{ type: 'string', value: 'NAME' }, { type: 'string', value: 'VALUE' }]);
        const name = ((e[1] as readonly RdrTypedNode[])[0] as { value: string }).value;
        const value = e[3] as readonly RdrTypedNode[];
        expect(value.length, `${file} ${name}`).toBe(1);
        const node = value[0] as { type: string; value: unknown };
        if (name === 'LOAD_PROGRESS') { expect(node.type, `${file} ${name}`).toBe('real'); floats.push(file); }
        else expect(node.type, `${file} ${name}`).toBe('string');
      }
    }
    expect(floats.length).toBe(12);
  });

  it('SpinLoadingCD is in each map\'s LDZANIM.ZAR set dlgLoad.rdr: two 0.75 s scale segments on load_CD_Parent, looped', () => {
    for (const file of MAPS) {
      const bytes = new Uint8Array(readFileSync(resolve(RUN as string, file)));
      const ld = parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), LOADING_SCRIPTS.member)));
      const set = ld.sets.find((s) => s.name === LOADING_SCRIPTS.set);
      expect(set, file).toBeDefined();
      const anim = set!.anims.find((a) => a.name === LOADING_SCRIPTS.spin);
      expect(anim, file).toBeDefined();
      const spin = loadingSpin(decodeUiProgram(anim!));
      expect(spin?.node, file).toBe('load_CD_Parent');
      expect(spin?.loops, file).toBe(true);
      expect(spin?.segments.map((s) => [s.seconds, ...s.from!.slice(0, 2), ...s.to.slice(0, 2)].map((v) => Math.round(v * 1000) / 1000)), file)
        .toEqual([[0.75, 1.1, 1.1, 0, 1], [0.75, 0, 1, 1.1, 1.1]]);
    }
  });

  it('OnMenuStart in the same set fades MENUFADER 1 -> 0 in 1.5 s on every map (research 125 §3)', () => {
    for (const file of MAPS) {
      const bytes = new Uint8Array(readFileSync(resolve(RUN as string, file)));
      const set = parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), LOADING_SCRIPTS.member))).sets.find((s) => s.name === LOADING_SCRIPTS.set);
      const anim = set?.anims.find((a) => a.name === LOADING_SCRIPTS.fade);
      expect(anim, file).toBeDefined();
      const fade = loadingFade(decodeUiProgram(anim!));
      expect(fade && [fade.node, fade.from, fade.to, Math.round(fade.seconds * 1000) / 1000], file).toEqual(['MENUFADER', 1, 0, 1.5]);
    }
  });

  it('the disc\'s three zAnim archives hold no SpinLoadingCD: the name lives only in the maps (research 96\'s open question)', () => {
    for (const archive of ['UIZANIM.ZAR', 'EXTZANIM.ZAR', 'MPZANIM.ZAR']) {
      const sets = parseAnimSets(Zar.parse(new Uint8Array(readFileSync(resolve(RUN as string, archive))))).sets;
      expect(sets.some((s) => s.name === LOADING_SCRIPTS.set), archive).toBe(false);
      expect(sets.some((s) => s.anims.some((a) => a.name === LOADING_SCRIPTS.spin)), archive).toBe(false);
    }
  });
});
