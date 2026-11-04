# The launcher redesign -- spec (the comparison audit)

> Written 2026-10-26 (seat redotcom-04, the owner present) from the owner's Claude Design artifact
> `(a private page)` (version 1792983394-8ddd, "SOCOM II LEGACY"), compared panel by
> panel against the launcher on `main` at `2e8b80433` and against the unlanded polish pass `agent/launcher-polish`
> (PR #509, `bcb21bb3a`). The plan that executes it: `../plans/2026-10-26-launcher-redesign.md` (LR).
> Product track (OT.R53): a browser launcher adaptation; nothing here changes the original game's behaviour.

**What the artifact is for** (the owner, 2026-10-26 ~04:05Z, in this seat): "We really only want the design and the
appearance of the layout, with the flexibility of the old merged into the new conventions where possible." The
artifact is the look and the layout. Every figure, list and option in it is sample data unless this spec maps it to an
adapter the launcher already has (CX.R5: what the launcher shows is what the server and the emulator report).

## 0. Provenance: the design's own input

The owner's Claude Design export (`SOCOM 2 Launcher Design.zip`, 2026-10-26; unpacked on this host under
`C:/Projects/agent-mail/evidence/launcher-design-src/`, never in git) holds two design versions -- `S2 Launcher.dc.html`
(the first pass) and `S2 Launcher v2.dc.html` (the artifact this spec audits) -- the assets (the Crossroads picture,
the Discord mark, Oswald and Saira) and, under `uploads/socom-launcher-design-handoff-2026-10-25/`, the **brief that
the design session was given**: a handoff package that freezes PR #509 at `bcb21bb3a` as "the design authority",
with the requirements (`01_REQUIREMENTS.md`), the design system 2.2.0 token files (`design-system/tokens.css`,
`tokens.json`, `components.css`, `icons.ts`, `emblem.svg`), the settings catalogue (`03_SETTINGS_CATALOG.md`: the
memory card's rows with their real ranges and persistence; the browser rows; the excluded sample options), a
navigation map of #509's routes, a screenshot atlas, byte-for-byte copies of the console source, and the open
questions (`05_COVERAGE_AND_OPEN_QUESTIONS.md`).

What that settles for this plan:
- The design was made knowing the launcher as #509 built it; its brief said "Do not invent unsupported resolution,
  frame-rate, smoothing or network options to fill a layout" and "Keep sample data visibly distinct from supported
  capabilities". The v2 artifact still drew them. LR.R7 (drop them) therefore follows the design's own brief, not
  only ours.
- The brief required the real emblem and wordmark ("do not substitute a text-only logo or a newly generated mark"),
  the self-hosted fonts and the authored backdrop. LR.R9 reads so: the brand is `emblem.svg` plus the wordmark.
- The brief's open questions map to the plan's deferred list: the Client / Game settings split (LATER 294, research,
  not a navigation change), the phone refinement (LATER 284; the 844x390 crowding is "a baseline problem to improve,
  not a desired layout" -- LR.R12's matrix covers it), a saved-data manager (not specified; the artifact's Memory
  Card panel is that unspecified proposal, not built).
- The settings catalogue is the authority for LR-5's rows, ranges, defaults and locks; it agrees with the inventory
  in section 3 and adds the numeric ranges (screen position across 0-250, down 80-250; launcher sound volume in 10 %
  steps; stick dead zone 0-40 % in 1 % steps).
- `01_REQUIREMENTS.md` "Companion overlay" and "Responsive and accessibility requirements" are LR-7's checklist in the
  handoff's words (overlay locks, no second backdrop, no history push; lists scroll within their region and never sit
  under the legend; dialogs inside both axes at 390x844, 360x640, 844x390; reduced motion, forced colours, safe areas).

## 1. The artifact, decoded

A single React class (`DCLogic`) rendering: a brand header (SOCOM II LEGACY, a date and a blinking clock, an account
button), a horizontal category rail of five icons with the selected one centred and the ends bumping (no wrap), an
item list under the rail (icon, title, subtitle), a panel to the right with a breadcrumb, a title, a description and
rows, a bottom legend of button hints, a toast, a "Before you deploy" check overlay with a Deploy button, a boot
sequence, a "Signed out" resting screen, and an animated backdrop (four translucent XMB-style sheets lit at their
upper edge, a dot grid, a vignette, an optional darkened Crossroads picture, seven colour themes).

