import { describe, expect, it } from 'vitest';
import { DEFAULT_RIFLE, HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import {
  BINOCULARS, eyeBob, fireRefused, hudZoom, ITEM_ZOOM_MODES, NIGHT_OVERRIDE, nightView, reloadRefused, SCOPE_SLOW, Zoom,
  VIEW_RANGE_EXTRA_READING, viewRangeExtra, ZOOM_BINOCULARS, ZOOM_FIRST, ZOOM_NIGHT, zoomsIn,
} from '../src/zoom';

/**
 * The view states and the zoom (research 84 §7): `FUN_005445b0` in, `FUN_00544400` out, `FUN_005448a0` the set -- with
 * the first-person state (1, 1.01x) restored by the owner's ruling of 2026-10-01 (superseding 2026-09-29's "no first
 * person") and the binoculars (state 4, 9x) back by the owner's yes of the same day: from first person a weapon of
 * fewer than two `ZoomMode`s goes to 4 (0x54480c), as the original does.
 */

const oneMode = { ...DEFAULT_RIFLE, zoomModes: [1.5] };              // a rifle-class weapon of NumZoomModes 1
const sniper = { ...DEFAULT_RIFLE, zoomModes: [1.5, 6, 12] };        // the M40A1

describe('the zoom steps', () => {
  it('the M4A1 SD: third -> first person -> 3x, and in stays there; out goes back through first person to third', () => {
    const z = new Zoom(HELD_RIFLE);
    expect([z.state(), z.view()]).toEqual([0, 'third']);
    expect(z.zoomIn()).toBe(1);                                      // FUN_005445b0: 0 -> 1 always
    expect([z.view(), z.target(), z.firstPerson(), z.scoped(), z.lens()]).toEqual(['first', ZOOM_FIRST, true, false, true]);
    expect(z.zoomIn()).toBe(5);                                      // NumZoomModes 2: 1 -> 5 (0x544804), not 4
    expect(z.target()).toBe(3);                                      // ZoomMode[5 - 4]: ZoomMode1
    expect(z.zoomIn()).toBe(5);                                      // 5 - 3 < 2 is false: no more levels
    expect(z.zoomOut()).toBe(1);                                     // FUN_00544400: 5 -> 1
    expect(z.zoomOut()).toBe(0);                                     // 1 -> 0
    expect(z.zoomOut()).toBe(0);
  });

  it('the M4A1 scopes at 2.5; its ZoomMode0 1.5 is never a magnification', () => {
    const z = new Zoom(DEFAULT_RIFLE);
    z.zoomIn();
    z.zoomIn();
    expect(z.target()).toBe(2.5);
  });

  it('a sniper steps 6 then 12; a weapon of one zoom mode goes from first person into the binoculars (0x54480c)', () => {
    const s = new Zoom(sniper);
    s.zoomIn();
    s.zoomIn();
    expect(s.target()).toBe(6);
    expect(s.zoomIn()).toBe(6);
    expect(s.target()).toBe(12);
    expect(s.zoomOut()).toBe(5);
    expect(s.zoomOut()).toBe(1);
    expect(s.zoomOut()).toBe(0);
    // FUN_005445b0 0x5447f0-0x54480c: from first person, fewer than two ZoomModes -> state 4, the binoculars at 9x;
    // 0x544810-0x54482c: from 4, fewer than two -> stay. The M16A2, the AK-47, the M60E3, the 870 ...
    const p = new Zoom(oneMode);
    expect(p.zoomIn()).toBe(1);
    expect(p.zoomIn()).toBe(BINOCULARS);
    expect([p.view(), p.target(), p.binoculars(), p.scoped(), p.lens(), p.firstPerson()]).toEqual(['binoculars', ZOOM_BINOCULARS, true, true, true, false]);
    expect(p.zoomIn()).toBe(BINOCULARS);                             // no wrap, no scope past them
    expect(p.zoomOut()).toBe(1);                                     // FUN_00544400 0x5444d8: 4 -> 1
    expect(p.zoomOut()).toBe(0);
    expect([p.cycle(), p.cycle(), p.cycle(), p.cycle()]).toEqual([1, 4, 0, 1]);   // the mouse: third, first, binoculars, third
    const none = new Zoom({ ...DEFAULT_RIFLE, zoomModes: [] });       // no ZoomMode at all: fewer than two as well
    expect([none.zoomIn(), none.zoomIn(), none.zoomIn()]).toEqual([1, 4, 4]);
    expect(none.lookScale()).toBe(SCOPE_SLOW);                        // FUN_005be660 past the count: 1, x 0.2
  });

  it('the pistol reaches first person, then the binoculars (READERC M62_BINOC); on a night map the goggles, and stays', () => {
    expect(zoomsIn(HELD_SIDEARM)).toBe(false);
    expect(zoomsIn(HELD_RIFLE)).toBe(true);
    expect(zoomsIn(DEFAULT_RIFLE)).toBe(true);
    expect(zoomsIn(sniper)).toBe(true);
    expect(zoomsIn(oneMode)).toBe(false);
    const p = new Zoom(HELD_SIDEARM);
    expect(p.zoomIn()).toBe(1);                                      // first person
    expect(p.zoomIn()).toBe(4);                                      // the binoculars (not a scope: no ret_scope, 9x)
    expect([p.view(), p.target(), p.scoped()]).toEqual(['binoculars', 9, true]);
    expect(p.zoomOut()).toBe(1);
    expect(p.zoomOut()).toBe(0);
    for (const w of [HELD_SIDEARM, oneMode]) {
      const night = new Zoom(w, true);
      expect(night.zoomIn()).toBe(1);
      expect(night.zoomIn()).toBe(3);                                // FUN_005445b0: 1 -> 3 on a night map (0x5447e4)
      expect(night.zoomIn()).toBe(3);                                // 0x544810: 3 with fewer than two modes stays
      expect(night.zoomOut()).toBe(1);                               // FUN_00544400: 3 -> 1
      expect(night.zoomOut()).toBe(0);
    }
    // Scoped with the rifle, the pistol taken up: out of the scope to first person [reading], and on into the binoculars.
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();
    z.zoomIn();
    expect(z.state()).toBe(5);
    z.setWeapon(HELD_SIDEARM);
    expect(z.state()).toBe(1);
    z.setWeapon(oneMode);
    expect(z.zoomIn()).toBe(4);
  });

  it('the binoculars stay through a weapon switch (FUN_005c4b10 drops only the night vision); a scoped weapon steps on to 5', () => {
    const z = new Zoom(HELD_SIDEARM);
    z.zoomIn();
    z.zoomIn();
    expect(z.state()).toBe(4);
    z.setWeapon(oneMode);
    expect(z.state()).toBe(4);
    z.setWeapon(HELD_RIFLE);
    expect(z.state()).toBe(4);                                       // still the binoculars, the SD in the hand
    expect(z.zoomIn()).toBe(5);                                      // 0x544810: 4 with two modes -> 5
    expect(z.target()).toBe(3);
  });

  it('a launcher-round mode and a raised LAW / RPG-7 stay at first person, night or not; an item reaches the binoculars', () => {
    for (const hold of ['round', 'launcher'] as const) {
      for (const night of [false, true]) {
        for (const w of [sniper, oneMode]) {
          const z = new Zoom(w, night);                              // a scoped weapon's or not
          z.setHold(hold);
          expect([hold, night, z.zoomIn(), z.zoomIn()]).toEqual([hold, night, 1, 1]);
          expect([hold, night, z.cycle()]).toEqual([hold, night, 0]);
        }
      }
      const scoped = new Zoom(sniper);
      scoped.zoomIn();
      scoped.zoomIn();
      scoped.setHold(hold);                                          // FUN_00216770: +0x200 > 1 -> 1
      expect([hold, scoped.state()]).toEqual([hold, 1]);
      const goggles = new Zoom(sniper, true);
      goggles.zoomIn();
      goggles.zoomIn();
      expect(goggles.state()).toBe(3);
      goggles.setHold(hold);
      expect([hold, goggles.state()]).toEqual([hold, 1]);
      const binocs = new Zoom(oneMode);
      binocs.zoomIn();
      binocs.zoomIn();
      expect(binocs.state()).toBe(4);
      binocs.setHold(hold);                                          // the binoculars too (+0x200 > 1)
      expect([hold, binocs.state()]).toEqual([hold, 1]);
      scoped.setHold('firearm');                                     // back to the firearm's own mode: it scopes again
      expect([hold, scoped.zoomIn()]).toEqual([hold, 5]);
    }
    // FUN_005445b0 has no item gate; an item's record has NumZoomModes 1 (every one on the disc): first person, binoculars.
    expect(ITEM_ZOOM_MODES).toBe(1);
    const item = new Zoom(sniper);
    item.setHold('item');
    expect([item.zoomIn(), item.zoomIn(), item.zoomIn()]).toEqual([1, 4, 4]);
    const nightItem = new Zoom(sniper, true);
    nightItem.setHold('item');
    expect([nightItem.zoomIn(), nightItem.zoomIn(), nightItem.zoomIn()]).toEqual([1, 3, 3]);
    const scoped = new Zoom(sniper);
    scoped.zoomIn();
    scoped.zoomIn();
    scoped.setHold('item');                                          // the grenade up: out of the scope to first person
    expect(scoped.state()).toBe(1);
    const held = new Zoom(oneMode);
    held.zoomIn();
    held.zoomIn();
    held.setHold('item');                                            // the grenade up in the binoculars: they stay
    expect(held.state()).toBe(4);
  });

  it('night maps: third -> first person -> the night vision -> the scope, and back out the same way', () => {
    const z = new Zoom(HELD_RIFLE, true);
    expect(z.zoomIn()).toBe(1);
    expect(z.zoomIn()).toBe(3);
    expect(z.target()).toBe(ZOOM_NIGHT);
    expect(z.zoomIn()).toBe(5);
    expect(z.zoomOut()).toBe(3);                                     // 5 -> 3 at night
    expect(z.zoomOut()).toBe(1);
    expect(z.zoomOut()).toBe(0);
  });

  it('the view from the eye is every state but third person (first person, the night vision, the binoculars, the scope)', () => {
    const z = new Zoom(HELD_RIFLE, true);
    expect(z.lens()).toBe(false);
    for (let i = 0; i < 3; i++) {
      z.zoomIn();
      expect(z.lens()).toBe(true);
    }
    z.reset();
    expect(z.lens()).toBe(false);
    const b = new Zoom(oneMode);
    b.zoomIn();
    b.zoomIn();
    expect([b.state(), b.lens()]).toEqual([4, true]);
  });

  it('the first-person bob runs in states 1-3 only (FUN_005966a0 453829), not in third person, the binoculars nor a scope', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 12].map(eyeBob)).toEqual([false, true, true, true, false, false, false, false]);
  });

  it('the mouse cycle: third, first person, the scope, back to third', () => {
    const z = new Zoom(HELD_RIFLE);
    expect([z.cycle(), z.cycle(), z.cycle(), z.cycle()]).toEqual([1, 5, 0, 1]);
  });

  it('runs to the magnification at 3 x the target a second, and the FOV and the look follow it', () => {
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();                                                      // 1 -> 1.01 at 3.03 a second
    z.update(1);
    expect(z.magnification()).toBe(ZOOM_FIRST);
    expect(z.lookScale()).toBe(1);                                   // FUN_005be660 at state 1: 1, no slow
    expect(z.moveScale()).toBe(1);
    expect(z.fov(49)).toBeCloseTo((360 / Math.PI) * Math.atan(Math.tan((49 * Math.PI) / 360) / 1.01), 9);
    z.zoomIn();                                                      // 1.01 -> 3 at 9 a second
    z.update(0.1);
    expect(z.magnification()).toBeCloseTo(1.01 + 0.9, 9);
    z.update(1);
    expect(z.magnification()).toBe(3);
    expect(z.fov(49)).toBeCloseTo((360 / Math.PI) * Math.atan(Math.tan((49 * Math.PI) / 360) / 3), 9);
    expect(z.lookScale()).toBeCloseTo(1 / 3, 12);
    expect(z.moveScale()).toBe(0.2);
    z.zoomOut();                                                     // back out at 3 x the old target: 9 a second
    z.update(0.1);
    expect(z.magnification()).toBeCloseTo(2.1, 9);
    const night = new Zoom(HELD_RIFLE, true);
    night.zoomIn();
    night.zoomIn();
    expect(night.lookScale()).toBe(1);                               // the night vision changes nothing in the look
  });

  it('a down run that arrives zeroes its rate in that same update (FUN_001f0490 D:L52795): a zoom-out straight after takes 3 x the old target', () => {
    const z = new Zoom(sniper);
    z.zoomIn(); z.zoomIn(); z.zoomIn();                              // state 6, 12x
    z.settle();
    z.zoomOut();                                                     // 12 -> 6 at 36 a second
    z.update(1);                                                     // passes 6: stops on it, the rate 0 here
    expect(z.magnification()).toBe(6);
    z.zoomOut();                                                     // no update between: max(0, 3 x 6) = 18, not 36
    z.update(0.05);
    expect(z.magnification()).toBeCloseTo(6 - 18 * 0.05, 9);
  });

  it('an up run that arrives zeroes its rate in that same update (FUN_001f0490 D:L52788): a zoom-out straight after takes 3 x the old target', () => {
    const z = new Zoom(sniper);
    z.zoomIn();
    z.settle();                                                      // state 1, 1.01
    z.zoomIn();                                                      // state 5, 6x
    z.zoomIn();                                                      // state 6, 12x at 36 a second
    z.update(0.05);                                                  // 1.01 + 1.8 = 2.81, rising
    z.zoomOut();                                                     // back to 6x, max(36, 3 x 12) = 36: still under 6, an up run
    z.update(0.1);                                                   // 2.81 + 3.6 passes 6: stops on it, the rate 0 here
    expect(z.magnification()).toBe(6);
    z.zoomOut();                                                     // no update between: max(0, 3 x 6) = 18, not 36
    z.update(0.05);
    expect(z.magnification()).toBeCloseTo(6 - 18 * 0.05, 9);
  });

  it('the run stops its rate at arrival (FUN_001f0490 D:L52788, D:L52795), so a later zoom-out runs at 3 x the old target', () => {
    const z = new Zoom(sniper);
    z.zoomIn(); z.zoomIn(); z.zoomIn();                              // state 6, 12x
    z.settle();
    z.zoomOut();                                                     // 12 -> 6 at 3 x 12 = 36 a second
    for (let i = 0; i < 60; i++) z.update(1 / 60);
    expect(z.magnification()).toBe(6);
    z.zoomOut();                                                     // 6 -> 1.01 at 3 x 6 = 18 a second, not 36
    z.update(0.05);
    expect(z.magnification()).toBeCloseTo(6 - 18 * 0.05, 9);
    // A zoom-out begun mid-run keeps the larger rate in flight (FUN_001f0750 D:L52895-52900: the rate only rises).
    const mid = new Zoom(sniper);
    mid.zoomIn(); mid.zoomIn(); mid.zoomIn();
    mid.settle();
    mid.zoomOut();                                                   // 36 a second toward 6
    mid.update(0.05);                                                // 12 - 1.8 = 10.2, not arrived
    mid.zoomOut();                                                   // max(36, 3 x 6) = 36
    mid.update(0.05);
    expect(mid.magnification()).toBeCloseTo(10.2 - 36 * 0.05, 9);
  });

  it('the binoculars: 9x at 27 a second, the look 1 / ZoomMode0 x 0.2 (FUN_005966a0, DAT_00650638), the move x 0.2', () => {
    for (const w of [HELD_SIDEARM, oneMode]) {
      const z = new Zoom(w);
      z.zoomIn();
      z.update(1);
      z.zoomIn();
      expect(z.state()).toBe(4);
      z.update(0.1);                                                 // FUN_001f1610: 3 x the target, 27 a second
      expect(z.magnification()).toBeCloseTo(1.01 + 2.7, 9);
      z.update(1);
      expect(z.magnification()).toBe(9);
      expect(z.fov(49)).toBeCloseTo((360 / Math.PI) * Math.atan(Math.tan((49 * Math.PI) / 360) / 9), 9);
      expect(z.lookScale()).toBeCloseTo((1 / 1.5) * 0.2, 12);        // ZoomMode0 1.5 (every record), x 0.2
      expect(z.moveScale()).toBe(0.2);
      z.zoomOut();                                                   // out at 3 x the old target: 27 a second
      z.update(0.1);
      expect(z.magnification()).toBeCloseTo(9 - 2.7, 9);
    }
  });

  it('a weapon switch drops the night vision to first person only off a night mission (FUN_005c4b10); a scope stays', () => {
    const night = new Zoom(HELD_RIFLE, true);
    night.zoomIn();
    night.zoomIn();
    expect(night.state()).toBe(3);
    night.setWeapon(DEFAULT_RIFLE);
    expect(night.state()).toBe(3);                                   // NightMission set: the goggles stay on
    // Off a night mission the state is reached only by a special-class flag (`nightView`, off on the disc); set it straight.
    const day = new Zoom(HELD_RIFLE);
    day.set(3);
    day.setWeapon(DEFAULT_RIFLE);
    expect(day.state()).toBe(1);
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();
    z.zoomIn();
    z.setWeapon(DEFAULT_RIFLE);
    expect(z.state()).toBe(5);
    const fp = new Zoom(HELD_RIFLE);
    fp.zoomIn();
    fp.setWeapon(HELD_SIDEARM);
    expect(fp.state()).toBe(1);                                      // first person survives the switch
  });
});

