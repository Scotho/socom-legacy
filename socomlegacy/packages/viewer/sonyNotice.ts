import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * The Sony licence notice (THIRD_PARTY_NOTICES.md, the DUALSHOCK 4 line art of the button mapping screen,
 * `src/assets/sony/`, drawn by `src/console/render/padArt.ts`): emitted into every build at this path, ours to ship.
 * Removed with the art on 2026-10-18 (the owner: "remove if we're not using it"); back with it for LATER 380 (the owner's
 * word, 2026-10-23: "the ps4 controller the socom2legacy-teaser had"; H313 for its terms in a public build).
 */
export const SONY_NOTICE_FILE = 'licenses/sony-controller.txt';

/** Emits the notice at `noticePath` as `SONY_NOTICE_FILE`, unconditionally. */
export function sonyNoticePlugin(noticePath: string): Plugin {
  return {
    name: 'sony-notice',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: SONY_NOTICE_FILE, source: readFileSync(noticePath) });
    },
  };
}
