import { beforeAll, describe, expect, it } from 'vitest';
import { materialTable, modelGate, segmentHit, type WorldPoly } from '@s2u/scene';
import { Button, type Command } from '../../src/net/protocol';
import { flat, floor, poly, scene, still } from './world';
/** Research 230 §3: source movement predicates, reading, pending review.
 * Synthetic planes and a documented pose height isolate branches; no original-runtime/map-prevalence claim.
 * Setup/observations run outside it.fails, so infrastructure or fixture errors fail the suite normally.
 */
describe('research 230: movement gaps', () => {
    const roofResults = new Map<number, boolean>();
    let carry: {
        x: number;
        beforeX: number;
        vx: number;
    }, standDown: number, proneFirst: number, proneSecond: number;
    let groundOnlyDown: number, headroom: boolean, stanceAfterCeiling: string, jumpStance: string;
    beforeAll(() => {
        for (const speed of [0, 40]) {
            const s = flat([floor(25)]);
            s.walker.state.vx = speed;
            // FUN_0057f150 D:L441263-441285: head+1 to head+21. 17.394 is a synthetic pose input (research 230 §3).
            expect(segmentHit(s.grid, [0, 18.394, 0], [0, 38.394, 0])?.point[1]).toBe(25);
            roofResults.set(speed, s.walker.jump());
        }
        const clear = flat([floor(50)]);
        expect(segmentHit(clear.grid, [0, 18.394, 0], [0, 38.394, 0])).toBeNull();
        expect(clear.walker.jump()).toBe(true);
        const s = flat([poly('wall', [4, -10, -100, 4, -10, 100, 4, 100, 100, 4, 100, -100], 2)]);
        s.walker.state.vx = 40;
        s.walker.state.vz = 30;
        expect(s.walker.jump()).toBe(true);
        s.walker.tick(still);
        expect(s.walker.airborne).toBe(true);
        expect(s.walker.state.vx).toBeCloseTo(0, 8);
        expect(s.walker.state.vz).toBeCloseTo(30, 8);
        const beforeX = s.walker.state.x;
        s.owners[1]!.flags = 0x1000;
        s.grid.revision++;
        s.walker.tick(still);
        carry = { beforeX, x: s.walker.state.x, vx: s.walker.state.vx };
        function slope(stance: 'stand' | 'prone', deg: number, ditype = 3) {
            const h = 100 * Math.tan(deg * Math.PI / 180);
            const q = scene([poly('slope', [-100, -h, -100, 100, h, -100, 100, h, 100, -100, -h, 100], ditype)]);
            expect(q.walker.place(0, 1, 0)).toBe(true);
            q.walker.stance = stance;
            const start = q.walker.state.x;
            for (let i = 0; i < 30; i++)
                q.walker.tick(still);
            const half = q.walker.state.x;
            for (let i = 0; i < 30; i++)
                q.walker.tick(still);
            return [start - half, half - q.walker.state.x];
        }
        standDown = slope('stand', 55).reduce((a, b) => a + b, 0);
        [proneFirst, proneSecond] = slope('prone', 55) as [
            number,
            number
        ];
        groundOnlyDown = slope('prone', 55, 1).reduce((a, b) => a + b, 0);
        expect(slope('stand', 49).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 8);
        const ceiling = flat([floor(15)]);
        ceiling.walker.stance = 'crouch';
        expect(ceiling.walker.headroom()).toBe(false);
        ceiling.owners[1]!.flags = 0x1000;
        ceiling.grid.revision++;
        expect(modelGate(ceiling.owners[1]!)).toBe(false);
        expect(segmentHit(ceiling.grid, [0, 7.504, 0], [0, 19, 0])).toBeNull();
        headroom = ceiling.walker.headroom();
        ceiling.walker.changeStance('stand');
        stanceAfterCeiling = ceiling.walker.stance;
        const jumping = flat();
        const cmd: Command = { seq: 1, forward: 0, right: 0, yaw: -90, pitch: 0, turn: 0, buttons: Button.Jump, stance: 0, weapon: 0 };
        expect(jumping.sim.apply(cmd).jumped).toBe(true);
        jumping.sim.apply({ ...cmd, seq: 2, buttons: Button.Stance, stance: 2 });
        for (let i = 0; i < 12; i++)
            jumping.sim.apply({ ...cmd, seq: i + 3, buttons: 0, forward: 1, stance: 2 });
        jumpStance = jumping.walker.stance;
    });
    // FUN_0057e1b0 D:L440799-440804 -> FUN_0057f150.
    for (const speed of [0, 40])
        it.fails(`refuses jump at speed ${speed} with a solid hit in the posed-head ray`, () => expect(roofResults.get(speed)).toBe(false));
    // FUN_005483d0 D:L413588-413593, scalar confirmed at ELF 0x548ae0-0x548b40: remove inward carry persistently.
    // SEGMENT-BODY: built in `resolveSegments` (the carried velocity loses its part into the face, D:L413588-413594): a gap closed.
    it('keeps the inward carry removed after contact ends', () => {
        expect(carry.vx).toBeCloseTo(0, 8);
        expect(carry.x).toBeCloseTo(carry.beforeX, 8);
    });
    // FUN_0054f330 D:L417220-417245 / FUN_0054edf0 D:L417108-417160.
    it('slides a standing body down eligible steep ground at rest', () => expect(standDown).toBeGreaterThan(.001));
    it('accelerates prone descent instead of constant collision push-out', () => expect(proneSecond).toBeGreaterThan(proneFirst * 1.5));
    it('slides prone on eligible ground without side-collision flags', () => expect(groundOnlyDown).toBeGreaterThan(.001));
    // D16 (PAR-21): FUN_0057efe0 D:L441217-441239's segment (FUN_0031e1d0 -> FUN_002d4780) visits owners through
    // FUN_002d2890, gated at D:L174789-174790 as FUN_002d3030 is at D:L175073-175074: m_active and m_hasDI (230 §3.4).
    it('ignores an inactive overhead owner for stance headroom', () => { expect(headroom).toBe(true); expect(stanceAfterCeiling).toBe('stand'); });
    // Existing §1 root cause, not a new exploit: FUN_00552ec0 D:L418927-418930.
    it('does not switch directly to prone inside the standing Jump action', () => expect(jumpStance).toBe('stand'));
});

