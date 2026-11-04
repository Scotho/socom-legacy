import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASE_REST } from '../src/doors';
import { GateSet, leadIns, type GateSpec } from '../src/gates';
import { simMapFromBytes, type SimMap } from '../src/simMap';
import { forkGround } from '../src/worldState';

/**
 * P8 on the dev disc (`SOCOM_DISC`; MP11 and MP62 are no fixtures; the P8 review's F4): `GATE_PREDICT_ADAPTATION`'s
 * lead-in read off Death Trap's and Enowapi's own lever programs (`gate_openclose1/2`: the 0.24 s wait before
 * `gateopen` / `gateclose`, research 174 s5 and s5.1), and the page's predicted pose against the room's run of the same
 * pull (`GateSet.use`), frame by frame, the open and then the close. Skipped without the disc, the skip said in its name.
 */

const DISC = process.env.SOCOM_DISC;
const has = (stem: string): boolean => !!DISC && existsSync(resolve(DISC, `RUN/${stem}.ZDB`));
const load = (stem: string): SimMap => simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, `RUN/${stem}.ZDB`))), `RUN/${stem}.ZDB`);
const DT = 1 / 60;

/** The page's predicted pull beside the room's, `seconds` of frames: the largest gap between the two offsets. */
function pull(page: GateSet, room: GateSet, action: number, seq: number, seconds: number): number {
  expect(room.use(action)).toBe(true);
  expect(page.predict(action, seq)).toBe(true);
  let gap = 0;
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    room.step(DT); page.step(DT);
    const a = page.offset(0), b = room.offset(0);
    gap = Math.max(gap, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  page.applyWire(room.wire(), 0, seq + 1, 0);                                 // the room's rest at that end settles it
  return gap;
}

for (const stem of ['MP11', 'MP62']) {
  describe.skipIf(!has(stem))(`P8: the lever's lead-in and the predicted slide on ${stem}${has(stem) ? '' : ` (SOCOM_DISC with RUN/${stem}.ZDB absent)`}`, () => {
    it("every lever's lead-in is its program's 0.24 s wait, to the frame, for the open and the close", () => {
      const map = load(stem);
      const levers = (map.gates ?? []).flatMap((g) => g.levers.map((l) => [g, l] as const));
      expect(levers.length).toBeGreaterThan(0);
      for (const [g, l] of levers) {
        const [open, close] = leadIns(g, l);
        for (const lead of [open, close]) {
          expect(lead, `${l.node}`).not.toBeNull();
          expect(lead!).toBeGreaterThanOrEqual(0.24 - 1e-9);
          expect(lead!).toBeLessThanOrEqual(0.24 + DT + 1e-9);
        }
      }
    });

    it("the page's predicted pose stays within a frame's travel of the room's run of the same pull, open then shut", () => {
      const map = load(stem);
      for (const g of map.gates ?? []) {
        const spec: GateSpec = { ...g, index: 0 };
        const room = new GateSet([spec], forkGround(map.ground));
        const page = new GateSet([spec], null);
        page.applyWire([{ valve: 0, phase: PHASE_REST }], 0, 0, 0);
        const frame = Math.hypot(...g.open) / g.seconds * DT;
        const action = g.levers[0]!.action;
        expect(pull(page, room, action, 10, 4), `${g.node} open`).toBeLessThanOrEqual(frame + 1e-4);
        expect(page.offset(0).map((v, k) => v - g.open[k]!).every((v) => Math.abs(v) < 1e-4)).toBe(true);
        expect(pull(page, room, action, 20, 4), `${g.node} shut`).toBeLessThanOrEqual(frame + 1e-4);
        expect(page.offset(0).every((v) => Math.abs(v) < 1e-4)).toBe(true);
      }
    });
  });
}
