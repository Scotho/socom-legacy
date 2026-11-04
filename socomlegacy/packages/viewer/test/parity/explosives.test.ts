import { beforeAll, describe, it, expect } from 'vitest';
import { buildGrid, CLAYMORE, HAND_ANIMS, type WorldPoly, type ThrowableRecord } from '@s2u/scene';
import { fixture as discFixture, FIXTURES_ABSENT } from '../../../archive/test/fixtures';
import { GrenadeThrower, type GrenadeEvents, type GrenadeSource } from '../../src/grenade';
import { Walker, TICK, moverSnapshot, type PlaySnapshot } from '../../src/mover';
import { ThrowPose, throwPoseEnds } from '../../src/throwPose';
import { clipsFromPack, motionTableFromArchive } from '../../src/motionTable';
/** Research 230 section 2, reading, pending review. Public component event wiring mirrors the audited
 * throwStart -> ThrowPose.start/Walker.hold seam. This is not a browser or original-game run.
 * All setup/execution/assertions about fixture health run outside it.fails.
 */
const reader = discFixture('RUN/READERC.ZAR'), pack = discFixture('RUN/MOTION_P.ZAR');
describe.skipIf(!reader || !pack)(`research 230: explosives${!reader || !pack ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
    const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0, points: Float32Array.from([-400, 50, -400, 400, 50, -400, 400, 50, 400, -400, 50, 400]) };
    const DI = 'worldmodel/access1=access1/good_parts/di_good';
    const wall: WorldPoly = { ...floor, path: DI, ditype: 2, points: Float32Array.from([130, 50, 150, 130, 50, 250, 130, 110, 250, 130, 110, 150]) };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 }, [], [], [floor, wall], [{ modelName: 'worldmodel', path: floor.path, first: 0, count: 1 }, { modelName: 'worldmodel', path: DI, first: 1, count: 1 }]);
    const still = { forward: 0, right: 0, boost: false };
    let table: NonNullable<ReturnType<typeof motionTableFromArchive>>;
    let clips: Map<string, ReturnType<typeof clipsFromPack>[number]>;
    // Synthetic target-eligible record, not a claim that these overridden fixture fields are retail C4 data.
    const C4: ThrowableRecord = { ...CLAYMORE, name: 'C4', id: 151, fuse: 6, removal: .1, explosionDamage: 18, explosionRadius: 50, model: 'c4', icon: 'c4.tif', capacity: 4 };
    function fixture(extra: Partial<GrenadeSource> = {}) {
        const w = new Walker(grid);
        w.place(100, 60, 200);
        for (let i = 0; i < 90; i++)
            w.tick(still);
        expect(w.airborne).toBe(false);
        let pitch = 0;
        const snapshot = () => ({ ...moverSnapshot(w, null, 0, 0), feet: [w.state.x, w.state.y, w.state.z], pitch } as PlaySnapshot);
        const g = new GrenadeThrower({ grid: () => grid, snapshot, view: () => 'third', handPoint: () => [102, 62, 192], aim: () => ({ eye: [100, 62, 200], far: [400, 62, 200] }), ...extra });
        const pose = new ThrowPose(() => ({ clips, table }));
        const thrown: Parameters<GrenadeEvents['throw']>[0][] = [], starts: Parameters<GrenadeEvents['throwStart']>[0][] = [], placed: Parameters<GrenadeEvents['place']>[0][] = [];
        g.on('throwStart', e => { starts.push(e); pose.start(e.anim); w.hold(e.hold); });
        w.onActionEnd(e => { if (throwPoseEnds(e)) g.noteHoldEnd?.(e.reason); });
        g.on('throw', e => thrown.push(e));
        g.on('place', e => placed.push(e));
        function run(seconds: number, moving = false) { for (let t = 0; t < seconds - 1e-9; t += TICK) {
            w.tick(moving ? { ...still, forward: 1 } : still);
            pose.step(TICK);
            g.update(TICK);
        } }
        function hold(seconds = .6) { g.select('M67'); g.pull(); run(seconds); g.release(); run(TICK); expect(starts).toHaveLength(1); }
        return { w, g, pose, thrown, starts, placed, run, hold, setPitch: (p: number) => { pitch = p; } };
    }
    /** A tap's outcome: the throws, the starts, the grenades spent, the phase, the hand up, the body's owner. */
    const taps = new Map<number, { thrown: number; starts: number; spent: number; phase: string; up: boolean; body: unknown }>();
    let positiveSpent = 0;
    let selected: boolean, lateAim: number, stance: string, busy: string, c4Places: number, c4StillPlacing: boolean;
    /** PAR-20 D07 through PAR-19's model: the body during the wind-up, the ineligible and the post-release controls. */
    let windupBody: unknown, refused: { detonator: boolean; thrown: number; spent: number }, after: { rifle: boolean; family: string | undefined; thrown: number };
    beforeAll(() => {
        table = motionTableFromArchive(reader!)!;
        expect(table).not.toBeNull();
        clips = new Map(clipsFromPack(pack!, HAND_ANIMS.map(a => a.clip)).map(c => [c.name, c]));
        for (const a of HAND_ANIMS) {
            expect(clips.get(a.clip)?.frameCount).toBe(a.frames);
            expect(table.get(a.clip)?.playback).toBeCloseTo(a.playback, 6);
        }
        for (const n of [0, 1, 3]) {
            const f = fixture();
            f.g.select('M67');
            const left = f.g.stats().left;
            f.g.pull();
            f.run(n * TICK);
            f.g.release();
            f.run(2);
            taps.set(n, { thrown: f.thrown.length, starts: f.starts.length, spent: left - f.g.stats().left, phase: f.g.phase(), up: f.g.equipped(), body: f.w.effectiveAction().body });
        }
        const positive = fixture();
        positive.g.select('M67');
        const positiveLeft = positive.g.stats().left;
        positive.g.pull();
        positive.run(4 * TICK);
        positive.g.release();
        positive.run(2);
        expect(positive.thrown).toHaveLength(1);
        expect(positive.thrown[0]!.power).toBeGreaterThan(.15);
        positiveSpent = positiveLeft - positive.g.stats().left;
        const cancel = fixture();
        cancel.g.select('M67');
        const ammo = cancel.g.stats().left;
        cancel.g.pull();
        cancel.run(.3);
        cancel.g.cancelMenuHold();
        cancel.g.release();
        cancel.run(2);
        expect(cancel.thrown).toHaveLength(0);
        expect(cancel.g.stats().left).toBe(ammo);
        const windup = fixture();
        windup.g.select('M67');
        windup.g.pull();
        windup.run(.3);
        windupBody = windup.w.effectiveAction().body;
        selected = windup.g.select('rifle');
        // An ineligible selection (the Detonator with no charge down, FUN_005bdc30) is refused: the wind-up goes on.
        const ineligible = fixture();
        ineligible.g.select('M67');
        const ineligibleLeft = ineligible.g.stats().left;
        ineligible.g.pull();
        ineligible.run(.3);
        const detonator = ineligible.g.select('Detonator');
        ineligible.g.release();
        ineligible.run(2);
        refused = { detonator, thrown: ineligible.thrown.length, spent: ineligibleLeft - ineligible.g.stats().left };
        // After the release the throw owns the body: the selection is refused and the grenade flies.
        const released = fixture();
        released.g.select('M67');
        released.g.pull();
        released.run(.3);
        released.g.release();
        released.run(TICK);
        const rifle = released.g.select('rifle');
        const family = released.w.effectiveAction().body?.family;
        released.run(2);
        after = { rifle, family, thrown: released.thrown.length };
        const aim = fixture();
        aim.hold();
        aim.setPitch(45);
        aim.run(1);
        expect(aim.thrown).toHaveLength(1);
        lateAim = aim.thrown[0]!.aimSin;
        const body = fixture();
        body.hold();
        body.w.changeStance('crouch');
        stance = body.w.stance;
        const cut = fixture();
        cut.hold();
        cut.run(.8, true);
        expect(cut.w.holding).toBeNull();
        expect(cut.thrown).toHaveLength(1);
        busy = cut.g.phase();
        const c4 = fixture();
        c4.g.setRecords([C4]);
        c4.g.setWorld(() => ({ health: { blastAt: () => [], c4TargetAt: (path: string, damage: number) => (path === DI && damage >= 17 ? 0 : null) } }));
        c4.g.setKit(['M67', 'AN-M8', 'C4']);
        c4.run(.3);
        expect(c4.g.plantC4()).toBe(true);
        c4.run(.1);
        c4.w.knock([0, 15, -5], 'fallBackwards');
        c4.run(1.1);
        c4Places = c4.placed.length;
        c4StillPlacing = c4.g.stats().placing;
    });
    // FUN_005be9a0 D:L475490-475511: power < .15 aborts before the pending throw exists (PAR-20 D10, research 256 s1).
    // The tick counts are this port model's samples of a digital press (powers 0, .05, .142625), not retail input latency.
    for (const n of [0, 1, 3])
        it(`rejects a ${n}-tick under-threshold tap`, () => expect(taps.get(n)!.thrown).toBe(0));
    // FUN_005be9a0 D:L475497-475498: the refusal zeroes the power (FUN_00592d40 D:L451964) and pushes no clip; the count
    // falls only at hand-open (FUN_005c1970 D:L477039-477042). The four-tick tap (.185494) is the positive control.
    it('a refused tap starts no throw and spends nothing: no throwStart, no body owner, the grenade still up; four ticks throw and spend one (PAR-20 D10)', () => {
        for (const n of [0, 1, 3]) expect(taps.get(n)).toEqual({ thrown: 0, starts: 0, spent: 0, phase: 'ready', up: true, body: null });
        expect(positiveSpent).toBe(1);
    });
    // FUN_00594cf0 D:L453288-453310 -> shoulder selection clears the controller wind-up.
    it('permits shoulder selection during pre-release wind-up', () => expect(selected).toBe(true));
    // PAR-20 D07 through PAR-19's model (research 256 s4, 251 s4.1): the wind-up puts no clip on the body (the throw's
    // one-shot is pushed at the release, FUN_005be9a0), so the shoulder's body gate passes; the kit's own gates decide
    // (FUN_00594cf0 D:L453288-453310: FUN_005a8cb0, FUN_005bdc30, FUN_005be030, FUN_005c4fd0).
    it('the wind-up owns no body; an ineligible selection is refused and the wind-up throws; after the release the throw owns the body and refuses it (PAR-20 D07)', () => {
        expect(windupBody).toBeNull();
        expect(refused).toEqual({ detonator: false, thrown: 1, spent: 1 });
        expect(after).toEqual({ rifle: false, family: 'throw', thrown: 1 });
    });
    // FUN_005c1970 D:L477105-477111 reads the current body elevation at hand-open release (PAR-20 D11, research 256 s2).
    it('uses current elevation when the hand opens', () => expect(lateAim).toBeCloseTo(Math.sin(Math.PI / 4), 6));
    // FUN_00552ec0 D:L418927-418930: the full-body one-shot still owns the outer stance gate.
    it('defers stance during the accepted full-body throw', () => expect(stance).toBe('stand'));
    // FUN_00550ef0 D:L418180-418190 / D:L445549-445564: source motion owner ends at this valid cut.
    it('ends throw busy state with the movement cut', () => expect(busy).toBe('ready'));
    // FUN_005bfe40 callback (D:L475379-475452), forced pop D:L440992-440998, 446515, 135092-135104.
    // Only the NORMAL deadline is asserted; the separate 99-second fallback is not claimed cancelled/refunded.
    // PAR-20 D09 (research 256 s3): the removed callback cannot cause the normal deadline; the 99 s timer is not decided here.
    it('does not commit C4 at the normal deadline after its source callback was removed', () => {
        expect(c4Places).toBe(0);
        expect(c4StillPlacing).toBe(true);                         // the knock keeps the 99 s interim; a leave would have cancelled
    });
});
