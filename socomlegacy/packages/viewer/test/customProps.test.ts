import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from 'three';
import { CustomProps } from '../src/customProps';
import { LoadingJoin, pageLanes } from '../src/loadingJoin';
import { sceneViewFor } from '../src/loadOwnership';

/**
 * FP-6 item 5, PR #756's third-pass P2s (1) and (2) (product track, a test instrument): a custom map's pack props are
 * part of its world. (1) Their hull is in the map's ground at `show`, so the load screen holds until they are drawn: the
 * scene lane reads no view while this load's props are still being read (`CustomProps.ready`), and a preparation that
 * fails settles so the screen always releases. (2) They are freed on EVERY world replacement, a disc map's included
 * (`clear`, called beside each `show` in `../src/main.ts`): `WorldView.dispose` does not reach this child.
 */

const MAIN = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf-8');
const textured = (): { group: Group; disposed: () => number } => {
  const map = new Texture();
  let n = 0;
  map.addEventListener('dispose', () => { n++; });
  const group = new Group();
  group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ map })));
  group.userData['dispose'] = () => { group.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as MeshBasicMaterial).map?.dispose(); (m.material as MeshBasicMaterial).dispose(); } }); };
  return { group, disposed: () => n };
};

/** The page's hold for load `load`: the real LoadingJoin (hold 0) over the real pageLanes, the scene view gated by the props. */
function hold(props: CustomProps, load: number) {
  const join = new LoadingJoin(0);
  join.begin(load, undefined, 0);
  const view = {};
  const frame = (): string => join.frame(load, pageLanes({
    load, playOn: false, view: props.ready(load) ? sceneViewFor(view, load, load) : null, worldWarmed: view, worldWarmFailed: null,
    playAnswer: 'none', walkWarmed: true, noArmory: true, loadedArmory: load, armoryReady: false, loadedEffects: load, loadedSound: load,
    url: false, netLoad: -1, status: null,
  }), 1, 0);
  return { frame };
}

describe('PR #756 P2 (1): the hold waits for the custom props to be drawn', () => {
  it('a slow GLB read: held while the props are prepared, released once they are attached', () => {
    const props = new CustomProps();
    const parent = new Group();
    props.begin(3);
    const h = hold(props, 3);
    expect(h.frame()).toBe('hold');
    expect(h.frame()).toBe('hold');                            // the read still going: the world warmed, the props not in
    const g = textured().group;
    props.attach(3, g, parent);
    expect(parent.children).toContain(g);
    expect(h.frame()).toBe('released');
  });
  it('a preparation that fails, or one superseded, settles: the screen always releases', () => {
    const props = new CustomProps();
    props.begin(5);
    props.settle(5);
    expect(hold(props, 5).frame()).toBe('released');
    props.begin(6);
    props.begin(7);                                           // a newer load's props: load 6 waits on nothing
    expect(props.ready(6)).toBe(true);
    expect(props.ready(7)).toBe(false);
    props.settle(6);                                          // the old one's late settle does not release the newer
    expect(props.ready(7)).toBe(false);
  });
  it('a stale attach (another load shown since) is disposed, never attached', () => {
    const props = new CustomProps();
    const parent = new Group();
    props.begin(8);
    props.begin(9);
    const t = textured();
    props.attach(8, t.group, parent);
    expect(parent.children).toEqual([]);
    expect(t.disposed()).toBe(1);
  });
  it('main.ts gates the scene lane by the props and settles a failed preparation', () => {
    expect(MAIN).toContain('view: customProps.ready(wantedMap) ? sceneViewFor(view, shownLoad, wantedMap) : null,');
    expect(MAIN).toMatch(/customProps\.begin\(load\);/);
    expect(MAIN).toMatch(/\.catch\(\(\) => \{ customProps\.settle\(load\); \}\);/);
  });
});
