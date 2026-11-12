import { GAME_FRAME_DT } from '@s2u/scene';
import type { Mount } from './heldItem';
import { ACTION_CLIPS, SWAP_OVERLAY } from './mover';
import type { SwapPick, SwapProgress } from './walk';

/**
 * The SEAL's kit slots and the rifle <-> pistol swap (the WEAPON workstream's sidearm round). What the game does:
 *
 * - **The slots.** `mp_seal1`'s kit is M4A1, Mark 23, M67, HE, ... (`READERC.ZAR/character.rdr`; the viewer's rifle is
 *   W2.R4's M4A1 SD). The player control (`FUN_00594cf0`, decomp 453288-453312) reads L1 (pad button 9) as a press
 *   of the slot kept at `ctrl+0x224` and L2 (button 10) the one at `+0x228`; the controller's constructor
 *   (`FUN_00598280`, 454785-454786) sets them to 0.0 and 1.0 -- slot 0, the primary, and slot 1, **the sidearm**. R2 is
 *   the Inventory (`FUN_0021bda0`'s menu over every slot): the grenades are reached there, not on L2.
 * - **The gate** (`FUN_005a8cb0`, `FUN_005bdc30`, the slot's count, `FUN_005c4fd0`, else the denied sound
 *   `FUN_003419c0`), then `FUN_005c4b10`: the slot already in the hand does nothing (**no toggle back**);
 *   the kit's selected slot `+0x824` is set, and a change of category (`FUN_005c50b0`) starts the swap through
 *   `FUN_005c1660` -> `FUN_005a64c0`, whose clip choice the MOTION workstream ported (`WalkMode.swapWeapon`).
 *   Refused while reloading, while a swap runs, while throwing, in the air, and in the 9x view or a scope (zoom 4 and
 *   up, `FUN_005c4fd0`, as the last tick left it); taken during a stance change (research 201 §1, 211 §2). A step into
 *   the scope in the press's own tick counts after the switch, against the new slot, and the view it reaches stays up
 *   through the swap: the switch drops none but the night vision (research 201 §2 A31). The raise
 *   state (`+0xf74`, the gun hot or down) is read by none of it: one clip per case (research 211 §1-§3).
 * - **Rifle to pistol.** At the start `FUN_005a7260` re-parents the rifle to `spinelo` (the clip's own `rifle` track
 *   poses it there) and sets `m_item` to 2 at once; `FUN_0057d5e0` turns the playing clips to their pistol versions.
 *   A callback in the clip (`FUN_005a7730`) moves the pistol to `rhand` at the hand-off (`HAND_OFF_READING`); at the
 *   end `FUN_005a60d0(seal, 2, 0)` hangs the rifle on `spinelo` at `character.rdr`'s "rifle" offset.
 * - **Pistol to rifle.** The same clip played backwards; its callback (`FUN_005a75d0`) holsters the pistol on `rthigh`
 *   at the "pistol" offset as the clip passes the hand-off going back; at the end `FUN_005a70f0` puts the rifle in the
 *   hand and sets `m_item` to 1.
 * - **At spawn** the pistol hangs on `+0x304` (`hips`) at the identity (`FUN_00553290` slot 2).
 *
 * The viewer's readings, named: the hand-off points are the clips' phases the callback fires at (`HAND_OFF_READING`:
 * the code's own constants, read -- research 181 §2.7, 211 §1), compared in the original's phase units (`handOffOf`,
 * research 251 §10); the swap's progress is the walk's clock (the walk's action, or the overlay on the second
 * channel's, runs the clip on it).
 */

export type Firearm = 'rifle' | 'pistol';
/** What the page's inventory holds, slot order (`mp_seal1`: M4A1, Mark 23, M67, HE). */
export type KitItem = Firearm | 'M67' | 'HE';
export const KIT_SLOTS: readonly KitItem[] = ['rifle', 'pistol', 'M67', 'HE'];

