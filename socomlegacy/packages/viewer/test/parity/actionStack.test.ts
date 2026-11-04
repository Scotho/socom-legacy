import { beforeAll, describe, expect, it } from 'vitest';
import { GAME_FRAME_DT } from '@s2u/scene';
import { Kit } from '../../src/kit';
import {
    HOLD_CODES, HOLD_OVER_PLACE_READING, HOLD_OVER_THROW_HAND_READING, holdFamily, holdOverHold, SWAP_OVERLAY, TICK, type HoldClip, type Walker,
} from '../../src/mover';
import { flat, still } from './world';
/** Research 230 §1: original action gates and callback phase, reading, pending review.
 * Setup and execution happen in beforeAll so a setup exception cannot satisfy an expected failure.
 * These are public component contracts, not a browser or original-game run.
 */
describe('research 230: action-stack gaps', () => {
    let reloadStance: string, swapStance: string, diveAccepted: boolean;
    const handoffs = new Map<string, number>();
    /** Research 251 §10: each swap's hand-off -- its tick from the swap's start and its clip's seconds then. */
    const handed = new Map<string, { tick: number; t: number }>();
    const carry = new Map<string, { cutT: number; overlayT: number }>();
    // frames and playback per stance from the port's swap table (V:mover.ts:722 at eb243aadd); the thresholds from
    // D:L446367-446396 (research 230 §1.2). A wrong table would move the computed source phase with it.
    const swaps = [['stand', 32, 1.32, .72], ['crouch', 23, 1, .82], ['prone', 38, 1.8, .62]] as const;
    /** A kit on the walker's clock, as the page's (`matchFirearm.ts`). */
    const kitOn = (w: Walker) => new Kit({ swapClip: to => w.swapWeapon(to), swapProgress: () => w.swapProgress(), canSwap: () => true, item: () => { } });
    /** Ticks a swap to its end; the tick the kit handed off and the clip's seconds then (the action's, else the overlay's). */
    const run = (w: Walker, kit: Kit) => {
        let out: { tick: number; t: number } | null = null;
        for (let i = 1; i < 240 && kit.swapping(); i++) {
            w.tick(still);
            kit.frame(TICK);
            if (!out && kit.state().swap?.handed) out = { tick: i, t: (w.action ?? w.overlay)!.t };
        }
        expect(kit.swapping()).toBe(false);
        return out;
    };
    beforeAll(() => {
        const reload = flat().walker;
        reload.stance = 'crouch';
        expect(reload.hold('seal_crouch_reload', 1.9)).toBe(true);
        reload.changeStance('stand');
        reloadStance = reload.stance;
        const swap = flat().walker;
        expect(swap.swapWeapon('pistol')?.action).toBe('swapStand');
        swap.changeStance('prone');
        swapStance = swap.stance;
        const d = flat();
        d.walker.state.vz = -45;
        expect(d.walker.swapWeapon('pistol')?.overlay).toBe(true);
        diveAccepted = d.moves.dive(d.walker);
        const control = flat();
        control.walker.state.vz = -45;
        expect(control.moves.dive(control.walker)).toBe(true);
        for (const [stance, frames, playback] of swaps) {
            const w = flat().walker;
            w.stance = stance;
            const kit = kitOn(w);
            expect(kit.select('pistol')).toBe(true);
            for (let i = 1; i < 180; i++) {
                w.tick(still);
                kit.frame(TICK);
                if (kit.state().swap?.handed) {
                    expect(w.action).not.toBeNull();
                    handoffs.set(stance, w.action!.t / (playback * ((frames - 1) / frames)));
                    handed.set(`${stance} forward`, { tick: i, t: w.action!.t });
                    break;
                }
            }
            expect(handoffs.has(stance)).toBe(true);
            for (let i = 0; i < 240 && kit.swapping(); i++) { w.tick(still); kit.frame(TICK); }
            expect(kit.item()).toBe('pistol');
            // back to the rifle: the same clip reversed (FUN_005a64c0's 4th argument 1, D:L461974/461979/461988)
            expect(kit.select('rifle')).toBe(true);
            expect(w.action?.reversed).toBe(true);
            const back = run(w, kit);
            if (back) handed.set(`${stance} reversed`, back);
        }
        // the moving overlay, kind 6 forward then kind 5 backwards (FUN_00587780 D:L445372-445401)
        const m = flat().walker, mk = kitOn(m);
        m.state.vz = -45;
        expect(mk.select('pistol')).toBe(true);
        expect(m.overlay?.reversed).toBe(false);
        const fwd = run(m, mk);
        if (fwd) handed.set('overlay forward', fwd);
        m.state.vz = -45;
        expect(mk.select('rifle')).toBe(true);
        expect(m.overlay?.reversed).toBe(true);
        const rev = run(m, mk);
        if (rev) handed.set('overlay reversed', rev);
        // the standing swap cut by the stick on its 31st tick, each way (FUN_00550ef0 D:L418227-418250)
        for (const way of ['forward', 'reversed'] as const) {
            const c = flat().walker, ck = kitOn(c);
            if (way === 'reversed') { expect(ck.select('pistol')).toBe(true); run(c, ck); }
            expect(ck.select(way === 'forward' ? 'pistol' : 'rifle')).toBe(true);
            for (let i = 0; i < 30; i++) { c.tick(still); ck.frame(TICK); }
            const cutT = c.action!.t + TICK;                    // the cut tick's clocks run before the cut
            c.tick({ forward: 1, right: 0, boost: false });
            expect(c.action).toBeNull();
            carry.set(way, { cutT, overlayT: c.overlay!.t });
        }
    });
    // FUN_00552ec0 D:L418927-418930; full-body one-shots do not pass the outer stance gate.
    it('defers stance while a still crouch reload owns the body', () => expect(reloadStance).toBe('crouch'));
    it('defers stance while the full-body swap owns the body', () => expect(swapStance).toBe('stand'));
    // FUN_00584b00 D:L443995-444001 -> FUN_005a7980 D:L462471-462506 includes the moving swap overlay.
    it('refuses a dive during a moving weapon swap', () => expect(diveAccepted).toBe(false));
    // FUN_0028c7c0 D:L134313-134374; callbacks .72/.82/.62 at D:L446367-446396 use phase, not t/duration.
    for (const [stance, , , trigger] of swaps) {
        it(`${stance} swap waits for the original callback phase`, () => expect(handoffs.get(stance)!).toBeGreaterThanOrEqual(trigger));
    }
    // Research 251 §10.2-§10.3: the stack's callback is a crossing of the play's phase, `t / (P·e)` forward and
    // `e - t / (P·e)` reversed (FUN_0028c160 D:L134080-134101 starts it at e), against the same h both ways; the hand-off
    // is the first tick past it. Forward and reversed of one clip each hand off on their own side (the direction control).
    const SOURCE_TICKS = { stand: [56, 20], crouch: [48, 8], prone: [66, 38] } as const;
    for (const [stance, frames, playback, h] of swaps) {
        const e = (frames - 1) / frames, phase = (t: number, reversed: boolean) => reversed ? e - t / (playback * e) : t / (playback * e);
        for (const [i, way] of (['forward', 'reversed'] as const).entries()) {
            it(`${stance} swap ${way}: hands off on the first tick its phase crosses ${h} (tick ${SOURCE_TICKS[stance][i]})`, () => {
                const got = handed.get(`${stance} ${way}`);
                expect(got).toBeDefined();
                const reversed = way === 'reversed', past = (p: number) => reversed ? p <= h : p >= h;
                expect(past(phase(got!.t, reversed))).toBe(true);
                expect(past(phase(got!.t - TICK, reversed))).toBe(false);
                expect(got!.tick).toBe(SOURCE_TICKS[stance][i]);
            });
        }
    }
    // Research 251 §10.2: the overlay's check (FUN_0028d0a0 D:L134651-134676) is one game frame ahead on the key phase
    // `u = t / P`: `u + s >= 0.79` forward, `u - s <= 0.79` backwards (kind 5 starts at t = P·e), s = GAME_FRAME_DT / (P·e).
    {
        const P = SWAP_OVERLAY.playback, e = (SWAP_OVERLAY.frames - 1) / SWAP_OVERLAY.frames, s = GAME_FRAME_DT / (P * e), h = 0.79;
        const passed = (t: number, reversed: boolean) => reversed ? (e - t / P) - s <= h : t / P + s >= h;
        for (const [way, tick] of [['forward', 61], ['reversed', 11]] as const) {
            it(`the moving overlay ${way}: hands off one game frame before its key phase crosses 0.79 (tick ${tick})`, () => {
                const got = handed.get(`overlay ${way}`);
                expect(got).toBeDefined();
                expect(passed(got!.t, way === 'reversed')).toBe(true);
                expect(passed(got!.t - TICK, way === 'reversed')).toBe(false);
                expect(got!.tick).toBe(tick);
            });
        }
    }
    // Research 251 §10.5: the cut's carry-over sets the overlay's clock to the stack's phase x P_ov x e_ov (D:L418236 /
    // D:L418247), the port to its normalised duration. Not this row's: the carry moves the overlay's end, which is the
    // room's swap life (`room.ts` swapProgress() !== null), so it waits for a row that checks the room with it.
    {
        const [, frames, playback] = swaps[0], e = (frames - 1) / frames;
        const ov = SWAP_OVERLAY.playback * ((SWAP_OVERLAY.frames - 1) / SWAP_OVERLAY.frames);
        it.fails('the standing swap cut forward carries the stack\'s phase onto the overlay\'s clock', () => {
            const c = carry.get('forward')!;
            expect(c.overlayT).toBeCloseTo((c.cutT / (playback * e)) * ov, 6);
        });
        it.fails('the standing swap cut reversed carries the stack\'s phase onto the overlay\'s clock, counting down', () => {
            const c = carry.get('reversed')!;
            expect(ov - c.overlayT).toBeCloseTo((e - c.cutT / (playback * e)) * ov, 6);
        });
    }
});

