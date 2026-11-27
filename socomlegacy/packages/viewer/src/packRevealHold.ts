/**
 * B-48 (tier 1 row 8; product track, a browser adaptation with no original -- the PS2 has no texture pack): the HD pack
 * applies behind the loading screen. The pack is applied to the live world's textures at the world's build
 * (`PackApplier.setWorld`), paced over frames (`ApplyFrames`); the loading screen lifted at the first world frame while
 * that apply (7.3-8.0 s measured for MP71's 411 textures on a strong GPU, LATER 1138) still ran, so it always spanned
 * the spawn and the round's opening -- and a player's clip (v0.4.22, 2026-11-14) shows the picture frozen 15 s under
 * "Applying pack... 373/374". v0.4.30 held the match's first world frame (`./matchMount`, the frame that lets the
 * loading screen go) while the pack was busy, up to 15 s; players then reported the load delayed, and the owner ruled
 * the hold out (LATER 1418): `PACK_REVEAL_HOLD_MAX_MS_ADAPTATION` is 0, so the loading screen ends as soon as the world
 * is ready and the pack finishes under the corner chip. The machinery stays (a later cap is one constant). Nothing the
 * game does moves: the room's prepared report (`tellReady`) keeps its own gate, and textures registered later (a
 * round's kit) keep the paced path.
 */
export const PACK_REVEAL_HOLD_ADAPTATION = 'the first world frame held while the HD pack applies, capped' as const;

/**
 * The longest the loading screen is held for the pack, counted from the first frame that would have let it go (a
 * browser adaptation's bound, not the game's): 0 -- NO hold. The owner's ruling (2026-11-22, after players reported the
 * match load delayed by the pack): "i'll just let the loading screen end before the textures have applied. it's just
 * to let them start early when waiting for others to join a match". The pack still starts applying at the world's build
 * (early, while the lobby waits) and finishes under the corner chip; the hold's machinery and its `[pack-hold]` notes
 * stay, so a later cap is one constant. Was 15 s (v0.4.30: twice the measured apply on a strong GPU, the reported
 * freeze's length, under the loading screen's own 60 s fallback, `./loadingHold` `FIRST_FRAME_FALLBACK_MS`).
 */
export const PACK_REVEAL_HOLD_MAX_MS_ADAPTATION = 0;

export interface PackRevealHold {
  /** Whether the first world frame waits this frame: true only while the pack is busy, within the bound. */
  hold(now: number, packBusy: boolean): boolean;
}

/**
 * What the hold notes for a served run (an instrument; the mount logs it as `[pack-hold]`): `free` -- nothing applying at
 * the first ask, the frame that would have revealed the world (world-ready); `start` -- held from that frame; `settled`
 * or `cap` -- let go, with the ms held from world-ready to the reveal.
 */
export type PackHoldNote = (what: 'free' | 'start' | 'settled' | 'cap', heldMs: number) => void;

export function packRevealHold(maxMs = PACK_REVEAL_HOLD_MAX_MS_ADAPTATION, note: PackHoldNote = () => {}): PackRevealHold {
  let since: number | null = null;
  let over = false, asked = false;
  const end = (what: 'settled' | 'cap', ms: number): false => { over = true; try { note(what, ms); } catch { /* an instrument */ } return false; };
  return {
    hold(now, packBusy) {
      if (over) return false;
      if (!asked) { asked = true; if (!packBusy) { over = true; try { note('free', 0); } catch { /* an instrument */ } return false; } }
      if (!packBusy) return since === null ? false : end('settled', now - since);
      if (since === null) { since = now; try { note('start', 0); } catch { /* an instrument */ } }
      if (now - since >= maxMs) return end('cap', maxMs);
      return true;
    },
  };
}
