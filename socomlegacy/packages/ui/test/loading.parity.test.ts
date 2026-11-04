// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRdr, parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeUiProgram, parseAnimSets, type ZAnimAnimation } from '@s2u/scene';
import { LOADING_SCRIPTS, loadingBinding, loadingFade, loadingFaderAlpha, loadingSpin, spinScale } from '../src/loading';

/**
 * TA-FRONTEND's golden pin of the loading screen's data (web research 125 §2-§3; TA.R3). `golden/loadingMaps.json`
 * holds, for each of the 22 multiplayer maps (`RUN/MP*.ZDB`), what `loadingBinding` reads from its `mission.rdr`
 * (title, picture, description, the `LoadingScreenAssets` library), the number of animations in its `LDZANIM.ZAR` set
 * `dlgLoad.rdr` and the SHA-256 of `SpinLoadingCD` and `OnMenuStart` in the runtime's shape; MP2's two animations whole
 * (command bytes as hex). The unit half decodes and plays them with no game data (CI); the disc half re-derives every
 * row and MP2's animations and compares them whole (it skips without `SOCOM_DISC` / `SOCOM_PC_ROOT`). `loading.test.ts`'s
 * disc block holds the same claims on the disc only.
 */
interface HexAnim {
  name: string; names: string[]; nodeRefs: { name: string }[]; params: { flags: number; priority: number; seqOffsets: number[]; state: number };
  sequences: { offset: number; name: string; word: number; size: number; commands: { offset: number; set: number; cmd: number; timeless: boolean; size: number; bytes: string }[] }[];
}
interface Row { map: string; title: string; picture: string; description: string; library: string; anims: number; spin: string; fade: string }
interface Pin { _source: string; maps: Row[]; mp2: { spin: HexAnim; fade: HexAnim } }
const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, 'golden/loadingMaps.json'), 'utf8')) as Pin;

