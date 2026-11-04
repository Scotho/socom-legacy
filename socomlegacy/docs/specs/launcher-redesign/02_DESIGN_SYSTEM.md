# Design system recreation requirements

## Identity and visual direction

The product name is **SOCOM II Legacy**. Use the supplied emblem, with SOCOM II and LEGACY treated as the existing wordmark in the header. `assets/logo/socom-ii-legacy-emblem.svg` is the exact repository asset; `console/icons.ts` embeds the same geometry in the launcher. The standalone SVG has its own dark square, gold border, segmented target ring and gold II strokes. Do not remove that background while claiming an unchanged transparent mark.

The character is a remastered SOCOM briefing console: dark ocean/green surfaces, restrained warm gold, condensed type, authored line icons and tactile PlayStation glyphs. Spacious console navigation sits over the project's authored Crossroads plaza at dusk. Avoid a dashboard of equally weighted cards, neon sci-fi additions, substitute logos, gratuitous military copy or invented statistics.

The supplied backdrop is authored project art, not a screenshot of the game. No disc asset is required to draw the basic launcher. Map previews and medal images can only appear when supplied by the player's disc; before that, show an honest guide/empty state.

## Foundations

### Colors

The exact files are `design-system/tokens.json`, `tokens.css` and the engineering aliases in `base.css`. Recreate semantic roles rather than sampling colors from compressed screenshots.

| Role | Reference value | Use |
|---|---|---|
| Ground | `#000e11` | Main dark teal ground |
| Deep ground | `#000000` | Black letterbox/boot and specified deep effects |
| Panel | `#002933` | Stable content surfaces |
| Panel edge | `#061a1c` | Quiet decorative edge |
| Tab | `#032326` | Resting controls |
| Lit tab | `#093535` | Hover/current surfaces |
| Highlight | `#0d595c` | Selected list/roller surface; strong text on top |
| Gold | `#c4a04a` | Modern labels, selected accents and figures |
| Display gold | `#dcb85c` | Large title/approved glow accents |
| Body text | `#b4bfc1` | Main copy |
| Strong text | `#dfe4e5` | High-emphasis text and active-surface content |
| Dim text | `#8a9a9c` | Readable captions and secondary text |
| Cross/focus | `#5fb3bf` | Cross glyph and focus |
| Triangle/ready | `#3fae7f` | Triangle and readiness cue |
| Square | `#d06fb0` | Square glyph |
| Circle/danger | `#ee5a52` | Circle and danger status cue |
| Warning | `#e0a35a` | Amber optional/unavailable/attention |

`gold-source` (`#786e3b`) is the original low-contrast reference color, not a modern text token. It remains inside the existing logo artwork. Do not use it for new small text. Ready/danger/warning UI roles follow the launcher overrides; do not use generic success/error recoloring of entire panels.

Text over the backdrop uses stable row and panel veils. The console's row veil is `#032326f2`, panel veil `#002933f2`; graded ground veils control the composition. The PR's later launcher rules refine these treatments, including the lighter Home panel. Read the final `console.css` alongside the older shared component layer. Do not treat every historical token comment as the current layout.

### Typography and assets

Self-host these actual supplied faces and carry their OFL licenses:

- **Saira Condensed**, italic 800: display/title treatments where defined.
- **Oswald**, variable normal 400–600: condensed labels, body and console roles as defined.
- **JetBrains Mono**, variable normal 400–500: technical readouts where useful, not every label.

Console typography roles are in `base.css`: `--s2u-type-cx-title`, subtitle, category, item, item-sub, hint and figure, with associated tracking. The stage uses rem-based design sizes; screenshots are viewport-scaled and should not be mistaken for raw font sizes. Preserve purposeful uppercase in existing console roles and sentence case in explanation text. Do not apply an unrelated generic sans-serif system.

### Space and geometry

The foundation spacing steps include 4, 8, 12, 16, 24, 32 and 48px. The original console stage uses 1920×1080 with 5% safe areas, fixed header/stage/legend regions and a scale fit; the approved polish recenters the rail and content group. Recreate the resulting hierarchy and proportions, with deliberate adaptation for shorter screens and phone orientation.

Foundational Briefing components A–F are generally flat and square. The **console `cx-*` layer is a documented exception**, with its authored pills, rounded on-screen keys and gold glows. Preserve that distinction. Do not flatten the console because an older page guide says all surfaces are square, and do not spread console pills to all project pages.

### Icons and controller glyphs

Use the project's 24-unit line-icon vocabulary from `reference-source/.../console/icons.ts` and `design-system/icons.ts`. Reuse the actual gear for Settings. Keep icon stroke, optical weight and contextual sizes consistent. Discord uses its official symbol from the source rather than a replacement globe or generic line mark.

Document Cross, Circle, Triangle, Square, shoulders, START and D-pad hints as reusable glyph components. Always pair prompts with meaningful words; on mobile, icon-only status cues retain accessible names. All interactive glyphs can share the brief tactile bump, with reduced motion and without moving surrounding text. The controller diagram is a reusable illustration component distinct from action icons.

