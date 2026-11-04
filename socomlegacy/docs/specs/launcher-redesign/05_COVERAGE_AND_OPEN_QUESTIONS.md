# Coverage and open questions

## Baseline and authority

This handoff freezes PR #509 at `bcb21bb3a98783bdc102c4ad2f350e2e3cdcc4b9`. The task is Polish the launcher menus and controller feedback. It was open, ready for review and unmerged when checked on 25 October 2026. The plan records approval of the preview. Its final LP.R1–LP.R20 decisions, including later placement and navigation corrections, govern this package.

The PR's recorded full gate and clean serial browser acceptance were still owed, and its physical-controller feel had not been tested. Preparing this design handoff does not supply that missing release evidence or approve merging the PR. The screenshot capture is a separate visual-reference exercise.

## What is established

The approved structure, screen families, settings inventory, navigation, data/permission constraints, typography/assets and responsive requirements are documented. Selected source files are copied byte-for-byte from the frozen commit with a source map. The main reference screenshots render those actual UI modules, including the live settings adapter, against isolated controlled fixture data.

The fresh source review checked the requirements against the screen, route, settings and dialog inventory. It caught and corrected two distinctions: live room filters are mutually exclusive All / Has room / No password plus a text query; the final Profile menu replaces its last Sign out row with Sign in while signed out. The source review also clarified that changing a disc source preserves the currently opened disc, and that Settings retains its own wrapping L1/R1 tabs while the main rail clamps.

## Evidence boundaries

The images are **rendered UI reference screenshots**, not Photoshop reconstructions and not proof of a live server, real account, game disc, actual controller, microphone permission or physical rumble. Example accounts, room/game names, participants, results, dates, counts, item names and selected values are fixtures. No personal account data or credentials are used.

The scene behind the basic launcher is the supplied authored project backdrop. Game map art is deliberately not added to a room/replay fixture as if it were read from a disc. The replay viewer reference shows actual viewer/transport chrome with a staged client and an unwired world; it does not show a real recording or claim real gameplay rendering. Its visible world-view-not-wired sentence is a consequence of the capture harness's deliberate no-world stage, not a claim that the real launcher cannot render replay worlds. Camera controls and the transport are actual UI modules. Overlay references show the shell and locks without a game running underneath. A native OS disc picker, microphone-permission prompt and browser installation prompt are described but are not app surfaces recreated in the atlas.

Screenshots show representative states of every UI piece. Textual state requirements also include transition, held-input, disconnect, partial-failure and accessibility behaviors that static images cannot prove. A screenshot of a current limitation is not an instruction to preserve that limitation.

## Open design and product questions

### Broader settings organization

The separate task Organise Settings launcher settings apart from game settings is still a design investigation. **Client / Game tabs are one idea, not an agreed replacement.** The PR's approved launcher entry remains System Settings / App, and the live full screen still mixes original and browser concerns across its existing groups. A recreation should preserve all those capabilities, bring controller choice/remapping into clear view, and propose any larger regrouping explicitly.

Reference: (the private board) ; LATER 294 in the repository.

### General saved-data management

The current design supports card personas, phrases, match name, original game settings and account mission loadouts. App removes a separate local disc-content copy with confirmation. A complete memory-card/saved-game backup/import/export/delete browser is not specified as implemented by this PR. The design session should identify the desired management model and scope it as a proposal instead of attaching invented actions to an existing button.

### Mobile refinement

The approved centered selection, visible neighboring categories, viewport-contained dialogs and larger scrollable landscape content are requirements. The separate phone review covers the modern UI more broadly and still needs its own real-device checks. The current 844×390 Home reference visibly crowds the rail/content/legend; it documents a baseline problem to improve, not a desired layout. The landscape sign-in reference shows the dialog scrolled to the focused keyboard key, so the title is above the visible scroll region. Preserve access to all of that dialog's content rather than treating the viewport crop as the entire dialog. Actual touch ergonomics, a physical controller and orientation changes should be reviewed after the recreated prototype is assembled.

Reference: (the private board) ; LATER 284.

### Controller artwork and behavior

The current mapper uses a PS4-style drawing as a swappable illustration. A new design may need artwork for other layouts, but should not infer a controller's exact shape from a generic browser ID. Preserve teaching, hold-to-bind, conflicts and required menu bindings. Physical rumble feel and the original game's rumble behavior are separate verification tasks.

### Complete original options

The source catalog names original options the launcher intentionally does not expose, and the original controller-preset flow has remaining scope. The design session cannot settle their behavior or add working toggles. Preserve the current source boundary and identify any requested expansion as another task requiring original-game evidence.

## Acceptance checklist for the design session

- The real logo, fonts, icon/glyph vocabulary and authored backdrop are used with their original files and licenses.
- The final five-category order, default Home, centered moving selection, single active label and clamped ends are preserved.
- Profile/account and Settings/App hierarchy follows the final corrections, including the signed-out action and installation placement.
- Every main and nested screen family in `01_REQUIREMENTS.md` has a composition, its applicable states and a clear Back route.
- Every shared dialog has the correct field/action semantics, safe default choice where applicable, focus ownership, short-screen scrolling and close path.
- All live settings appear with their meaning, real range/choices, persistence, defaults where known and conditional locks. Excluded sample options are not resurrected.
- Disc selection/extraction, account/device states, server failures and stored-content deletion remain honest and actionable.
- The companion overlay keeps its disc/account/card/round locks and never shows page-only launch actions.
- Desktop, laptop, portrait and landscape layouts remain readable; enlarged interface size, reduced motion, forced colors and native input/password managers are considered.
- Proposed features and open decisions are clearly labeled. No deployment, real service integration, account creation outside the original flow or gameplay change is implied.

## Package checks

The final package includes a machine-readable screenshot index, a file/checksum manifest and a browsable atlas. The assembly check verifies listed image dimensions, source hashes, required logo/font files, relative file links and ZIP contents. The final verification note records the actual capture count and any missing or unavailable references; it does not reuse the PR's test counts.
