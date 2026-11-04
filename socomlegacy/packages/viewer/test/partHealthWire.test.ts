import { describe, expect, it } from 'vitest';
import { freshHealth, MP_HEALTH, PART } from '../src/net/damage';
import {
  healthTold, PART_HEALTH_INTERVAL_TICKS_READING, partHealthBytes, partHealthOf, partHealthWire, TEAM_HEALTH_RECIPIENTS_ADAPTATION, TICK_HZ,
  type ServerEvent,
} from '../src/net/protocol';

/**
 * NU-3c (research 321 section 4.2.1): another seat's health on the wire -- the SealObject's six part bytes 0x82-0x87 as
 * the owner writes them (`FUN_002bd640` D:L161982-162034) and every other console reads them back (`FUN_002be150`
 * D:L162325-162347 -> `FUN_005a5790`), the bar's total made from them (`FUN_005a56d0` D:L461416-461437, 0 with the head
 * or the body at 0: `FUN_005a54d0` D:L461376-461380).
 */
describe('a seat\'s part health on the wire (NU-3c)', () => {
  it('writes each part as ceilf(clamp(hp / max, 0, 1) x 255), in PART order', () => {
    expect(partHealthBytes(freshHealth())).toEqual([255, 255, 255, 255, 255, 255]);
    const h = freshHealth();
    h.hp[PART.HEAD] = 4;                                        // 4 / 8 x 255 = 127.5 -> 128 (the ceiling, not the nearest)
    h.hp[PART.BODY] = 25;                                       // 25 / 50 -> 128, the body is index 3 (PART), not the wire's second
    h.hp[PART.RLEG] = 0.01;                                     // 0.01 / 30 x 255 = 0.085 -> 1: a sliver is never 0
    h.hp[PART.LARM] = -3;                                       // clamped at 0 (FUN_00267a60, the bound 0.0 at 0x3de768)
    h.hp[PART.RARM] = 31;                                       // clamped at 1 (the bound 1.0 at 0x3de770)
    expect(partHealthBytes(h)).toEqual([128, 255, 0, 128, 1, 255]);
  });

  it('a byte is never more than the ratio x 255 rounded up (FUN_001b3470 is ceilf)', () => {
    const h = freshHealth();
    for (let hp = 0; hp <= MP_HEALTH[PART.BODY]!; hp += 0.37) {
      h.hp[PART.BODY] = hp;
      const b = partHealthBytes(h)[PART.BODY]!;
      expect(b).toBe(Math.ceil(Math.fround(Math.fround(Math.fround(hp) / 50) * 255)));   // the EE's single precision
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });

  it('reads the bar\'s total back from the six bytes: (3 head + the rest) / (3 head max + the rest), each part max x byte / 255', () => {
    expect(partHealthOf([255, 255, 255, 255, 255, 255])).toBe(1);
    const k = Math.fround(0.003921569);
    const part = (i: number, b: number): number => Math.fround(MP_HEALTH[i]! * Math.fround(b * k));
    const want = (3 * part(0, 128) + part(1, 255) + part(2, 0) + part(3, 128) + part(4, 1) + part(5, 255)) / (3 * 8 + 30 + 30 + 50 + 30 + 30);
    expect(partHealthOf([128, 255, 0, 128, 1, 255])).toBeCloseTo(want, 9);
  });

  it('reads 0 with the head or the body at 0, whatever the rest (FUN_005a54d0)', () => {
    expect(partHealthOf([0, 255, 255, 255, 255, 255])).toBe(0);
    expect(partHealthOf([255, 255, 255, 0, 255, 255])).toBe(0);
    expect(partHealthOf([255, 0, 0, 255, 0, 0])).toBeGreaterThan(0);
  });

  it('round-trips a wound as another console would draw it: the six bytes, not the total quantised once more', () => {
    const h = freshHealth();
    h.hp[PART.HEAD] = 5.2; h.hp[PART.BODY] = 17.4; h.hp[PART.LLEG] = 2.9;
    const total = partHealthOf(partHealthBytes(h));
    const k = Math.fround(0.003921569);
    const bytes = partHealthBytes(h);
    const parts = bytes.map((b, i) => Math.fround(MP_HEALTH[i]! * Math.fround(b * k)));
    expect(total).toBeCloseTo((3 * parts[0]! + parts[1]! + parts[2]! + parts[3]! + parts[4]! + parts[5]!) / 194, 9);
  });

  it('is told to the seat\'s side and the spectators, never to the other side (TEAM_HEALTH_RECIPIENTS_ADAPTATION)', () => {
    expect(TEAM_HEALTH_RECIPIENTS_ADAPTATION).toMatch(/side/);
    expect(healthTold('seal', 'seal')).toBe(true);
    expect(healthTold('terrorist', 'terrorist')).toBe(true);
    expect(healthTold('seal', 'terrorist')).toBe(false);
    expect(healthTold('terrorist', 'seal')).toBe(false);
    expect(healthTold('seal', null)).toBe(true);                // a spectator
  });

  it('a byte goes again on the first frame past 100 whole milliseconds (research 193 section 12.4; FUN_0061a488, FUN_0063d2d8)', () => {
    expect(PART_HEALTH_INTERVAL_TICKS_READING).toBe(7);
    // Six frames reach 100 whole ms but not past it at 60 Hz; seven are past (the strict `lastSent + 100 < now`).
    expect(Math.floor(((PART_HEALTH_INTERVAL_TICKS_READING - 1) * 1000) / TICK_HZ)).toBeLessThanOrEqual(100);
    expect(Math.floor((PART_HEALTH_INTERVAL_TICKS_READING * 1000) / TICK_HZ)).toBeGreaterThan(100);
  });

  it("the event is a seat's id and its six bytes (additive under protocol 11)", () => {
    const ev = { type: 'health', id: 3, parts: [255, 255, 255, 128, 255, 255] } satisfies ServerEvent;
    expect(JSON.parse(JSON.stringify(ev))).toEqual(ev);
  });

  it('takes a wire `parts` only as six integers 0..255, a copy (partHealthWire); anything else is none', () => {
    const wire = [255, 255, 255, 128, 255, 255];
    const got = partHealthWire(wire);
    expect(got).toEqual(wire);
    expect(got).not.toBe(wire);
    for (const bad of [null, undefined, 'x', 7, {}, [255, 255, 255, 255, 255], [255, 255, 255, 255, 255, 255, 255],
      [256, 0, 0, 0, 0, 0], [-1, 0, 0, 0, 0, 0], [1.5, 0, 0, 0, 0, 0], ['1', 0, 0, 0, 0, 0], [Number.NaN, 0, 0, 0, 0, 0]]) {
      expect(partHealthWire(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
