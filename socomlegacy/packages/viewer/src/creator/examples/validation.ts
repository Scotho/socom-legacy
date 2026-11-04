import type { LoadedMap } from '../../loadMap';
import { layoutGround, prototypePolygons, type PieceHull } from '../../forge/ground';
import { groundWithout, placementsOf } from '../../forge/hide';
import { archiveStem, parseAssetId } from '../../forge/layout';
import { layoutOfRecord, type LayoutRecord } from '../../forge/record';
import { checkMap, type CheckedPiece } from '../../forge/validate';
import type { StarterDiagnostic } from './index';

/** Authored starter adaptation: validate the completed replacement, using exactly the Forge's source hull reader,
 * hull composer and actor checks. Per-piece placement checks cannot establish actor clearance after all props exist. */
export function checkStarterLayout(record: LayoutRecord, base: LoadedMap | null, maps: readonly LoadedMap[]): StarterDiagnostic[] {
  if (!base?.ground) return [{ code: 'NO_SAFE_FLOOR', message: 'The completed starter needs the loaded base collision ground.' }];
  const layout = layoutOfRecord(record), pieces: CheckedPiece[] = [], hulls: PieceHull[] = [];
  for (const [index, piece] of layout.pieces.entries()) {
    const parsed = parseAssetId(piece.asset), source = parsed ? maps.find(m => archiveStem(m.archive) === parsed.archive) : null;
    if (!source || !parsed) return [{ code: 'ASSET_UNAVAILABLE', message: 'A completed starter piece has no loaded source archive.' }];
    const polys = prototypePolygons(source, parsed.model);
    if (!polys?.length) return [{ code: 'COLLISION_UNAVAILABLE', message: 'A completed starter piece has no actual collision hull.' }];
    const owner = `starter:${index}`;
    pieces.push({ index, asset: piece.asset, m: piece.m, polys, owner });
    hulls.push({ owner, m: piece.m, polys });
  }
  const original = groundWithout(base, base.ground, placementsOf(base, record.hidden ?? []));
  const ground = layoutGround(original, hulls);
  // NPCs use the same body clearance checks as player starts, on the FULL composed collision ground.
  for (const n of layout.npcs ?? []) layout.spawns.push({ team: n.side === 'seal' ? 'A' : 'B', p: [...n.p], yaw: n.yaw });
  return checkMap(layout, ground, pieces).issues.flatMap(issue => {
    // The straight-line reach instrument does not certify a route or rule out a normal way around; Play remains owed.
    if (issue.kind === 'spawn-reach') return [];
    const code = issue.kind === 'spawn-inside' || issue.kind === 'spawn-facing' ? 'ACTOR_OBSTRUCTED'
      : issue.kind === 'spawn-floor' ? 'NO_SAFE_FLOOR' : 'LAYOUT_INVALID';
    return [{ code, message: issue.text }];
  });
}
