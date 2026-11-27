import { describe, expect, it } from 'vitest';
import { xboxSessionPlan } from '../e2e/xboxSessionPlan';

describe('Xbox desktop session scheduling', () => {
  it('keeps the default case and independent cleanup backstop bounded', () => {
    expect(xboxSessionPlan(undefined)).toEqual({ soakSeconds: 30, timeoutMs: 240000, jobSeconds: 300, memorySamples: 310 });
  });
  it('allows ten minutes of observation without the old five-minute job expiry', () => {
    const plan = xboxSessionPlan('600');
    expect(plan.timeoutMs).toBe(810000);
    expect(plan.jobSeconds * 1000 - plan.timeoutMs).toBe(60000);
    expect(plan.memorySamples).toBeGreaterThan(plan.jobSeconds);
  });
  it('allows a fifteen-minute soak inside the existing job and evidence limits', () => {
    const plan = xboxSessionPlan('900');
    expect(plan).toEqual({ soakSeconds: 900, timeoutMs: 1110000, jobSeconds: 1170, memorySamples: 1180 });
    expect(plan.jobSeconds).toBeLessThanOrEqual(1800);
    expect(Math.ceil(plan.jobSeconds * 2)).toBeLessThan(4096);
    expect(plan.memorySamples).toBeLessThanOrEqual(1800);
  });
  it.each(['', 'NaN', '-1', '29', '30.5', '901', 'Infinity'])('rejects invalid duration %j before launching processes', value => {
    expect(() => xboxSessionPlan(value)).toThrow('XBOX_SOAK_SECONDS');
  });
});
