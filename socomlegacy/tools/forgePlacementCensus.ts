/**
 * FX-7 (the Forge export sprint, `docs/plans/2026-11-11-forge-export-sprint.md`; product track): a read-only census of the
 * disc maps' own prop placements. An instrument with no original: it reports what the disc holds and changes nothing the
 * game or the port does. The question it answers: would refusing a piece that is not a translation times a rotation
 * times a positive scale, or whose scale is outside 0.1..4, refuse a Forge duplicate of something the game's own maps
 * already place -- and how much tilt and scale does the game itself use?
 *
 * Every map archive the Forge lists (`../packages/viewer/src/forge/catalog` `archivesOf`: `RUN/MP<N>.ZDB` and the
 * campaign's `RUN/M<NN>.ZDB`) is loaded as the page loads it (`../packages/viewer/src/loadMap` `loadMap`), and every
 * placement of every prop -- `LoadedMap.props[].matrices`, column-major, the placements `forge/hide` `placementsOf`
 * hides and the page's duplicate decomposes (`forge/page.ts`, `selection.duplicate`), the world's facade nodes left out
 * as `placementsOf` leaves them (`../packages/viewer/src/worldFacadeProps` `isWorldFacadeProp`) -- is classified by
 * `classifyPlacement`. It prints a table, and a JSON object (`--json <path>` writes it to a file instead). It exits 0
 * whatever it finds; a map that does not load is listed as failed. Nothing of the disc is written but the counts, the
 * props' model names, the axis lengths and the placements' places.
 *
 * The disc: `SOCOM_DISC` (the directory holding `RUN/`), else `<SOCOM_PC_ROOT>/game/disc`, as the disc-backed tests
 * find it (`packages/viewer/test/campaignZanimDisc.test.ts`, `FsAssetSource`); else the image `SOCOM_ISO`, read by
 * range as `tools/map-validation.ts` reads it (`IsoAssetSource`). From `socomlegacy/`:
 *   SOCOM_DISC=<dir> npx tsx tools/forgePlacementCensus.ts [--json <path>] [--maps MP2,M51]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cleanError, openDisc, parseCensusArgs } from './censusDisc';
import {
  PIECE_ORTHO_TOLERANCE_ADAPTATION, PIECE_SCALE_EPSILON_ADAPTATION, PIECE_SCALE_MAX_ADAPTATION, PIECE_SCALE_MIN_ADAPTATION,
} from '@s2u/creator-contracts';

// The shared check's numbers, imported from it (`packages/creator-contracts/src/pieceMatrix.ts`, `pieceMatrixError`),
// never restated: the census refuses what the lobby's create refuses.
/** The least axis length the shared check admits. */
export const CENSUS_SCALE_MIN = PIECE_SCALE_MIN_ADAPTATION;
/** The greatest axis length the shared check admits. */
export const CENSUS_SCALE_MAX = PIECE_SCALE_MAX_ADAPTATION;
/** The greatest absolute cosine between two axis columns the shared check admits. */
export const CENSUS_ORTHO_TOLERANCE = PIECE_ORTHO_TOLERANCE_ADAPTATION;
/** The relative slack on the scale range the shared check allows. */
export const CENSUS_SCALE_EPSILON = PIECE_SCALE_EPSILON_ADAPTATION;

// The census's own thresholds (the FX-7 brief's), for reporting only: they refuse nothing.
/** A placement whose up axis leans further than this from the vertical is tilted (a pitch or a roll). */
export const CENSUS_TILT_DEGREES = 0.5;
/** A placement with an axis length further than this from 1 is scaled. */
export const CENSUS_SCALE_TOLERANCE = 0.005;
/** The refused placements listed in full, over every map; the rest are counted. */
export const CENSUS_REFUSED_CAP = 200;
/** The commonest non-unit scale triples kept per map. */
export const CENSUS_SCALES_KEPT = 10;

/**
 * What a placement's matrix is. `yaw` alone, or every other that holds: `tilted` and `scaled` the shared check admits;
 * `mirrored`, `sheared`, `outOfRange`, `badBottomRow` and `nonFinite` it refuses.
 */
