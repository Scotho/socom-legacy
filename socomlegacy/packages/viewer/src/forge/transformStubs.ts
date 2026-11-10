/**
 * FC-1 (the owner, 2026-11-07: "re: crispy's work, take this on and finish it: hiding the pitch/roll/scale"; a browser
 * adaptation, FG.R2 -- the game has no editor, nothing here is the original's): the Forge Overhaul's pitch, roll and
 * scale controls -- the Inspector's Pitch, Roll and Scale fields and the Scale row's reset, the Scale tool and its R key,
 * the rotate gizmo's tilt rings -- are stubs: record v3 keeps a placed piece's yaw alone (`creator-contracts`
 * `recordOfLayout`, a piece row `[asset, x, y, z, yaw°]`) and every other placed kind a yaw or none, so an edit to them
 * could not survive a save nor reach the composed match map. While this is true they are hidden, not deleted.
 *
 * What makes them real, and turns this off: a record version that keeps a piece's tilt and scale (its parse, its
 * `recordOfLayout`, its round-trip tests), a test that the composed match map carries them, the page's
 * `transformStub` replaced by an edit, and the agent's `placement.set` taking the fields.
 */
export const FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION = true;
