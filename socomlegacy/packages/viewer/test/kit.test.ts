import { describe, expect, it } from 'vitest';
import { HAND_OFF_READING, hotkey, KIT_SLOTS, Kit, pressShoulder, type Firearm } from '../src/kit';
import type { SwapPick, SwapProgress } from '../src/walk';
import { DEFAULT_RIFLE } from '@s2u/scene';
import { Fire, RELOAD_DELAY } from '../src/fire';

/**
 * The WEAPON workstream's kit (`./kit`): L1 the rifle, L2 the Mark 23 (the controller's slots 0.0 and 1.0,
 * `FUN_00598280`); the swap's `m_item` at once going to the pistol and at the end coming back; the pistol to the hand
 * and back to the holster at the clip's hand-off (`FUN_005a7730` / `FUN_005a75d0`); the rifle slung on `spinelo`.
 */
function rig(pick: Partial<SwapPick> | null = { action: 'swapStand', overlay: false, seconds: 1 }, gate = true) {
  const items: Firearm[] = [];
  const asked: Firearm[] = [];
  let started = 0;
  let ok = gate;
  const kit = new Kit({
    swapClip: (to) => { asked.push(to); return pick && { action: null, overlay: false, reversed: to === 'rifle', seconds: 1, ...pick }; },
    canSwap: () => ok,
    item: (i) => items.push(i),
    started: () => { started++; },
  });
  return { kit, items, asked, started: () => started, gate: (on: boolean) => { ok = on; } };
}