describe('the fire, the reload and the HUD in the binoculars', () => {
  it('FUN_005be9a0 475290-475305: no use of the trigger in state 4 -- by the view state alone, every item the page holds', () => {
    // cVar4 is the record's +0x7c byte, its ID (FUN_003cda30 L322435 stores the `ID` key, 0x3fca50, there); 0x0b is the
    // Designator's ID (class pistol by FUN_003d1a60). Its branch fires no round and the page never holds it as itself
    // (no firearm record: the slot fires the baked placeholder), so the exemption is not ported and takes no item.
    expect((fireRefused as (...a: number[]) => boolean)(4, 0x0b)).toBe(true);   // the Designator's ID: refused too
    for (let s = 0; s <= 12; s++) expect([s, fireRefused(s)]).toEqual([s, s === 4]);
  });

  it('FUN_005c2a90 477410: no reload begins in state 4', () => {
    for (let s = 0; s <= 12; s++) expect([s, reloadRefused(s)]).toEqual([s, s === 4]);
  });

  it('FUN_001f6ce0: the HUD reads 9.0 in the binoculars and ZoomMode[state - 4] in a scope -- the state\'s, not the run\'s', () => {
    expect([0, 1, 2, 3].map((s) => hudZoom(s, [1.5, 3]))).toEqual([0, 0, 0, 0]);
    expect(hudZoom(4, [1.5])).toBe(9);
    expect(hudZoom(5, [1.5, 3])).toBe(3);
    expect(hudZoom(6, [1.5, 6, 12])).toBe(12);
    expect(hudZoom(6, [1.5, 3])).toBe(1);                            // past the count: FUN_005be660's 1
    const z = new Zoom(HELD_SIDEARM);
    z.zoomIn();
    z.zoomIn();
    expect([z.hudZoom(), z.magnification()]).toEqual([9, 1]);        // the readout is 9.0 while the run starts
  });
});