/**
 * D16's controls (PAR-21; research 230 §3.4, reading, pending review). The headroom segment's owner gate
 * (`FUN_002d2890` D:L174789-174790) needs both `+0x5c` bit 0 (`m_active`) and `+0x5d` bit 4 (`m_hasDI`, flag bit 12);
 * the walk's other probes (`FUN_005ab590` -> `FUN_0031de90` -> `FUN_002d3cf0` -> `FUN_002d3030` D:L175073-175074)
 * apply the same gate, so they never saw an inactive owner either. Each probe keeps its own surface class filter.
 */
describe('research 230 §3.4: the headroom owner gate (D16)', () => {
    const ACTIVE_DI = 0x1001, DI_ONLY = 0x1000, ACTIVE_ONLY = 0x0001;
    function ceilingAt(flags: number, cameratype = 0) {
        const s = flat([{ ...floor(15), cameratype }]);
        s.owners[1]!.flags = flags;
        s.grid.revision++;
        s.walker.stance = 'crouch';
        return s;
    }
    it('an active owner with DI still blocks headroom and the stand', () => {
        const s = ceilingAt(ACTIVE_DI);
        expect(s.walker.headroom()).toBe(false);
        expect(s.walker.stanceGate('stand')).toBe('reset');
        s.walker.changeStance('stand');
        expect(s.walker.stance).toBe('crouch');
    });
    it('an active owner with DI blocks prone -> crouch headroom (mode 1, the feet + 12)', () => {
        const s = flat([floor(10)]);
        s.walker.stance = 'prone';
        expect(s.walker.headroom('crouch')).toBe(false);
        s.owners[1]!.flags = DI_ONLY;
        s.grid.revision++;
        expect(s.walker.headroom('crouch')).toBe(true);
    });
    it('an owner without m_hasDI is not in the headroom ray either (both bits, not one)', () => {
        const s = ceilingAt(ACTIVE_ONLY);
        expect(s.walker.headroom()).toBe(true);
        expect(s.walker.stanceGate('stand')).toBe('open');
    });
    it('an active m_cameratype 1 ceiling does not block (the nearest hit is type 1: clear, PAR-50)', () => {
        expect(ceilingAt(ACTIVE_DI, 1).walker.headroom()).toBe(true);
    });
    it('the walk\'s other probe keeps its gate and its class filter (the prone gate, FUN_002d3030)', () => {
        const wall = (flags: number, cameratype = 0) => {
            const face = poly('wall', [6, -10, -100, 6, -10, 100, 6, 100, 100, 6, 100, -100], 2);
            const s = flat([{ ...face, cameratype }]);
            s.owners[1]!.flags = flags;
            s.grid.revision++;
            return s.walker.proneRefused();
        };
        expect(wall(ACTIVE_DI)).toBe(true);
        expect(wall(DI_ONLY)).toBe(false);
        expect(wall(ACTIVE_ONLY)).toBe(false);
        expect(wall(ACTIVE_DI, 1)).toBe(false);
    });
});