const fromHex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** The pinned animation as `decodeUiProgram` reads it (name, names, node names, sequences' words and command bytes). */
const anim = (a: HexAnim): ZAnimAnimation => ({
  ...a, sequences: a.sequences.map((q) => ({ ...q, commands: q.commands.map((c) => ({ ...c, bytes: fromHex(c.bytes) })) })),
}) as unknown as ZAnimAnimation;
const sha = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');

describe('the loading screen\'s maps and scripts from their golden pin (no game data)', () => {
  it('22 multiplayer maps; each binds ld_mp<n>_prog.tif in the library LoadingScreenAssets names: OMnn on MP1-MP12, LPnn on MP51-MP83 (R125.2)', () => {
    expect(PIN.maps).toHaveLength(22);
    for (const r of PIN.maps) {
      const n = Number(r.map.slice(2, -4));
      expect(r.picture, r.map).toBe(`ld_mp${n}_prog.tif`);
      expect(r.library, r.map).toBe(`ui/assetlib/ld/${n <= 12 ? 'om' : 'lp'}${String(n).padStart(2, '0')}`);
      expect(r.title.trim().length, r.map).toBeGreaterThan(0);
      // R125.6: the description is a blank " " on 21 maps, empty on MP64.
      expect(r.description, r.map).toBe(n === 64 ? '' : ' ');
      expect(r.anims, r.map).toBe(6);
    }
  });

  it('every map carries the same SpinLoadingCD and OnMenuStart as MP2\'s (R125.3: the set lives in each map\'s LDZANIM.ZAR)', () => {
    expect(new Set(PIN.maps.map((r) => r.spin))).toEqual(new Set([sha(PIN.mp2.spin)]));
    expect(new Set(PIN.maps.map((r) => r.fade))).toEqual(new Set([sha(PIN.mp2.fade)]));
    expect([PIN.mp2.spin.name, PIN.mp2.fade.name]).toEqual([LOADING_SCRIPTS.spin, LOADING_SCRIPTS.fade]);
  });

  it('SpinLoadingCD: two 0.75 s scale motions on load_CD_Parent, (1.1, 1.1) -> (0, 1) -> (1.1, 1.1), looped: a 1.5 s turn (R125.3)', () => {
    const spin = loadingSpin(decodeUiProgram(anim(PIN.mp2.spin)))!;
    expect([spin.node, spin.loops]).toEqual(['load_CD_Parent', true]);
    expect(spin.segments.map((s) => [s.seconds, ...s.from!.slice(0, 2), ...s.to.slice(0, 2)].map((v) => Math.round(v * 1000) / 1000)))
      .toEqual([[0.75, 1.1, 1.1, 0, 1], [0.75, 0, 1, 1.1, 1.1]]);
    expect(spin.period).toBeCloseTo(1.5, 6);
  });

  it('the spin is linear at the stored rate, -1.4667 a second in x, and snaps to "to" at each end (R125.4, FUN_0025f9b0)', () => {
    const spin = loadingSpin(decodeUiProgram(anim(PIN.mp2.spin)))!;
    expect(spin.segments[0]!.rate[0]).toBeCloseTo(-1.1 / 0.75, 4);
    const at = (t: number): number[] => spinScale(spin, t).slice(0, 2).map((v) => Math.round(v * 1e4) / 1e4);
    expect(at(0)).toEqual([1.1, 1.1]);
    expect(at(0.375)).toEqual([0.55, 1.05]);
    expect(at(0.75)).toEqual([0, 1]);
    expect(at(1.5 + 0.375)).toEqual([0.55, 1.05]);
  });

  it('OnMenuStart fades MENUFADER 1 -> 0 in 1.5 s; the drawn fader is its opacity x 128, 0 at 1.5 s (research 125 §3, R112.3)', () => {
    const fade = loadingFade(decodeUiProgram(anim(PIN.mp2.fade)))!;
    expect([fade.node, fade.from, fade.to, Math.round(fade.seconds * 1000) / 1000]).toEqual(['MENUFADER', 1, 0, 1.5]);
    expect(loadingFaderAlpha(fade, 0)).toBe(128);
    expect(loadingFaderAlpha(fade, 0.75)).toBeCloseTo(64, 3);
    expect(loadingFaderAlpha(fade, 1.5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The disc half: the pin re-derived.

const DISC = process.env.SOCOM_DISC ?? (process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game', 'disc') : undefined);
const RUN = DISC ? resolve(DISC, 'RUN') : undefined;
const MAPS = RUN && existsSync(RUN) ? readdirSync(RUN).filter((f) => /^MP\d+\.ZDB$/i.test(f)).sort((a, b) => Number(a.slice(2, -4)) - Number(b.slice(2, -4))) : [];

const rtAnim = (a: ZAnimAnimation): HexAnim => ({
  name: a.name, names: a.names, nodeRefs: a.nodeRefs.map((r) => ({ name: r.name })),
  params: { flags: a.params.flags, priority: a.params.priority, seqOffsets: a.params.seqOffsets, state: a.params.state },
  sequences: a.sequences.map((q) => ({
    offset: q.offset, name: q.name, word: q.word, size: q.size,
    commands: q.commands.map((c) => ({ offset: c.offset, set: c.set, cmd: c.cmd, timeless: c.timeless, size: c.size, bytes: toHex(c.bytes) })),
  })),
});

describe.skipIf(MAPS.length === 0)('the loading screen\'s pin re-derived from the disc (SOCOM_DISC / SOCOM_PC_ROOT)', () => {
  it('every map\'s row, and MP2\'s two animations, equal the pin whole', () => {
    const rows: Row[] = [];
    let mp2: Pin['mp2'] | null = null;
    for (const file of MAPS) {
      const bytes = new Uint8Array(readFileSync(resolve(RUN!, file)));
      const zdb = parseZdb(bytes);
      const readerm = Zar.parse(zdbMember(bytes, zdb, 'READERM.ZAR'));
      const b = loadingBinding(parseRdr(readerm.data(readerm.root.children.find((k) => k.name.toLowerCase() === 'mission.rdr')!)));
      const set = parseAnimSets(Zar.parse(zdbMember(bytes, zdb, LOADING_SCRIPTS.member))).sets.find((s) => s.name === LOADING_SCRIPTS.set)!;
      const spin = rtAnim(set.anims.find((a) => a.name === LOADING_SCRIPTS.spin)!);
      const fade = rtAnim(set.anims.find((a) => a.name === LOADING_SCRIPTS.fade)!);
      rows.push({ map: file, title: b.title!, picture: b.picture!, description: b.description!, library: b.library!, anims: set.anims.length, spin: sha(spin), fade: sha(fade) });
      if (file === 'MP2.ZDB') mp2 = { spin, fade };
    }
    expect(rows).toEqual(PIN.maps);
    expect(mp2).toEqual(PIN.mp2);
  }, 120_000);
});
