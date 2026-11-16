import { describe, expect, it } from 'vitest';
import { burst, RECORDS } from './helpers/fireCadence';

/**
 * SHOTGUN-PELLET-CONE (LATER 934; reading, pending review): the room judged every ray of a shotgun's pull against the
 * command's cone before the volley, while the page -- and the original -- bloom between the pellets: `FUN_005be9a0`'s
 * pellet loop (D:L475580-475677) draws each ray from the controller's cone and then calls `FUN_005c5340` (D:L475604),
 * which blooms (`FUN_005c3360`, D:L479542), so pellet k leaves by the cone bloomed by pellets 1..k-1. On 2026-11-11 the
 * room refused 46 JACKHAMMER and 10 870 pellets, never the first (`agent-mail/evidence/xbox-day-2026-11-12/
 * FIRE-CONE-REFUSALS.md`). Here the page's own kit (`Fire`, its pellet loop) and its own bloom (`Accuracy`, as
 * `matchFirearm`'s gun), each ray's claim at 0.95 of a corner of the cone it was drawn from, judged by the room through its
 * command path (`fireCadence.ts` `burst`): held (mid-burst) and pressed from rest.
 */

const JACKHAMMER = RECORDS['83']!, R870 = RECORDS['84']!;

describe("SHOTGUN-PELLET-CONE (LATER 934): an honest volley's every pellet at its own cone's corner -- none refused", () => {
  it.each([30, 60, 144])('JACKHAMMER held 3 s at %s fps (mid-burst): every pellet fired', (fps) => {
    expect(JACKHAMMER.name).toBe('JACKHAMMER');
    const s = burst(JACKHAMMER, fps, 3, undefined, { corner: true });
    expect(s.named.length, `${fps} fps`).toBeGreaterThanOrEqual(4 * 8);
    expect(s.tally, `${fps} fps: ${s.rows.filter((r) => !r.endsWith(':fired')).slice(0, 8).join(' ')}`).toEqual({ fired: s.named.length });
  }, 120_000);

  it.each([30, 60])('JACKHAMMER, 8 single pulls from rest at %s fps: every pellet fired', (fps) => {
    const s = burst(JACKHAMMER, fps, 0.1, undefined, { corner: true, presses: 8, gap: 1 });
    expect(s.named.length, `${fps} fps`).toBe(8 * 4);
    expect(s.tally, `${fps} fps: ${s.rows.filter((r) => !r.endsWith(':fired')).slice(0, 8).join(' ')}`).toEqual({ fired: s.named.length });
  }, 120_000);

  it.each([30, 60])('870, 6 pulls from rest at %s fps and held 4 s (its pump between): every pellet fired', (fps) => {
    expect(R870.name).toBe('870');
    const rest = burst(R870, fps, 0.1, undefined, { corner: true, presses: 6, gap: 1 });
    expect(rest.named.length, `${fps} fps`).toBe(6 * 4);
    expect(rest.tally, `${fps} fps: ${rest.rows.filter((r) => !r.endsWith(':fired')).slice(0, 8).join(' ')}`).toEqual({ fired: rest.named.length });
    const held = burst(R870, fps, 4, undefined, { corner: true });
    expect(held.named.length, `${fps} fps`).toBeGreaterThanOrEqual(4 * 4);
    expect(held.tally, `${fps} fps: ${held.rows.filter((r) => !r.endsWith(':fired')).slice(0, 8).join(' ')}`).toEqual({ fired: held.named.length });
  }, 120_000);
});
