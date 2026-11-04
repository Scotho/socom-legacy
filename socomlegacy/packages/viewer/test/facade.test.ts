// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { CAMPAIGN_STEMS, parseZdb, Zar, zdbMember } from '@s2u/archive';
import { loadModelLibrary, parseSceneGraph, placeInstances, resolveChunk, type PlacedModel, type ModelLibrary } from '@s2u/scene';
import { archivePositionForm, interpretChainPartsAs, walkChain, type MeshData, type PositionForm } from '@s2u/mesh';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { assetLibStems } from '../src/mapTextures';
import { facadeAlphaKey, facadeCollapsed, FacadeRelight, facadeRows, facadeTrianglesShown, relightFacade, turnFacade } from '../src/facade';
import { applyLighting } from '../src/lighting';

/**
 * Issue #291 (PARITY-2): the facade nodes -- a lamp's flare, a star, the moon, Bitter Jungle's far tree cards -- as the
 * engine turns and culls them. `FUN_00317fc0` (D:L216502-216595) replaces the node's rotation by one built from the
 * camera's direction to the node (`FUN_00309200` D:L216541: node - camera): facade 1 a turn about the vertical, facade 2
 * that turn then the tilt (`FUN_001bfc30` D:L216569), the third row the unit vector from the camera to the node. So the
 * camera is always on the node's local -z side, and a visual with the cull bit (`FUN_003b5f20` D:L307850) shows only the
 * triangles whose normal points back at it. Desert Glory's `lightbulb` carries a red-green checker cross
 * (`null_xmas.bmp`, `N002_I000_V01`) beside its flare card (`flare_orange.tif`, `N002_I000_V00`): the card faces the
 * camera, the cross's flat quad faces away (culled) and its other quad is edge-on, so the console never shows it.
 */

const WORLD = 'worldmodel';
const MP = ['MP1', 'MP2', 'MP5', 'MP6', 'MP7', 'MP8', 'MP9', 'MP10', 'MP11', 'MP12', 'MP51', 'MP52', 'MP53', 'MP61', 'MP62',
  'MP64', 'MP71', 'MP72', 'MP73', 'MP81', 'MP82', 'MP83'];
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_DISC = DISC !== '' && [...MP, ...CAMPAIGN_STEMS].every((m) => existsSync(join(DISC, 'RUN', `${m}.ZDB`)));

interface Opened { models: ReturnType<typeof parseSceneGraph>; library: ModelLibrary }

/** A map's graph and its model chain as `loadMap` reads them: `WORL_MDL`, then the asset libraries but `CLIB`. */
function open(bytes: Uint8Array, stem: string): Opened {
  const toc = parseZdb(bytes);
  const models = parseSceneGraph(Zar.parse(zdbMember(bytes, toc, `${stem}_GEO.ZED`)));
  const zars: Zar[] = [];
  const forms: PositionForm[] = [];
  const members = ['WORL_MDL.ZED', ...assetLibStems(bytes, toc, stem, { add: () => {} }).filter((s) => s !== 'CLIB').map((s) => `${s}_MDL.ZED`)];
  for (const member of members) {
    try { zars.push(Zar.parse(zdbMember(bytes, toc, member))); forms.push(archivePositionForm(member)); } catch { /* a library with no models */ }
  }
  return { models, library: loadModelLibrary(zars, forms) };
}

/** One visual of a facade placement: its meshes, how many GS line strips it draws (LATER 120), and its cull bit. */
interface FacadeVisual { stem: string; placement: PlacedModel; chunk: string; meshes: MeshData[]; strips: number; cull: boolean }

/**
 * Every visual of every facade placement of the scene graph, the world model's own nodes among them: the draw walk turns
 * them alike (LATER 112, FACADES-2). `CLUTTER.ZAR`'s placements are not the scene graph's and are not here.
 */
function facadeVisuals(stem: string, { models, library }: Opened): FacadeVisual[] {
  const out: FacadeVisual[] = [];
  for (const p of placeInstances(models, WORLD)) {
    if (p.facade === 0) continue;
    const entry = library.get(p.modelName);
    if (!entry) continue;
    p.chunks.forEach((chunk, v) => {
      const at = resolveChunk(entry, chunk);
      if (!at) return;
      const { meshes, lines } = interpretChainPartsAs(walkChain(entry.buffer, at.offset, chunk), entry.form ?? 'bias');
      out.push({ stem, placement: p, chunk, meshes, strips: lines.length, cull: p.cull[v] ?? true });
    });
  }
  return out;
}