export type PlacementClass = 'yaw' | 'tilted' | 'scaled' | 'mirrored' | 'sheared' | 'outOfRange' | 'badBottomRow' | 'nonFinite';
export const PLACEMENT_CLASSES: readonly PlacementClass[] = ['yaw', 'tilted', 'scaled', 'mirrored', 'sheared', 'outOfRange', 'badBottomRow', 'nonFinite'];
export const REFUSING_CLASSES: ReadonlySet<PlacementClass> = new Set(['mirrored', 'sheared', 'outOfRange', 'badBottomRow', 'nonFinite']);

export interface PlacementClassification {
  /** In `PLACEMENT_CLASSES` order. */
  classes: PlacementClass[];
  /** The x, y and z axis columns' lengths. */
  lengths: [number, number, number];
  /** X . (Y x Z) of the three axis columns. */
  determinant: number;
  /** The largest absolute cosine between two axis columns; null when an axis has no length. */
  maxCosine: number | null;
  /** The angle between the y axis column and the vertical, degrees; null when it has no length. */
  tiltDegrees: number | null;
  /** The x axis column's heading about the vertical, degrees; null when it has no horizontal part. */
  yawDegrees: number | null;
  /** The shared check's first reason to refuse it, in that check's order and words; null when it admits it. */
  refusal: string | null;
}

const AXES = ['x', 'y', 'z'] as const;
const DEG = 180 / Math.PI;

/**
 * Classifies the column-major 4x4 at `m[at..at+15]` (three's `Matrix4.elements`; a `LoadedMap` prop's placement). Pure.
 * The refusal follows `pieceMatrixError` (`@s2u/creator-contracts`, `src/pieceMatrix.ts`) check for check: every
 * entry finite, the bottom row exactly 0, 0, 0, 1, every axis length within 0.1..4 (with its slack), the axes mutually
 * perpendicular, the determinant above 0.
 */
export function classifyPlacement(m: ArrayLike<number>, at = 0): PlacementClassification {
  const e = (i: number): number => m[at + i]!;
  const cols = [0, 4, 8].map((c) => [e(c), e(c + 1), e(c + 2)] as const);
  const lengths = cols.map(([x, y, z]) => Math.hypot(x, y, z)) as [number, number, number];
  const [xx, xy, xz] = cols[0]!, [yx, yy, yz] = cols[1]!, [zx, zy, zz] = cols[2]!;
  const determinant = xx * (yy * zz - yz * zy) + xy * (yz * zx - yx * zz) + xz * (yx * zy - yy * zx);
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(e(i))) {
      return { classes: ['nonFinite'], lengths, determinant, maxCosine: null, tiltDegrees: null, yawDegrees: null, refusal: `entry ${i} is not a finite number` };
    }
  }
  const hasLength = lengths.every((l) => l > 1e-12);
  let maxCosine: number | null = null;
  if (hasLength) {
    maxCosine = 0;
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) {
      const [ax, ay, az] = cols[a]!, [bx, by, bz] = cols[b]!;
      maxCosine = Math.max(maxCosine, Math.abs(ax * bx + ay * by + az * bz) / (lengths[a] * lengths[b]));
    }
  }
  const tiltDegrees = lengths[1] > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, yy / lengths[1]))) * DEG : null;
  const yawDegrees = Math.hypot(xx, xz) > 1e-12 ? Math.atan2(-xz, xx) * DEG : null;
  const badBottomRow = e(3) !== 0 || e(7) !== 0 || e(11) !== 0 || e(15) !== 1;
  const outOfRange = lengths.some((l) => !(l >= CENSUS_SCALE_MIN * (1 - CENSUS_SCALE_EPSILON)) || l > CENSUS_SCALE_MAX * (1 + CENSUS_SCALE_EPSILON));
  const sheared = maxCosine !== null && maxCosine > CENSUS_ORTHO_TOLERANCE;
  const mirrored = determinant < 0;
  const flags: Record<Exclude<PlacementClass, 'yaw' | 'nonFinite'>, boolean> = {
    tilted: tiltDegrees !== null && tiltDegrees > CENSUS_TILT_DEGREES,
    scaled: lengths.some((l) => Math.abs(l - 1) > CENSUS_SCALE_TOLERANCE),
    mirrored, sheared, outOfRange, badBottomRow,
  };
  const classes: PlacementClass[] = PLACEMENT_CLASSES.filter((c) => c in flags && flags[c as keyof typeof flags]);
  let refusal: string | null = null;
  if (badBottomRow) refusal = 'the bottom row is not 0, 0, 0, 1';
  else {
    for (const [k, l] of lengths.entries()) {
      if (refusal) break;
      if (!(l >= CENSUS_SCALE_MIN * (1 - CENSUS_SCALE_EPSILON))) refusal = `the ${AXES[k]} axis scale ${l} is under ${CENSUS_SCALE_MIN}`;
      else if (l > CENSUS_SCALE_MAX * (1 + CENSUS_SCALE_EPSILON)) refusal = `the ${AXES[k]} axis scale ${l} is over ${CENSUS_SCALE_MAX}`;
    }
    if (!refusal && !(maxCosine !== null && maxCosine <= CENSUS_ORTHO_TOLERANCE)) {
      refusal = 'two axes are not perpendicular (a shear)';
    }
    if (!refusal && !(determinant > 0)) refusal = 'the piece is mirrored (a negative determinant)';
  }
  return { classes: classes.length ? classes : ['yaw'], lengths, determinant, maxCosine, tiltDegrees, yawDegrees, refusal };
}

