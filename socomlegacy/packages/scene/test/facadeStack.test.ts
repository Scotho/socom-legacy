import { describe, expect, it } from 'vitest';
import { IDENTITY, NODE_GENERIC, NODE_INSTANCE, NODE_MODEL, identityLike, placeInstances, type SceneNode } from '../src/index';

/**
 * LATER 120 (PARITY-2): the facade turn a placement is drawn under, by the draw walk's matrix stack. `FUN_003389c0`
 * pushes an entry for a node whose local matrix is not identity-like (`FUN_003084f0` D:L206890-206916: the translation
 * words exactly 0 and the diagonal words exactly 1.0, compared as bit patterns, the off-diagonal words not read; the push
 * D:L236075-236079) and draws any other node with the entry on top; a facade node's turn (`FUN_00317fc0`, D:L236081)
 * rewrites the entry on top -- its own, or the one it shares -- and only a node that pushed pops (D:L236222-236225). So
 * the nodes drawn after an identity-like facade node under the entry it shares turn with it: MP11's `light_bulb`, whose
 * `flare` is drawn first (file order: `FUN_00315f40` appends, D:L215358-215359) and turns the instance's entry, so its
 * `bulb_1`, `wire` and `frame` turn with it. The port takes each child of the world as an atom drawn on a fresh entry
 * (`FUN_00337f40` D:L235715-235717, popped D:L235753-235754): no turn reaches past it -- a reading resting on the world
 * root's unread draw path (gathered into atoms with its flag bit 24 set in memory, `FUN_0033b110` D:L237277-237282, or
 * drawn inline; research 101 A11), on which no disc case depends. Synthetic graphs; MP11 itself is
 * `packages/viewer/test/worldFacadeDisc.test.ts`'s.
 */

const FACADE_1 = 1 << 8, FACADE_2 = 2 << 8, FACADE_3 = 3 << 8;
const ACTIVE = 1;

/** A node with one visual and the identity matrix, unless `over` says otherwise. */
const node = (name: string, flags: number, over: Partial<SceneNode> = {}): SceneNode => ({
  name, modelName: null, type: NODE_GENERIC, flags: ACTIVE | flags, matrix: Float32Array.from(IDENTITY),
  bbox: new Float32Array(6), regionmask: 0, visuals: 1, visualParams: [0], visualMaterials: [0], children: [], collision: [], ...over,
});
const translation = (x: number, y: number, z: number): Float32Array => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
/** The world with one instance of `lamp` (its children `children`) at (10, 0, 5); each placement's last name and facade. */
const lampWorld = (children: SceneNode[], instance: Partial<SceneNode> = {}): [string, number][] => {
  const lamp = node('lamp', 0, { type: NODE_MODEL, visuals: 0, children });
  const world = node('worldmodel', 0, {
    type: NODE_MODEL, visuals: 0,
    children: [node('lamp_1', 0, { type: NODE_INSTANCE, modelName: 'lamp', visuals: 0, matrix: translation(10, 0, 5), ...instance })],
  });
  return placeInstances([lamp, world]).map((p) => [p.path.split('/').pop()!, p.facade]);
};