const originOf = (p: PlacedModel): [number, number, number] => [p.rowMajor[12]!, p.rowMajor[13]!, p.rowMajor[14]!];

/** Eight cameras on a ring `radius` units out from the node (100 by default), from 5 to 60 units up. */
function ring(origin: readonly number[], radius = 100): [number, number, number][] {
  return Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4;
    return [origin[0]! + radius * Math.cos(a), 5 + (55 * k) / 7, origin[2]! + radius * Math.sin(a)];
  });
}

/**
 * How far a visual's vertices reach from its node's origin, model space. Inside that reach a triangle wound to face +z
 * that sits on the camera's side of the origin can face the camera -- Bitter Jungle's far-tree cards are two 10-unit
 * triangles at the corners of the tree's box, their centroids 117 to 364 units from the node, in planes 78 to 203 units
 * out along local z -- in the console as here, so the disc's ring stands beyond twice the reach.
 */
function reach(v: FacadeVisual): number {
  let r = 0;
  for (const m of v.meshes) {
    for (let i = 0; i < m.positions.length; i += 3) r = Math.max(r, Math.hypot(m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!));
  }
  return r;
}

/** The triangles of a visual the camera sees with the engine's facade turn, summed over its meshes. */
function shown(v: FacadeVisual, eye: readonly number[]): number {
  const origin = originOf(v.placement);
  const rows = facadeRows(v.placement.facade, origin, eye);
  if (!rows) throw new Error(`${v.placement.path}: facade ${v.placement.facade} has no rows`);
  return v.meshes.reduce((n, m) => n + facadeTrianglesShown(m.positions, m.indices, rows, origin, eye, v.cull), 0);
}
const triangles = (v: FacadeVisual): number => v.meshes.reduce((n, m) => n + m.indices.length / 3, 0);

describe('the facade turn (synthetic: FUN_00317fc0 D:L216502-216595)', () => {
  const origin = [10, 5, 20] as const;
  const eye = [-20, 45, -20] as const;
  const d = new Vector3(origin[0] - eye[0], origin[1] - eye[1], origin[2] - eye[2]);
  const row = (r: Float32Array, i: number): Vector3 => new Vector3(r[i * 3]!, r[i * 3 + 1]!, r[i * 3 + 2]!);

  it('facade 1 turns about the vertical only: row 1 is up, row 2 the horizontal direction from the camera to the node', () => {
    const r = facadeRows(1, origin, eye)!;
    const flat = new Vector3(d.x, 0, d.z).normalize();
    expect(row(r, 1).toArray()).toEqual([0, 1, 0]);
    expect(row(r, 2).distanceTo(flat)).toBeLessThan(1e-6);
    expect(row(r, 0).distanceTo(new Vector3(flat.z, 0, -flat.x))).toBeLessThan(1e-6);
  });

  it('facade 2 tilts too: row 2 is the unit vector from the camera to the node, the rows a rotation', () => {
    const r = facadeRows(2, origin, eye)!;
    expect(row(r, 2).distanceTo(d.clone().normalize())).toBeLessThan(1e-6);
    expect(row(r, 0).y).toBe(0);                                    // the tilt leaves the first row level
    const det = row(r, 0).dot(row(r, 1).clone().cross(row(r, 2)));
    expect(det).toBeCloseTo(1, 6);
    expect(row(r, 0).dot(row(r, 1))).toBeCloseTo(0, 6);
    expect(facadeCollapsed(r)).toBe(false);
  });

  it('turnFacade carries the node\'s +z along the camera-to-node direction; facade 0 and 3 are no turn', () => {
    const o = new Object3D();
    turnFacade(o, 2, origin, eye);
    expect(new Vector3(0, 0, 1).applyQuaternion(o.quaternion).distanceTo(d.clone().normalize())).toBeLessThan(1e-6);
    expect(o.scale.toArray()).toEqual([1, 1, 1]);
    expect(facadeRows(0, origin, eye)).toBeNull();
    expect(facadeRows(3, origin, eye)).toBeNull();
  });

  it('a camera straight above the node collapses the turn, and the collapse hides it', () => {
    const above = [origin[0], origin[1] + 50, origin[2]] as const;
    for (const facade of [1, 2]) {
      expect(facadeCollapsed(facadeRows(facade, origin, above)!)).toBe(true);
      const o = new Object3D();
      turnFacade(o, facade, origin, above);
      expect(o.scale.toArray()).toEqual([0, 0, 0]);
    }
  });

  it('a culled quad facing the camera shows, the same quad wound the other way does not, and an edge-on one never', () => {
    const rows = facadeRows(2, origin, eye)!;
    const quad = Float32Array.from([-1, 1, 0, 1, 1, 0, 1, -1, 0, -1, -1, 0]);
    const toward = Uint16Array.from([0, 1, 2, 0, 2, 3]);          // normal -z: back at the camera
    const away = Uint16Array.from([0, 2, 1, 0, 3, 2]);
    expect(facadeTrianglesShown(quad, toward, rows, origin, eye, true)).toBe(2);
    expect(facadeTrianglesShown(quad, away, rows, origin, eye, true)).toBe(0);
    expect(facadeTrianglesShown(quad, away, rows, origin, eye, false)).toBe(2);
    const edge = Float32Array.from([0, 1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1]);   // the x = 0 plane holds the camera's ray
    expect(facadeTrianglesShown(edge, toward, rows, origin, eye, false)).toBe(0);
  });
});

