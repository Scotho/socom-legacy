# Complete launcher UI requirements

## Purpose and authority

SOCOM II Legacy's launcher gets a community player from their own disc to the game, with device setup, server discovery, account tools and project experiments in a familiar console shell. It also supplies the same modern interface as an overlay where the host permits it. All of it is a browser adaptation. The original game remains the specification for its settings, data and behavior.

This document scopes the frozen PR #509 design, including its final corrections LP.R1–LP.R20. Those corrections override earlier plans, outdated code comments, prototype sample data and earlier screenshots. The PR plan is included under `reference-source/socomlegacy/docs/plans/2026-10-24-launcher-polish.md`. The earlier console plan and menu/history rules explain retained behavior, but do not restore superseded categories or placements.

Requirements are marked **approved** when the final plan or source establishes them, **conditional** when a device, account, disc or host supplies them, and **open** when further design or owner input is needed. Screenshots are examples of states, not evidence that services or game hardware were exercised.

## Scope

Included: launcher chrome, the category rail, every category's actions and readout, disc selection and extraction, readiness and launch handoff, device settings and controller remapping, all settings groups, account sign-in and remembered state, profile/persona tools, service record, loadouts, replays and replay entry/transport UI, server/room/game/custom-match views, every shared dialog, installation/storage UI, controller glyphs and menu feedback, responsive layouts and the companion overlay's differences.

The Forge and Test room are included as launcher destinations and explanatory entries. Their internal editors, the full gameplay HUD, original game menus, project reading pages, server administration, moderation tools, account creation in the original ONLINE flow, and any deployment are outside this recreation. Related UI seams such as the touch-layout editor and local problem-report dialog are documented as companion surfaces rather than new crossbar categories.

## Final shell and layout

### Category rail

The five categories are **Experiments / Online / Home / Settings / Profile**, in that order. **Home is the default** on initial load. Category identities and deep links remain stable even though their visual positions changed.

The rail is a fixed container centered on the screen. Its selected icon always occupies the center. Neighboring icons translate around it; soft edge fades hide icons as they leave the visible track. Selection does not resize the rail. Only the active category's visible label fades in beneath the icon, with a small settle. All icons retain accessible category names. First and last categories are clamped: no end wrap for pointer, keyboard, controller or wheel navigation.

L1/R1 hints sit close to the fixed rail, with slightly enlarged desktop glyphs. Their disabled/end states are understandable. Native Tab can reach all five categories and selects a focused category without scrolling the clipped rail away from its center.

### Main content

Below the rail, the left action list and right information panel form a centered group. Balance both columns as one composition rather than anchoring the list far left and the panel far right. Use calm TV/console spacing and responsive sizing. Preserve a useful view of the authored backdrop.

Rows align the primary title with the icon. Subtitles reveal on pointer hover, keyboard focus or controller selection. Their reveal moves the icon/title pair coherently; the icon must not remain centered against the combined title/subtitle block. Idle pointer rows keep titles centered with their icons. Sign out stays the last item in Profile's normal group, not pinned to the bottom of the screen.

The right panels are redesigned, darker layered surfaces with clear headings, helpful explanation and compact state cues. Home's panel is deliberately lighter than the first dark revision. The panel explains the selected area or row and tells the player what to do next. It does not add invented metrics or decorative statistics.

### Header

Keep the real SOCOM II Legacy emblem and wordmark. A compact package-version badge sits along the top in a restrained metallic treatment. Its side-to-side sheen is very subtle, and static under reduced motion. An optional build revision is provenance, not a replacement for the package version.

The account control is at the top right. Its mouse dropdown opens beneath it and aligns to its right edge. It has the same action order as Profile, survives live redraws, closes after selection and on outside click/Escape, and returns focus sensibly. It is the explicit exception to the controller-support pass: a controller uses Profile and the normal sign-in action instead.

Discord is the one authorized community link: a small official symbol beside the account area on desktop, a Home row below Memory card on phones. It opens a new tab. Do not restore the removed project News/Roadmap/Journey/Archive navigation or add other social links.

### Bottom legend and launch cluster

The bottom bar carries controller/device status, contextual controller glyphs with words, the disc chip and the primary START action in page mode. On the main menu, the Cross/X prompt always reads **Select**; this changes prompt wording, not the selected action's behavior. Nested screens may use contextual verbs.