Row kinds in the artifact: header, toggle, slider, select, action (tones: primary, muted, danger), link, info (tones:
good, warn), list, pick (radio within a group), bind (press-to-bind), meter (microphone level), drop (disc drop zone),
check (disc, controller). Navigation: Left/Right on the rail, Up/Down on items, Enter opens, Escape or Backspace
pops; inside a panel Left/Right adjust a slider, select or toggle, Right follows a link, Left pops.

Design-time knobs the artifact exposes as props (font, iconStyle, railSpacing, hintGlyphs, labIcon, padIcon, profIcon,
theme) are not features: the plan fixes their values (LR.R9) and ships no knob.

## 2. The categories

| artifact order | the owner's order (LR.R2) | items in the artifact | what the launcher has (main / #509) |
|---|---|---|---|
| Experiments | **Profile** | Service record, Replays, Loadouts, Profiles, Sign out | the same five since LP.R2; Profiles = the memory card's personas |
| Online | **Settings** | Game Settings, System Settings, App | System Settings + App since LP.R3; Appearance is new (LR.R8) |
| Home (default) | **Home** (default, centred) | Play, Memory card, Server activity | Disc, Controller, Microphone, Memory card, Discord + the readout |
| Settings | **Online** | Quick match, Rooms, Friends, Clans, Server information | Browse rooms, Sign in, Server news, Custom matches, Server |
| Profile | **Experiments** | Forge, Test room | Forge, Test room (links that open the pages) |

The rail: selection centred, neighbours slide, soft edge fades, one label under the selected icon, a bump at either
end and no wrap ("The bump on l1/r1 is intentional", the owner, 2026-10-26 ~04:05Z) -- LP.R13, LP.R15, LP.R18 as
#509 built them, with LR.R2's order. L1/R1 keep CX.R12's item-move sound and hold-to-repeat; CX.R12's wrap and
CX.R10's "never hide the categories scrolled past" are superseded (LR.R3).

## 3. Panel by panel: what the artifact shows, what it becomes

**Kept from the launcher as it is (the artifact lacks it; the plan carries it into the new skin):**

- The in-game overlay mode (CX.R13): "Back to game", the "Over your game" readout, the lock lines, Report a problem,
  START and the launch target hidden. The artifact has no notion of it.
- History routing (CX.R15-R17): nested pages push, categories are tabs, Circle = the header Back = the browser's
  Back, a dirty editor blocks Back, deep links and invite / lobby share links decode. The artifact keeps an in-memory
  stack only.
- Mobile: the phone layout under 760 px, the touch pad, the touch layout editor, dialogs that stay inside the
  viewport (LP.R20).
- The disc model: DISC ISO or RETAIL DISC folder behind the cog on the Disc row (CX.R9, CX.R11), drop anywhere, the
  kept disc in browser storage, the extraction popover (FI.R6, FI.R7), "delete the kept disc" (LP.R10).
- Sign-in as it works: persona tiles, the on-screen keyboard, Remember me and the quick sign-in, the USER AGREEMENT
  step, sign-out with "forget this device".
- Rooms as they are: L2/R2 filters (All, Has room, No password), the search chip, the signed-in and signed-out
  columns, the room drawer with the disc's map picture, the Briefing room and Game screens, the launch-target pick,
  the 0-3 ping band (never milliseconds).
- Custom matches (Forge lobbies), Server news (the announcement dialog), the Discord link (LATER 407's mark).
- Personas (create, edit, delete; home town, gender, taunts, messages, match name) -- the artifact's "Profiles"
  panel takes the memory card's semantics and loses its own (local launcher profiles with their own saves and binds).
- Loadouts per mission and side, read from and saved to the server, with the editor's rollers (LP.R2's side chooser).
- The Service record as the server has it (rank medal, clan, friends and ignored counts, ladder, mission loadouts).
- The memory card's settings rows and their locks (Display, Audio, Controller, Communication, Mobile, Account), in the
  artifact's row styles; the **Button mapping screen (CX-14) unchanged** ("I do want to keep our button mapping ui",
  the owner, 2026-10-26 ~04:00Z -- LR.R4).
- **The original's button glyphs and names**: Cross, Circle, Square, Triangle, L1/R1/L2/R2, START, SELECT ("and the
  original sony buttons", the owner, 2026-10-26 ~04:00Z -- LR.R5). The artifact's "Face ↓ / → / ← / ↑" names and
  its Stadia controller glyph are not used.
