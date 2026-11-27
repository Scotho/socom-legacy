import { describe, expect, it } from 'vitest';
import { buildReport, createTracker } from '../src/playtestReport';
import { joinShotLedger, ledgerClass, type PageShot } from '../src/net/shotLedger';
import { NO_PART } from '../src/net/hitVolumes';
import type { CombatReport } from '../src/net/protocol';

/**
 * [adaptation] SHOT-LEDGER playtest instrument (B-16; never changes the game). Product track: the ?devmode playtest
 * report joins the room's combat rows that name a seq (opt-in COMBAT_REPORT) with the page's own expectation of each
 * round it sent (`PageShot`) by seq, and classes each round. Without a row that names a seq the report is as before.
 */

const labels = {
  revision: 'abc1234', map: 'RUN/MP2.ZDB', renderingBackend: 'webgl2', startedAt: '2026-10-02T00:00:00.000Z',
  savedAt: '2026-10-02T00:01:00.000Z', durationSeconds: 60,
};
const tracked = () => { const t = createTracker(); t.record({ elapsedMs: 1000, online: { state: 'online', players: 2 }, frameMs: 16 }); return t.report(); };

/** A room's fire row (`CombatReport`), the ledger's fields as `extra` gives them. */
const row = (status: CombatReport['status'], extra: Partial<CombatReport> = {}): CombatReport => ({
  type: 'combat', eventId: 1, tick: 40, round: 1, map: 'MP2', status, request: 'fire', reason: null, weapon: 62,
  attacker: { id: 1, team: 'seal' }, target: status === 'applied' ? { id: 2, team: 'terrorist' } : null, part: status === 'applied' ? 3 : null, hitLocations: null,
  distance: null, distanceMetres: null, healthBefore: null, healthAfter: null, armourBefore: null, armourAfter: null, rawDamage: null,
  damageApplied: 0, killed: false, selfDamage: false, friendlyFire: false, point: null, direction: [0, 0, 1], hitLocation: null,
  hitLocationNames: [], struckPartHealthChange: null, totalBodyPartHealthChange: null, ...extra,
});
const page = (seq: number, body: number | null, part: number | null, distance: number | null = 100): PageShot =>
  ({ seq, body, bone: body === null ? null : 7, part, distance: body === null ? null : distance });

