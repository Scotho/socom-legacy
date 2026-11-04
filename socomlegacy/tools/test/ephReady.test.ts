import { describe, expect, it } from 'vitest';
import {
  PAGE_READY_EXPRESSION, PAGE_STATE_EXPRESSION, STANCE_REQUEST_SEEN, pageNotReadyMessage, startStanceMismatch, startStancesOf,
} from '../eph/ready';

/**
 * The two readiness checks before a run's script starts (EPH-2, the first complete live run 20261031T010239Z): the page
 * in play with its input live (not under the loading screen's hold), and both sides in the same stance. Product track
 * (OT.R53): an instrument's checks, nothing of the game's.
 */
describe('the page-ready wait', () => {
  it('waits for the walk AND the loading hold released AND the ARMORY shut, through the existing __viewer reads', () => {
    expect(PAGE_READY_EXPRESSION).toContain('window.__viewer.ephFrame().walking');
    expect(PAGE_READY_EXPRESSION).toContain('!window.__viewer.loading().blocked');
    expect(PAGE_READY_EXPRESSION).toContain('!window.__viewer.armory().open');
  });

  it('reads the same three facts for the timeout line', () => {
    for (const read of ['ephFrame()', 'loading().blocked', 'armory().open']) expect(PAGE_STATE_EXPRESSION).toContain(read);
  });

  it('names what still holds the page on a timeout', () => {
    expect(pageNotReadyMessage({ viewer: true, walking: true, loadingBlocked: true, armoryOpen: false }, 180_000)).toBe(
      'EPH run: the page was not in play within 180 s: the loading screen still holds the input (__viewer.loading().blocked); '
      + 'the script would land on the map briefing',
    );
    expect(pageNotReadyMessage({ viewer: true, walking: true, loadingBlocked: false, armoryOpen: true }, 180_000)).toMatch(/the ARMORY is open/);
    expect(pageNotReadyMessage({ viewer: true, walking: false, loadingBlocked: false, armoryOpen: false }, 180_000)).toMatch(/the walk is off/);
    expect(pageNotReadyMessage({ viewer: false, walking: false, loadingBlocked: false, armoryOpen: false }, 180_000)).toMatch(/no __viewer/);
    expect(pageNotReadyMessage(null, 180_000)).toMatch(/its state could not be read/);
  });
});

describe('the start stances', () => {
  it('the stance request byte: 0 and 2 as run 20261031T010239Z saw them, 1 not seen', () => {
    expect(STANCE_REQUEST_SEEN).toEqual({ 0: 'stand', 2: 'prone' });
  });

  it('PCSX2 by its root y band (seal_speed_fit stance_of), the page by ephFrame().stance; equal ones match', () => {
    const s = startStancesOf({ rootY: 5.51, stanceRequest: 0 }, { stance: 'crouch' });
    expect(s).toMatchObject({ pcsx2: { stance: 'crouch', rootY: 5.51, stanceRequest: 0 }, page: { stance: 'crouch' }, match: true });
    expect(startStanceMismatch(s)).toBeNull();
  });

  it('refuses the 2026-10-31 run: PCSX2 prone (root 2.168, request 2) while the page stood', () => {
    const s = startStancesOf({ rootY: 2.16796875, stanceRequest: 2 }, { stance: 'stand' });
    expect(s.match).toBe(false);
    expect(startStanceMismatch(s)).toBe(
      'EPH run: the two sides start in different stances: PCSX2 prone (root y 2.168, by the root bands; stance request 2 = prone as seen) '
      + 'and the page stand (ephFrame().stance); save a state in the page\'s stance, or set the page\'s, then run again',
    );
  });

  it('refuses a root in no band (between stances) and says so; an r0004 row (no request byte) is read by the root alone', () => {
    const between = startStancesOf({ rootY: 8, stanceRequest: 0 }, { stance: 'stand' });
    expect(between.match).toBe(false);
    expect(startStanceMismatch(between)).toMatch(/PCSX2 unknown \(root y 8, in no band/);
    const r4 = startStancesOf({ rootY: 11.48, stanceRequest: null }, { stance: 'stand' });
    expect(r4.match).toBe(true);
    expect(r4.pcsx2.by).toMatch(/stance request not read on this build/);
  });
});