/** A prop entry as the census reads it: `LoadedMap.props[number]`'s model name, placements and draw flags. */
export interface CensusProp {
  modelName: string;
  matrices: ArrayLike<number>;
  /** `m_facade`: non-zero, the placement is turned to the camera each frame. */
  facade?: number;
  /** The LOD band, or null: one placement of a LOD pair is listed once per entry. */
  lod?: unknown;
}

/** A placement the shared check would refuse. */
export interface RefusedPlacement {
  map: string;
  prop: string;
  /** Its index among its prop entry's placements. */
  index: number;
  classes: PlacementClass[];
  lengths: [number, number, number];
  refusal: string;
  /** Its place (the matrix's translation), rounded to 0.01. */
  at: [number, number, number];
}

export interface MapPlacementCensus {
  map: string;
  campaign: boolean;
  status: 'ok' | 'failed';
  error?: string;
  /** Prop entries counted (the world's facade nodes left out). */
  props: number;
  placements: number;
  /** Per class: placements with that class (a placement can carry several; `yaw` only alone). */
  counts: Record<PlacementClass, number>;
  /** Placements the shared check refuses. */
  refused: number;
  /** Placements of an `m_facade` entry, and of an entry with a LOD band (a LOD pair's place counted once per entry). */
  facadePlacements: number;
  lodPlacements: number;
  maxTiltDegrees: number;
  /** The least and greatest axis length over every finite placement; null with none. */
  axisMin: number | null;
  axisMax: number | null;
  /** The commonest scale triples among the scaled placements (lengths rounded to 0.001), most first. */
  scales: { lengths: string; count: number }[];
  refusedList: RefusedPlacement[];
}

const zeroCounts = (): Record<PlacementClass, number> =>
  Object.fromEntries(PLACEMENT_CLASSES.map((c) => [c, 0])) as Record<PlacementClass, number>;
const round = (n: number, places: number): number => { const f = 10 ** places; return Math.round(n * f) / f; };