describe('identityLike (FUN_003084f0 D:L206890-206916)', () => {
  it('the identity is identity-like; a translation, a scale or a -0.0 translation word is not', () => {
    expect(identityLike(Float32Array.from(IDENTITY))).toBe(true);
    expect(identityLike(translation(0, 0, 1))).toBe(false);
    expect(identityLike(Float32Array.from([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))).toBe(false);
    expect(identityLike(translation(-0, 0, 0))).toBe(false);   // 0x80000000 is not the word 0
  });

  it('the off-diagonal words are not read: a shear with a unit diagonal and no translation is identity-like', () => {
    expect(identityLike(Float32Array.from([1, 0.5, 0, 0, 0, 1, 0.25, 0, 0, 0, 1, 0, 0, 0, 0, 1]))).toBe(true);
  });
});

describe('the facade turn a placement is drawn under (LATER 120: the matrix stack)', () => {
  it('an identity-like facade node drawn first turns the instance\'s entry: the siblings after it turn with it', () => {
    expect(lampWorld([node('flare', FACADE_2), node('bulb', 0), node('wire', 0)]))
      .toEqual([['flare', 2], ['bulb', 2], ['wire', 2]]);
  });

  it('a sibling drawn before the facade node is drawn on the entry before the turn: it stays fixed', () => {
    expect(lampWorld([node('bulb', 0), node('flare', FACADE_2), node('wire', 0)]))
      .toEqual([['bulb', 0], ['flare', 2], ['wire', 2]]);
  });

  it('a facade node that pushes turns its own entry only: its children turn, its later siblings do not', () => {
    const flare = node('flare', FACADE_1, { matrix: translation(0, -2, 0), children: [node('card', 0)] });
    expect(lampWorld([flare, node('bulb', 0)])).toEqual([['flare', 1], ['card', 1], ['bulb', 0]]);
  });

  it('a -0.0 translation word pushes: the facade node turns its own entry, not its siblings\'', () => {
    const flare = node('flare', FACADE_2, { matrix: translation(0, -0, 0) });
    expect(lampWorld([flare, node('bulb', 0)])).toEqual([['flare', 2], ['bulb', 0]]);
  });

  it('a facade node whose only off-identity words are off the diagonal shares the entry, and turns its siblings', () => {
    const flare = node('flare', FACADE_2, { matrix: Float32Array.from([1, 0.5, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) });
    expect(lampWorld([flare, node('bulb', 0)])).toEqual([['flare', 2], ['bulb', 2]]);
  });

  it('a node pushed on a turned entry is drawn turned too', () => {
    expect(lampWorld([node('flare', FACADE_2), node('hook', 0, { matrix: translation(0, 1, 0) })]))
      .toEqual([['flare', 2], ['hook', 2]]);
  });

  it('facade 3 writes nothing (FUN_00317fc0 returns first): no turn, and a turn before it stands', () => {
    expect(lampWorld([node('odd', FACADE_3), node('bulb', 0)])).toEqual([['odd', 0], ['bulb', 0]]);
    expect(lampWorld([node('flare', FACADE_1), node('odd', FACADE_3), node('bulb', 0)]))
      .toEqual([['flare', 1], ['odd', 1], ['bulb', 1]]);
  });

  // The atom bound as the port reads it: it rests on the world root's unread draw path (research 101 A11, not read --
  // gathered into atoms by FUN_00338480 only with the root's flag bit 24 set in memory, FUN_0033b110 D:L237277-237282;
  // drawn inline, the two would share the root's entry). No disc case depends on it.
  it('the turn stops at its atom (a reading on an unread bit): a world child after an identity-like facade world child stays fixed', () => {
    const world = node('worldmodel', 0, { type: NODE_MODEL, visuals: 0, children: [node('glow', FACADE_2), node('wall', 0)] });
    expect(placeInstances([world]).map((p) => [p.path, p.facade])).toEqual([['worldmodel/glow', 2], ['worldmodel/wall', 0]]);
  });

  it('the turn stops at the instance: the next instance of the same lamp starts fixed', () => {
    const lamp = node('lamp', 0, { type: NODE_MODEL, visuals: 0, children: [node('bulb', 0), node('flare', FACADE_2), node('wire', 0)] });
    const world = node('worldmodel', 0, {
      type: NODE_MODEL, visuals: 0,
      children: [1, 2].map((k) => node(`lamp_${k}`, 0, { type: NODE_INSTANCE, modelName: 'lamp', visuals: 0, matrix: translation(10 * k, 0, 5) })),
    });
    expect(placeInstances([lamp, world]).map((p) => p.facade)).toEqual([0, 2, 2, 0, 2, 2]);
  });
});