const MP6 = fixture('RUN/MP6.ZDB');
const MP2 = fixture('RUN/MP2.ZDB');
const absent = !MP6 || !MP2;

describe.skipIf(absent)(`the facades on the fixtures${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it.skipIf(absent)('Desert Glory: the lightbulb\'s checker cross shows nothing from 8 cameras, its flare card both triangles', () => {
    const visuals = facadeVisuals('MP6', open(MP6!, 'MP6'));
    const flasher = visuals.filter((v) => v.placement.path === 'worldmodel/lightbulb3/lightbulb=lightbulb/flare_flasher');
    const cross = flasher.find((v) => v.chunk === 'N002_I000_V01')!;
    const card = flasher.find((v) => v.chunk === 'N002_I000_V00')!;
    expect(cross.meshes.map((m) => m.textureName)).toEqual(['null_xmas.bmp']);
    expect(card.meshes.map((m) => m.textureName)).toEqual(['flare_orange.tif']);
    expect(cross.placement.facade).toBe(2);
    expect([cross.cull, card.cull]).toEqual([true, true]);
    for (const eye of ring(originOf(cross.placement))) {
      expect(shown(cross, eye)).toBe(0);
      expect(shown(card, eye)).toBe(2);
    }
  });

  it.skipIf(absent)('Frostfire, the control: its 15 culled glows show every triangle from 8 cameras each', () => {
    const glows = facadeVisuals('MP2', open(MP2!, 'MP2')).filter((v) => v.cull);
    expect(glows.length).toBe(15);
    for (const g of glows) for (const eye of ring(originOf(g.placement))) expect(shown(g, eye)).toBe(triangles(g));
  });
});

describe.skipIf(!HAVE_DISC)(`the facades on every map${HAVE_DISC ? '' : ' (no dev disc: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  /** Every prop facade visual of the 34 maps, read once for both distances. */
  let all: FacadeVisual[] | null = null;
  const visuals = (): FacadeVisual[] => all ??= [...MP, ...CAMPAIGN_STEMS].flatMap((stem) =>
    facadeVisuals(stem, open(new Uint8Array(readFileSync(join(DISC, 'RUN', `${stem}.ZDB`))), stem)));
  const label = (v: FacadeVisual): string => `${v.stem} ${v.placement.path} ${v.chunk} ${v.meshes.map((m) => m.textureName).join(',')}`;
  /** The visuals that show nothing from 8 ring cameras at `radius(v)`, counted by map. */
  const hiddenAt = (radius: (v: FacadeVisual) => number): { labels: string[]; byMap: Record<string, number> } => {
    // LATER 120: a visual of line strips alone (MP11's 13 bulb wires, turned since) has no triangle to hide: not counted.
    const labels = visuals().filter((v) => triangles(v) > 0 && ring(originOf(v.placement), radius(v)).every((eye) => shown(v, eye) === 0)).map(label);
    const byMap: Record<string, number> = {};
    for (const l of labels) byMap[l.split(' ')[0]!] = (byMap[l.split(' ')[0]!] ?? 0) + 1;
    return { labels, byMap };
  };

  it.skipIf(!HAVE_DISC)('LATER 120: the only facade visuals that draw line strips are MP11\'s 13 bulb wires', () => {
    // The read's sweep (2026-10-19): of the 34 maps' facade placements, the scene graph's and CLUTTER.ZAR's (570 before
    // LATER 120), none drew a strip; the bulbs' `wire`, turned on its flare's entry since LATER 120, is the one that does.
    const byPath: Record<string, number> = {};
    for (const v of visuals()) if (v.strips > 0) byPath[`${v.stem} ${v.placement.path}`] = (byPath[`${v.stem} ${v.placement.path}`] ?? 0) + 1;
    expect(byPath).toEqual({ 'MP11 worldmodel/light_bulb=light_bulb/wire': 13 });
  }, 600_000);

  it.skipIf(!HAVE_DISC)('the world model\'s own facade nodes: 23 on 7 maps (LATER 112)', () => {
    const byMap: Record<string, number> = {};
    for (const v of visuals()) if (v.placement.modelName === WORLD) byMap[v.stem] = (byMap[v.stem] ?? 0) + 1;
    expect(byMap).toEqual({ M72: 6, M82: 1, MP11: 4, MP52: 4, MP53: 1, MP7: 6, MP71: 1 });
  }, 600_000);

  it.skipIf(!HAVE_DISC)('exactly 51 facade visuals show nothing beyond their reach: Desert Glory\'s cross, Bitter Jungle\'s 49 far-tree cards and M82\'s g4445', () => {
    const far = hiddenAt((v) => Math.max(100, 2 * reach(v)));
    expect(far.byMap).toEqual({ MP6: 1, MP9: 49, M82: 1 });
    // M82's world-model `g4445`: four culled `flare_red.tif` triangles wound to face +z, facade 2 (FACADES-2's read).
    expect(far.labels.filter((l) => !l.endsWith(' null_xmas.bmp'))).toEqual(['M82 worldmodel/g4445 N134_000 flare_red.tif']);
  }, 600_000);

  it.skipIf(!HAVE_DISC)('from 120-unit rings, 22 of Bitter Jungle\'s 49 cards show a corner (the original\'s too, by the reading); the cross still none', () => {
    // 120, not 100: a facade 1 card's camera sits at local z = -(its horizontal range), and the cards' planes lie at
    // local z -78.44, -98.44, -100, -108.44, -130 and -197 on the camera's side -- a 100-unit ring stood exactly in one.
    const near = hiddenAt(() => 120);
    const far = hiddenAt((v) => Math.max(100, 2 * reach(v)));
    // A card is two 10-unit triangles at the corners of its tree's box, their centroids 117 to 364 units from the node,
    // in planes 78 to 203 units out along local z: from a camera nearer than a corner's plane, a corner on the camera's
    // side faces it under the engine's turn, in the console as here.
    expect(near.byMap).toEqual({ MP6: 1, MP9: 27, M82: 1 });
    expect(near.labels.every((l) => far.labels.includes(l))).toBe(true);
    const corner = far.labels.filter((l) => !near.labels.includes(l));
    expect(corner.length).toBe(22);
    expect(corner.every((l) => l.startsWith('MP9 ') && l.endsWith(' null_xmas.bmp'))).toBe(true);
  }, 600_000);
});

