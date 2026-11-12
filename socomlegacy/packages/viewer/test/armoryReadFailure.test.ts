// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mountArmory } from '../src/matchArmory';
import { LaneRequest } from '../src/loadOwnership';

/**
 * LATER 781 (product track, the test room's instrument): a failed ARMORY read in Play mode. `show` seats the ARMORY
 * (`./matchArmory` `seat`), which waits for its data; when the worker answers the ARMORY lane with an `error` reply, that
 * reply must hand the ARMORY its empty data through the page's own hand-off (`../src/main.ts` `armoryData(null)`), as
 * the no-library branch does since FP-6's fold (PR #756 P2, `testroomContentArmory.test.ts`), so the waiting seat is
 * released (`openOrDone`) and the solo match starts (`soloAfterArmory`, the part's `done`). Before, the reply answered
 * the lane counter alone: the seat waited forever. main.ts's own error-branch line runs here against the real ARMORY
 * part, its deps faked.
 */

const MAIN = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/main.ts'), 'utf-8');

/** The worker reply handler's `error` branch, as main.ts writes it. */
function errorBranch(): string {
  const start = MAIN.indexOf("if (message.kind === 'error') {");
  expect(start).toBeGreaterThan(0);
  const end = MAIN.indexOf("if (message.kind === 'index') {", start);
  expect(end).toBeGreaterThan(start);
  return MAIN.slice(start, end);
}

function mount(log: string[]) {
  return mountArmory({
    net: () => null, map: () => ({ path: 'content/x', archive: 'x', name: 'Yard' }) as never, side: () => 'seal',
    loadouts: { type: () => 0, pending: () => null, base: () => null } as never, answer: () => undefined,
    playing: () => true, online: () => false, audio: { play: () => true, restart: () => true }, device: () => 'pad',
    done: () => { log.push('solo match starts'); },
  });
}

/** The error branch's ARMORY-lane line(s), run with main.ts's names bound to fakes. */
function runArmoryLines(messageId: number, lane: LaneRequest, armoryData: (d: null) => void, reopen = false) {
  const lines = errorBranch().split('\n').filter((l) => l.includes('armoryLane.answers(message.id)'));
  expect(lines.length).toBe(1);
  const state = { loadedArmory: -1, reopenArmory: reopen, reopenArmoryData: false, reopened: 0 };
  const run = new Function('message', 'armoryLane', 'armoryData', 'tryReopenArmory', 'state',
    `let loadedArmory = state.loadedArmory, reopenArmory = state.reopenArmory, reopenArmoryData = state.reopenArmoryData;
     ${lines[0]!}
     state.loadedArmory = loadedArmory; state.reopenArmory = reopenArmory; state.reopenArmoryData = reopenArmoryData;`);
  run({ kind: 'error', id: messageId, doing: 'reading the ARMORY', message: 'boom' }, lane, armoryData, () => { state.reopened++; }, state);
  return state;
}

describe('LATER 781: a failed ARMORY read in Play mode releases the waiting seat and starts the solo match', () => {
  it("the ARMORY lane's error reply hands armoryData(null), and the seat waiting on data reaches the solo start", () => {
    const log: string[] = [];
    const part = mount(log);
    part.seat();                                             // show's seat: no data yet, so it waits
    expect(log).toEqual([]);
    const lane = new LaneRequest();
    lane.ask(17, 4);                                         // the ARMORY asked as request 17 for load 4
    const state = runArmoryLines(17, lane, (d) => { log.push(`armoryData ${String(d)}`); part.setData(d); });
    expect(state.loadedArmory).toBe(4);                      // the lane answered for the load, as before
    expect(log).toEqual(['armoryData null', 'solo match starts']);   // the empty data handed on, the seat released
    expect(part.isOpen()).toBe(false);
  });

  it("another request's error (a superseded ARMORY ask, or another lane's) hands nothing on", () => {
    const log: string[] = [];
    const lane = new LaneRequest();
    lane.ask(17, 4);
    const state = runArmoryLines(16, lane, () => { log.push('armoryData'); });
    expect(state.loadedArmory).toBe(-1);
    expect(log).toEqual([]);
    expect(state.reopened).toBe(0);
  });

  it('a mod reload waiting on the ARMORY data is told the data landed, as the data reply tells it', () => {
    const lane = new LaneRequest();
    lane.ask(17, 4);
    const state = runArmoryLines(17, lane, () => undefined, true);
    expect(state.reopenArmoryData).toBe(true);
    expect(state.reopened).toBe(1);
  });
});
