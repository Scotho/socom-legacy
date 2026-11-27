/**
 * LATER 938 (`GLOW_HOLD_XBOX_ADAPTATION`; product track, a renderer adaptation -- no picture, no game value and no game
 * timing changed): on the Xbox class the flash glow's 1 x 1 twin compiles that `prepare` queues for every body, weapon and
 * tracer (FLASH-GLOW-BODIES) wait while the player is in play, and run at the first flashbang in the air (where WM-17's
 * `promoteGlow` brings them forward) or at an idle point -- dead, spectating, or between rounds (the round screens up). v0.4.19's
 * two Xbox WebGL2 losses came 9.7 and 14.0 s into play while three's counts still climbed (shadow's census: 707 of 1,371
 * prepare compiles in the first seconds of play were the glow twin's). The glow itself is the flashbang's game effect
 * (BLUR3D, `FUN_00264a40`) and stays; the cost moved: a first flashbang may hitch on the Xbox class. Proof only by the
 * field's `contextdiag` beacon after it ships. Every other class: as before.
 */
export const GLOW_HOLD_XBOX_ADAPTATION = true;

export interface GlowHoldState {
  /** The page's device class is the Xbox's (`./deviceClass` `pageDeviceClass() === 'xbox'`). */
  xbox: boolean;
  /** The local player is in play: a player's seat, walking, alive, the round screens down. */
  playing: boolean;
  /** A flashbang is in the air (`GrenadeThrower.flashInAir`). */
  flashInAir: boolean;
}

/** Whether `prepare`'s glow-twin compiles are held this frame (`ViewerRenderer.holdGlow`). */
export function glowHeld(s: GlowHoldState): boolean {
  return GLOW_HOLD_XBOX_ADAPTATION && s.xbox && s.playing && !s.flashInAir;
}