describe('the turned facade\'s alpha key and lighting (synthetic: FACADES-2, LATER 113 and 114)', () => {
  const origin = [10, 5, 20] as const;
  const eye = [70, 65, -40] as const;
  /** A point of model space through the rows (row-vector) to the node. */
  const through = (rows: ArrayLike<number>, p: readonly number[]): number[] =>
    [0, 1, 2].map((k) => origin[k]! + p[0]! * rows[k]! + p[1]! * rows[3 + k]! + p[2]! * rows[6 + k]!);

  it('facadeAlphaKey: the centroid carried by the turn to the node (FUN_003371b0 D:L235314), facade 1 and 2', () => {
    for (const facade of [1, 2]) {
      const o = new Object3D();
      o.position.set(...origin);
      turnFacade(o, facade, origin, eye);
      const out: [number, number, number] = [0, 0, 0];
      facadeAlphaKey(out, [3, -2, 7], o);
      const want = through(facadeRows(facade, origin, eye)!, [3, -2, 7]);
      out.forEach((v, k) => expect(v).toBeCloseTo(want[k]!, 5));
    }
  });

  it('facadeAlphaKey: a pose put back carries its scale too', () => {
    const o = new Object3D();
    o.position.set(...origin);
    o.scale.setScalar(2);
    const out: [number, number, number] = [0, 0, 0];
    facadeAlphaKey(out, [1, 2, 3], o);
    expect(out).toEqual([12, 9, 26]);
  });

  it('relightFacade: the rig against the normals the turn gives the part (FUN_003b6870 D:L308207-308208)', () => {
    const rig = { directions: [[-0.6, -0.8, 0], [0, 0, 1], [0, 0, 0]] as [number, number, number][], colours: [[0.5, 0.4, 0.3], [0.2, 0.3, 0.4], [0, 0, 0]] as [number, number, number][], ambient: [0.1, 0.1, 0.1] as [number, number, number] };
    const light = { rig, brighten: 0, rigEverywhere: false };
    const part = { colors: new Float32Array(8).fill(0.75), normals: Float32Array.from([0, 0, 1, 0.6, 0, 0.8]), lit: true };
    const o = new Object3D();
    turnFacade(o, 2, origin, eye);
    const out = new Float32Array(8);
    relightFacade(part, o.quaternion, light, new Float32Array(6), out);
    const rows = facadeRows(2, origin, eye)!;
    const turned = Float32Array.from([0, 1].flatMap((v) => [0, 1, 2].map((k) => part.normals[v * 3]! * rows[k]! + part.normals[v * 3 + 1]! * rows[3 + k]! + part.normals[v * 3 + 2]! * rows[6 + k]!)));
    const want = new Float32Array(8);
    applyLighting({ colors: part.colors, normals: turned, lit: true }, light, want);
    want.forEach((v, k) => expect(out[k]).toBeCloseTo(v, 5));
  });

  it('relightFacade: an unlit part keeps its material colour; a part without normals takes applyLighting\'s own rule', () => {
    const light = { rig: null, brighten: 0, rigEverywhere: false };
    const out = new Float32Array(4);
    relightFacade({ colors: Float32Array.from([0.2, 0.3, 0.4, 1]), normals: Float32Array.from([0, 0, 1]), lit: false }, new Object3D().quaternion, light, new Float32Array(3), out);
    expect(Array.from(out)).toEqual(Array.from(Float32Array.from([0.2, 0.3, 0.4, 1])));
  });
});