## Component inventory

The original export named fifteen console components. The recreation must cover all of them and their later additions. Screenshots and crops are indexed in the atlas; component state families below remain necessary even when only representative states are pictured.

| Component | Anatomy | Required state families |
|---|---|---|
| ConsoleFrame | Backdrop, veils, header, stage, legend, overlay, live region | Home/deep page, page/overlay, wide/narrow, reduced motion |
| ConsoleHeader | Emblem/wordmark, version, Discord, account | Signed in/out, dropdown open/closed, optional overlay close |
| Crossbar | Fixed rail, translating track, icons, selected label, shoulder hints, edge fade | Each category, first/last clamped, native focus, selected-label reveal |
| ActionList | Row icon/title, revealable description, optional status, split source cog | Idle, hover/focus, press, disabled/locked, live input, scroll |
| Readout | Heading, concise explanation, facts/checks/status cues | Readiness, server up/down/unknown, account state, contextual help |
| ScreenHead | Return chevron, parent icon/label, title, optional filter/tab row | Parent return, long title, wide/narrow, no duplicate eyebrow |
| RoomTable | Column header, scrollable rows, count/ping, footer | Public summary/briefing rooms, focus, target, empty/loading/failure |
| RoomDrawer | Preview or guide, facts, optional supplied figures, action/lock | No disc, art from disc, full/private/locked, selected target |
| OptionRows | Label, roller/action, previous/next, current/default/changed value | Focused, changed, fixed, missing default, locked, save refusal |
| ConsoleLegend | Context prompts, device cues, disc chip, START cluster | Main Select, nested actions, paging, ready/not ready, overlay no START |
| SignInDialog | Persona tiles, name/password fields, error, OSK, remember, account note | Existing/Add new, busy/error, remembered/unavailable, portrait/landscape |
| OnScreenKeyboard | Letter keys, Shift, Space, Delete, Done, field target | Focused key, shifted, disabled/busy, short viewport scroll |
| Confirm | Title/body, safe answer, destructive/alternate answers, close | Signout/forget, decline, storage removal, mapping conflict/restore, persona delete, loadout leave/defaults |
| Toast | One brief status line | Positive outcome/replacement/dismissal; failures remain in context |
| LaunchScreen | Progress/handoff, named target, error and Back | Arming, launch, failure/cancel; absent in overlay |
| Account disclosure | Right-aligned anchored menu, shared Profile order | Open persistence, outside/Escape dismissal, sign-in/locks |
| Disc source menu | Split row cog, two menu-radio sources | Open, focus, checked, unsupported source, overlay lock |
| Extraction dialog | Disc/storage illustration, path, facts, determinate bar, actions | Plan/copy/verify/done/error/cancel/refused/eligible fallback |
| Controller mapper | Diagram, binding rows, pressed marks, hold ring, explainer | Disconnected, usable, teaching, listening, conflict, changed, reset |
| Persona tools | Card list, field rows, phrase groups, create/delete | Empty/unreadable, server read state, signed-in, locked, editing |
| Service record | Identity/rank, independent fact/loadout sections, retry | Signed out, partial load/error, populated, no medal |
| Loadout tools | Side chooser, mission list, type/equipment rollers, save | Missing prerequisites, dirty/busy/fixed/unoffered, defaults/leave |
| Replay list and transport | Matches table/drawer, pagination, mounted viewer controls | Account/read failure/empty, loaded/saved, disc/round locks, playback |
| Install dialog | App mark, benefit, browser-specific instructions, action | Chromium/iOS/Firefox/installed/no offer |
| Local report | Description, optional capture, local save, cancel | Empty/filled, capture unavailable, saved/error; conditional host seam |
| Touch layout editor | Orientation-specific preview, movable buttons/sticks, toolbar | Portrait/landscape, selected control, save/reset/cancel |

## Motion and feedback

Use the existing short duration vocabulary: fast 120ms, base 200ms, slow 600ms and the signature 360ms where used. The settle curve is the source's `cubic-bezier(0.22, 1.12, 0.36, 1)`. Exact feature-specific timing remains in the supplied CSS/logic; these values are references, not permission to replace gameplay timings.

Design the rail glide, selected-label fade, row-description reveal, press/glyph bump, version sheen, optional backdrop drift and extraction flow as one calm vocabulary. Avoid simultaneous decorative loops. A static screenshot cannot establish animation or physical rumble feel; document those separately. Reduced motion disables drift, sheen, bumps and extraction motion while keeping selection, progress and status understandable.

## Documentation expected from the design session

Provide semantic tokens, typography roles, spacing/layout rules, icon/glyph and logo guidance, component anatomy, state variants, input/focus behavior and responsive examples. The interactive prototype must demonstrate the same navigation and data/permission constraints as the requirements. Distinguish visual polish from proposals that change structure or add capability.

Keep original settings' real labels/meaning and browser adaptations visibly intelligible. Do not embed implementation details that do not help players, and do not claim that fixture service data is live. Include empty/error/locked flows as first-class system examples, not only an ideal signed-in Home screenshot.