describe('the render view (PF-29, research 232 §2)', () => {
  it("the view range's extension by state (FUN_001f0750 D:L52939, 53049, 53075, 53159; FUN_001f1470 D:L53202-53255): 0 in states 0-2, +200 in night vision and the binoculars, +300 in every scope, 0 again on exit (VIEW_RANGE_EXTRA_READING); renderView carries the magnification on screen", () => {
    expect(VIEW_RANGE_EXTRA_READING).toEqual({ nightvision: 200, binoculars: 200, scope: 300 });
    expect([0, 1, 2].map(viewRangeExtra)).toEqual([0, 0, 0]);
    expect(viewRangeExtra(3)).toBe(200);                              // DAT_003dc368, 200.0 in .data (D:L53049)
    // DAT_0043666c / DAT_00436670: CMission +0x18c / +0x190, 200.0 / 300.0 written by its constructor FUN_002adbc0
    // (D:L152890-152891); SEEFARTHER_BINOCS / SEEFARTHER_WEAPZOOM may override them (FUN_002aab20 D:L151383-151384),
    // absent on all 34 retail mission scripts, and an absent key leaves the value as it was (reconciliation C13). Was:
    // "200.0 live" / "300.0 live" (read in RDRAM dumps, the writer not found).
    expect(viewRangeExtra(BINOCULARS)).toBe(200);                     // DAT_0043666c, the constructor's 200.0 (D:L53075)
    for (let s = 5; s <= 12; s++) expect([s, viewRangeExtra(s)]).toEqual([s, 300]);   // DAT_00436670, the constructor's 300.0 (D:L53159)

    const z = new Zoom(sniper);
    expect(z.renderView()).toEqual({ magnification: 1, farExtra: 0 });
    z.zoomIn();                                                       // first person
    expect(z.renderView().farExtra).toBe(0);
    z.zoomIn();                                                       // the scope, state 5 (6x)
    expect(z.renderView()).toEqual({ magnification: z.magnification(), farExtra: 300 });   // at once: the run has not moved
    z.update(0.1);
    expect(z.renderView().magnification).toBe(z.magnification());     // the run on screen, not the target
    expect(z.renderView().magnification).toBeGreaterThan(ZOOM_FIRST);
    expect(z.renderView().magnification).toBeLessThan(z.target());
    z.settle();
    expect(z.renderView()).toEqual({ magnification: 6, farExtra: 300 });
    z.zoomOut();                                                      // FUN_00544400: 5 -> 1, restored at once
    expect(z.renderView().farExtra).toBe(0);
    z.zoomOut();                                                      // 1 -> 0
    expect(z.renderView().farExtra).toBe(0);

    const b = new Zoom(HELD_SIDEARM);
    b.zoomIn(); b.zoomIn(); b.settle();
    expect(b.renderView()).toEqual({ magnification: ZOOM_BINOCULARS, farExtra: 200 });
    b.reset();                                                        // death: 0 and 1.0 at once
    expect(b.renderView()).toEqual({ magnification: 1, farExtra: 0 });

    const n = new Zoom(HELD_SIDEARM, true);
    n.zoomIn(); n.zoomIn();
    expect([n.state(), n.renderView().farExtra]).toEqual([3, 200]);
    n.zoomOut();
    expect([n.state(), n.renderView().farExtra]).toEqual([1, 0]);
  });
});

