import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { loadMap } from '../src/loadMap';
import { NetClient, type NetWalk } from '../src/net/client';
import { LoopbackMatch, simMapOfLoaded } from '../src/net/loopback';
import type { Command, Knock } from '../src/sim';
import { campaignPathsOf, campaignStand, M51_INSERTION_MEASURED } from '../src/testroomCampaign';

/**
 * EPH campaign stand, on the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped -- and said so -- without
 * it): M51 loads with no spawn slots (its AIMAPS is not the multiplayer layout, research 200 U6), the stand gives round 1
 * its measured start, and the page's offline room (`../src/net/loopback`) spawns the player there facing +z. A browser
 * adaptation's check (`../src/testroomCampaign`); nothing here is the original's behaviour.
 */

const PC_ROOT = process.env.SOCOM_PC_ROOT;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';
const HAVE_M51 = DISC !== '' && existsSync(join(DISC, 'RUN', 'M51.ZDB'));

/** The walk as the net client drives it, recording its spawns (as `loopback.test.ts`'s). */
class Walk implements NetWalk {
  tap: ((cmd: Omit<Command, 'seq'>, feet: [number, number, number]) => void) | null = null;
  spawns: { at: readonly number[]; yaw: number }[] = [];
  feet: [number, number, number] = [0, 0, 0];
  setNetTap(tap: Walk['tap']): void { this.tap = tap; }
  respawn(at: readonly [number, number, number], yaw: number): boolean { this.spawns.push({ at, yaw }); this.feet = [at[0], at[1], at[2]]; return true; }
  nudge(dx: number, dy: number, dz: number): void { this.feet = [this.feet[0] + dx, this.feet[1] + dy, this.feet[2] + dz]; }
  setLocked(_on: boolean): void { /* not read here */ }
  knock(_k: Knock): boolean { return true; }
  tick(): void { this.tap?.({ forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 }, this.feet); }
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe.skipIf(!HAVE_M51)(`EPH campaign stand on M51${HAVE_M51 ? '' : ' (no dev disc with RUN/M51.ZDB: SOCOM_DISC or SOCOM_PC_ROOT -- skipped)'}`, () => {
  it('lists M51 among the disc listing\'s campaign paths', () => {
    const run = readdirSync(join(DISC, 'RUN')).map((f) => `RUN/${f}`);
    expect(campaignPathsOf(run).map((p) => p.toUpperCase())).toContain('RUN/M51.ZDB');
  });

  it('loads with no slots, and the offline room stands the player at the measured start facing +z', async () => {
    const map = await loadMap(new FsAssetSource(DISC), 'RUN/M51.ZDB');
    expect(map.ground).toBeTruthy();
    expect(map.slots).toEqual([]);                                   // the reason for the stand (research 200 U6)
    const sim = simMapOfLoaded(map);
    const stand = campaignStand('M51', sim.slots, null);
    expect(stand && 'slots' in stand).toBe(true);
    if (!stand || !('slots' in stand)) return;
    sim.slots = stand.slots;
    for (const rules of ['respawn', 'classic'] as const) {
      const match = new LoopbackMatch(sim, null, { rules, auto: false });
      const walk = new Walk();
      const client = new NetClient({ url: 'loopback:', map: 'M51', name: 'Solo', socket: match.socket }, walk);
      await flush();
      for (let i = 0; i < 30; i++) { walk.tick(); match.step(); }
      await flush();
      const body = match.room.player(client.id!)!;
      const st = body.sim.walker.state;
      expect([st.x, st.z], rules).toEqual([M51_INSERTION_MEASURED.x, M51_INSERTION_MEASURED.z].map((v) => expect.closeTo(v, 1)));
      expect(Math.abs(st.y - M51_INSERTION_MEASURED.y), `${rules}: the feet on the ground under the measured stand`).toBeLessThan(3);
      expect(st.yaw, rules).toBe(180);
      expect(walk.spawns.length, rules).toBeGreaterThan(0);
      match.stop();
    }
  }, 120_000);
});