/** One map's census from its prop entries (the caller leaves out the world's facade nodes). Pure. */
export function censusOfProps(map: string, campaign: boolean, props: readonly CensusProp[]): MapPlacementCensus {
  const row: MapPlacementCensus = {
    map, campaign, status: 'ok', props: props.length, placements: 0, counts: zeroCounts(), refused: 0, facadePlacements: 0,
    lodPlacements: 0, maxTiltDegrees: 0, axisMin: null, axisMax: null, scales: [], refusedList: [],
  };
  const scales = new Map<string, number>();
  for (const p of props) {
    const n = Math.floor(p.matrices.length / 16);
    for (let i = 0; i < n; i++) {
      const c = classifyPlacement(p.matrices, i * 16);
      row.placements++;
      for (const k of c.classes) row.counts[k]++;
      if (p.facade) row.facadePlacements++;
      if (p.lod !== null && p.lod !== undefined) row.lodPlacements++;
      if (c.tiltDegrees !== null) row.maxTiltDegrees = Math.max(row.maxTiltDegrees, c.tiltDegrees);
      if (c.lengths.every(Number.isFinite)) {
        const lo = Math.min(...c.lengths), hi = Math.max(...c.lengths);
        row.axisMin = row.axisMin === null ? lo : Math.min(row.axisMin, lo);
        row.axisMax = row.axisMax === null ? hi : Math.max(row.axisMax, hi);
      }
      if (c.classes.includes('scaled')) {
        const key = c.lengths.map((l) => round(l, 3)).join('/');
        scales.set(key, (scales.get(key) ?? 0) + 1);
      }
      if (c.refusal !== null) {
        row.refused++;
        const base = i * 16;
        row.refusedList.push({
          map, prop: p.modelName, index: i, classes: c.classes, lengths: c.lengths.map((l) => round(l, 4)) as [number, number, number],
          refusal: c.refusal, at: [12, 13, 14].map((k) => round(Number(p.matrices[base + k]), 2)) as [number, number, number],
        });
      }
    }
  }
  row.scales = [...scales].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, CENSUS_SCALES_KEPT)
    .map(([lengths, count]) => ({ lengths, count }));
  return row;
}

/** A map that did not load. */
export function failedPlacementMap(map: string, campaign: boolean, error: string): MapPlacementCensus {
  return { ...censusOfProps(map, campaign, []), status: 'failed', error };
}

export interface PlacementCensusReport {
  /** The thresholds the census used. */
  thresholds: { scaleMin: number; scaleMax: number; orthoTolerance: number; tiltDegrees: number; scaleTolerance: number };
  /** Each map without its refused list (that is `refused`, over every map). */
  maps: Omit<MapPlacementCensus, 'refusedList'>[];
  total: {
    maps: number; failed: string[]; props: number; placements: number; counts: Record<PlacementClass, number>; refused: number;
    maxTiltDegrees: number; axisMin: number | null; axisMax: number | null;
    /** The maps with any refused placement. */
    mapsWithRefused: string[];
  };
  /** The first `CENSUS_REFUSED_CAP` refused placements, map by map; `refusedMore` counts the rest. */
  refused: RefusedPlacement[];
  refusedMore: number;
}

/** The report over every map's census. Pure. */
export function buildPlacementReport(rows: readonly MapPlacementCensus[], cap = CENSUS_REFUSED_CAP): PlacementCensusReport {
  const counts = zeroCounts();
  const all: RefusedPlacement[] = [];
  let props = 0, placements = 0, refused = 0, maxTilt = 0;
  let axisMin: number | null = null, axisMax: number | null = null;
  for (const r of rows) {
    props += r.props; placements += r.placements; refused += r.refused; maxTilt = Math.max(maxTilt, r.maxTiltDegrees);
    for (const k of PLACEMENT_CLASSES) counts[k] += r.counts[k];
    if (r.axisMin !== null) axisMin = axisMin === null ? r.axisMin : Math.min(axisMin, r.axisMin);
    if (r.axisMax !== null) axisMax = axisMax === null ? r.axisMax : Math.max(axisMax, r.axisMax);
    all.push(...r.refusedList);
  }
  return {
    thresholds: {
      scaleMin: CENSUS_SCALE_MIN, scaleMax: CENSUS_SCALE_MAX, orthoTolerance: CENSUS_ORTHO_TOLERANCE,
      tiltDegrees: CENSUS_TILT_DEGREES, scaleTolerance: CENSUS_SCALE_TOLERANCE,
    },
    maps: rows.map(({ refusedList: _r, ...rest }) => rest),
    total: {
      maps: rows.length, failed: rows.filter((r) => r.status === 'failed').map((r) => r.map), props, placements, counts, refused,
      maxTiltDegrees: maxTilt, axisMin, axisMax, mapsWithRefused: rows.filter((r) => r.refused > 0).map((r) => r.map),
    },
    refused: all.slice(0, cap),
    refusedMore: Math.max(0, all.length - cap),
  };
}

const COLUMNS: readonly [PlacementClass, string][] = [
  ['yaw', 'yaw'], ['tilted', 'tilt'], ['scaled', 'scale'], ['mirrored', 'mirror'], ['sheared', 'shear'],
  ['outOfRange', 'range'], ['badBottomRow', 'row'], ['nonFinite', 'nan'],
];

