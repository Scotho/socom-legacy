import { beforeAll, describe, expect, it, vi } from 'vitest';
import { noInput } from '../../src/gamepad';
import { playerLanes, type LaneParts } from '../../src/matchLanes';
import { StanceButton } from '../../src/stanceButton';
// The fire-mode callback is the boundary under test. Other lanes have no active input.
vi.mock('../../src/play', () => ({ playActions: () => ({ jump: false, crouch: false }) }));
/** Research 230 section 4: DEFAULT fire-mode timing, reading, pending review.
 * FUN_00594b70 D:L452969-452994; FUN_002d9ff0 D:L179137-179183;
 * FUN_002da1c0 D:L179217-179227. The alternate first-press binding is a separate branch.
 * These expected counts are the original source state table at dt=525/15734, not a runtime trace.
 */
describe('research 230: DEFAULT fire-mode timing', () => {
    const cases = [
        { name: 'single tap', sequence: [true, false, false], expected: 0 },
        { name: 'double tap', sequence: [true, false, false, true, false], expected: 1 },
        { name: 'held for 31 original ticks', sequence: Array<boolean>(31).fill(true), expected: 2 },
    ];
    const observed = new Map<string, number>();
    beforeAll(() => {
        for (const row of cases) {
            let count = 0, before = noInput();
            const lanes: LaneParts = {
                walk: { mode: () => 'walk', isDead: () => false, stance: () => 'stand', stanceIntent: () => 'stand', jump: () => false, crouch: () => false, setStance: () => false },
                firearm: { stepZoom: () => 0, switchFireMode() { count++; return 'semi'; }, viewLanes() { return false; }, fire: { reload() { return false; } } },
                shoulder() { }, stanceButton: new StanceButton(),   // the real one (OT.R67's `lanes`): never pressed here, it does nothing
            };
            for (const down of row.sequence) {
                const after = { ...noInput(), fireMode: down };
                playerLanes(lanes, before, after, 525 / 15734, { walking: true, menu: false });
                before = after;
            }
            expect(Number.isFinite(count)).toBe(true);
            observed.set(row.name, count);
        }
    });
    for (const row of cases) {
        it(row.name, () => expect(observed.get(row.name)).toBe(row.expected));
    }
});
