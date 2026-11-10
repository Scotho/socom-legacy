import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseZdb, zdbMember, Zar } from '@s2u/archive';
import { parseWorldRoot } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';

/**
 * DF-11 (the Desert Glory / Fish Hook release, 2026-11-08): the sky's scroll rate, named and held.
 *
 * - **The unit** (`world.ts` `SKY_SCROLL_TICKS_READING`, research 82 §8): a `TextureScroll_Object` band adds `du, dv`
 *   times the scheduler's dT once a frame (`FUN_003c0120` D:L313834-313853, from the task "Update visual effects"), and
 *   dT is in seconds -- the state tick's `param_1`, the value it hands the pad reader, whose flush passes 1/30 for one
 *   frame (`FUN_001ebed0` D:L50795-50801; research 205 §5.2). So the multiplier is 1: `du` is texture widths a second.
 *   A reading (the decompilation), not measured running; a frame pair of Fish Hook's sky is its evidence still owed
 *   (`waterLook.spec.ts`'s MP71 `08-sky-a` / `08-sky-b`, listed and not run).
 * - **The two maps' bands** (the disc's data through `parseWorldRoot`, `MP<N>.ZED`'s `TextureScroll_Object`): Desert Glory
 *   carries none (its sky does not scroll); Fish Hook carries one, `mp71_sky` / `whispy_scroller` at (0.08, 0.01) --
 *   at the reading, a texture width every 12.5 s across u and every 100 s across v. MP6 from the committed fixture, MP71
 *   from `SOCOM_DISC` (no fixture yet: DF-2); each half skips without its source, and a skip is not a pass.
 */
const SRC = resolve(import.meta.dirname, '../src');
const world = readFileSync(resolve(SRC, 'world.ts'), 'utf8');
const DISC = process.env.SOCOM_DISC;
const MP71 = DISC && existsSync(resolve(DISC, 'RUN/MP71.ZDB')) ? new Uint8Array(readFileSync(resolve(DISC, 'RUN/MP71.ZDB'))) : null;
const MP6 = fixture('RUN/MP6.ZDB');

const bands = (zdb: Uint8Array, stem: string) =>
  parseWorldRoot(Zar.parse(zdbMember(zdb, parseZdb(zdb), `${stem}.ZED`))).textureScroll
    .map((b) => ({ model: b.modelName, node: b.nodeName, du: Number(b.du.toFixed(6)), dv: Number(b.dv.toFixed(6)) }));

describe("the sky's scroll unit, named (world.ts)", () => {
  it('SKY_SCROLL_TICKS_READING = 1 (dT in seconds: FUN_003c0120, FUN_001ebed0), the one multiplier of both scroll lines; the bare name gone', () => {
    expect(world).toMatch(/\nconst SKY_SCROLL_TICKS_READING = 1;\n/);
    expect(world).toContain('v.x = (v.x + s.du * dt * SKY_SCROLL_TICKS_READING) % 1;');
    expect(world).toContain('v.y = (v.y + s.dv * dt * SKY_SCROLL_TICKS_READING) % 1;');
    expect(world).not.toContain('SCROLL_TICKS_PER_SECOND');
  });
});

describe.skipIf(!MP6)('Desert Glory: no scrolling band (the committed fixture)', () => {
  it('MP6.ZED holds no TextureScroll_Object band: its sky stands still', () => {
    expect(bands(MP6!, 'MP6')).toEqual([]);
  });
});

describe.skipIf(!MP71)(`Fish Hook: the one band${MP71 ? '' : ' (SOCOM_DISC with RUN/MP71.ZDB absent)'}`, () => {
  it('MP71.ZED holds one band, mp71_sky / whispy_scroller at (0.08, 0.01): 12.5 s a width across u, 100 s across v at the reading', () => {
    const got = bands(MP71!, 'MP71');
    expect(got).toEqual([{ model: 'mp71_sky', node: 'whispy_scroller', du: 0.08, dv: 0.01 }]);
    const rate = 1;   // SKY_SCROLL_TICKS_READING, pinned in the source above
    expect([1 / (got[0]!.du * rate), 1 / (got[0]!.dv * rate)].map((s) => Number(s.toFixed(3)))).toEqual([12.5, 100]);
  });
});
