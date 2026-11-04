/**
 * The SEAL's measured statures, units over the soles (web sprint 2, W2.3; kept from the stand-in body when the
 * merge of the two sprint 2s replaced it with the real model): the derivation -- the console dump's skeleton and
 * the console frame `scripts/parity/refs/console_spawn_slot8.png` -- is in the spec's section 7, "The SEAL is 19.6
 * units tall". The camera's stance limits and the placeholder hit volumes read them (`./main`, `./net/hitVolumes`); the
 * scope's eye no longer does: it stands on the skeleton root (`./cameraRig` `scopeEye`, PF-05).
 */

/** The crown over the feet, standing (above: the dump's head joint 17.37 + the frame's head 2.23). */
export const STANDING_HEIGHT = 19.6;
/** The crown over the feet, crouched: the console frame at spawn, the SEAL crouched (above). */
export const CROUCH_HEIGHT = 12.4;
/**
 * The body's top lying prone: the original has no prone height (research 180 s1.4) -- its prone body is the size class
 * `FUN_0058a720(actor, 1)` = 2 with `bVar5`, radius 8.0 and height **6.0** (`FUN_0054aa30` D:L415119-415122; its wall
 * probe at half of it, D:L415231-415233), the posed skeleton's top under it (`seal_prone`: rshoulder 3.891, head 3.637).
 * The prone placeholder capsules (`./net/hitVolumes`), the traversal's body box (`./traversal` `BODY_TOP`) and the
 * water's ripple read it. Retires the 3.0 estimate (PF-21, research 217 s4).
 */
export const PRONE_HEIGHT = 6;
/**
 * The placeholder head capsule's height over the feet, standing [estimate: 0.936 of the stature] (`./net/hitVolumes`,
 * the fallback without a skeleton; PF-21 retires it). It was the scope's eye too, under another name, until PF-05 put
 * that on the skeleton root (`./cameraRig` `scopeEye`: 15.884 standing, research 180 §1.3).
 */
export const HEAD_VOLUME_HEIGHT_READING = 18.3;