Disc, controller and microphone use consistent compact cues: ready green; missing disc/controller danger red; optional microphone unavailable/off warning amber. Color is supported by icons and words. Do not recolor whole cards. On mobile, status cues collapse to icons with accessible names. Missing controller status does not block valid keyboard, mouse or touch play.

START is the launcher handoff, not an invitation to invent a different game flow. It has disabled/not-ready, ready, arming/launching and failure states. A selected room/game is named as the launch target. Device/disc status must stay readable and must not overlap prompts at smaller desktop sizes.

## Information architecture and screens

### Home

The action list is **Disc / Controller / Microphone / Memory card**, followed by Discord where shown. Disc opens the player's local selection; Controller opens controller settings; Microphone enables/disables optional voice input; Memory card opens Profile. Home's right panel contains readiness and **On the server now** players/rooms information when the server has answered. Unknown/offline state is shown honestly rather than as zero or invented numbers.

Readiness depends on the disc and a supported input. The microphone is optional and never a launch blocker. Show the next useful action when the disc is absent, input is unavailable or a read failed. Account sign-in is not required merely to open one's own game disc.

### Disc selection and local storage

The Disc row is one visual box with its main action and a partitioned cog on the right. The cog opens a small source menu. Current sources are **DISC ISO** and **RETAIL DISC**. The active source is checked; keyboard/controller focus moves into the menu. Square, the cog, outside click and Back provide the supported open/close paths. Changing source neither closes the current disc nor revokes its readiness; the next Disc activation opens the newly selected source's chooser, and replacement happens only when another disc is chosen. The source menu is not an account or settings screen.

ISO selection uses the user's local file picker and whole-window drop support. Retail disc uses a directory picker where supported. A native OS file picker is not app chrome to redesign. Explain unsupported directory access with actionable text. Disc files remain on the player's device and are never uploaded to the project server.

Required disc states: empty, reading, ready, invalid/unreadable, partial kept content, complete kept content, and in-use under an overlay. Show the error reason and a way to choose again. A working copied read set can satisfy subsequent starts; the user must understand what is retained and where.

The extraction dialog shows planning, copying, verification, completion and error. It includes the current file path, file count, bytes/progress, storage backend in plain words, available space when known, and cancel/retry/continue choices appropriate to the state. Its disc-to-storage animation follows determinate progress, stands still under reduced motion and never substitutes for text. Cancel keeps completed work. A refused/wrong disc offers Close rather than a misleading continue. The current source only offers direct-disc fallback after three real extraction failures; do not show that choice as an immediate default.

Keep partial/resume, quota/storage unavailable, verification failure, cancel and retry states. Successful completion has a clear ready result. Installation and the copy of disc content are separate concepts and must not be conflated.

### Controller setup and remapping

Home's Controller row leads to Settings > Controller. Show connection state, selected device and a useful "press a button" instruction. Automatic selection and named connected controllers are supported. Device names appear from the browser; the design must allow long names and disconnect/reconnect.

The Button mapping page is a full nested screen. Its visual anchor is the supplied PS4-style controller drawing, with the focused logical button, pressed inputs and a hold-to-bind progress ring reflected on the drawing and the matching row. Clicking a drawn button focuses its row. Keep the drawing as a replaceable component; do not imply it accurately identifies every physical controller shape.

Cover all sixteen logical actions, plus Stick dead zone, Crouch, Prone and Stance mode. Dead zone for the browser controller profile is 0–40% in 1% steps. The game's own stick dead-zone setting is separate. Mapping is kept for this browser/controller. Preserve the current stance choices and explanations without inventing gameplay behavior.

Required mapping states: no device; supported/usable layout; an unfamiliar layout that must be taught; teaching prompts for buttons/sticks; hold progress; not-now/cancel; active pressed-button feedback; ready; listening with release-all instruction, hold prompt and countdown; timeout; custom binding; unbound optional bind; conflict; restore confirmation. Conflict offers **Swap / Replace / Cancel**, initially focused on Cancel. Essential Cross, Circle and START bindings cannot be silently destroyed. The restore dialog explains that bindings, dead zone and crouch/prone binds reset for that controller.

The controller illustration, list and explainer must stay usable at laptop sizes, portrait and landscape. A separate diagnostic input-test concept from this chat is not an approved new page.

### Microphone and communication

