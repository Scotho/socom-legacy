import { rgbaPng } from '../console/rgbaPng';
import type { Layout } from './layout';

/**
 * FX-11a slice 1 (FX.R4, FX.R11; the pack format 0.2 spec section 5; H442 f; a browser adaptation with no original): the
 * store package's `icon.png`, a drawn top-down plan of the layout. Pure: no DOM, no canvas, no texture, nothing read
 * from the disc or an archive -- the layout's own numbers drawn as marks in a fixed palette of the port's own colours,
 * so a package's icon carries no game pixels (the export's leak test holds every pixel to this palette). A viewport
 * capture would be a picture of the game's textures on a store: that is the owner's call (H442 f) and is not built.
 *
 * The plan: x to the right, z toward the top (the icon's own convention, not a claim about the game's map screens), the
 * extent of every drawn row fitted inside a margin at one scale for both axes, centred; a layout with nothing placed, or
 * one point, is drawn at a least span (`PLAN_ICON_MIN_SPAN`). A non-finite place draws nothing.
 */
export const PLAN_ICON_ADAPTATION = "the Forge export's plan icon: a browser adaptation with no original, drawn from the layout's numbers alone" as const;

/** The icon's edge in pixels: Thunderstore's icon size (`THUNDERSTORE_PACKAGE_RULES.icon`, 256 x 256). */
export const PLAN_ICON_SIZE = 256;
/** The pixels kept clear inside the frame before the fitted extent starts. */
export const PLAN_ICON_MARGIN = 20;
/** The least span drawn, in game units: an empty layout or one mark is not blown up to the whole icon. */
export const PLAN_ICON_MIN_SPAN = 400;
/** The frame's width in pixels. */
const FRAME = 3;

/** The inks, in drawing order's meaning: the ground, the frame, the pieces, each team's spawns, objectives, rules markers. */
export const PLAN_ICON_INKS = ['ground', 'edge', 'piece', 'teamA', 'teamB', 'objective', 'marker'] as const;
export type PlanIconInk = (typeof PLAN_ICON_INKS)[number];
export type PlanIconColour = readonly [number, number, number, number];
/** The palette: the port's own colours, opaque, chosen for this icon (product track; no original). */
export const PLAN_ICON_PALETTE: Readonly<Record<PlanIconInk, PlanIconColour>> = Object.freeze({
  ground: Object.freeze([28, 34, 31, 255] as const),
  edge: Object.freeze([96, 112, 100, 255] as const),
  piece: Object.freeze([196, 186, 150, 255] as const),
  teamA: Object.freeze([72, 140, 230, 255] as const),
  teamB: Object.freeze([226, 84, 64, 255] as const),
  objective: Object.freeze([244, 204, 64, 255] as const),
  marker: Object.freeze([150, 220, 170, 255] as const),
});

