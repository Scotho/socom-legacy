/**
 * OT.R38 / H115 (the owner, 2026-10-06, "Controller only"): matches are controller only, and the mouse's look is a local
 * testing option like the keyboard (OT.R29): the pointer lock, the locked mouse's look and trigger, a mouse's drag look
 * the match's right-click zoom (`matchMount.ts`) and the settings' Mouse look section are attached only under a literal `import.meta.env.DEV`, which every `vite
 * build` -- the release, a demo -- folds to false and drops. Each such site calls `mouseSite` with its marker inside its
 * gate, so the build test (`test/build_keyboard.test.ts`) can grep a built bundle for the markers and find none. The
 * touch layer stays in every build (OT.R29's touch exemption: a real touch device plays with its page controls): a
 * finger's drag on the canvas looks, on the stick's law (`camera.ts`, TOUCH_LOOK_STICK_LAW_ADAPTATION). A browser
 * adaptation: local testing only. Owed in a held file: the page's own right-click zoom, `main.ts`.
 */
export const MOUSE_SITES = ['s2u-mouse-pointer-lock', 's2u-mouse-drag-look', 's2u-mouse-look-settings', 's2u-mouse-zoom'] as const;

/** Records that a mouse site was attached (a development build only: every call sits inside a DEV gate). */
export function mouseSite(site: (typeof MOUSE_SITES)[number]): void {
  const g = globalThis as { __s2uMouseSites?: Set<string> };
  (g.__s2uMouseSites ??= new Set()).add(`s2u-mouse-site ${site}`);
}