describe('FacadeRelight: LATER 114\'s cost guard (synthetic: FACADES-2)', () => {
  it('re-lights on a new turn, a new lighting stamp or after invalidate, and not otherwise; an unlit part never', () => {
    const rig = { directions: [[0, 1, 0], [0, 0, 1], [0, 0, 0]] as [number, number, number][], colours: [[0.5, 0.5, 0.5], [0.2, 0.2, 0.2], [0, 0, 0]] as [number, number, number][], ambient: [0.1, 0.1, 0.1] as [number, number, number] };
    const light = { rig, brighten: 0, rigEverywhere: false };
    const attribute = { array: new Float32Array(4), needsUpdate: false };
    const r = new FacadeRelight({ colors: new Float32Array(4).fill(1), normals: Float32Array.from([0, 0, 1]), lit: true }, attribute);
    const o = new Object3D();
    turnFacade(o, 2, [0, 0, 0], [10, 5, -20]);
    expect(r.update(o.quaternion, light, 0)).toBe(true);
    expect(attribute.needsUpdate).toBe(true);
    expect(r.update(o.quaternion, light, 0)).toBe(false);
    expect(r.update(o.quaternion, light, 1)).toBe(true);
    turnFacade(o, 2, [0, 0, 0], [-10, 5, -20]);
    expect(r.update(o.quaternion, light, 1)).toBe(true);
    expect(r.update(o.quaternion, light, 1)).toBe(false);
    r.invalidate();
    expect(r.update(o.quaternion, light, 1)).toBe(true);
    const unlit = new FacadeRelight({ colors: new Float32Array(4).fill(1), normals: Float32Array.from([0, 0, 1]), lit: false }, attribute);
    expect(unlit.update(o.quaternion, light, 0)).toBe(false);
    expect(unlit.update(o.quaternion, { ...light, rigEverywhere: true }, 1)).toBe(true);
  });
});