describe('the kit\'s slots and the rifle <-> pistol swap', () => {
  it('holds the slots in the kit\'s order, and the hand-off phases per clip', () => {
    expect(KIT_SLOTS).toEqual(['rifle', 'pistol', 'M67', 'HE']);
    expect(HAND_OFF_READING).toEqual({ swapStand: 0.72, swapCrouch: 0.82, swapProne: 0.62, moving: 0.79 });
  });

  it('rifle to pistol: m_item at once, the rifle to spinelo, the pistol to the hand at phase 0.72, the rifle slung at the end', () => {
    const { kit, items, started } = rig();
    expect(kit.state()).toMatchObject({ item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' }, swap: null });
    expect(kit.select('rifle')).toBe(false);                     // the one in the hand: nothing, no toggle back
    expect(kit.select('pistol')).toBe(true);
    expect(started()).toBe(1);
    expect(items).toEqual(['pistol']);                           // FUN_005a7260: m_item 2 at once
    expect(kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'swap', pistol: 'spawn' } });
    expect(kit.swapping()).toBe(true);
    // research 251 §10: the phase is progress x e (31/32 on seal_rifle2pistol), so 0.72 is progress 0.7432
    kit.frame(0.74);
    expect(kit.state().mounts.pistol).toBe('spawn');
    kit.frame(0.01);                                             // phase past 0.72: FUN_005a7730
    expect(kit.state().mounts.pistol).toBe('hand');
    expect(kit.select('pistol')).toBe(false);                    // already going there
    kit.frame(0.3);
    expect(kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' }, swap: null });
    expect(kit.swapping()).toBe(false);
  });

  it('pistol to rifle: the clip backwards, the pistol holstered as it passes the hand-off, m_item back at the end', () => {
    const { kit, items } = rig();
    kit.select('pistol'); kit.frame(1.01);
    items.length = 0;
    expect(kit.select('rifle')).toBe(true);
    expect(items).toEqual([]);                                   // the pistol's anim set until the end
    expect(kit.state().mounts).toEqual({ rifle: 'swap', pistol: 'hand' });
    kit.frame(0.25);                                             // phase e x (1 - 0.25) = 0.7266: not yet
    expect(kit.state().mounts.pistol).toBe('hand');
    kit.frame(0.02);                                             // e x (1 - 0.27) = 0.7072 <= 0.72: FUN_005a75d0
    expect(kit.state().mounts.pistol).toBe('holster');
    kit.frame(0.8);
    expect(kit.state()).toMatchObject({ item: 'rifle', mounts: { rifle: 'hand', pistol: 'holster' }, swap: null });
    expect(items).toEqual(['rifle']);                            // FUN_005a70f0 at the end
  });

  it('the moving overlay hands off a game frame before its key phase reaches 0.79, each way; prone at phase 0.62', () => {
    // research 251 §10: the overlay's key phase is progress x e (20/21), checked one game frame ahead (FUN_0028d0a0):
    // forward at progress (0.79 - s) / e = 0.8016, backwards at 1 - (0.79 + s) / e = 0.1426, s = GAME_FRAME_DT / (P x e)
    const moving = rig({ action: null, overlay: true, seconds: 1 });
    moving.kit.select('pistol');
    moving.kit.frame(0.8);
    expect(moving.kit.state().mounts.pistol).toBe('spawn');
    moving.kit.frame(0.01);
    expect(moving.kit.state().mounts.pistol).toBe('hand');
    moving.kit.frame(0.2);
    expect(moving.kit.swapping()).toBe(false);
    expect(moving.kit.select('rifle')).toBe(true);
    moving.kit.frame(0.14);
    expect(moving.kit.state().mounts.pistol).toBe('hand');
    moving.kit.frame(0.01);
    expect(moving.kit.state().mounts.pistol).toBe('holster');
    // seal_prone_rifle2pistol: e = 37/38, so phase 0.62 is progress 0.6368
    const prone = rig({ action: 'swapProne', overlay: false, seconds: 2 });
    prone.kit.select('pistol');
    prone.kit.frame(1.27);
    expect(prone.kit.state().mounts.pistol).toBe('spawn');
    prone.kit.frame(0.01);
    expect(prone.kit.state().mounts.pistol).toBe('hand');
  });

  it('is refused by the gate (reloading, throwing) and by the mover (in the air, an action): nothing changes', () => {
    const gated = rig(undefined, false);
    expect(gated.kit.select('pistol')).toBe(false);
    expect(gated.asked).toEqual([]);
    const refused = rig(null);
    expect(refused.kit.select('pistol')).toBe(false);
    expect(refused.asked).toEqual(['pistol']);
    expect(refused.kit.state()).toMatchObject({ item: 'rifle', mounts: { rifle: 'hand' } });
  });

  it('settles a swap on leaving the walk, and resets to the spawn\'s hold for a new map', () => {
    const { kit, items } = rig();
    kit.select('pistol');
    kit.settle();
    expect(kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' }, swap: null });
    kit.reset();
    expect(kit.state()).toMatchObject({ item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' } });
    expect(items).toEqual(['pistol', 'rifle']);
  });
});

describe('the PC number keys (the owner, 2026-09-29)', () => {
  it('1 the main weapon, 2 the sidearm, 3, 4 and 5 the equipment slots 1-3 in kit order (W4.R5); nothing else', () => {
    expect(hotkey('Digit1')).toEqual({ firearm: 'rifle' });
    expect(hotkey('Digit2')).toEqual({ firearm: 'pistol' });
    expect(hotkey('Digit3')).toEqual({ equipment: 1 });
    expect(hotkey('Digit4')).toEqual({ equipment: 2 });
    expect(hotkey('Digit5')).toEqual({ equipment: 3 });           // W4.R5: the third slot's key, the sprint's ruling
    for (const code of ['Digit0', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Numpad1', 'KeyQ']) expect(hotkey(code), code).toBeNull();
  });
});

describe('the swap on the clock of the walk (swapProgress: the re-sync the handoff asked for)', () => {
  /** A kit whose host reports the clip the walk plays: `on` is what `swapProgress` answers. */
  function synced() {
    let on: SwapProgress | null = null;
    const items: Firearm[] = [];
    const kit = new Kit({
      swapClip: (to) => { on = { action: 'swapStand', overlay: false, progress: 0 }; return { action: 'swapStand', overlay: false, reversed: to === 'rifle', seconds: 1.24 }; },
      canSwap: () => true, item: (i) => items.push(i), swapProgress: () => on,
    });
    return { kit, items, set: (p: SwapProgress | null) => { on = p; } };
  }

  it('hands off by the clip playing -- the 0.79 of the overlay once a standing swap is cut to it -- and ends when it does', () => {
    const { kit, set } = synced();
    kit.select('pistol');
    set({ action: 'swapStand', overlay: false, progress: 0.5 });
    kit.frame(5);                                            // the kit's own count would be long over: it is not used
    expect(kit.state().swap).toMatchObject({ progress: 0.5, handed: false });
    set({ action: null, overlay: true, progress: 0.75 });    // the stick cut it: the moving overlay at the same phase
    kit.frame(1 / 60);
    expect(kit.state().swap).toMatchObject({ progress: 0.75, handed: false, clip: 'seal_mv_rifle2pistol' });   // past 0.72, not 0.79
    set({ action: null, overlay: true, progress: 0.8 });     // past 0.79 of its seconds, not of its phase (research 251 §10)
    kit.frame(1 / 60);
    expect(kit.state().swap?.handed).toBe(false);
    set({ action: null, overlay: true, progress: 0.81 });    // key phase 0.81 x 20/21 a game frame short of 0.79
    kit.frame(1 / 60);
    expect(kit.state().mounts.pistol).toBe('hand');
    expect(kit.swapping()).toBe(true);
    set(null);                                               // the overlay is over: the swap with it, that frame
    kit.frame(1 / 60);
    expect(kit.state()).toMatchObject({ item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' }, swap: null });
  });

  it('back to the rifle: m_item on the frame the clip ends, not a frame before or after', () => {
    const { kit, items, set } = synced();
    kit.select('pistol'); set(null); kit.frame(1 / 60);
    items.length = 0;
    kit.select('rifle');
    set({ action: 'swapStand', overlay: false, progress: 0.99 });
    kit.frame(1);
    expect(kit.state().mounts.rifle).toBe('swap');
    expect(items).toEqual([]);
    set(null);
    kit.frame(1 / 60);
    expect(kit.state().mounts.rifle).toBe('hand');
    expect(items).toEqual(['rifle']);
  });
});

describe('the reload waits out a swap (FUN_00594cf0 453460-453463: the request only while FUN_005a7ab0 is 0)', () => {
  it('R mid-swap is refused, and taken once the swap has played to its end', () => {
    const { kit } = rig();
    const fire = new Fire({ grid: () => null, aim: () => null, ready: () => !kit.swapping() }, DEFAULT_RIFLE);
    expect(kit.select('pistol')).toBe(true);
    expect(fire.reload()).toBe(false);
    expect(fire.state().magazine.reloading).toBe(false);
    kit.frame(0.5);
    expect(fire.reload()).toBe(false);
    kit.frame(0.6);                                              // the clip's end: the swap is over
    expect(kit.swapping()).toBe(false);
    expect(fire.reload()).toBe(true);
    fire.update(RELOAD_DELAY + 0.001);
    expect(fire.state().magazine.reloading).toBe(true);
  });
});

/**
 * The review of the swap layering (2026-10-05, low 2, and its second round's item 3): L2 with a grenade in hand at the
 * binoculars, or mid-jump, put the grenade away and lowered the launcher, then the swap was refused -- half a press.
 * `FUN_00594cf0` passes the press through all four tests first -- `FUN_005a8cb0` (the body free: alive, not in the air,
 * no jump, landing, swap or reload playing), `FUN_005bdc30` and `FUN_005be030` (the slot usable, within the count),
 * `FUN_005c4fd0` (not at view state 4 and up) -- and only then does `FUN_005c4b10` act (research 201 §1, 211 §2):
 * refused, nothing of the press acts.
 */
describe('a shoulder press is gated whole before it acts (the four tests, then FUN_005c4b10)', () => {
  const press = (open: boolean) => {
    const did: string[] = [];
    const taken = pressShoulder({ gate: () => open, putAway: () => { did.push('put away'); }, take: () => { did.push('take'); return true; } });
    return { taken, did };
  };
  it('refused (mid-jump, at the binoculars, a slot not usable): the grenade and the launcher left as they are', () => {
    expect(press(false)).toEqual({ taken: false, did: [] });
  });
  it('passed: put away, then taken', () => {
    expect(press(true)).toEqual({ taken: true, did: ['put away', 'take'] });
  });
});

/** The review's F2 (RECONNECT-GHOST, OT.R59): a swap in progress at a resume -- the firearm placed, the host told whatever it was. */
describe('Kit.place (OT.R59): a resume mid-swap', () => {
  it('a pistol -> rifle swap under way (m_item still the pistol, the rifle\'s record already taken), placed on the pistol: the host told the pistol, the swap gone', () => {
    const { kit, items } = rig();
    kit.select('pistol'); kit.frame(1.01);
    expect(kit.state()).toMatchObject({ item: 'pistol', swap: null });
    expect(kit.select('rifle')).toBe(true);                         // the swap back started in the gap
    expect(kit.swapping()).toBe(true);
    items.length = 0;
    (kit as unknown as { place(to: Firearm): void }).place('pistol');
    expect(items).toEqual(['pistol']);                              // told although the item did not change
    expect(kit.swapping()).toBe(false);
    expect(kit.state()).toEqual({ item: 'pistol', mounts: { rifle: 'carry', pistol: 'hand' }, swap: null });
  });
});
