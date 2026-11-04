/**
 * OT.R29 and its clarification (the owner, 2026-10-04: "keyboard has been made a full testing local only release
 * excluded (and demo excluded) option. controller support only"; asked "Should the keyboard be removed from release
 * and demo builds everywhere?", he chose "Everywhere"): every keyboard input of the game is attached only under a
 * literal `import.meta.env.DEV`, which every `vite build` -- the release, a demo -- folds to false and drops. Each such
 * site calls `keyboardSite` with its marker inside its gate, so the build test (`test/build_keyboard.test.ts`) can grep
 * a built bundle for the markers and find none; the scan (`test/keyboardGate.test.ts`) holds every listener to a gate.
 * A browser adaptation: local testing only.
 */
// CX-9b: 's2u-kb-setup-page' (the setup page's any-key stand-in for the controller) went with that page (`./startup`).
export const KEYBOARD_SITES = [
  's2u-kb-menus', 's2u-kb-soft-keyboard', 's2u-kb-fly-camera', 's2u-kb-fire', 's2u-kb-walk',
  's2u-kb-scoreboard', 's2u-kb-tac-map', 's2u-kb-traversal', 's2u-kb-net-page', 's2u-kb-match-keys', 's2u-kb-chrome-keys',
  's2u-kb-voice',                                     // SVC-22b: the talk keys, V in the round and R in the menus (`./voice/headset`)
  's2u-kb-forge',                                     // FORGE (FG.R9): the forge's shortcuts (`./forge/page`)
  's2u-kb-dev-panel',                                 // /testroom's developer panel: F2 (`./devPanel` `DEV_PANEL_KEY`)
] as const;

/** Records that a keyboard site was attached (a development build only: every call sits inside a DEV gate). */
export function keyboardSite(site: (typeof KEYBOARD_SITES)[number]): void {
  const g = globalThis as { __s2uKeyboardSites?: Set<string> };
  (g.__s2uKeyboardSites ??= new Set()).add(`s2u-keyboard-site ${site}`);
}