/** The short text table: a line per map and the total, then the refused placements. Pure. */
export function renderPlacementTable(report: PlacementCensusReport): string {
  const head = ['map'.padEnd(6), 'props'.padStart(6), 'places'.padStart(7), ...COLUMNS.map(([, h]) => h.padStart(7)),
    'refused'.padStart(8), 'maxTilt'.padStart(8), 'axisMin'.padStart(8), 'axisMax'.padStart(8)].join(' ');
  const fmt = (n: number | null): string => (n === null ? '-' : String(round(n, 3)));
  const line = (name: string, r: { props: number; placements: number; counts: Record<PlacementClass, number>; refused: number; maxTiltDegrees: number; axisMin: number | null; axisMax: number | null }): string =>
    [name.padEnd(6), String(r.props).padStart(6), String(r.placements).padStart(7), ...COLUMNS.map(([k]) => String(r.counts[k]).padStart(7)),
      String(r.refused).padStart(8), fmt(r.maxTiltDegrees).padStart(8), fmt(r.axisMin).padStart(8), fmt(r.axisMax).padStart(8)].join(' ');
  const out = [head];
  for (const m of report.maps) out.push(m.status === 'failed' ? `${m.map.padEnd(6)} FAILED: ${m.error ?? ''}` : line(m.map, m));
  out.push(line('TOTAL', report.total));
  if (report.total.failed.length) out.push(`failed to load: ${report.total.failed.join(', ')}`);
  out.push('', `refused by the shared check (mirrored, sheared, scale outside ${CENSUS_SCALE_MIN}..${CENSUS_SCALE_MAX}, bad bottom row): ${report.total.refused}`);
  for (const r of report.refused) out.push(`  ${r.map} ${r.prop}#${r.index} ${r.classes.join('+')} axes ${r.lengths.join('/')} at ${r.at.join(',')}: ${r.refusal}`);
  if (report.refusedMore > 0) out.push(`  ... and ${report.refusedMore} more`);
  return out.join('\n');
}

async function main(argv: readonly string[]): Promise<void> {
  let args: ReturnType<typeof parseCensusArgs>;
  try { args = parseCensusArgs(argv); } catch (e) {
    console.error(`forgePlacementCensus: ${(e as Error).message}\nusage: npx tsx tools/forgePlacementCensus.ts [--json <path>] [--maps MP2,M51]`);
    process.exitCode = 2;
    return;
  }
  const disc = await openDisc();
  if (!disc) {
    console.error('forgePlacementCensus: no disc -- set SOCOM_DISC (the directory holding RUN/), SOCOM_PC_ROOT or SOCOM_ISO');
    process.exitCode = 2;
    return;
  }
  const { archivesOf } = await import('../packages/viewer/src/forge/catalog');
  const { loadMap } = await import('../packages/viewer/src/loadMap');
  const { isWorldFacadeProp } = await import('../packages/viewer/src/worldFacadeProps');
  let archives = archivesOf(await disc.source.list());
  const only = args.maps;
  if (only) archives = archives.filter((a) => only.includes(a.stem));
  const rows: MapPlacementCensus[] = [];
  for (const a of archives) {
    const t = Date.now();
    try {
      const map = await loadMap(disc.source, a.path);
      rows.push(censusOfProps(a.stem, a.campaign, map.props.filter((p) => !isWorldFacadeProp(p))));
      console.error(`${a.stem}: ${rows[rows.length - 1]!.placements} placements, ${Date.now() - t} ms`);
    } catch (e) {
      rows.push(failedPlacementMap(a.stem, a.campaign, cleanError(e, disc.root)));
      console.error(`${a.stem}: FAILED after ${Date.now() - t} ms`);
    }
  }
  const report = buildPlacementReport(rows);
  console.log(renderPlacementTable(report));
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(report, null, 2));
    console.log(`\nJSON written to ${args.json}`);
  } else console.log(`\n${JSON.stringify(report, null, 2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // A map that fails to load is a finding (exit 0); only the census's own crash exits 1.
  main(process.argv.slice(2)).catch((e: unknown) => { console.error(e); process.exitCode = 1; });
}