describe('the night step gate (FUN_005445b0 410733-410744, 0x5445ec-0x54464c, 0x5447b8-0x5447e4)', () => {
  it('the special-class flags: off on the disc, so the night step is the map flag for every item', () => {
    expect(NIGHT_OVERRIDE).toEqual({ primary: null, secondary: null });
    for (const id of [54, 62, 15, 121, 151, 145]) {
      expect([id, nightView(true, id), nightView(false, id)]).toEqual([id, true, false]);
    }
  });

  it('a set flag decides for its class whatever the map: DAT_00436674/78 the primaries, DAT_0043667c/80 the pistols', () => {
    const on = { primary: true, secondary: false };
    expect([nightView(false, 54, on), nightView(true, 15, on), nightView(true, 121, on)]).toEqual([true, false, true]);
    const pistol = { primary: null, secondary: true };
    expect([nightView(false, 15, pistol), nightView(false, 54, pistol), nightView(true, 54, pistol)]).toEqual([true, false, true]);
  });

  it('the Zoom takes the gate in, out and at a switch (FUN_005445b0, FUN_00544400, FUN_005c4b10)', () => {
    const forced = new Zoom(HELD_RIFLE, false, { primary: true, secondary: null });
    forced.zoomIn();
    forced.zoomIn();
    expect(forced.state()).toBe(3);                                   // a day map, the primary's flag set: the goggles
    forced.zoomIn();
    expect(forced.state()).toBe(5);
    forced.zoomOut();
    expect(forced.state()).toBe(3);                                   // 5 -> 3 by the flag
    forced.setWeapon(HELD_SIDEARM);
    expect(forced.state()).toBe(1);                                   // the pistol: the map flag, a day map
    const barred = new Zoom(oneMode, true, { primary: false, secondary: null });
    barred.zoomIn();
    barred.zoomIn();
    expect(barred.state()).toBe(BINOCULARS);                          // a night map, the flag clear: no goggles
  });
});