/**
 * The PC's number keys (the owner, 2026-09-29; spec W4.R5): `1` the main weapon, `2` the sidearm (L1's and L2's slots),
 * `3`, `4` and `5` the kit's three equipment slots in kit order (`./equipment`'s `EQUIPMENT_SLOTS`, whatever the kit
 * holds there). `5` is the sprint's own ruling for the third slot (W4.R5, the owner may overturn it); the pad keeps the
 * game's ways -- R2's Inventory and L1/L2 on the slots it assigns (research 85 §9.1).
 */
export type Hotkey = { firearm: Firearm } | { equipment: 1 | 2 | 3 };
const HOTKEYS: Readonly<Record<string, Hotkey>> = {
  Digit1: { firearm: 'rifle' }, Digit2: { firearm: 'pistol' }, Digit3: { equipment: 1 }, Digit4: { equipment: 2 }, Digit5: { equipment: 3 },
};

/** A key's `code` to what it takes up, or null for a key that is none of the four (`Numpad1` .. are not bound). */
export function hotkey(code: string): Hotkey | null {
  return HOTKEYS[code] ?? null;
}

/**
 * The clips' hand-off points, in the play's phase -- the key fraction, not the clip's normalised seconds (`handOffOf`,
 * research 251 §10) -- (`FUN_005a7730` / `FUN_005a75d0`'s callbacks): standing 0.72, crouched
 * 0.82, prone 0.62 -- the action's callback trigger `FUN_00588bc0` sets per swap action (D:L446304-446398, research 181
 * §2.7) -- and the moving overlay 0.79, `FUN_0057a010`'s `+0x1f4` = 0x3f4a3d71 for kinds 6 and 5 (D:L438603-438624,
 * research 211 §1) [reading: the code's constants, pending review].
 */
export const HAND_OFF_READING = { swapStand: 0.72, swapCrouch: 0.82, swapProne: 0.62, moving: 0.79 } as const;

/** What a shoulder press asks of the page (`pressShoulder`). */
export interface ShoulderPress {
  /**
   * `FUN_00594cf0`'s four tests at the press (research 201 §1): `FUN_005a8cb0` (the body free: alive, not in the air, no
   * jump, landing, swap or reload playing -- the page's `WalkMode.swapGate` and its own reload and throw), `FUN_005bdc30`
   * and `FUN_005be030` (the slot usable, within the count), `FUN_005c4fd0` (not at view state 4 and up, as the last tick
   * left it: `WalkMode.swapGate`). True when all pass.
   */
  gate(): boolean;
  /** `FUN_005c4b10`'s first steps: the throwable and the launcher put away. */
  putAway(): void;
  /** The slot taken up (`Kit.select` for a firearm): true when it was. */
  take(): boolean;
}

/**
 * A shoulder press (L1 / L2; `1` / `2`) in the game's order: `FUN_00594cf0` passes it through the four tests first,
 * whole (`ShoulderPress.gate`), and only then does `FUN_005c4b10` act -- put away, then take. Refused, nothing of the
 * press acts (the review of the swap layering: at the binoculars, or mid-jump, a grenade was put away for a swap the
 * kit then refused).
 */
export function pressShoulder(press: ShoulderPress): boolean {
  if (!press.gate()) return false;
  press.putAway();
  return press.take();
}

/** Where each weapon rides, and which one the anim set and the fire use (`m_item`). */
export interface KitState {
  item: Firearm;
  mounts: { rifle: Mount; pistol: Mount };
  swap: { to: Firearm; progress: number; handed: boolean; clip: string } | null;
}

