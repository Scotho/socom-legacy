import { Mesh, Vector3, type BufferGeometry, type Object3D } from 'three';
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

/**
 * The transform gizmo made tighter (a browser adaptation, the game has no editor; three's TransformControls):
 *
 * - Its hit shapes thinned (the owner, 2026-11-20: "even if my mouse is a bit away from the handles, it hovers them ...
 *   make the handles only interactable if we are very close"). three tests the pointer against invisible picker shapes
 *   much fatter than the handles it draws (an axis's picker a cone 0.2 wide at its tip, its arrow 0.04); each is made
 *   thinner, about the handle drawn, keeping its length and place, so a point, edge or face beside the gizmo can be
 *   picked. three bakes each shape's place into its points, so they are scaled where they lie: an axis's across its
 *   axis, a ring's tube about its circle, a centre handle about the centre, a plane square about its own middle.
 * - The negative-side handles taken off (the owner, 2026-11-20: "remove the negative handles (the ones that are
 *   floating, no lines attached to them)"): the second arrow (move) or cube (scale) three puts on each axis's negative
 *   side, and its picker, so each axis has its one handle at the end of its line.
 *
 * The shares below are this adaptation's, chosen against the handles three draws.
 */
/** An axis's picker (a cone along the axis): its width kept to this share -- at the arrow, about the arrow's own. */
export const GIZMO_AXIS_PICK_ADAPTATION = 0.35;
/** A turn ring's picker (a torus): its tube kept to this share. */
export const GIZMO_RING_PICK_ADAPTATION = 0.4;
/** The centre handles' pickers (free move, free turn, uniform scale): kept to this share, about the drawn centre. */
export const GIZMO_CENTRE_PICK_ADAPTATION = 0.55;
/** A plane handle's picker (a square): kept to this share, the square drawn. */
export const GIZMO_PLANE_PICK_ADAPTATION = 0.8;

const AXES: Record<string, Vector3> = { X: new Vector3(1, 0, 0), Y: new Vector3(0, 1, 0), Z: new Vector3(0, 0, 1), E: new Vector3(0, 0, 1) };

/** Every point of `g` moved by `f` (its normals left: pickers are never lit). */
function eachPoint(g: BufferGeometry, f: (p: Vector3) => void): void {
  const pos = g.getAttribute('position');
  const p = new Vector3();
  for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); f(p); pos.setXYZ(i, p.x, p.y, p.z); }
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

/** A picker's shape made tight where it lies (see above); `mode` its gizmo mode. */
function tighten(mesh: Mesh, mode: string): void {
  const g = mesh.geometry as BufferGeometry & { parameters?: Record<string, number> };
  const name = mesh.name, axis = AXES[name];
  if (name === 'XYZ' || name === 'XYZE') { eachPoint(g, (p) => p.multiplyScalar(GIZMO_CENTRE_PICK_ADAPTATION)); return; }
  if (mode === 'rotate' && axis && g.parameters?.radius !== undefined) {
    // A ring: each point's offset from the circle through the tube's middle shortened.
    const r = g.parameters.radius;
    eachPoint(g, (p) => {
      const along = axis.dot(p);
      const flat = p.clone().addScaledVector(axis, -along);
      const centre = flat.lengthSq() > 1e-12 ? flat.setLength(r) : flat;
      p.sub(centre).multiplyScalar(GIZMO_RING_PICK_ADAPTATION).add(centre);
    });
    return;
  }
  if (axis) {
    // An axis: its points drawn in toward the axis line, their place along it kept.
    eachPoint(g, (p) => { const along = axis.dot(p); p.addScaledVector(axis, -along).multiplyScalar(GIZMO_AXIS_PICK_ADAPTATION).addScaledVector(axis, along); });
    return;
  }
  if (name === 'XY' || name === 'YZ' || name === 'XZ') {
    g.computeBoundingBox();
    const mid = g.boundingBox!.getCenter(new Vector3());
    eachPoint(g, (p) => { p.sub(mid).multiplyScalar(GIZMO_PLANE_PICK_ADAPTATION).add(mid); });
  }
}

/** Whether `mesh` (an axis's handle or picker, its place baked into its points) lies on its axis's negative side. */
function onNegativeSide(mesh: Mesh): boolean {
  const axis = mesh.name.length === 1 ? AXES[mesh.name] : undefined;
  if (!axis || mesh.name === 'E') return false;
  const g = mesh.geometry as BufferGeometry;
  g.computeBoundingBox();
  return axis.dot(g.boundingBox!.getCenter(new Vector3())) < -1e-6;
}

/** `controls`' gizmo made tight and one-sided (once; a second call leaves it). */
export function tightenGizmo(controls: TransformControls): void {
  const gizmo = controls.getHelper().children.find((c) => 'picker' in c) as (Object3D & { gizmo?: Record<string, Object3D>; picker?: Record<string, Object3D>; tightened?: boolean }) | undefined;
  if (!gizmo?.picker || !gizmo.gizmo || gizmo.tightened) return;
  gizmo.tightened = true;
  for (const mode of ['translate', 'scale']) {
    for (const group of [gizmo.gizmo[mode], gizmo.picker[mode]]) {
      for (const o of [...(group?.children ?? [])]) if (o instanceof Mesh && onNegativeSide(o)) group!.remove(o);
    }
  }
  for (const [mode, group] of Object.entries(gizmo.picker)) for (const o of group.children) if (o instanceof Mesh) tighten(o, mode);
}