- The pad grammar: Triangle = account, L2/R2 = filter or page, Square = the secondary verb, OPTIONS = START anywhere,
  hold-to-bind, the "teach me your pad" pass, the connected / disconnected toasts; menu rumble (LP.R6).
- The original menu sounds read from the player's disc (CX.R19). The artifact's oscillator beeps are not used.
- The launch path: START signs out, rewinds history, notes the launch target, hands over. The artifact's boot stages
  (MOUNTING / APPLYING SETTINGS & BINDS / CONNECTING) may label the real adapter's steps; they invent none.
- From #509: the version badge (LP.R7), the right-aligned account control and dropdown (LP.R12), the status cues in
  the legend (LP.R11), the subtitle reveal (LP.R4), the return chevron (LP.R14).

**In the artifact, not adopted (sample data with no server or emulator behind it; LR.R7):**

| artifact panel or row | why not |
|---|---|
| Display & Performance (resolution, aspect, frame rate, filtering, anti-aliasing, v-sync) | dropped by CX.R5 already; the emulator has no such settings |
| Network (region, server, show ping, test connection) | CX.R5; central has one door list, not regions; ping is the server's band |
| Game Patches (hi-res textures, 60 fps physics, widescreen HUD, netcode v2) | game-behaviour changes the project does not make (the parity rule) |
| Forge rules in the launcher (map, mode, rounds, time, friendly fire, one-shot, radar off, low gravity, presets) | the Forge owns its instruments; the launcher links to it |
| Test Room rows (side, loadout, bots, latency, hitboxes, infinite ammo) | the test room owns its panel; the launcher links to it |
| Quick Match | central has no matchmaking |
| Friends; Server Activity feed; Clans' scrims and challenges | no server data; a read-only Clans roster is deferred (LR plan, "Deferred") |
| Memory card save import / export / delete | the card is virtual slots and personas, not save files |
| Voice extras (transmit mode, threshold, hear myself, proximity voice) | proximity voice changes the game; the others have no path in the original's headset handling -- kept out until the server supports one |
| Controls panel (press-to-bind list, Classic / Modern / Southpaw presets, look sensitivity, aim assist) | replaced by the Button mapping screen (LR.R4) and the card's Controller rows |
| Launcher language, open at login, clear cache, "Launcher 0.9.4" | no implementation; the version is LP.R7's badge; the update row is CX.R18's notice |
| Career statistics (wins, kills, accuracy, headshots, hours) | the server keeps the record's rows, not these |
| Profiles as local launcher profiles | becomes Personas (above) |
| "Face ↓" button names, Stadia glyph, oscillator sounds | LR.R5, CX.R19 |

**New in the artifact and kept as product-track work (LR.R8):**

- Appearance (Settings): the seven themes, the Crossroads backdrop option (CX.R4: project art, never a game
  screenshot), background motion, 24-hour clock, launcher sounds. Every colour is a `--s2u-*` token under part G's
  guards (CX.R4, CX.R7); the theme is saved in this browser.
- The animated sheet backdrop behind the whole launcher, driven by the theme; it respects reduced motion and the
  existing "Backdrop motion" row.
- Home centred on Play, with the "Before you deploy" check panel (disc, controller; microphone optional) fed by the
  existing disc, pad and mic adapters, and Deploy = START.
- Server information (Online): status, universe name and users, players and rooms, the server's build and the
  announcement -- the rows the server adapter already returns; "Game version" and "Uptime" only if the server reports
  them, otherwise the row is absent (never invented).
- The brand header with the clock and the account control; the "Signed out" resting screen with the quick sign-in
  prompt.
- The breadcrumb + title + description panel header on nested pages, with LP.R14's return chevron.

## 4. Icons and type

The design system's fonts stay (Saira, Oswald as "S2 Label", JetBrains Mono; `shared/fonts/`). The artifact's icon
glyphs are Material Symbols Sharp; the launcher's icon set is its own (`console/icons.ts`). Default, the owner's to
overturn: each artifact glyph maps to an existing icon where one exists; the missing ones are drawn into the same set
in the same stroke, never loaded from a CDN (the build hosts no third-party fetch). A self-hosted Material Symbols
subset is the fallback if drawing proves slower than the sprint allows; its licence (Apache 2.0) is then credited in
`shared/fonts/`.