/**
 * Research 251 §11 (PARITY-2, PAR-29): a kit hold asked over a running one. Reading, pending review: the original's
 * answer per running hold, through the page's mover (`Walker.hold`, which the room's `MoverSim.apply` calls too).
 * Component contracts on a synthetic floor, not a run of the original.
 */
describe('research 251 §11: a kit hold asked over a running one', () => {
    const RELOADS: HoldClip[] = ['seal_crouch_reload', 'seal_p_crouch_reload', 'seal_prone_reload', 'seal_p_prone_reload'];
    const THROWS: HoldClip[] = ['seal_throwgrenade', 'seal_tossgrenade', 'seal_crouch_throwgrenade', 'seal_prone_throwgrenade',
        'seal_prone_tossgrenade', 'seal_toss_rlean', 'seal_toss_llean', 'seal_p_tossgrenade'];
    const ALL = HOLD_CODES as readonly HoldClip[];
    /** A walker holding `running` for `ticks` ticks, the ends it heard from then on. */
    const holding = (running: HoldClip, ticks = 10) => {
        const w = flat().walker;
        expect(w.hold(running)).toBe(true);
        for (let i = 0; i < ticks; i++) w.tick(still);
        expect(w.holding?.clip).toBe(running);
        const ends: [string | undefined, string][] = [];
        w.onActionEnd((e) => ends.push([e.body?.name, e.reason]));
        return { w, ends, t: w.holding!.t, starts: w.holdStarts };
    };
    /** Refused: false, the running clip kept at its own time, nothing ended, no new start; it then plays on. */
    const refused = (running: HoldClip, asked: HoldClip) => {
        const r = holding(running);
        expect(r.w.hold(asked)).toBe(false);
        expect(r.w.holding?.clip).toBe(running);
        expect(r.w.holding?.t).toBe(r.t);
        expect(r.w.holdStarts).toBe(r.starts);
        expect(r.ends).toEqual([]);
        expect(holdOverHold(running, asked)).toBe('refused');
        r.w.tick(still);
        expect(r.w.holding?.t).toBeCloseTo(r.t + TICK, 9);
    };
    // FUN_005a7de0 D:L462636 (FUN_005a7ab0 D:L462526-462559) refuses a throw or a placing; the reload's press D:L453461
    // and its push FUN_005c2a90 D:L477398 refuse a reload.
    for (const running of RELOADS) {
        it(`${running} refuses every kit hold, itself included, and plays on (FUN_005a7ab0)`, () => {
            for (const asked of ALL) refused(running, asked);
        });
    }
    // FUN_005a7de0 D:L462620-462634 refuses a throw or a placing over a throw; FUN_005c2a90's FUN_005a7d10 D:L477397 a
    // reload. The pistol hand's throws share these codes and are refused too (HOLD_OVER_THROW_HAND_READING).
    for (const running of THROWS) {
        it(`${running} refuses every kit hold, itself included, and plays on (FUN_005a7de0, FUN_005a7d10)`, () => {
            for (const asked of ALL) refused(running, asked);
        });
    }
    // FUN_0057d540 D:L440344-440350: the current action asked again pushes nothing; FUN_00577e40 D:L437398-437412 counts
    // the pistol's kin as the same action (C4's two hands).
    for (const [running, asked] of [['seal_place_claymore', 'seal_place_claymore'], ['seal_put_onwall', 'seal_put_onwall'],
        ['seal_put_onwall', 'seal_p_put_onwall'], ['seal_p_put_onwall', 'seal_put_onwall'], ['seal_p_put_onwall', 'seal_p_put_onwall']] as const) {
        it(`${asked} over ${running}: the same placing again is refused, the clip running on (FUN_0057d540)`, () => refused(running, asked));
    }
    // A different item over a placing: the original pushes it over the placing (D:L446292, FUN_0028dc90) and a still
    // reload clears the stack first (FUN_0058a4d0 D:L462925-462926); the port's one hold replaces it.
    for (const running of ['seal_place_claymore', 'seal_put_onwall', 'seal_p_put_onwall'] as const) {
        const others = ALL.filter((c) => holdFamily(c) !== 'place' || (running === 'seal_place_claymore') !== (c === 'seal_place_claymore'));
        it(`${running}: a different item over it is laid, the placing ended replaced (HOLD_OVER_PLACE_READING; a still reload's replacement read)`, () => {
            for (const asked of others) {
                const r = holding(running);
                expect(r.w.hold(asked)).toBe(true);
                expect(r.w.holding?.clip).toBe(asked);
                expect(r.w.holding?.t).toBe(0);
                expect(r.w.holdStarts).toBe(r.starts + 1);
                expect(r.ends).toEqual([[running, 'replaced']]);
                expect(holdOverHold(running, asked)).toBe('replaced');
            }
        });
    }
    it('the two readings name the port\'s choices (research 251 s7)', () => {
        expect(HOLD_OVER_PLACE_READING).toBe('replaced');
        expect(HOLD_OVER_THROW_HAND_READING).toBe('refused');
    });
    it('controls: a hold on a free body is taken, and after the running one ends the next is taken', () => {
        const w = flat().walker;
        expect(w.hold('seal_throwgrenade')).toBe(true);
        for (let i = 0; i < 200 && w.holding; i++) w.tick(still);
        expect(w.holding).toBeNull();
        expect(w.hold('seal_throwgrenade')).toBe(true);
        expect(w.holdStarts).toBe(2);
    });
});
