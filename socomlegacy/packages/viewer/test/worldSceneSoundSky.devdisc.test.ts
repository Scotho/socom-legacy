// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { parseZdb, Zar, zdbMember } from '@s2u/archive';
import { decodeEffectProgram, parseAnimSets, parseSceneGraph, type EffectProgram } from '@s2u/scene';
import { readMapMeta } from '../src/mapMeta';
import { loadSimMap } from '../src/simMap';
import { SCENE_SOUND_CAMERA_NODE_PLACEHOLDER, WorldState } from '../src/worldState';

/**
 * The v0.4.19 front-end re-review: a scene `SOUND` at a node a `translate_sky`-class program holds at the camera.
 *
 * Every offered map's autostart that moves its sky moves it by `OBJECT_TRANSLATE_STATE` (18; tick `FUN_00263890`
 * D:L111263ff, `@s2u/scene` `effects.ts`): the node (+6) takes the reference node's (+7) world position -- the reference
 * is `camera` on each (MP6/MP71/MP83's `skydome`s, MP73's `skydome` and `flashes`, MP8, MP9, MP12, MP51, MP52's
 * `mp52_dustfollow`, MP53, MP72, MP81's `skyplane`, MP82's `move_sky`), looped, so the node stands at the camera every
 * frame (research 175 s5.1.1). `FUN_002659c0`'s place carries the command's offset through the node's matrix as it stands
 * (`FUN_00310980`, D:L112446-112450): on Sandstorm (MP73) and Desert Glory (MP6) the battle sounds' `.EXP_DISTANT`
 * (flags 0x86) at the sky plus (300, 0, 1000), (-800, 0, -120), (-600, 0, -120) play that far from the LISTENER. The port
 * has no camera-following node (`SCENE_NODE_TRANSFORM_PLACEHOLDER`): since `agent/fh-seagulls` they played at the sky's
 * REST origin plus the offset, inside the playable area. `SCENE_SOUND_CAMERA_NODE_PLACEHOLDER` plays them unplaced, as
 * v0.4.18 did. The maps are no fixtures: this file reads `SOCOM_DISC` (or `SOCOM_PC_ROOT`'s `game/disc`) and SKIPS
 * without them -- a skip is said, never a pass.
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP73.ZDB')) && existsSync(join(d, 'RUN/MP6.ZDB')) && existsSync(join(d, 'RUN/MP71.ZDB')));
const SKIP = DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT with RUN/MP73, MP6, MP71 absent -- skipped (no fixtures)';

const bytes = (stem: string): Uint8Array => new Uint8Array(readFileSync(join(DISC!, `RUN/${stem}.ZDB`)));

function programs(stem: string): Map<string, EffectProgram> {
  const b = bytes(stem);
  const out = new Map<string, EffectProgram>();
  for (const s of parseAnimSets(Zar.parse(zdbMember(b, parseZdb(b), 'MZANIM.ZAR'))).sets) for (const a of s.anims) out.set(a.name, decodeEffectProgram(a));
  return out;
}

type Heard = { t: number; name: string; path: string | null; at: [number, number, number] | null };
/**
 * A seeded unit draw (mulberry32) for the autostarts' `RANDOM_WEIGHT`s: the battle sounds' bursts are `IF` random 0.2 /
 * 0.3 branches, so the 0.5 the other files take never picks MP6's (and only MP73's `burst3`); this one picks all three.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The page's world on `stem` (`./matchWorld`'s lines), its autostarts run for `seconds` at 60 Hz, every SOUND heard. */
async function run(stem: string, seconds: number): Promise<{ heard: Heard[]; world: WorldState }> {
  const sim = await loadSimMap(new FsAssetSource(DISC!), `RUN/${stem}.ZDB`);
  const b = bytes(stem), toc = parseZdb(b);
  const meta = readMapMeta(b, toc, stem, parseSceneGraph(Zar.parse(zdbMember(b, toc, `${stem}_GEO.ZED`))));
  const heard: Heard[] = [];
  let t = 0;
  const world = new WorldState(meta, sim.ground, sim.grid, {
    sound: (name, path, _volume, at?: [number, number, number] | null) => { heard.push({ t, name, path, at: at ?? null }); },
  });
  world.runAutostartPrograms = true;
  world.autostartRandom = seeded(73);
  world.applyInitial();
  for (let i = 0; i < seconds * 60; i++) { world.step(1 / 60); t = (i + 1) / 60; }
  return { heard, world };
}