/** What the kit asks of the page. */
export interface KitHost {
  /** The walk's swap clip (`WalkMode.swapWeapon`): null when the mover refuses (in the air, an action playing). */
  swapClip(to: Firearm): SwapPick | null;
  /** Whether the kit may swap now: not reloading, not throwing (`FUN_005a8cb0` / `FUN_005bdc30`'s gates). */
  canSwap(): boolean;
  /** `m_item` changed: the anim set, the fire's record, the reticle, the icon, the sounds follow. */
  item(item: Firearm): void;
  /**
   * A swap began (`FUN_005c4b10`): the zoom's record is the new slot's (`main.ts` `switchZoom`; a step into the scope this
   * tick goes again against it, and the view it reaches stays up). The trigger stays held (TRIGGER-SWAP fold: the switch
   * leaves +0x118 and the pull count +0x818, D:L478779-478936; research 211 §10).
   */
  started?(to: Firearm): void;
  /**
   * The swap clip on the mover and its progress (`WalkMode.swapProgress`), null once it is over or cut. Given, the kit
   * runs on the walk's clock -- the one the body is drawn by -- so the mounts change on the frame the clip does: a
   * standing swap that the stick turns into the moving overlay carries on at the overlay's own length and hand-off
   * (the handoff's "re-sync the swap clock"). Absent, the kit counts the pick's seconds itself.
   */
  swapProgress?(): SwapProgress | null;
}

/**
 * The hand-off of a pick, or of the swap clip playing (`SwapProgress`), going `to` that firearm: the overlay's, else
 * its action's `HAND_OFF_READING` phase, carried onto the clock the kit runs -- `progress`, 0..1 of the clip's seconds
 * from the swap's start -- so that `handedAt(to, progress, handOffOf(...))` is the original's callback (research 251
 * §10, reading, pending review):
 *
 * - **The full-body clip** (`FUN_0057a330` D:L438995-438997 -> `FUN_0028c7c0` D:L134313-134374): a crossing of the
 *   play's phase -- `t / (P x e)` forward, `e - t / (P x e)` reversed (`FUN_0028c160` D:L134080-134101 starts it at
 *   e), e = (n - 1) / n -- against the same h both ways. The kit's progress is `t / (P x e^2)`, so the phase is
 *   `progress x e` forward and `e x (1 - progress)` reversed: h / e on the progress clock, each way.
 * - **The moving overlay** (`FUN_0028d020` D:L439010 -> `FUN_0028d0a0` D:L134651-134676): the node's key phase
 *   `u = t / P` (`FUN_0028d170` D:L134684-134767; kind 5 starts at t = P x e and runs back), checked one game frame
 *   ahead -- `u + s >= h` forward, `u - s <= h` backwards, s = dt / (P x e) with dt the actor's `+0x2e0`, the game
 *   frame (`FUN_00551ec0` D:L418488; `GAME_FRAME_DT`). Its progress is `t / (P x e)`, so `u` is `progress x e` forward
 *   and `e x (1 - progress)` back: (h - s) / e forward, (h + s) / e back.
 *
 * The clips' keys and playback are `ACTION_CLIPS` and `SWAP_OVERLAY`, pinned to `motion.rdr` and `MOTION_P.ZAR`.
 */
export function handOffOf(pick: { action: SwapPick['action']; overlay: boolean; to: Firearm }): number {
  const h = pick.overlay ? HAND_OFF_READING.moving : HAND_OFF_READING[pick.action ?? 'swapStand'];
  const clip = pick.overlay ? SWAP_OVERLAY : ACTION_CLIPS[pick.action ?? 'swapStand'];
  const e = clip.frames < 2 ? 1 : (clip.frames - 1) / clip.frames;   // FUN_0028ada0 D:L133349-133366
  if (!pick.overlay) return h / e;
  const s = GAME_FRAME_DT / (clip.playback * e);                      // one game frame of the overlay's key phase
  return (pick.to === 'pistol' ? h - s : h + s) / e;
}

/**
 * Whether a swap to `to` at `progress` (0..1 of its clip's seconds, whichever way it runs) has passed its hand-off `h`
 * (`handOffOf`'s, on the same clock).
 */
export function handedAt(to: Firearm, progress: number, h: number): boolean {
  return to === 'pistol' ? progress >= h : 1 - progress <= h;
}

