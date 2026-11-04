// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { BODY_RADIUS, groundGrid, Walker } from '../src/mover';
import { simMapFromBytes } from '../src/simMap';

/**
 * Disc check of Fuse's #408 head (PR #408's verification comment), MP72 regression path 1 of 97. Walking +x from (2156, 89.25, 1574) on
 * `worldmodel/emb01`, the landing pushes three faces about 2 deep and the chain slides the body on. Reverting that
 * push stopped the walk at about 7. The chain walks about 25, to the radius off the next wall (x 2184.49). The
 * fixture is the disc's `RUN/MP72.ZDB`. No map is served.
 *
 * MV-PARITY (b2), re-derived: the z was 1572.58, the port's own output when the test was written -- the end of the
 * neighbouring `emb01` face (z 1572.57), to which the slide's push along a direction from that corner carried the body.
 * The original's hit has the polygon's own normal and is met by the fan cast forward from the feet
 * (`WALL_END_CONTACT_READING`; `FUN_005483d0` D:L413557-413567, `FUN_0054aa30` D:L415549-415577): the face ends the
 * step-down meets lie behind the feet, nothing turns the walk, and it runs on along the start's z, 1574. [reading,
 * pending review]
 */
const MP72 = fixture('RUN/MP72.ZDB');
const START = { x: 2156, z: 1574 };

describe.skipIf(MP72 === null)(`MP72 step-down at (2156, 89.25, 1574)${MP72 === null ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  it('walking +x off the step reaches the next wall, about 25 on, and stops at the radius', () => {
    const grid = groundGrid(simMapFromBytes(MP72!, 'RUN/MP72.ZDB').ground!);
    const w = new Walker(grid);
    expect(w.place(START.x, 100, START.z)).toBe(true);
    expect(w.state.y).toBeCloseTo(89.25, 2);
    w.state.yaw = Math.atan2(-1, 0) * 180 / Math.PI;
    for (let i = 0; i < 180; i++) w.tick({ forward: 1, right: 0, boost: false });
    expect(w.state.x - START.x).toBeGreaterThan(20);
    expect(w.state.x).toBeCloseTo(2180.99, 1);
    expect(2184.49 - w.state.x).toBeCloseTo(BODY_RADIUS, 1);
    expect(w.state.z).toBeCloseTo(START.z, 1);                    // straight on: no corner turns it (was 1572.58)
    expect(w.airborne).toBe(false);
  });
});
