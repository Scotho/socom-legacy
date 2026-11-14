/**
 * The console launcher's held-press repeat, dependency-free (RVK-A, LATER 966: lifted out of `./input` so the replay
 * transport, `../modern/replays/transport`, reads the same two numbers without `./input`'s module graph; `./input`
 * exports them as before). A browser adaptation with no original (the project's launcher page, OT.R28): the S2U Briefing
 * design system's "Controller UI" section 1 -- a held direction repeating after 400 ms every 100 ms.
 */
export const REPEAT_DELAY = 400;
export const REPEAT_EVERY = 100;

/**
 * RVK-A (LATER 966, V21.R7; the owner, 2026-11-12: "the << and >> buttons should be able to be held to page through"):
 * a control carrying this attribute takes the pad's held Cross as the D-pad's hold is taken -- the first press as any
 * press, then after `REPEAT_DELAY` every `REPEAT_EVERY` one `PAD_REPEAT_EVENT` dispatched on it (`./input`'s poll). The
 * replay transport's two jumps carry it. A browser adaptation.
 */
export const PAD_REPEAT_ATTR = 'data-pad-repeat';
export const PAD_REPEAT_EVENT = 's2u-pad-repeat';
