import { describe, expect, it } from 'vitest';
import { burst, RECORDS } from './helpers/fireCadence';

/**
 * LATER 326 (#455; the merge controller's condition 1): every automatic in the kit's records (the disc's, through
 * `scene/test/golden/weapon-records.json`: a fire mode 3), held 30 s at 20, 30 and 60 fps through the viewer's own kit
 * (`Fire`, the console's timer) and named at each page frame's last command as before, judged by the room (its rate
 * clock): every refusal is listed with its weapon and frame rate, never assumed away. LATER 338: each round named at
 * the command of its own game frame's boundary (the kit's step, `Fire.update`; the walk's tick at or before it), not its
 * page frame's last. Main's code at the same rates refused rounds in 27 of the 70 (the sweep's measure, the LATER 326 Log
 * entry); LATER 326's naming, 3 at 20 fps (below).
 */
const AUTOMATICS = Object.values(RECORDS).filter((r) => r.fireModes.includes(3)).sort((a, b) => a.id - b.id);

describe("LATER 326, LATER 338: the kit's automatics held 30 s at 20, 30 and 60 fps -- every round fired", () => {
  it('the sweep covers the kit\'s automatics', () => {
    expect(AUTOMATICS.length).toBeGreaterThanOrEqual(20);
  });

  /**
   * LATER 338's three (measured 2026-10-23 under LATER 326's naming): a rate rounded up to 4 game frames (8.0 ticks) named
   * on a 20 fps page's 3-tick frames gave gaps of 9 and 6, under the 552's, the 552SD's and the AK-47's cycle (6.2, 6.7)
   * -- 74 of 225 refused 'rate'. Named at its own game frame's command, every round of all three fires.
   */
  for (const fps of [20, 30, 60]) {
    it.each(AUTOMATICS.map((r) => [r.name, r] as const))(`${fps} fps, %s: every round of 30 s held fired`, (_name, rec) => {
      const { tally, named } = burst(rec, fps, 30);
      expect(named.length).toBeGreaterThan(50);
      expect(tally, `${rec.name} at ${fps} fps`).toEqual({ fired: named.length });
    }, 120_000);
  }
});
