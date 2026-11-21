import type { BlockShape } from './blockShapes';

/**
 * Create's shape pictures (the owner, 2026-11-17: "make the dropdown create menu a little nicer. Be nice to have a preview
 * image and it is categorized better"; a browser adaptation, FG.R2): each shape drawn in lines, in a 32 x 32 box, in
 * the text's colour -- an isometric look at what a drag makes.
 */
const PATHS: Record<BlockShape, string> = {
  // Box: a cube.
  block: 'M16 4 L28 10 L28 22 L16 28 L4 22 L4 10 Z M4 10 L16 16 L28 10 M16 16 L16 28',
  // Quad: a flat face.
  quad: 'M16 10 L29 16 L16 22 L3 16 Z',
  // Ramp: a wedge rising to the back.
  ramp: 'M4 22 L16 28 L28 22 L28 10 Z M16 28 L16 20 M4 22 L16 20 L28 10',
  // Polygon: an outline of its own, corner by corner (its corners marked).
  polygon: 'M5 22 L9 8 L20 5 L27 14 L21 26 Z M4 21 L6 23 M8 7 L10 9 M19 4 L21 6 M26 13 L28 15 M20 25 L22 27',
  // Pyramid: a square base, its apex over the middle.
  pyramid: 'M16 4 L4 22 L16 28 L28 22 Z M16 4 L16 28',
  // Cylinder: two ellipses and its sides.
  cylinder: 'M5 9 A11 4 0 1 0 27 9 A11 4 0 1 0 5 9 M5 9 L5 23 A11 4 0 0 0 27 23 L27 9',
  // Pipe: a cylinder with its hole.
  pipe: 'M5 9 A11 4 0 1 0 27 9 A11 4 0 1 0 5 9 M10 9 A6 2 0 1 0 22 9 A6 2 0 1 0 10 9 M5 9 L5 23 A11 4 0 0 0 27 23 L27 9',
  // Spike: a cone.
  spike: 'M16 3 L5 23 A11 4 0 0 0 27 23 Z',
  // Sphere: a circle and its equator.
  sphere: 'M16 4 A12 12 0 1 0 16.01 4 M4 16 A12 4 0 0 0 28 16',
  // Torus: a ring and its hole.
  torus: 'M3 16 A13 7 0 1 0 29 16 A13 7 0 1 0 3 16 M10 15 A6 2.5 0 0 0 22 15 M11.5 14.2 A5 2.5 0 0 1 20.5 14.2',
  // Stairs: steps rising to the right.
  stairs: 'M3 27 L3 21 L10 21 L10 15 L17 15 L17 9 L24 9 L24 3 L29 3 L29 27 Z',
  // Ladder: two rails and the rungs.
  ladder: 'M9 3 L9 29 M23 3 L23 29 M9 8 L23 8 M9 14 L23 14 M9 20 L23 20 M9 26 L23 26',
  // Arch: a wall with a round-topped opening.
  arch: 'M3 29 L3 4 L29 4 L29 29 L22 29 L22 16 A6 6 0 0 0 10 16 L10 29 Z',
  // Doorway: a wall with a door-shaped opening.
  doorway: 'M3 29 L3 4 L29 4 L29 29 L21 29 L21 12 L11 12 L11 29 Z',
  // Railing: posts and two rails.
  railing: 'M4 8 L4 28 M12 8 L12 28 M20 8 L20 28 M28 8 L28 28 M3 9 L29 9 M3 18 L29 18',
  // Column: a base, a shaft and a capital.
  column: 'M8 4 L24 4 L24 8 L8 8 Z M8 24 L24 24 L24 28 L8 28 Z M11 8 L11 24 M21 8 L21 24 M16 8 L16 24',
  // Window: a wall with two square openings.
  window: 'M3 29 L3 4 L29 4 L29 29 Z M7 11 L14 11 L14 19 L7 19 Z M18 11 L25 11 L25 19 L18 19 Z',
  // Roof: a gable seen from its end and along its ridge.
  roof: 'M2 22 L12 10 L22 22 Z M12 10 L24 6 L30 18 L22 22',
  // Room: a box seen into, its walls' thickness drawn.
  room: 'M16 4 L28 10 L28 22 L16 28 L4 22 L4 10 Z M7 11 L16 6.5 L25 11 L16 15.5 Z M7 11 L7 20 M25 11 L25 20 M16 15.5 L16 25',
};

/** A shape's picture, an inline SVG (`aria-hidden`: its word says it). */
export function blockShapeIcon(shape: BlockShape): string {
  return `<svg class="fx-shape-icon" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="${PATHS[shape]}"/></svg>`;
}
