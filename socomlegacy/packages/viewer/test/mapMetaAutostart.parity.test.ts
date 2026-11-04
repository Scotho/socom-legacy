// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { IDENTITY, NODE_INSTANCE, NODE_MODEL, ZCMD, nodeRefInit, type SceneNode, type ZAnimAnimation, type ZAnimArchive, type ZAnimCommand } from '@s2u/scene';
import { AUTOSTART_INITIAL_READING, readMapMeta } from '../src/mapMeta';

/**
 * The autostart rule on a hand-built archive (registry `world.zanim.autostart-opening`; research 209 s9-s10): an
 * animation whose `Anim_Params` flags read 1 in their low two bits starts with its set (`FUN_0026c600` D:L116312-116387,
 * research 115 R115.6), and the `OBJECT_ACTIVE_STATE` commands opening its activation-1 sequences -- up to the first
 * command that is neither that nor a `VALVE` -- are the map's opening state (`AUTOSTART_INITIAL_READING`). The disc's
 * Desert Glory `beerN` (flags 0x21) is held on the MP6 fixture by `loadMap.test.ts`; this one needs no data.
 */

/** A command's bytes, as `packages/scene/test/effects.test.ts`'s `cmd()` builds them: the header, then `payload`. */
function cmd(type: number, payload: number[]): ZAnimCommand {
  const bytes = new Uint8Array(4 + payload.length);
  new DataView(bytes.buffer).setUint32(0, (type & 0xffff) | (bytes.length << 18), true);
  bytes.set(payload, 4);
  return { offset: 0, type, set: 0, cmd: type & 0xff, quadAlign: false, timeless: false, size: bytes.length, bytes };
}
/** `OBJECT_ACTIVE_STATE`: on in the u16 at +4 (1 shown), the node reference in the i8 at +6 (effects.ts decodeEffectOp). */
const active = (node: number, on: boolean): ZAnimCommand => cmd(ZCMD.OBJECT_ACTIVE_STATE, [on ? 1 : 0, 0, node, 0, 0, 0, 0, 0]);
const wait = (): ZAnimCommand => cmd(ZCMD.WAIT, [0, 0, 0, 0, 0, 0, 0x80, 0x3f, 0, 0, 0, 0]);
/** A sequence head's second word carries the activation in bits 1-7 (`decodeEffectProgram`). */
const seq = (activation: number, commands: ZAnimCommand[]) => ({ offset: 0, name: 'NA', word: activation << 1, size: 28, commands });

const node = (name: string, over: Partial<SceneNode> = {}): SceneNode => ({
  name, modelName: null, type: NODE_MODEL, flags: 1, matrix: Float32Array.from(IDENTITY), bbox: new Float32Array(6), regionmask: 0,
  visuals: 0, visualParams: [], visualMaterials: [], children: [], collision: [], ...over,
});
/** worldmodel holding one placement of `beer`, whose model has the two nodes the animation names. */
const models: SceneNode[] = [
  node('worldmodel', { children: [node('beer_1', { type: NODE_INSTANCE, modelName: 'beer' })] }),
  node('beer', { children: [node('beer_parts'), node('bottles')] }),
];

const archiveOf = (flags: number): ZAnimArchive => {
  const names = ['NA', 'beer1', 'beer_parts', 'bottles'];
  const ref = (name: string) => ({ parent: 0, name, search: 0, word: 0, flags: 0, init: nodeRefInit(0) });
  const anim: ZAnimAnimation = {
    name: 'beer1', names,
    params: { nameIndex: 1, rootNodeIndex: 0, paused: 0, state: 1, flags, timer: 0, priority: 0, seqOffsets: [0, 0, 0, 0] },
    nodeRefs: [ref('NA'), ref('beer_parts'), ref('bottles')],
    health: null,
    sequences: [
      // The opening: beer_parts off, then a WAIT -- the bottles' command after it is not part of the opening.
      seq(1, [active(1, false), wait(), active(2, false)]),
      // Another activation's sequence: not an opening, whatever it turns off.
      seq(2, [active(2, false)]),
    ],
  };
  return { main: { version: 0, gravity: -98, flags: 0, userActionAnimIndex: 0 }, names: [], sets: [{ name: 'mission', names, rdrPaths: [], siScripts: [], anims: [anim] }] };
};

describe('the autostart opening on a hand-built archive', () => {
  it("flags 0x21 (low two bits 1): only the activation-1 sequence's leading OBJECT_ACTIVE_STATE opens the map -- beer_parts off; 0x22 opens nothing", () => {
    expect(AUTOSTART_INITIAL_READING.startsWithSet(0x21)).toBe(true);
    expect(AUTOSTART_INITIAL_READING.startsWithSet(0x22)).toBe(false);

    const on = readMapMeta(new Uint8Array(0), [], 'MPX', models, archiveOf(0x21));
    expect(on.autostart).toEqual([{ path: 'worldmodel/beer_1=beer/beer_parts', on: false }]);
    expect(on.initial.filter((e) => e.deactivate).map((e) => e.path)).toEqual(['worldmodel/beer_1=beer/beer_parts']);

    const off = readMapMeta(new Uint8Array(0), [], 'MPX', models, archiveOf(0x22));
    expect(off.autostart).toBeUndefined();
    expect(off.initial).toEqual([]);
  });
});