describe('[adaptation] SHOT-LEDGER playtest instrument (B-16; never changes the game): the join and its classes', () => {
  const combat = [
    row('applied', { seq: 10, rewindTick: 50, rewindLead: null, rewindClass: 'a', worldAt: null }),
    row('applied', { seq: 11, rewindTick: 51, rewindLead: 2, rewindClass: 'a', worldAt: null }),
    row('miss', { seq: 12, rewindTick: 52, rewindLead: null, rewindClass: 'c', worldAt: 400, missBy: 1.1 }),
    row('miss', { seq: 13, rewindTick: 53, rewindLead: null, rewindClass: 'c', worldAt: 30, missBy: 0.4 }),
    row('miss', { seq: 14, reason: 'no damage', target: { id: 2, team: 'terrorist' }, part: NO_PART, rewindClass: 'a' }),
    row('rejected', { seq: 15, reason: 'cone: eye', direction: null }),
    row('miss', { seq: 17, rewindClass: 'c', worldAt: null, missBy: 30 }),
    row('miss', { seq: 18, reason: 'not alive', rewindClass: 'a' }),
  ];
  const refused = [{ seq: 16, why: 'reload or empty' }];
  const shots = [page(10, 2, 3), page(11, 2, 0), page(12, 2, 3), page(13, 2, 3, 100), page(14, 2, NO_PART), page(15, 2, 3), page(16, 2, 3), page(17, null, null), page(18, 2, 3), page(19, 2, 3)];

  it('classes each round by seq: OK, PART-DIFFERS (page head, room body), POSE-MISS, WORLD, NO-DAMAGE-BONE, REFUSED, ROOM-MISS, UNANSWERED', () => {
    const j = joinShotLedger(combat, refused, shots)!;
    expect(j.rows.map((r) => [r.seq, r.class])).toEqual([
      [10, 'OK'], [11, 'PART-DIFFERS'], [12, 'POSE-MISS'], [13, 'WORLD'], [14, 'NO-DAMAGE-BONE'], [15, 'REFUSED:cone: eye'],
      [16, 'REFUSED:reload or empty'], [17, 'OK'], [18, 'ROOM-MISS:not alive'], [19, 'UNANSWERED'],
    ]);
    expect(j.byClass).toEqual({
      OK: 2, 'PART-DIFFERS': 1, 'POSE-MISS': 1, WORLD: 1, 'NO-DAMAGE-BONE': 1, 'REFUSED:cone: eye': 1, 'REFUSED:reload or empty': 1,
      'ROOM-MISS:not alive': 1, UNANSWERED: 1,
    });
  });

  it("a POSE-MISS row keeps the room's miss distance and class beside the page's pick", () => {
    const r = joinShotLedger(combat, refused, shots)!.rows.find((x) => x.seq === 12)!;
    expect(r.page).toEqual({ body: 2, bone: 7, part: 3, distance: 100 });
    expect(r.room).toMatchObject({ status: 'miss', missBy: 1.1, rewindClass: 'c', rewindTick: 52, rewindLead: null, worldAt: 400 });
    const d = joinShotLedger(combat, refused, shots)!.rows.find((x) => x.seq === 11)!;
    expect(d.page!.part).toBe(0);
    expect(d.room).toMatchObject({ status: 'applied', part: 3, target: 2, rewindLead: 2 });
  });

  it('no row that names a seq: no ledger (an older room, or the report off)', () => {
    expect(joinShotLedger([], refused, shots)).toBeNull();
    expect(joinShotLedger([row('applied')], refused, shots)).toBeNull();
  });

  it('the saved report: a shotLedger section (rows, the count by class, the page ring\'s dropped) and its note, after the others', () => {
    const r = buildReport(labels, tracked(), { events: combat, dropped: 0, refused: { events: [{ seq: 16, request: 'fire', why: 'reload or empty' }], dropped: 0, byReason: { 'reload or empty': 1 } }, pageShots: { events: shots, dropped: 4 } });
    expect(r.shotLedger!.byClass['POSE-MISS']).toBe(1);
    expect(r.shotLedger!.rows).toHaveLength(10);
    expect(r.shotLedger!.pageDropped).toBe(4);
    expect(Object.keys(r).at(-1)).toBe('shotLedger');
    expect(r.notes.join(' ')).toMatch(/SHOT-LEDGER/);
  });

  it('the report byte for byte as before with no ledger rows: page shots alone, or combat rows with no seq', () => {
    const data = tracked();
    const plain = [row('applied')];
    expect(JSON.stringify(buildReport(labels, data, { events: plain, dropped: 0, pageShots: { events: shots, dropped: 0 } })))
      .toBe(JSON.stringify(buildReport(labels, data, { events: plain, dropped: 0 })));
    expect(JSON.stringify(buildReport(labels, data, { events: [], dropped: 0, pageShots: { events: shots, dropped: 0 } })))
      .toBe(JSON.stringify(buildReport(labels, data)));
  });

  it("F5: a room miss with no page expectation is MISS-NO-PAGE, not OK; a miss the page's cast also missed (body null) stays OK", () => {
    const miss = row('miss', { seq: 20, rewindClass: 'c', worldAt: null, missBy: 12 });
    expect(ledgerClass([miss], undefined, undefined).class).toBe('MISS-NO-PAGE');
    expect(ledgerClass([miss], undefined, page(20, null, null)).class).toBe('OK');
    const j = joinShotLedger([miss, row('miss', { seq: 21, rewindClass: 'c', worldAt: null, missBy: 3 })], [], [page(21, null, null)])!;
    expect(j.rows.map((r) => [r.seq, r.class])).toEqual([[20, 'MISS-NO-PAGE'], [21, 'OK']]);
    expect(j.byClass).toEqual({ 'MISS-NO-PAGE': 1, OK: 1 });
  });
});
