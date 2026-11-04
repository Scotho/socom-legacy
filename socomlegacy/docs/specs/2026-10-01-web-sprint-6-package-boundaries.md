# Web sprint 6 -- the front end's package boundaries (PLAT-02)

> Written 2026-10-01 for PLAT-02 (`../roadmap/01-platform.md`), writing up ruling **W6.R2** of the sprint plan
> (`../plans/2026-10-01-web-sprint-6-foundations.md`). The front end -- dialogs, movies, the memory card, streamed
> sound -- would otherwise grow `packages/viewer` further (s5: 141 files, 43,603 lines). This page says where each part
> lives, what each package may import, and the test that holds the line. It moves no existing code.

## 1. The packages

The split mirrors reCOM's (`research/recom/src/gamez/`): `zUI`, `zAnim`, `zInput` -> `@s2u/ui`; `zMPEG` -> `@s2u/fmv`;
`zSave` -> `@s2u/card`; `zSound` -> `@s2u/sound` (already ours). `zFTS` has no package of its own yet.

The last column is **guidance, not a rule**: the expected imports, which W6.R2 does not rule and no test enforces; a
task that needs another package says so in its report. What is enforced is §2.

| package | will hold (roadmap ids) | reCOM | expected imports (not enforced) |
|---|---|---|---|
| `@s2u/ui` (`packages/ui`) | the dialog (.rdr screen) loader PLAT-05; the zAnim UI script runner PLAT-07; the host command table PLAT-08; the valve store and UI variables PLAT-09; the screen and state manager PLAT-10; menu input as abstract buttons PLAT-11; the front-end frame clock PLAT-12; text, the 640x448 compositor, the widget set, popups and the software keyboard PLAT-13..17, as data the viewer draws | `zUI`, `zAnim`, `zInput` | archive, gs, mesh, scene, sound |
| `@s2u/fmv` (`packages/fmv`) | the PSS demuxer PLAT-18; the MPEG-2 decoder's wrapper PLAT-19b and its real-time budget PLAT-19c; movie audio and A/V sync PLAT-20; the player's semantics (open, loop, end event, skip, background) PLAT-21 | `zMPEG` | archive, sound |
| `@s2u/card` (`packages/card`) | the storage interface PLAT-24; the two-slot store of raw `.ps2` images PLAT-25; libmc's commands and result codes PLAT-26; the card file's scrambler and the save modules PLAT-27; the PS2 card filesystem inside a `.ps2` image PLAT-37 | `zSave` | archive |

*(Corrected 2026-10-01, PLAT-35, for the owner's ruling R7 (W6.R10): `@s2u/card` holds the storage interface
PLAT-24, two virtual card slots in localStorage in redotcom's own JSON PLAT-25, and libmc over their file table
PLAT-26 -- no `.ps2` images. PLAT-27 and PLAT-37 are dropped; PLAT-27's read side is the dev tool `tools/cardFile.ts`,
which no package imports (rule (c) of `tools/test/packageBoundaries.test.ts`, added with the move, beside §2's (a) and
(b)); the writers below were deleted. The row above is as it was planned.)*

Two parts get no new package:

- **The writers** (ZAR V2 and the flattened rdr, PLAT-27's codec half) go beside their readers in `@s2u/archive`, so one
  module owns each format both ways and a round-trip test sits next to it.
- **The streams** (989snd streamed music and voice, PLAT-22; UI sounds, PLAT-23) go inside `@s2u/sound`, beside the
  banks and the grain sequencer they share.

## 2. The rule

Each of the three is **pure, DOM-free and testable under Node**, as `IsoAssetSource` is. A browser API -- IndexedDB, a
WebAssembly instance, Web Audio, a pad or a key, a canvas -- enters through an interface the package declares and
`viewer` fills (a Node fake serves the tests: an in-memory card store, a decoder stub, a recorded input stream).

- **No package below the viewer imports from it**: archive, gs, mesh, scene, sound, ui, fmv and card never name
  `@s2u/viewer` or a relative path into `packages/viewer`. (`@s2u/server` is outside this rule: it imports
  `viewer/src/sim.ts` by path, under its own boundary, `packages/viewer/test/simBoundary.test.ts`.)
- **ui, fmv and card import no `three`** and reach no browser global as a value: `document`, `window`, `indexedDB`,
  `localStorage`, `sessionStorage`, `AudioContext`, `navigator`, `requestAnimationFrame`, `cancelAnimationFrame`,
  `addEventListener`, `removeEventListener`, `location`, `history`, `Image`, `OffscreenCanvas`, `HTMLCanvasElement`
  (as a value, e.g. `instanceof`), `Worker`, `XMLHttpRequest`, `caches`, `matchMedia` or `alert` -- by name, by
  `typeof` in an expression, through `globalThis`, `self` or `window` (`globalThis.indexedDB`, `self['navigator']`,
  `(globalThis as any).indexedDB`), or by destructuring them (`const { indexedDB } = globalThis`). Nor do they hold
  the global object itself (`const g = globalThis`, `f(self)`). An ambient `declare` is not a local: at run time it is
  the global. `fetch`, `performance` and `WebSocket` are not on the list: Node 22+ has them too, and the rule is
  DOM/browser values, not every global. A task that wants one still takes it as a parameter where it can (a
  `fetch`-shaped function or, better, an `AssetSource`; a `now(): number` clock), as `@s2u/archive`'s
  `httpAssetSource.ts` -- the one pure package that calls the global `fetch` today -- does not.
- **DOM types are allowed; DOM values from the global scope are not** (the controller's ruling, 2026-10-01, PLAT-02's
  fix round). The DOM lib stays in the packages' tsconfig. A backend may be typed against the browser's API -- a
  store typed `IDBFactory`, a canvas typed `HTMLCanvasElement` -- and **takes its browser object as a parameter**,
  which `viewer` passes in; it never fetches one from the global scope itself. That is "the browser API enters through
  an interface the package declares and `viewer` fills".

**The test that enforces it:** `tools/test/packageBoundaries.test.ts` reads every `.ts`, `.mts`, `.cts` and `.tsx`
under `packages/{archive,gs,mesh,scene,sound,ui,fmv,card}/src` on the TypeScript syntax tree (`ts.createSourceFile`
per file) and fails on either breach. For (a) it takes every module specifier -- `import`/`export ... from`, a bare
`import`, `import(...)` (a template literal too), `require(...)`, `import x = require(...)`, an `import('...')`
type -- and fails on any that reaches `packages/viewer`: `@s2u/viewer`, the deep path
`@s2u/socomlegacy/packages/viewer/...`, or a relative path. For (b) it tells a value reference from a type, a member
or property key, a parameter or binding, and a local that shadows the name; comments, strings, template text and
regex literals are not code to it. Its helpers are proved on inline samples in the same file. Each new package also
carries `test/headless.test.ts`, which loads its index under Node with no DOM -- the
runtime half of the rule, and the test its own vitest project needs (vitest fails a project with none). The
placeholder ledger (`tools/test/placeholderLedger.test.ts`) already walks every `packages/<name>/src`; it now
asserts that ui, fmv and card are among them, so a `*_PLACEHOLDER` or `*_READING` added there is held to the same rule.

## 3. Where today's code stays

Nothing moves in this task. The ARMORY's runtime stays in the viewer -- `packages/viewer/src/uiScript.ts` and
`armory*.ts` -- and its readers in the scene -- `packages/scene/src/ui*.ts` (`uiLayout.ts`, `uiLoc.ts` and the
rest). **PLAT-34** folds the ARMORY into the generic runtime (PLAT-05..PLAT-10) in place of its bespoke state
machine; where `scene`'s `ui*.ts` readers end up is PLAT-05's and PLAT-34's to say, not this page's. Until then a new
front-end task builds in the new package and leaves those files alone; a reader it needs from `scene` it imports.

## 4. What was scaffolded

`packages/ui`, `packages/fmv` and `packages/card`, each modelled on `packages/archive`: `package.json` (`@s2u/<x>`,
`type: module`, `main`/`types`/`exports` at `src/index.ts`, no dependencies until the first import needs one),
`tsconfig.json` (the base, `src` and `test`), `vitest.config.ts`, and `src/index.ts`, whose header states the
package's purpose and boundary and cites this page. The three join `npm run typecheck`'s `tsc -b` list and the
workspace's lockfile. `docs/ARCHITECTURE.md`'s package table gains them with PLAT-35.