Home's Microphone action asks for permission only when the player enables it. Off is optional, not failure to set up the launcher. Show listening/on, off, permission denied, unavailable or no device with a useful explanation. Device names are only available after browser permission; use neutral fallback names before then. Communication settings provide use-in-game and device selection alongside the original external-whispers setting.

Do not invent a recording/upload workflow, echo cancellation control, standalone microphone test page or voice-activation system as an existing requirement. If the design session proposes one, label it as a proposal. Browser permission prompts remain native.

### Online

The launcher list includes **Browse rooms**, sign-in/account status, **Server news**, **Custom matches**, and **Server**. Server is nested here, not a crossbar category. Signed-out visitors can inspect the server's anonymous rooms/counts; signed-in players can select a launch target. The real server determines what actions and data are available.

Browse rooms is a nested screen with a filter row, scrollable table, focused-row detail panel, totals/update line, Search and Refresh. Live filter tabs are **All / Has room / No password**: one tab is selected at a time, and a text query combines with the selected tab. The prototype's mode filters are not live requirements. The live server's connection measure is a 0–3 quality band with words and bars, not a fabricated millisecond ping. Do not invent a SEAL/Terrorist split when the server only supplies player/spectator counts.

Distinguish briefing rooms from the games inside them. A room detail lists games and players, or states why names are private/unavailable. A game detail shows supplied map/rules/counts, round settings and player information. Preserve locked/password/private/clan/rank/full/in-progress states where supplied. A target stays identified by stable ID across a poll; the screen must not reorder or move focus unexpectedly. If a row disappears, focus goes to a sensible neighbor and a gone detail returns to a valid parent.

Required list states: first load; available rows; empty; no filter/search match; refresh; unreachable/refused/session lost; stale rows plus a failure line; signed out; target selected; full/locked game; removed room/game. Filters, room rows, selected target and focus are distinct states.

Custom matches lists Forge lobbies with names, maps, players/capacity, password and in-match states. It has waiting, unavailable, empty, populated and joining states. JOIN is locked over a running game because it would replace that page with Forge. Any password field supplied by the custom-match flow uses the same field/keyboard principles.

Server news is a reading dialog with universe and announcement states; the Server screen provides status/Refresh, universe information, announcement and conditional Report a problem. Loading, signed-out announcement, failure and available content are distinct. No count is shown before a response.

### Profile and account

When signed in, both Profile and the top-right mouse account menu use **Service record / Replays / Loadouts / Profiles / Sign out**, in that order. When signed out, the last row becomes **Sign in**. Do not reintroduce a separate Replays or Armory category. The title **Profiles** is the launcher entry; nested screens work with the card's **personas**. A local persona and a server account are related but not interchangeable.

Service record shows the signed-in name, rank where known, clan, friends, ignored count, ladder and any supplied player-info rows. Account record, rank and mission loadouts load separately and may fail independently. A rank uses the authored star before the disc is available, and the real medal picture when supplied by the player's disc. Never invent ranks, service statistics or a complete record from a partially available response. Provide signed-out, loading, failed/retry and populated states.

Replays opens **Your matches**, newest first. Its table shows map, rules, recorded time, length and players; its detail panel shows supplied participant names/result/end state and Watch. Required states: signed out with sign-in action; loading; failed/retry; empty; populated; more available; loading more; failed-more with already loaded rows retained; disc required; locked during a round; disc lost while viewing. Label loaded and saved totals correctly when pagination is incomplete.

Replay playback is a full viewer seam with its existing transport and seek control. D-pad walks the controls, left/right on seek adjusts position, Cross activates the focused control, Circle closes and restores the list row. Loading/error/locked and normal playback need a consistent treatment. The game rendering itself is outside this launcher recreation; no real replay capture is claimed without disc data.

Loadouts first opens a two-row chooser: **SEAL**, then **Terrorist**. Each side opens its mission list, then a mission's editor. Lists handle sign-in/disc/round locks, loading, failure/retry, empty, default/saved and stored-for-an-unoffered-mission rows. An editor has the type and five equipment slots, current and default values, fixed/disabled entries, busy save, dirty state, success/failure, gone mission, Defaults and Save. Leaving dirty edits asks **Leave without saving?**, with Keep editing as the safe initial choice. Defaults asks separately and explains its server-side effect. The design never invents equipment legality or available weapons.