/**
 * The review of the press order (2026-10-05, item 1): `FUN_00594cf0` reads the shoulders (D:L453288-453312) before the
 * zoom (D:L453313-453323), and the switch writes the new slot `+0x824` at once (`FUN_005c4b10` D:L478842), which the zoom
 * step's record is read through (`FUN_005445b0` -> `FUN_005c3780`: the record of slot `+0x824`). So a step into the
 * scope and a switch in one tick count the step against the new slot. The page takes presses between ticks: a switch
 * after a step in the same tick rewinds the view to the tick's and steps again with the new record (`switchWeapon`).
 */
describe('a switch in the tick a zoom step was taken in: the step counts against the new slot', () => {
  it('the rifle at first person, Up, then L2 before the tick: the binoculars (4), not first person', () => {
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();
    z.markTick();
    expect(z.zoomIn()).toBe(5);
    expect(z.switchWeapon(HELD_SIDEARM).state).toBe(4);
  });
  it('the Mark 23 at first person, Up, then L1 before the tick: the rifle\'s scope (5), not the binoculars', () => {
    const z = new Zoom(HELD_SIDEARM);
    z.zoomIn();
    z.markTick();
    expect(z.zoomIn()).toBe(4);
    expect(z.switchWeapon(HELD_RIFLE).state).toBe(5);
  });
  it('no step since the tick: the switch is the record\'s change alone', () => {
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();
    z.markTick();
    expect(z.switchWeapon(HELD_SIDEARM).state).toBe(1);
    z.zoomIn();
    z.markTick();
    expect(z.switchWeapon(HELD_RIFLE).state).toBe(4);                   // the binoculars stay (FUN_005c4b10 drops only the night vision)
  });
});

