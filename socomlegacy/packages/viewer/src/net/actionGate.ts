/**
 * LATER 220 (research 369; reading, pending review): the action prompts' common gate, `FUN_005a7de0(actor, 1, 0)`
 * (D:L462594-462737), behind which `FUN_00593500` builds every action offer (D:L452277). The page and the room ask it
 * on the command an ask names (`./walk` `WalkMode.actionGateShut`, `room.ts` `actionGateShut`), from the same terms: the
 * kit's lock -- `FUN_005a7ab0`'s timer (D:L462522) and the reload's window, as `Fire.reloadLocked` and the room's
 * `mountKitLocked` count them -- the walker's top (`Walker.gateTop`, recorded with each command, `AimFrame.gate`): a
 * throw on top (term 4, the hand's: the pistol's throws are not among its words), a reload clip (term 5), a swap's clip
 * or its moving overlay or the launcher's raise (term 6), a get-up (term 9) -- and the stick's moving lower (term 6
 * directly, `moving_rifle_to_launcher` / `moving_pistol_to_launcher` on the second layer, D:L462494-462495: the page's
 * `launcherMovingUntil`, the room's `movingLowerUntil`).
 *
 * Not modelled (the review's F4): term 1 (the posture: 8 dying, 9 carrying, 10 carried, 5 the command menu, D:L462611 --
 * death is each handler's own alive test, no carry is ported, the command menu not asked), term 3 (the top clip's posture
 * byte 8, D:L462616: a knock's lying clips not asked), term 8 (posture 9, D:L462675), and the three readings below; a
 * knife, a restraint, a CQB attack (term 7) and a pair (term 11) have no port (no stab, restraint or carry: LATER 494).
 */

/** The walker's terms of the gate (`Walker.gateTop`): what on its stack shuts it, or null. */
export type GateTop = 'throw' | 'reload' | 'swap' | 'getUp';

/**
 * LATER 220 (research 369 §1 terms 2 and 12, §2; open 1): the flag terms are not modelled -- `+0x1060` bits 0x20 and 0x10
 * (D:L462613, D:L462683), kit byte `+0x5e1` bit 0x10 (`FUN_005a7980` D:L462482), the builder's early return on the
 * controller's `+0x170` bit 0x4 clear with `+0xed8` 0 (D:L452266-452268), and the climb's escape past a shut gate with
 * `+0x105e` bit 0x20 set (D:L452279; the last head's review F3): their writers are unread. Settled by reading them, or a
 * capture of a door pressed in each state.
 */
export const ACTION_GATE_FLAGS_READING = 'not asked: the flags\' writers unread' as const;

/**
 * LATER 220 (research 369 §1 term 10; the review's F2): any record on the second layer (`+0x1e4` non-zero, D:L462681)
 * shuts the gate. The port knows two kinds there -- the moving reloads (a reload's lock) and the moving swap (`gateTop`
 * 'swap') -- and asks no other. Settled by the list of what `+0x1e4` carries, or a capture.
 */
export const ACTION_GATE_SECOND_LAYER_READING = 'the moving reloads and the moving swap only' as const;

/**
 * LATER 220 (research 369 §1 term 13): C4 the kit's current item while jumping or landing shuts the gate
 * (D:L462687-462693). The port's gate does not ask the kit's current item. Settled by the hand's item on the frame.
 */
export const ACTION_GATE_C4_AIR_READING = 'not asked' as const;

/**
 * Why the gate is shut, or null: open. `kitLocked`, the kit's lock at the command (the timer, the reload's clip and
 * window, an after-shot); `top`, the walker's top at it. A reload, either way, is `'reload'` (the room's tally since
 * LATER 175); the walker's other terms `'gate: <term>'`.
 */
export function actionGateWhy(kitLocked: boolean, top: GateTop | null): string | null {
  if (kitLocked || top === 'reload') return 'reload';
  return top !== null ? `gate: ${top}` : null;
}