/**
 * PAR-50 (research 230 §3.4, reading, pending review): the headroom ray (`FUN_0057efe0`, D:L441228-441232) and the
 * jump's (`FUN_0057f150`, D:L441275-441279) are cast with `DAT_0044d758` = 1. The surface filter (`FUN_002d2890`
 * D:L174845-174864) wants `ditype` bit 1, skips `m_cameratype` bit 1 (word bit 19) and a VOLUMETRIC material
 * (`0x44f358[m]+0x3c` bit 0, set for the SOILS key VOLUMETRIC, `FUN_002dde40` D:L181403-181405); the nearest hit
 * (`FUN_002d4cc0` D:L175904) leaves the ray clear when it is `m_cameratype` exactly 1. Synthetic planes; the jump's
 * head is the standing idle head 17.394 (the ray head + 1 to head + 21). The jump's refusal itself stays D13's, after
 * its capture (PTW.R1): these hold the query.
 */
describe('research 230 §3.4: the camera-class cast of the headroom and jump rays (PAR-50)', () => {
    const LEAFY = materialTable().findIndex((m) => m.name === 'LEAFY_TREE');
    const at = (y: number, over: Partial<WorldPoly> = {}): WorldPoly => ({ ...floor(y), ...over });
    /** Crouched, the stand's ray is the feet + 7.504 to + 19; standing, the jump's the feet + 18.394 to + 38.394. */
    const headroom = (extra: WorldPoly[]) => {
        const c = flat(extra);
        c.walker.stance = 'crouch';
        return c.walker.headroom();
    };
    const jump = (extra: WorldPoly[]) => flat(extra).walker.jumpClear();
    const cases: [string, number, number, (y: number) => WorldPoly[], boolean][] = [
        ['a type-2 overhead polygon is skipped (bit 19): clear', 15, 25, (y) => [at(y, { cameratype: 2 })], true],
        ['a type-1 polygon nearer than a solid one is the nearest hit: clear', 12, 22, (y) => [at(y, { cameratype: 1 }), at(y + 3)], true],
        ['a ditype-1 (ground only) overhead polygon is skipped (no bit 1): clear', 15, 25, (y) => [at(y, { ditype: 1 })], true],
        ['a VOLUMETRIC material overhead (LEAFY_TREE) is skipped: clear', 15, 25, (y) => [at(y, { material: LEAFY })], true],
        ['a solid type-0 polygon blocks (the control)', 15, 25, (y) => [at(y)], false],
        ['a type-1 polygon beyond a solid one: the solid is nearest, blocked', 12, 22, (y) => [at(y), at(y + 3, { cameratype: 1 })], false],
        ['a type-3 polygon is skipped (bit 19): clear', 15, 25, (y) => [at(y, { cameratype: 3 })], true],
    ];
    for (const [name, headY, jumpY, make, clear] of cases) {
        it(`headroom: ${name}`, () => expect(headroom(make(headY))).toBe(clear));
        it(`jump: ${name}`, () => expect(jump(make(jumpY))).toBe(clear));
    }
    it('the material table is the engine\'s: UNKNOWN first, not VOLUMETRIC; LEAFY_TREE is', () => {
        expect(materialTable()[0]!.volumetric).toBe(false);
        expect(materialTable()[LEAFY]!.volumetric).toBe(true);
    });
    it('the cast keeps D16\'s owner gate: an inactive owner\'s solid polygon is not met (both rays)', () => {
        const c = flat([at(15)]), j = flat([at(25)]);
        for (const s of [c, j]) { s.owners[1]!.flags = 0x1000; s.grid.revision++; }
        c.walker.stance = 'crouch';
        expect(c.walker.headroom()).toBe(true);
        expect(j.walker.jumpClear()).toBe(true);
    });
    it('the jump itself is unchanged until D13\'s capture (PTW.R1): a solid roof still lets it start', () => {
        const s = flat([at(25)]);
        expect(s.walker.jumpClear()).toBe(false);
        expect(s.walker.jump()).toBe(true);
    });
});
