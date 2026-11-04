/**
 * The hostage's body, the rules the page and the room share (HX-2, web sprint 31; research 238 §1, §3). The room owns the
 * hostage (HX-1, ruling HX.R2); every page draws it through the shared `../remotePlayers` (`setEscortee`, `setOpacity`).
 * Readings, pending review: no hostage behaviour has been measured on a running console (research 207).
 */

/**
 * HOSTAGE_FADE_READING (research 238 §1, §5): a rescued hostage's opacity falls by this a second -- `CAiSRescued::Tick`
 * sub-state 2 (`FUN_00559070` D:L422191-422212) moves the body node's `+0x9c` (`m_Opacity`) toward 0 by dt x 0.75, clamped to
 * [0, 1] (`FUN_00539b70` D:L422203), so a rescue fades out in at most 1 / 0.75 = 1.33 s. Every console runs it on its own
 * copy (199 §2, §12.3: the AI word's nibble 24-27 carries (1 - opacity) x 15 as an integer, `FUN_001b3648`, 15 when
 * inactive, D:L432905-432913; read back as 1 - n / 15 with `SetActive(n != 15)`, D:L432833-432834).
 */
export const HOSTAGE_FADE_READING = 0.75;

/**
 * HOSTAGE_HIDDEN_READING (research 238 §1, §5): at opacity 0 the node is set inactive (vt(+0x60)+0x38 `SetActive(opacity
 * != 0)`, D:L422203-422212; V5 H4-2), and an inactive node leaves every grid ray query (`FUN_002d6260` D:L176893,
 * `FUN_002d61b0` D:L176837): the hostage is neither drawn, nor picked by an aim, nor hit. The page hides the body and drops
 * it from its aim (`RemotePlayers.aimDistance`); the room's hit path (HX-1) skips it.
 */
export const HOSTAGE_HIDDEN_READING = 'inactive: unpicked, unhit, unseen' as const;

/**
 * HOSTAGE_HANDS_PLACEHOLDER (research 238 §5, §7): the replicated byte 0x7e drives `FUN_005dfe30(body, b)` (the rifle
 * raise state `+0xf74`, 199 §12.10, V5); whether it changes a hostage's clip was not traced. The page ignores a hostage's
 * item, aim, trigger and binoculars: no weapon is hung and no raise or binocular layer runs. Capture C2 settles it.
 */
export const HOSTAGE_HANDS_PLACEHOLDER = 'ignored' as const;

/** One frame of the rescued fade (`HOSTAGE_FADE_READING`): the opacity `dt` seconds on, clamped to [0, 1]. */
export function fadeStep(opacity: number, dt: number): number {
  return Math.min(1, Math.max(0, opacity - dt * HOSTAGE_FADE_READING));
}
