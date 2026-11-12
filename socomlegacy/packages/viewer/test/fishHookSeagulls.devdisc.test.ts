// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, flattenScene, parseAnimSets, parseSceneGraph, type EffectProgram, type SceneNode } from '@s2u/scene';
import type { RenderedSound } from '@s2u/sound';
import { GameAudio, type AudioOut } from '../src/audio';
import { readMapMeta } from '../src/mapMeta';
import { loadSimMap } from '../src/simMap';
import { soundFromDisc } from '../src/soundData';
import { WorldState } from '../src/worldState';

/**
 * The owner's v0.4.18 report: "fishook has a seagull problem they are painfully loud and continue all match". Fish
 * Hook's (`RUN/MP71.ZDB`) mission set `mission` starts four `seagull_squak1..4` (flags 0x21), each a `WHILE` for ever
 * of a random `WAIT` (flags 0x29: 4 s plus 9 x U[0,1), `FUN_0025ed50` D:L108436-108447) and a call of its `squak`
 * sequence: `SOUND .SEABIRD_SQUAK` (flags 0x182) at its node `seagullN`. The doggies, chimes and waves beside them
 * (`doggy_ruff1..3`, `chimes_ring1..3`, `ocean_waves1..2`) start a `~` loop each at their node: the audio's emitters.
 * MP71 is not a committed fixture: this file reads `SOCOM_DISC` (or `SOCOM_PC_ROOT`'s `game/disc`) and SKIPS without
 * it -- a skip is said, never a pass.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP71.ZDB')));
const SKIP = DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP71.ZDB absent -- skipped (MP71 is no fixture)';

const bytes = (): Uint8Array => new Uint8Array(readFileSync(join(DISC!, 'RUN/MP71.ZDB')));

function programs(): Map<string, EffectProgram> {
  const b = bytes();
  const out = new Map<string, EffectProgram>();
  for (const s of parseAnimSets(Zar.parse(zdbMember(b, parseZdb(b), 'MZANIM.ZAR'))).sets) for (const a of s.anims) out.set(a.name, decodeEffectProgram(a));
  return out;
}

type Heard = { t: number; name: string; path: string | null; at: [number, number, number] | null };
/** The page's world on MP71 (`./matchWorld`'s lines), its autostarts run for `seconds` at 60 Hz, every SOUND heard. */
/** A placement's world origin off its `flattenScene` matrix (row-major: the translation at 12..14). */
function origin(node: string): [number, number, number] {
  const b = bytes();
  const flat = flattenScene(parseSceneGraph(Zar.parse(zdbMember(b, parseZdb(b), 'MP71_GEO.ZED'))) as SceneNode[], 'worldmodel');
  const w = flat.find((f) => f.path === `worldmodel/${node}`)!.world;
  return [w[12]!, w[13]!, w[14]!];
}

async function run(seconds: number): Promise<Heard[]> {
  const sim = await loadSimMap(new FsAssetSource(DISC!), 'RUN/MP71.ZDB');
  const b = bytes(), toc = parseZdb(b);
  const meta = readMapMeta(b, toc, 'MP71', parseSceneGraph(Zar.parse(zdbMember(b, toc, 'MP71_GEO.ZED'))));
  const heard: Heard[] = [];
  let t = 0;
  const world = new WorldState(meta, sim.ground, sim.grid, {
    sound: (name, path, _volume, at?: [number, number, number] | null) => { heard.push({ t, name, path, at: at ?? null }); },
  });
  world.runAutostartPrograms = true;
  world.autostartRandom = () => 0.5;
  world.applyInitial();
  for (let i = 0; i < seconds * 60; i++) { world.step(1 / 60); t = (i + 1) / 60; }
  return heard;
}