export class Kit {
  private state_: KitState = { item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' }, swap: null };
  private pick: SwapPick | null = null;
  private elapsed = 0;
  /**
   * PAR-37: the firearm and the mounts before the last swap, for its undoing (`undo`); null once nothing can undo it.
   * PAR-51: with the swap's pick and target, for its redoing (`redo`).
   */
  private before: { item: Firearm; mounts: KitState['mounts']; pick: SwapPick; to: Firearm } | null = null;
  /** PAR-51: the last swap undone (`undo`), for its redoing (`redo`); null once nothing can redo it. */
  private undid: { item: Firearm; mounts: KitState['mounts']; pick: SwapPick; to: Firearm } | null = null;

  constructor(private readonly host: KitHost) {}

  state(): KitState {
    const s = this.state_;
    return { item: s.item, mounts: { ...s.mounts }, swap: s.swap && { ...s.swap } };
  }

  /** The firearm the fire and the anim set use (`m_item`). */
  item(): Firearm { return this.state_.item; }
  /** Whether a swap is playing (no round leaves until it is done: `FUN_005a7ab0`). */
  swapping(): boolean { return this.pick !== null; }

  /**
   * Takes a firearm up (L1 the rifle, L2 the pistol): true when a swap started. The one already in the hand does
   * nothing; refused mid-swap, by the page's gate (`canSwap`) or by the mover (`swapClip` null).
   */
  select(to: Firearm): boolean {
    if (this.pick || to === this.target() || !this.host.canSwap()) return false;
    const pick = this.host.swapClip(to);
    if (!pick) return false;
    const s = this.state_;
    this.undid = null;                                            // PAR-51: a new swap is the kit's now
    this.before = { item: s.item, mounts: { ...s.mounts }, pick, to };
    s.swap = { to, progress: 0, handed: false, clip: pick.overlay ? 'seal_mv_rifle2pistol' : pick.action ?? '' };
    this.host.started?.(to);
    this.begin(pick, to);
    return true;
  }

  /** The swap's start on the kit's state (`select`, PAR-51's `redo`): the pick playing, the firearm and the mounts. */
  private begin(pick: SwapPick, to: Firearm): void {
    const s = this.state_;
    this.pick = pick;
    this.elapsed = 0;
    if (to === 'pistol') {
      // FUN_005a7260: the rifle to spinelo (the clip poses it) and m_item 2 at once.
      s.mounts.rifle = 'swap';
      s.item = 'pistol';
      this.host.item('pistol');
    } else s.mounts.rifle = 'swap';                // the rifle rises off the back as the clip plays backwards
  }

  /** One frame of a swap: the hand-off as its phase passes, the end at its seconds. */
  frame(dt: number): void {
    const pick = this.pick, s = this.state_;
    if (!pick || !s.swap) {
      // PAR-37: a swap already finished that the room never ran (the walk's run under a victory dance refused it).
      // PAR-51: a swap undone that the room ran after all (its stop named a command before it): taken again.
      if (!this.before && !this.undid) return;
      const on = this.host.swapProgress?.();
      if (on?.undone && this.before) this.undo();
      else if (on?.redone && this.undid) this.redo();
      return;
    }
    let progress: number, h: number;
    if (this.host.swapProgress) {
      const on = this.host.swapProgress();
      if (on?.undone) { this.undo(); return; }                   // PAR-37: the room refused it: the firearm left, back
      if (on?.redone) return;                                    // PAR-51: nothing undone while a swap plays
      if (!on) { this.finish(); return; }                        // the clip is over (or cut): the swap with it
      progress = on.progress;
      h = handOffOf({ action: on.action, overlay: on.overlay, to: s.swap.to });
      if (on.overlay) s.swap.clip = 'seal_mv_rifle2pistol';
    } else {
      this.elapsed += dt;                                        // the no-host count: the same progress clock
      progress = pick.seconds > 0 ? Math.min(1, this.elapsed / pick.seconds) : 1;
      h = handOffOf({ action: pick.action, overlay: pick.overlay, to: s.swap.to });
    }
    s.swap.progress = progress;
    if (!s.swap.handed && handedAt(s.swap.to, progress, h)) {
      s.swap.handed = true;
      if (s.swap.to === 'pistol') s.mounts.pistol = 'hand';      // FUN_005a7730
      else s.mounts.pistol = 'holster';                          // FUN_005a75d0
    }
    if (progress >= 1) this.finish();
  }

  /** A new map, or leaving the walk mid-swap: the swap finishes where it was going. */
  settle(): void {
    if (this.pick) this.finish();
    this.before = null;
    this.undid = null;
  }

  /**
   * PAR-37 (research 251 section 9): the last swap undone -- the page took it on a command after a victory dance's `seq`,
   * which the room ran under the dance and refused (`./walk` `WalkMode.swapProgress`'s `undone`): the firearm and the
   * mounts as they were before it, `m_item` told again when it had changed.
   */
  private undo(): void {
    const b = this.before!, was = this.state_.item;
    this.before = null;
    this.undid = b;                                              // PAR-51: kept for its redoing
    this.pick = null;
    this.state_ = { item: b.item, mounts: { ...b.mounts }, swap: null };
    if (was !== b.item) this.host.item(b.item);
  }

  /**
   * PAR-51 (research 251 section 9.1): the last swap undone taken again -- the room's stop named a command before the one
   * it rode, so the room ran it with no dance and took it (`./walk` `WalkMode.swapProgress`'s `redone`): the swap begins
   * again from the state it began from, as `select` began it, and runs on the walk's clock (the walker's swap clip, which
   * the second run started; over already, the next frame finishes it). Symmetric with `undo`: `started` is not told again,
   * as `undo` does not take it back.
   */
  private redo(): void {
    const u = this.undid!;
    this.undid = null;
    this.before = u;                                             // undone again, should a later run refuse it
    this.state_ = { item: u.item, mounts: { ...u.mounts }, swap: { to: u.to, progress: 0, handed: false, clip: u.pick.overlay ? 'seal_mv_rifle2pistol' : u.pick.action ?? '' } };
    this.begin(u.pick, u.to);
  }

  /** Back to the spawn: the rifle in the hand, the pistol on the hips. */
  reset(): void {
    this.pick = null;
    this.before = null;
    this.undid = null;
    const was = this.state_.item;
    this.state_ = { item: 'rifle', mounts: { rifle: 'hand', pistol: 'spawn' }, swap: null };
    if (was !== 'rifle') this.host.item('rifle');
  }

  /**
   * OT.R59 (RECONNECT-GHOST; the gameplay seat's condition 4 (a)): the firearm in the hand set at once, with no swap clip
   * -- a resumed seat's, as the room holds it -- the other on its mount (the rifle carried, the sidearm holstered), any
   * swap and its undoing forgotten, the host told (`item`) when it changed.
   */
  place(to: Firearm): void {
    const swapping = this.pick !== null || this.state_.swap !== null;   // the review's F2: its start took the other's record
    this.pick = null;
    this.before = null;
    this.undid = null;
    const was = this.state_.item;
    this.state_ = { item: to, mounts: to === 'pistol' ? { rifle: 'carry', pistol: 'hand' } : { rifle: 'hand', pistol: 'holster' }, swap: null };
    if (was !== to || swapping) this.host.item(to);
  }

  /** The firearm the kit is on or going to. */
  private target(): Firearm {
    return this.state_.swap?.to ?? this.state_.item;
  }

  private finish(): void {
    const s = this.state_, to = s.swap?.to ?? s.item;
    this.pick = null;
    s.swap = null;
    if (to === 'pistol') {
      s.mounts = { rifle: 'carry', pistol: 'hand' };             // FUN_005a60d0(seal, 2, 0)
    } else {
      s.mounts = { rifle: 'hand', pistol: s.mounts.pistol === 'hand' ? 'holster' : s.mounts.pistol };
      s.item = 'rifle';                                          // FUN_005a70f0: m_item 1 at the end
      this.host.item('rifle');
    }
  }
}
