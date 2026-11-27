// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gridCast, launchGrenade, M67, stepGrenade } from '@s2u/scene';
import { GAME_FRAME_DT } from '../../scene/src/gameFrame';
import { blastPoint } from '../../viewer/src/net/blast';
import { roomOn } from './sceneRoundsDisc';

/**
 * WM-29 (research 430 s2; simulation track, reading, pending review), dev disc: the one recorded case of the port's
 * blast passing a wall (a recording of the PORT, v0.4.22, MP12, read on the hub by seat numbers only; WM.R19). An M67
 * thrown from (1349.4, 120.2, 1381.5) at (-45.8, 10.2, 27.4) bounces off `worldmodel/cbigbase` (STONE) and comes to rest
 * 0.037 u from its face; its thrower, standing at (1299.6, 97.1, 1514.6) behind 11.5 u of that stone, 105.7 u from the
 * burst, died of it. Here the throw is flown again with the room's own flight over MP12's own hull to its burst, and
 * the room's own line test (`blastLines`, private, called as the room calls it for a SEAL standing) is asked: the wall
 * must shelter him -- the original's line runs from the round's own lifted point (`FUN_005ac070` D:L464853, research
 * 179 s8.9). RED on the trunk: the room started both lines 0.1 toward the body, past the face. Skips without the disc
 * (a skip, not a pass).
 */
const DISC = [process.env.SOCOM_DISC, process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game/disc') : undefined]
  .find((d) => !!d && existsSync(join(d, 'RUN/MP12.ZDB')) && existsSync(join(d, 'RUN/ZWEAPON.ZAR')));

type V3 = [number, number, number];
type Lines = { blastLines(point: V3, feet: V3, posture: 'stand' | 'crouch' | 'prone', radius: number): boolean };

describe.skipIf(!DISC)(`WM-29: MP12's recorded M67 at rest against cbigbase (dev disc${DISC ? '' : ': SOCOM_DISC / SOCOM_PC_ROOT absent -- skipped'})`, () => {
  it('RED: the stone wall it rests against shelters the body behind it', async () => {
    const { room } = await roomOn(DISC!, 'MP12');
    const map = (room as unknown as { map: { grid: Parameters<typeof gridCast>[0]; defaultMaterial?: string } }).map;
    const g = launchGrenade([1349.4, 120.2, 1381.5], [-45.8, 10.2, 27.4], M67);
    const cast = gridCast(map.grid, map.defaultMaterial ?? '');
    let burst: V3 | null = null;
    for (let i = 0; i < 2000 && !burst; i++) for (const e of stepGrenade(g, GAME_FRAME_DT, cast)) if (e.kind === 'explode') burst = [e.point[0], e.point[1], e.point[2]];
    expect(burst).not.toBeNull();
    // The re-flight lands where the recording says it went off (research 430 s2: within 2 ticks of the kill).
    expect(Math.hypot(burst![0] - 1303.2, burst![2] - 1409.0)).toBeLessThan(0.5);
    const feet: V3 = [1299.6, 97.1, 1514.6];
    expect((room as unknown as Lines).blastLines(blastPoint(burst!), feet, 'stand', M67.explosionRadius)).toBe(false);
  });
});