describe.skipIf(!DISC)(`Fish Hook's gulls and loops${SKIP}`, () => {
  it('the gulls: four autostarts, each a random WAIT of 4 s plus 9 and a SOUND .SEABIRD_SQUAK (flags 0x182) at its seagullN', () => {
    const all = programs();
    for (const n of [1, 2, 3, 4]) {
      const p = all.get(`seagull_squak${n}`)!;
      expect(p.flags).toBe(0x21);
      expect(p.nodes).toEqual(['NA', `seagull${n}`]);
      expect(p.sequences.map((s) => [s.name, s.activation])).toEqual([['squak', 2], ['NA', 1]]);
      expect(p.sequences[0]!.ops).toEqual([{ op: 'sound', sound: '.SEABIRD_SQUAK', node: 1, volume: 1, flags: 0x182, newPlay: true }]);
      expect(p.sequences[1]!.ops).toEqual([
        { op: 'while', forever: true }, { op: 'wait', seconds: 4, range: 9, frames: null }, { op: 'callSequence', sequence: 'squak' }, { op: 'endWhile' },
      ]);
    }
  });

  it("the world's autostarts play no `~` loop -- the dogs, chimes and waves are the audio's eight emitters, each at its node", async () => {
    const heard = await run(60);
    expect(heard.filter((h) => h.name.startsWith('~'))).toEqual([]);
    const data = await soundFromDisc(new FsAssetSource(DISC!), 'RUN/MP71.ZDB', 'MP71');
    const loops = (data.emitters ?? []).map((e) => [e.anim, e.sound, e.node]).sort();
    expect(loops).toEqual([
      ['chimes_ring1', '~WIND_CHIMES', 'chime1'], ['chimes_ring2', '~WIND_CHIMES', 'chime2'], ['chimes_ring3', '~WIND_CHIMES', 'chime3'],
      ['doggy_ruff1', '~DIST_DOGS', 'dog1'], ['doggy_ruff2', '~DIST_DOGS', 'dog2'], ['doggy_ruff3', '~DIST_DOGS', 'dog3'],
      ['ocean_waves1', '~WATER_LAPPING', 'ocean1'], ['ocean_waves2', '~WATER_LAPPING', 'ocean2'],
    ]);
  });

  it("each squawk reaches the sound hook placed at its gull's world origin -- seagull2 at (2004.334, 50.6, 1733) -- every 4 + 9 x U s", async () => {
    const heard = (await run(30)).filter((h) => h.name === '.SEABIRD_SQUAK');
    expect(origin('seagull2').map((v) => +v.toFixed(3))).toEqual([2004.334, 50.6, 1733]);
    for (const n of [1, 2, 3, 4]) {
      const mine = heard.filter((h) => h.path === `worldmodel/seagull${n}`);
      // U = 0.5 (`autostartRandom`): 8.5 s, then 8.5 s after each -- three in 30 s; within a few 60 Hz ticks of the wait.
      expect(mine.map((h) => h.t)).toHaveLength(3);
      mine.forEach((h, k) => expect(Math.abs(h.t - 8.5 * (k + 1))).toBeLessThanOrEqual(0.1));
      for (const h of mine) h.at!.forEach((v, k) => expect(v).toBeCloseTo(origin(`seagull${n}`)[k]!, 3));
    }
  });

  it("the audio plays a placed squawk over .SEABIRD_SQUAK's RANGE [20, 600]: full by its gull, half at 310 u, none by chime2", async () => {
    const data = await soundFromDisc(new FsAssetSource(DISC!), 'RUN/MP71.ZDB', 'MP71');
    const played: RenderedSound[] = [];
    const out: AudioOut = {
      unlocked: true, state: 'running', unlock() {}, setGain() {},
      play(sound) { played.push(sound); }, setReverb() {}, rampReverb() {}, loop() { return null; },
    };
    const audio = new GameAudio(out, () => 0.5);
    audio.setData(data);
    const listenAt = (p: readonly number[]): void => audio.setListener([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0]!, p[1]!, p[2]!, 1]);
    const gull = origin('seagull2');
    const vol = (): number => audio.stats().recent.at(-1)!.vol;
    listenAt(gull);
    expect(audio.play('.SEABIRD_SQUAK', gull)).toBe(true);
    expect(vol()).toBe(0x400);                                        // within 20 u: the whole volume (FUN_00342670 D:L241924-241931)
    listenAt([gull[0], gull[1], gull[2] + 310]);
    expect(audio.play('.SEABIRD_SQUAK', gull)).toBe(true);
    expect(vol()).toBe(512);                                          // 1 - (310 - 20) / 580 = 0.5
    // Inland by chime2 (2155, 222, 564.855): every gull more than 600 u away (1138-1311) -- none of the four sounds.
    listenAt(origin('chime2'));
    const range = audio.stats().dropped.range;
    for (const n of [1, 2, 3, 4]) expect(audio.play('.SEABIRD_SQUAK', origin(`seagull${n}`))).toBe(false);
    expect(audio.stats().dropped.range).toBe(range + 4);
  });
});