Profiles opens the memory card's persona list, including the signed-in persona not stored on this card when applicable, saved personas, New persona and Match name. Show card-slot information, unreadable card, empty card, host loading/failure/retry/full, signed-in marker and editing locks. A persona editor contains home town, gender, five taunts and five team messages, plus Delete. Distinguish the card's own phrase text from a disc caption not yet read or unavailable. Text edits use a shared field dialog with cap/error; deleting a persona asks for confirmation. A new-persona form collects name/home town/gender and reports creation refusal. Match name is its own edit, not the server account's identity.

Sign out uses a confirmation with a safe No first. Where offered, include **Yes, and forget this device**. Signing out leaves memory cards untouched. Keep truthful locks if the game holds the account or a round runs. The final PR retains a signed-out **Sign in** row in the last slot of Profile/account; Service record can also open the shared sign-in dialog. This final state supersedes the older backlog suggestion to keep sign-in only in the header.

### Sign in, agreement and text entry

The sign-in dialog offers the card's persona tiles and **Add new**. Add new means type a persona name for sign-in; it is not an account-creation form. The copy directs a player without an account to start the game and choose **ONLINE** to create one.

Use real username/password inputs for physical typing, autofill and password managers, even when styled with console fields. Preserve server/card length limits and native field entry. Passwords are masked. The on-screen keyboard supports letters, Shift, Space, Delete and Done/sign-in, plus controller hints. Its selected tile, field target and keyboard key are independently understandable. Busy sign-in disables the relevant inputs; errors are inline and recoverable, not success toasts.

Remember me is chosen on sign-in where supported and starts ticked. Explain the shared-device consequence. Quick remembered sign-in can succeed, require a password or fail; the UI must not flash the wrong account or lie about remembered state. In overlay contexts that do not offer remembered state, say so.

The user agreement has a scrollable body, Accept/Decline and the required decline confirmation. Accept is the original's initial focus exception; do not change the agreement's real text or acceptance behavior for layout convenience. Search and profile fields reuse the same native-input/on-screen-keyboard system, with field-specific caps and a clear cancel path.

### Experiments

Two entries: **Forge** and **Test room**. Explain that they are the project's own tools and not part of the original game. Forge is build-and-fly using the player's own disc props on a map or blank floor. Test room explores maps, collision and spawns. Each opens in a new tab. Keep requirements at these launcher entry points; their editors are separate products, not additional screens to recreate in this handoff.

### Settings and App

The launcher category list is only **System Settings** and **App**. System Settings opens the full existing settings screen; App opens that screen on its App tab. Keep its supported groups and row data, current/default/changed states, locks and per-row explanation. The exact catalog is in `03_SETTINGS_CATALOG.md`. Changes generally save as made; each row explains whether it applies now or at the next start and whether it saves to the memory card, this browser, this controller or the account.

Installation belongs at **Settings > App > Install app**. The dialog reflects Chromium offer, iOS instructions, already installed, Firefox unsupported, or no install offer. It explains the icon/window benefit and that installed iOS storage is separate from Safari. The native install prompt requires a trusted pointer activation; do not promise controller-only installation beyond opening/reading the explanatory dialog.

Downloaded-content removal is next to installation under App. Show what is kept, approximate size, partial/whole state and local backend when supplied. No stored content means a clear locked Nothing stored row. Confirmation explains that disc files kept by this browser are removed, the next start asks for the disc, and accounts, memory cards, profiles and preferences are preserved. Prevent removal while that disc is in use by a game.

Memory-card/persona management is supported through Profile. A general saved-game import/export/backup browser is **not established by this PR**. It remains a design question; do not imply that removing downloaded content deletes saved games, or that a local card deletion/backup feature already exists.

## Navigation and interaction

### Controller

Support the whole launcher except the header's mouse account dropdown. L1/R1 changes categories on the main shell; D-pad walks lists or changes a selected roller as appropriate. Cross confirms, Circle goes back one level or closes the current dialog. L2/R2 handles filters or page navigation where the current screen offers it. Triangle/Square/START retain the current contextual actions in the bottom legend; do not use one global verb regardless of context.

Preserve focus across polling and incremental redraws. DOM updates patch existing elements so rail motion, focus and pressed feedback survive. A held navigation input uses the existing repeat behavior; a blur or handover cancels held feedback. Returning from a child or dialog restores the opener or nearest valid row. Long read-only dialog text supports D-pad reading. A dialog takes input away from the screen behind it.

