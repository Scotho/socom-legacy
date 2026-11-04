// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_FRAME_DT, type WeaponRecord } from '@s2u/scene';
import { fireFrames } from '../../viewer/src/accuracy';
import { botFireFrames } from '../src/bots/roles';

/**
 * LATER 588 (c) (simulation track; reading, pending review): a bot's bolt-action waits its fire timer AND its after-shot
 * lock, one after the other. The kit's frame (`FUN_005c0fd0`) runs the lock `kit+0x820` down while it is non-zero and
 * ends it on the frame it goes below 0, that frame and every frame of it skipping the fire branch (`bVar11 = false`,
 * D:L476550-476562); the fire timer `kit+0x81c` runs down only inside that branch (D:L476643-476647). The round's own
 * frame runs the timer down once (the round, then the run-down, D:L476637-476647), so the next round goes `fireFrames`
 * + the lock's frames after it. Was: the longer of the two (the M40A1 15 frames against 30).
 */

const PIN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json'), 'utf8')) as { records: Record<string, WeaponRecord> };
const RECORDS = Object.values(PIN.records);

/** The lock's frames: run down a game frame at a time in float32, ended on the frame it goes below 0 (D:L476550-476553). */
function lockFrames(seconds: number): number {
  const f = Math.fround, dt = f(GAME_FRAME_DT);
  let left = f(seconds), n = 0;
  do { left = f(left - dt); n++; } while (!(left < 0));
  return n;
}

describe("LATER 588 (c): a bot's bolt-action waits fire + lock frames", () => {
  const bolts = RECORDS.filter((r) => (r.reloadDelayAfterShot ?? 0) > 0);
  it('the pin holds the bolts (the M40A1, the M87ELR)', () => {
    expect(bolts.map((r) => r.name).sort()).toEqual(['M40A1', 'M87ELR']);
  });

  it.each(['M40A1', 'M87ELR'])('%s: botFireFrames = fireFrames + the lock\'s frames', (name) => {
    const r = bolts.find((x) => x.name === name)!;
    expect(botFireFrames(r, 1)).toBe(fireFrames(r.fireWait, 1) + lockFrames(r.reloadDelayAfterShot!));
  });

  it('the M40A1: 15 + 15 = 30 frames; the M87ELR: 21 + 15 = 36', () => {
    expect(botFireFrames(bolts.find((x) => x.name === 'M40A1')!, 1)).toBe(30);
    expect(botFireFrames(bolts.find((x) => x.name === 'M87ELR')!, 1)).toBe(36);
  });

  it('a weapon with no lock is its fire frames alone', () => {
    for (const r of RECORDS.filter((x) => !x.reloadDelayAfterShot && x.fireModes.length)) {
      for (const m of r.fireModes) expect(botFireFrames(r, m), `${r.name} m${m}`).toBe(fireFrames(r.fireWait, m));
    }
  });
});