/**
 * The review of the zoom replay (2026-10-05, L2): the replay's steps read the new slot's hold too -- `FUN_005445b0`'s
 * state-1 gates read the slot `+0x824` names (its fire mode: a launcher round stays at first person). The rifle in its
 * M203 round mode at first person, Up, then L2: the pistol's step reaches the binoculars; the reverse stays at first
 * person, the rifle's round mode up.
 */
describe('the replay steps with the new slot\'s hold', () => {
  it('the rifle\'s M203 round mode at first person, Up, then L2: the pistol\'s step, the binoculars (4)', () => {
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();
    z.setHold('round');
    z.markTick();
    expect(z.zoomIn()).toBe(1);                                    // a launcher round stays at first person
    expect(z.switchWeapon(HELD_SIDEARM, 'firearm').state).toBe(4);
    expect(z.hold()).toBe('firearm');
  });
  it('the Mark 23 at first person, Up, then L1 to the rifle in its round mode: first person, not the scope', () => {
    const z = new Zoom(HELD_SIDEARM);
    z.zoomIn();
    z.markTick();
    expect(z.zoomIn()).toBe(4);
    expect(z.switchWeapon(HELD_RIFLE, 'round').state).toBe(1);
  });
  it("the path the replay took, from the tick's view: what the page's accuracy reckons the view changes by", () => {
    const z = new Zoom(HELD_RIFLE);
    z.zoomIn();
    z.markTick();
    z.zoomIn();
    expect(z.switchWeapon(HELD_SIDEARM, 'firearm')).toEqual({ state: 4, replayed: true, path: [1, 1, 4] });
    const y = new Zoom(HELD_RIFLE);
    y.zoomIn();
    y.markTick();
    expect(y.switchWeapon(HELD_SIDEARM, 'firearm')).toEqual({ state: 1, replayed: false, path: [1, 1] });
  });
});
