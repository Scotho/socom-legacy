import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from 'three';
import { CustomProps } from '../src/customProps';

/**
 * FP-6 item 5, PR #756's third-pass P2 (2) (product track, a test instrument): a custom map's pack props are freed on
 * EVERY world replacement -- a disc map's show included (`../src/main.ts`, `customProps.clear()` beside each `show`):
 * `WorldView.dispose` does not reach this child, and before this a disc map after a custom one kept its GPU resources.
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

describe('PR #756 P2 (2): the custom props are freed on every world replacement', () => {
  it('custom then disc: the props\' textures disposed once, and only once', () => {
    const props = new CustomProps();
    const parent = new Group();
    const t = textured();
    props.begin(1);
    props.attach(1, t.group, parent);
    props.clear();                                            // the disc map's show replaces the world
    expect(t.disposed()).toBe(1);
    expect(parent.children).toEqual([]);
    props.clear();                                            // the next replacement: nothing left to free
    expect(t.disposed()).toBe(1);
  });
  it('main.ts clears them beside both shows, the worker\'s disc show included', () => {
    expect(MAIN).toContain('customProps.clear();                              // PR #756 P2: every world replacement frees the custom props');
    expect(MAIN).toContain('show: (map) => { shownFrom = wantedMapFrom; customProps.clear(); show(customOffline.mark(map)); },');
  });
});
