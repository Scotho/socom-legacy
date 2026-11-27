import { describe, expect, it } from 'vitest';
import { aimToward, AIM_PASSES_MAX, AIM_REACH_MAX, AIM_SETTLED_DEG, turnOf, yawToward, type V3 } from '../e2e/turnWithinLaw';

/**
 * The networked specs' aim at a point (`../e2e/turnWithinLaw` `turnToward`; a test instrument, product track): R4P-301's
 * foot plant (fc1506c838; the original's, r0004 FUN_00553870) slides the feet on a standing turn, so a yaw taken once
 * from the feet before the turn ends off the point once the turn has moved them. A fake body here slides its feet
 * sideways in proportion to the turn (0.012 u a degree: ~2.2 u for a half turn, inside the 1.4-2.8 u the RC's runs saw),
 * so the aim is tested without a browser.
 */
const SLIDE_PER_DEG = 0.012;

function fakeBody(feet: V3, yaw: number) {
  const body = { feet: [...feet] as V3, yaw, turns: 0 };
  const turn = async (want: number): Promise<void> => {
    const d = turnOf(body.yaw, want);
    const r = (body.yaw * Math.PI) / 180;
    const rx = Math.cos(r), rz = -Math.sin(r);                  // the body's right (it faces -z at yaw 0), level
    const slide = SLIDE_PER_DEG * Math.abs(d) * Math.sign(d);
    body.feet = [body.feet[0] + rx * slide, body.feet[1], body.feet[2] + rz * slide];
    body.yaw = want;
    body.turns++;
  };
  return { body, turn, feet: async (): Promise<V3> => body.feet };
}

const target: V3 = [100, 0, 50];
const start: V3 = [100, 0, 65];                                    // 15 u south of the target, as the specs stand

describe('turnToward: the aim re-taken after the turn slides the feet', () => {
  it('the single-shot aim (the yaw from the feet before the turn) ends more than 3 degrees off the point', async () => {
    const { body, turn } = fakeBody(start, 180);
    await turn(yawToward(start, target));
    expect(Math.abs(turnOf(body.yaw, yawToward(body.feet, target)))).toBeGreaterThan(3);
  });

  it('aimToward ends within AIM_SETTLED_DEG (3) of the point from the feet where the turns left them', async () => {
    for (const yaw0 of [180, 90, -90, 135, 0]) {
      const { body, turn, feet } = fakeBody(start, yaw0);
      const yaw = await aimToward(target, feet, turn);
      expect(yaw).toBe(body.yaw);
      expect(Math.abs(turnOf(body.yaw, yawToward(body.feet, target)))).toBeLessThan(AIM_SETTLED_DEG);
      expect(body.turns).toBeLessThanOrEqual(AIM_PASSES_MAX);
    }
  });

  it('a body that never settles fails loudly, with the last bearing, inside the cap', async () => {
    let n = 0;
    const turns: number[] = [];
    const wander = async (): Promise<V3> => [100 + (n++ % 2 ? 5 : -5), 0, 65];
    await expect(aimToward(target, wander, async (y) => { turns.push(y); })).rejects.toThrow(/not converged.*bearing/);
    expect(turns.length).toBeLessThanOrEqual(AIM_PASSES_MAX);
  });

  it("the box's case settles: a body whose corrective turns slide it ~2 u still lands within 3 degrees", async () => {
    // the passes the release check's hostageOrder run saw: 0.00 | -1.65 | 6.29 | 7.11 (feet x 1750.3 -> 1752.1)
    const seen: V3[] = [[1750.26, 50, 1194.72], [1749.88, 50, 1193.09], [1751.9, 50, 1194.53], [1752.1, 50, 1194.43]];
    let n = 0;
    const hostage: V3 = [1750.25, 51, 1179.75];
    const yaw = await aimToward(hostage, async () => seen[Math.min(n++, seen.length - 1)]!, async () => {});
    expect(Number.isFinite(yaw)).toBe(true);
  });

  it('a target beyond AIM_REACH_MAX fails loudly when the aim settles (a 3-degree aim could graze it)', async () => {
    const far: V3 = [100, 0, 65 - 30];
    expect(30).toBeGreaterThan(AIM_REACH_MAX);
    const { turn, feet } = fakeBody(start, 180);
    await expect(aimToward(far, feet, turn)).rejects.toThrow(/beyond AIM_REACH_MAX/);
  });
});