/** A drawn icon: 8-bit RGBA rows, top row first (the shape `rgbaPng` writes). */
export interface PlanIcon {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

type Point = readonly [number, number];
/** One mark: a filled or hollow box about a plan point, its half-size in pixels or in game units. */
interface Mark {
  readonly ink: PlanIconInk;
  readonly at: Point;
  /** Half-size in pixels (a dot). */
  readonly px?: number;
  /** Half-size in game units on x and z (a drawn area); at least one pixel. */
  readonly units?: Point;
  readonly hollow?: boolean;
}

const finite = (p: Point): boolean => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const xz = (v: readonly number[]): Point => [v[0]!, v[2]!];

/** Every row the plan draws, as marks, in drawing order (areas first, then pieces, then markers, spawns on top). */
function marksOf(l: Layout): Mark[] {
  const out: Mark[] = [];
  for (const z of l.extractionZones ?? []) out.push({ ink: 'objective', at: xz(z.at), units: [z.size[0] / 2, z.size[1] / 2], hollow: true });
  for (const z of l.zones ?? []) {
    const half: Point = z.shape === 'cylinder' ? [z.radius, z.radius] : [z.size[0] / 2, z.size[2] / 2];
    out.push({ ink: 'marker', at: xz(z.at), units: half, hollow: true });
  }
  for (const p of l.pieces) out.push({ ink: 'piece', at: [p.m[12]!, p.m[14]!], px: 2 });
  for (const key of ['turrets', 'doors', 'gates', 'barriers'] as const) for (const t of l[key] ?? []) out.push({ ink: 'piece', at: xz(t.at), px: 2 });
  for (const m of l.markers ?? []) out.push({ ink: 'marker', at: xz(m.at), px: 2 });
  for (const s of l.spawners ?? []) out.push({ ink: 'marker', at: xz(s.at), px: 3, hollow: true });
  for (const n of l.npcs ?? []) out.push({ ink: 'marker', at: xz(n.p), px: 1 });
  for (const h of l.hostages ?? []) out.push({ ink: 'objective', at: xz(h.p), px: 2 });
  const bomb = l.objectives?.bomb;
  if (bomb?.start) out.push({ ink: 'objective', at: xz(bomb.start), px: 3 });
  for (const site of bomb?.sites ?? []) out.push({ ink: 'objective', at: xz(site.at), px: 4, hollow: true });
  for (const s of l.respawns ?? []) out.push({ ink: s.team === 'A' ? 'teamA' : 'teamB', at: xz(s.p), px: 2, hollow: true });
  for (const s of l.spawns) out.push({ ink: s.team === 'A' ? 'teamA' : 'teamB', at: xz(s.p), px: 3 });
  return out.filter((m) => finite(m.at) && (!m.units || finite(m.units)));
}

/** The plan's frame: the centre, and the pixels a game unit takes. */
function fit(marks: readonly Mark[]): { cx: number; cz: number; scale: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const m of marks) {
    const [hx, hz] = m.units ? [Math.abs(m.units[0]), Math.abs(m.units[1])] : [0, 0];
    x0 = Math.min(x0, m.at[0] - hx); x1 = Math.max(x1, m.at[0] + hx);
    z0 = Math.min(z0, m.at[1] - hz); z1 = Math.max(z1, m.at[1] + hz);
  }
  if (!marks.length) return { cx: 0, cz: 0, scale: (PLAN_ICON_SIZE - 2 * PLAN_ICON_MARGIN) / PLAN_ICON_MIN_SPAN };
  const span = Math.max(x1 - x0, z1 - z0, PLAN_ICON_MIN_SPAN);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, scale: (PLAN_ICON_SIZE - 2 * PLAN_ICON_MARGIN) / span };
}

/** The layout as a 256 x 256 top-down plan in `PLAN_ICON_PALETTE`'s colours; the same layout gives the same bytes. */
export function drawPlanIcon(l: Layout): PlanIcon {
  const size = PLAN_ICON_SIZE;
  const data = new Uint8ClampedArray(size * size * 4);
  const box = (ink: PlanIconInk, ax: number, ay: number, bx: number, by: number): void => {
    const c = PLAN_ICON_PALETTE[ink];
    const left = Math.max(0, Math.min(ax, bx)), right = Math.min(size - 1, Math.max(ax, bx));
    const top = Math.max(0, Math.min(ay, by)), bottom = Math.min(size - 1, Math.max(ay, by));
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const i = (y * size + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3];
      }
    }
  };
  const outline = (ink: PlanIconInk, ax: number, ay: number, bx: number, by: number): void => {
    box(ink, ax, ay, bx, ay); box(ink, ax, by, bx, by); box(ink, ax, ay, ax, by); box(ink, bx, ay, bx, by);
  };
  box('ground', 0, 0, size - 1, size - 1);
  for (let k = 0; k < FRAME; k++) outline('edge', k, k, size - 1 - k, size - 1 - k);
  const marks = marksOf(l);
  const { cx, cz, scale } = fit(marks);
  const inside = (v: number): number => Math.max(FRAME, Math.min(size - 1 - FRAME, v));
  for (const m of marks) {
    const x = Math.round(size / 2 + (m.at[0] - cx) * scale);
    const y = Math.round(size / 2 - (m.at[1] - cz) * scale);
    const hx = m.units ? Math.max(1, Math.round(Math.abs(m.units[0]) * scale)) : m.px ?? 1;
    const hy = m.units ? Math.max(1, Math.round(Math.abs(m.units[1]) * scale)) : m.px ?? 1;
    const [ax, ay, bx, by] = [inside(x - hx), inside(y - hy), inside(x + hx), inside(y + hy)];
    if (m.hollow) outline(m.ink, ax, ay, bx, by); else box(m.ink, ax, ay, bx, by);
  }
  return { width: size, height: size, data };
}

/** The plan icon as PNG bytes: `drawPlanIcon` through the viewer's own RGBA writer (`../console/rgbaPng`, stored deflate). */
export function planIconPng(l: Layout): Uint8Array {
  return rgbaPng(drawPlanIcon(l));
}