Menu rumble is a labelled browser adaptation for navigation, confirm, back, changed values and refusals. Respect the vibration preference and silently handle hardware that cannot rumble. Original-game rumble is separate. All modern-launcher controller glyphs have a small action bump, including face buttons, shoulders and D-pad hints; the surrounding layout stays still. Under reduced motion, the result remains clear without bumps.

### Pointer, wheel, keyboard and touch

Pointer hover previews focus and reveals descriptions. Click/tap activates the named target without duplicate actions. The main category rail accepts wheel navigation at a graceful, debounced pace through the same category action; modifier/zoom gestures, text fields, dialogs, nested screens and lists that can scroll are left native. End wrap is disabled by the newer LP.R13 decision even though the older wheel card described wrapping.

Native Tab focus stays visible and logically ordered. Fields accept native typing and password managers. The existing launcher START accepts keyboard/mouse/touch as supported by the actual input layer; development navigation shortcuts are not presented as universal gameplay controls. Escape closes supported dialogs without disrupting native text entry; pointer/touch Back controls and browser history remain available.

Phone touch targets must not overlap or depend on hover. The touch-layout editor is a companion screen, offered only on touch-capable devices, with separate portrait and landscape layouts, movable controls, save/reset/cancel and its own input ownership. It is not the original game's menu.

### Back and history

Category changes, settings-tab changes and focus changes replace the current history entry. Opening a nested page pushes a new entry. A dialog has no distinct route but takes a same-URL history entry so browser Back closes it first. Browser Back/Forward, Circle and the page Back affordance resolve the same navigation. Deep links and refresh restore a valid page; a removed mission/persona/room falls back safely.

Every nested page has one compact back control: a small left chevron, then the parent context icon/label. No duplicated eyebrow and no local Circle glyph; Circle is explained in the bottom legend. The header Back remains mouse/touch oriented, outside the controller walk. Dirty loadouts preserve their confirmation across browser Back and Forward.

## Companion overlay

Overlay mode uses the same launcher components over the host game, Forge or Test room. It must not mount a second authored backdrop or pretend the game stops. Show **Back to game** and the host's toggle label/cap where supplied. Circle at the top closes it. Hide START, launch-target actions and the launch screen. The iframe overlay never pushes browser history.

The host owns the active disc; show In use/served/reading/error truthfully and lock disc replacement and downloaded-content removal while the game uses it. Browsing rooms is read-only as a launch target in overlay mode. Sign out/persona switching waits when the game owns the account or a round runs; memory-card edits wait while the game holds the card. Replays cannot start during a round, and Custom match JOIN cannot replace the underlying game. Explain each lock on its row/aside instead of simply dimming an unexplained button.

The overlay-only opening-button setting and local Report a problem dialog are conditional surfaces. Problem reporting saves a local report file with optional screenshot; it is not automatic telemetry or a message to a third party. Installation/update notices must not reload an active game or unsaved edit without the established defer path.

## Responsive and accessibility requirements

Provide deliberate desktop/TV, laptop, phone portrait and short landscape compositions. The current reference starts from a 1920×1080 rem stage, a 760px narrow breakpoint, a scaled desktop fit and a scrollable narrow stage. These implementation details explain the captures; a recreated system may improve the mechanics while retaining the approved hierarchy and behavior.

At 1920×1080, 1440×900 and 1280×720, long action/settings lists scroll within their content region and never sit under the legend. At phone sizes such as 390×844, 360×640 and 844×390, dialogs stay within both axes, wrap long labels and scroll their body so fields, keyboard and close/confirm controls remain reachable. Portrait retains the selected-centered rail with smaller/partially visible neighbors, rather than wrapping all categories into a grid. Landscape gives actual content a usable scroll region instead of letting header/tab chrome consume it.

Use readable contrast over every possible backdrop. Text lives on stable row/panel surfaces rather than directly on light art. Give visible focus, accessible names to icon-only controls, disabled reasons, announced loading/error/status changes, native roles for dialogs/fields/switches, and text/glyph support for color cues. Respect reduced motion, forced colors, larger interface sizes and safe areas. Do not make a visual-only glow the only way to identify selection.

## Required design-session outputs

Recreate the foundations, tokens, icon/glyph rules and components as a browsable system, then assemble the approved shell and connected screen flow. Supply each component's states, desktop/mobile compositions and behavior annotations. Cover supported and conditional states from the inventory; flag any missing screenshot without inventing its content. Separate new proposals from approved requirements. Finish with a clear list of decisions still open and any source constraints the design cannot resolve.