describe.skipIf(!DISC)(`a scene SOUND at a camera-following node${SKIP}`, () => {
  it("the data: MP73's and MP6's translate_sky hold the sky at `camera`; their battle sounds' .EXP_DISTANT sit at it plus three offsets", () => {
    for (const [stem, sky] of [['MP73', 'skydome'], ['MP6', 'mp6_skydome']] as const) {
      const all = programs(stem);
      const follow = all.get('translate_sky')!;
      expect(follow.flags).toBe(0x21);
      const moves = follow.sequences.flatMap((s) => s.ops).filter((o) => o.op === 'translate');
      expect(moves.map((o) => o.op === 'translate' && follow.nodes[o.ref])).toContain('camera');
      expect(moves.map((o) => o.op === 'translate' && follow.nodes[o.node])).toContain(sky);
      const battle = all.get(`${stem.toLowerCase()}_battlesounds`)!;
      const far = battle.sequences.flatMap((s) => s.ops).filter((o) => o.op === 'sound' && o.sound === '.EXP_DISTANT' && battle.nodes[o.node] === sky);
      expect(far).toHaveLength(14);                                   // burst1..3: 4 + 5 + 5 (`incoming`'s four are at `camera`)
      for (const o of far) if (o.op === 'sound') { expect(o.flags).toBe(0x86); expect(battle.nodes[o.node]).toBe(sky); }
      expect(new Set(far.map((o) => o.op === 'sound' && JSON.stringify(o.offset)))).toEqual(new Set(['[300,0,1000]', '[-800,0,-120]', '[-600,0,-120]']));
    }
  });

  it('Sandstorm (MP73), 180 s: every .EXP_DISTANT of mp73_battlesounds at the sky plays unplaced (SCENE_SOUND_CAMERA_NODE_PLACEHOLDER)', async () => {
    expect(SCENE_SOUND_CAMERA_NODE_PLACEHOLDER).toBe('unplaced');
    const { heard } = await run('MP73', 180);
    const far = heard.filter((h) => h.name === '.EXP_DISTANT' && h.path === 'worldmodel/skydome');
    // Was (agent/fh-seagulls): each at the sky's rest origin (1440, 0, 1440) plus its offset -- (1740, 0, 2440), (640, 0,
    // 1320), (840, 0, 1320) -- in the playable area.
    expect(far.length).toBeGreaterThanOrEqual(40);
    expect(far.filter((h) => h.at !== null).map((h) => h.at)).toEqual([]);
    expect(heard.filter((h) => h.name === '.EXP_DISTANT' && h.at !== null)).toEqual([]);
  }, 120_000);

  it("Desert Glory (MP6), 180 s: no .EXP_DISTANT at all through the world -- mp6_battlesounds is the effect runner's", async () => {
    // Its `test` sequence calls `testexplode` (particles), so `drawsAmbient` hands the whole program to `./effects`'s
    // runner, which places a node's SOUND at the drawn node's matrix with no offset (`EffectRunner` 'sound'): there the
    // sky's rest origin, as at v0.4.18 -- outside this world's `soundPlace` (LATER 894).
    const { heard } = await run('MP6', 180);
    expect(heard.filter((h) => h.name === '.EXP_DISTANT')).toEqual([]);
    // A node no program holds at the camera keeps its place: the cell and garage lights' insect buzz at their lights.
    const buzz = heard.filter((h) => h.name === 'SND_INSECT_BUZZ_1_LOOP');
    expect(buzz.map((h) => h.path).sort()).toEqual(['worldmodel/cell_light1', 'worldmodel/cell_light2', 'worldmodel/garage_light1']);
    for (const h of buzz) expect(h.at).not.toBeNull();
  }, 120_000);

  it("a node no program holds at the camera keeps its place: Fish Hook's gulls at their world origins", async () => {
    const { heard } = await run('MP71', 30);
    const gulls = heard.filter((h) => h.name === '.SEABIRD_SQUAK');
    expect(gulls.length).toBeGreaterThanOrEqual(8);
    for (const h of gulls) {
      expect(h.path).toMatch(/^worldmodel\/seagull[1-4]$/);
      expect(h.at).not.toBeNull();
    }
  }, 120_000);
});
