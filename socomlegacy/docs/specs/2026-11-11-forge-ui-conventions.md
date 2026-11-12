# The Forge's UI conventions -- the checklist for the FX sprint's builders and reviewers (FX-22)

> Written 2026-11-11T08:01Z on `agent/forge-v4` for [the FX plan](../plans/2026-11-11-forge-export-sprint.md), FX.R12: the sprint's UI is
> to Crispy's standard. Read from the Forge's code at `9002339114` by a read-only pass (nothing run); a convention is
> what is built, cited to the line that shows it. **An adaptation:** the editor is the port's own (OT.R112: its UI is its
> contributor's). Section 4's questions are put on his next pull request when he opens it (the owner, FX.R13); until then
> section 3's placements are the default, and his answers amend this sheet.

Read at `C:/Projects/wt-fx-w1`, branch `agent/fx-w1`. On this branch the Forge's code matches `main`. Read only: no test,
build or browser was run. Every claim below comes from reading the source, and each one cites the code that shows it.

Path short forms used throughout:
- `F/` = `socomlegacy/packages/viewer/src/forge/`
- `T/` = `socomlegacy/packages/viewer/test/forge/`
- `E/` = `socomlegacy/packages/viewer/e2e/`
- `P:` = `F/page.ts` (one file of 9,877 lines)

**Who wrote what.** This matters, because "his standards" are partly ours.
- Crispy's three imported commits are `36ddf42827` (Forge Overhaul), `06d558635b` (flares, toolbar, View dropdown)
  and `daed4f539f` (presets, light rig). They wrote about 4,050 lines of `page.ts`, 841 of `forge.css`, all of
  `scrub.ts`, `panels/lightRigEditor.ts` and `panels/environmentPanel.ts`, most of `panels/inspectorPanel.ts`, and
  159 lines of `shell/panel.ts` (the movable dock zones, `moveTab` and `resetLayout`).
- The shell underneath is the project's own FUI work, and Crispy kept and built on it: the panel registry, card
  stack, notifier, pad focus, menu, operations registry and early-press hold.
- So are the lobby window (`F/lobby/lobbyView.ts`, `lobby.css`, all 648 and 188 lines by Craig) and the Saves card.
- OT.R112 (`socomlegacy/docs/MISSION.md:752`) gives him "the Forge editor's keys, docks, tabs, gizmos, views and looks".
- Its 2026-11-09 amendment (MISSION.md:762-765) moves the agent MCP section (`viewer/src/agent/**`) to the AX lane.

**Work of his not yet in this repository.** Commit `e55e7267bc` on `Scotho/socom-legacy`, branch `forge/custom-maps`,
dated 2026-11-08 ("Custom Maps/Mode. Better selection workflow. Moving/Deleting map objects."), is not imported. It
changes `page.ts` by 604 lines and renames the right dock's **World** tab to **Map** and "Settings" to **"Map
Settings"**. Its refusals then say "(Map tab, Map Settings)". Seen with read-only `gh api`. Any new UI that names a tab
or a panel in its words will drift when that commit lands.

---

## 1. The builder's checklist (tick each before sending UI for review)

1. The control is built from the existing pieces: `fx-tool` buttons (`fx-primary` for the one next step, `fx-danger`
   for a destructive act), `fx-chip`, `label.fx-toggle`, `fx-select`, `fx-search` and `fx-num fx-stepper`. It is
   built with `forgeEl()` (or `el()` inside `page.ts`), with no new widget kit.
2. A new dock panel is registered with `shell.register(builtPanel({...}, body))`, never appended by hand. It has an
   `id`, a `title`, a `dock`, an `order` and a `tab` that sits in the existing order, and a `padLegend`.
3. Its body is `forgeEl(doc, 'div', 'fx-<name> fx-section')`, with `h3` sub-headings, so it takes the dock's one
   section style.
4. Every number field is `input[type=number]` with `min`, `max` and `step`. It scrubs (drag to change, click to type,
   Escape puts it back). Its title ends "· drag to change, click to type".
5. Every layout change goes through the operations registry (`personEdit`, `settingsEdit` or `entityEdit`) and leaves
   exactly **one** undo step named by `FORGE_EDIT_OPERATIONS`. A new kind of edit adds its row there and to the agent's
   table, and `T/operations.test.ts:107` stays green.
6. A drag or scrub previews live with no edit and commits once at release. Escape mid-drag restores the value with no
   edit.
7. Every button has `type="button"`. Every icon-only control has an `aria-label`. Every control has a `title` saying
   what it does; where a key or pad button exists, the title ends with " · <key>" (the `key()` helper) and "pad ○"-style
   glyph words.
8. A card is opened on the card stack (`cards.open` or `ctx.ui.open`), never with `window.confirm`, `prompt` or
   `alert`. Esc and Circle run its `onBack`, which is never its act. A destructive card passes `danger: true` and marks
   its Cancel `data-card-safe`.
9. Every card button and row the pad must reach carries `data-pad-item`. A row's Open, Rename and Delete carry
   `data-pad="act|secondary|remove"`.
10. A new panel gets a pad path for free (START › Panels). If it holds real actions, it adds a `menuSection()` row or
    rows (`MenuItem` with `note`, `left`/`right`, `keepOpen`) so a pad can reach them without the mouse.
11. A refusal goes through `notifier.refused(...)` or `ctx.ui.refused(...)`, worded as "reason: remedy". A passing
    event goes through `pop` or `ctx.ui.toast` in the past tense ("Saved X"). A lasting status goes through `say`.
    Nothing uses `console` for the user.
12. Words are sentence case. Fields separate with " · ". Units go in the label ("Rotation °", "Round time (s)"). Text
    names things the player sees (map names, not internals) and has no filler or "AI-sounding" phrasing.
13. A new toolbar button is avoided. If one is unavoidable, the row still fits at 1280, 1440 and 1920 with nothing
    scrolled (`E/forgeToolbar.spec.ts`). A right-hand tool whose label repeats its icon is `iconOnly`.
14. A control on the toolbar that acts on the scene is added to `untilWired` (inert until the page is wired). Any
    other toolbar button is caught by the early-press hold.
15. Hidden means the `hidden` attribute. A new class with `display:flex` or `inline-flex` also gets a
    `[hidden] { display: none }` rule.
16. Disabled means the native `disabled` attribute (the one faded look). The reason is said in the `title` or the
    row's `note`.
17. The CSS uses only `--fx-*` tokens: no colour literal, radius, z-index or shadow outside the alias block, and no
    text below 12 px (13 px for dim text). `T/forge/tokens.test.ts` passes, and its exception list is not extended.
18. On a coarse pointer, every new tap target is at least 44 px. At 760 px or narrower, the dock drawers are 240 px
    wide, and the control fits and stays usable there.
19. If the act changes the layout or the saves, the agent has the same act: an existing operation, or a new one in
    `forge-agent-protocol` `FORGE_OPERATIONS`.
20. Each building function has a jsdom unit test (as `T/inspectorPanel.test.ts` or `T/savesPanel.test.ts`). Behaviour
    on the mounted page has a jsdom page test (as `T/pagePanels.test.ts`). Anything layout-sensitive or
    pointer-sensitive has an e2e spec using the `E/forgeBase.ts` helpers.
21. A stable test hook is a `data-*` attribute (`data-forge="..."`, `data-save-id`, `data-forge-menu-row`), never a
    CSS class or the text alone.

---

## 2. The conventions, with where they are built

### 2.1 The shell's layout: regions and what goes where

**The page's regions** are all appended in one call (P:1928):
- toolbar `header.fx-top`
- the placing-tools row `nav.fx-tools-row`
- the left dock `aside.fx-dock.fx-left`
- the right dock `aside.fx-dock.fx-right`
- the top, bottom and centre dock zones
- the dock drop guides
- the status bar `footer.fx-status`
- the check sheet
- the dialog host `.fx-modal`
- the Controls card `.fx-modal`
- the workspace `section.fx-workspace`
- the two tool popups

**The toolbar, left to right** (P:840-851):
- home and brand
- the menu button
- the base group: New, Open, Saves and the read-only layout name (P:838; Saves sits beside Open by the owner's word)
- Select and Place
- Duplicate and Delete
- Undo and Redo
- a spacer
- Controls, Docks and Reset layout
- Walk, Check, Create lobby and Save map
- Play

The base list left the toolbar: New asks for the base on a card (P:836-837; `chooseNewBase`
P:8172).

**The placing-tools row** sits under the toolbar (P:1906-1927). Its labelled sections are `.fx-mode-section`, each a
caption plus groups: Spawn, Objects, Demolition, Escort · Extraction, Info and Other. A section whose game type is not
played is greyed whole (`is-off`, P:3178; CSS `forge.css:1680-1681`).

**The left dock** is the Assets panel:
- `asset-browser`, tab `Assets`, order 0 (P:1072-1078)
- its archive select, a search box, a chip row (All, Favourites, Characters, the view-options gear), the list, and a
  foot holding the list/grid switch and the size slider (P:853-951)
- the left dock always draws tabs when an `Assets` tab is present (`F/shell/panel.ts:397`)

**The right dock** groups panels by tab:
- **Object**: Outliner (order 10, `F/panels/outlinerPanel.ts:74`), Inspector (20, `F/panels/inspectorPanel.ts:205`),
  Rules (25, `F/panels/rulesPanel.ts:179`).
- **World**: Light rig (35, `F/panels/environmentPanel.ts:65`), Settings (40, `F/panels/settingsPanel.ts:265`),
  Starters (P:9338).
- **Content**: Local files (70, `F/../creator/assetsForgePanel.ts:325`).

Past five panels a dock draws a tab strip, one tab open at a time (`F/shell/panel.ts:119-122`), and a tab shows only
its own panels (`panel.ts:252-261`). Tabs can be dragged between the left, right, top, bottom and centre zones unless
`movable: false` (Crispy's, `panel.ts:63-64`, `629-649`). "Reset layout" restores the defaults (`panel.ts:650-677`).

**The centre is the viewport**, registered as panel `viewport` with `movable: false` (P:1729-1735). Its overlays
(P:1696):
- the canvas
- the crosshair
- the marquee
- `fx-viewport-left-controls`: the **Draw** dropdown, **Billboards** dropdown and **View** (camera) dropdown (P:1164,
  P:1682)
- `fx-camera-hud`: the gizmo's Move, Rotate and Scale group, then the snap and camera settings (P:1683-1689)
- the axis widget
- the pad legend strip (`ul.s2u-prompts.fx-legend`)
- the toast

The viewport dropdowns are `details` elements that close on an outside press (P:1662-1680).

**The tool popups.** Select and Play each carry a gear inside the button. The gear, a right-click or the menu key opens
a body-level popup:
- `div.fx-tool-popup[role=dialog]` with `.fx-tool-popup-title`
- `label.fx-toggle` rows or `.fx-tool-popup-row` (a word and a select)
- a `.fx-tool-popup-note` line

Both are built at P:724-817. This is the pattern for a tool's own settings.

**The status bar** (P:1702-1712) holds:
- the status line `.fx-status-msg`
- the Messages log button
- the status-chip strip (`registerStatusChip`, `F/shell/context.ts:41`)
- named cells: mode, counts, camera, speed, fps

**Cards** have one host, `.fx-modal`, holding one stack (P:1736-1742; `F/shell/cards.ts`). The Saves card, New's
chooser, every confirm, text and choice question, and the lobby's create card all open there. The START menu draws in
its own `.fx-modal.fx-padmenu` (P:8562-8564).

**The workspace** is a full-viewport surface with a breadcrumb and Back (`panel.ts:154-181`). Its contract exists, but
it holds no panel today.

**The lobby window** is a separate floating window (`F/lobby/window.ts`, `F/lobby/lobbyView.ts`) in the original
lobby's ALL-CAPS look: READY, SWITCH SIDES, ARMORY, LAUNCH, LISTED/UNLISTED, PASSWORD/LOCKED, KICK, CLOSE LOBBY and
LEAVE (`lobbyView.ts:80`, `213-215`). Its own small cards (`.fx-lobby-card`) are separate from the page's card stack
(`lobbyView.ts:230-294`). It is Craig's code, not Crispy's.

**How a new panel is registered.**
- Signature: `builtPanel(def, body, instance?)` (`panel.ts:686-688`), which returns a `ForgePanel` for
  `shell.register(...)`.
- `def` takes `id`, `title`, `dock`, `order`, `defaultOpen`, `padLegend`, and optionally `tab`, `availableIn`,
  `movable` and `menuSection` (`panel.ts:42-72`).
- A panel that needs the page's context or a frame tick writes `mount(host, ctx)` itself and returns
  `{update, pad, frame, visibility, dispose}` (`panel.ts:26-40`). The Local files panel is the example
  (`assetsForgePanel.ts:323-340`).
- A feature's own START section is added with `registerMenuSection(shell, spec)` (P:96-100). Its id must not be one of
  the built-in ids `play`, `build`, `view`, `settings`, `panels` or `forge` (`F/padMenu.ts:127`).

### 2.2 The building blocks and their classes

| Block | Built as | Where |
|---|---|---|
| Toolbar or tools-row button | `tool(icon, label, title, cls)` makes `button.fx-tool`: an svg plus a span | P:650-656 |
| Icon-only tool | `iconOnly(b, label)` adds `.fx-tool--icon`, moves the label to `aria-label` and hides the span | P:663-667; css `forge.css:152` |
| Button group with a divider | `group(...)` makes `div.fx-group` | P:657 |
| Card buttons | `fx-tool` (Cancel), `fx-tool fx-primary` (the act), `fx-tool fx-danger` (a destructive act) | P:1960-1975; css `forge.css:1441-1443`, `1508-1509` |
| Chip (filter, small action, Lock) | `button.fx-chip`, `.is-on` when chosen; pill radius | `forge.css:479-483`; P:867-895; Lock `F/panels/inspectorPanel.ts:92-95`, P:4558 |
| Toggle (switch look) | `label.fx-toggle > input[type=checkbox] + span` | `forge.css:776-792`; P:740-749; `F/panels/viewPanel.ts:19-30`; `F/lobbyPage.ts:193-205` |
| Select | `select.fx-select` | `forge.css:130-140` |
| Text or search | `input.fx-search` (placeholders end "…") | P:874-877, `F/panels/outlinerPanel.ts:51-54` |
| Number field | `input.fx-num.fx-stepper` (mono font) | `F/panels/inspectorPanel.ts:52-62`; `F/panels/settingsPanel.ts:105-112`; `forge.css:680`, `729` |
| Labelled transform row | `div.fx-field-row` > `.fx-field-caption` + three `label.fx-field.fx-field--x/y/z` (a coloured axis chip and the input) + `button.fx-field-reset` (hidden until off default) | `F/panels/inspectorPanel.ts:68-99`; css `forge.css:682-728` |
| Settings row | `label.fx-setting` > `.fx-setting-head` (word, value) + the control; `p.fx-dim.fx-setting-note` for a line under it | `F/panels/settingsPanel.ts:85-92`; `forge.css:819` |
| Inspector "Data" fields (any per-kind field) | `InspectorEditor {label, kind: text\|number\|select\|check, value, options?, covers?, title?, disabled?, set, preview?}` drawn by `showInspectorData` | `F/panels/inspectorPanel.ts:130-212` |
| Panel section | `div.fx-section` with `h3` (an upper-case caption) | `forge.css:663`; every panel |
| Dim words | `.fx-dim` | `forge.css:28` |
| Empty list line | `li.fx-empty` | `forge.css:636`; `F/savesPanel.ts:51-56` |
| Tree list (Outliner) | `li.fx-tree-branch` > `button.fx-tree-toggle` (▾ or ▸, "Label (n)") + `ul.fx-outliner-children` | P:4731-4747 |
| Outliner row | `li[data-user-prop]`: the billboard badge, the name, a dim `#n`/`locked`/`missing`, then the `fx-chip fx-lock` button; `.is-on` when selected | P:4544-4590 |
| Billboard badge | `markBadge(kind)`: a coloured letter, round for map data and square for the user's | P:389-393 |
| Card | `div.fx-card` (a `form.fx-card` when it takes text) > `h2`, `p`, controls, `footer` (right-aligned buttons) | P:1960-2068; `forge.css:1411-1424` |
| Toast | `.fx-toast`, bottom centre over the legend; `data-kind="refusal"` is red; `.has-action` holds an Undo | `forge.css:1214-1240`; `F/shell/notify.ts:31-41` |
| Menu row | `MenuItem {id, label, value?, note?, disabled?, heading?, act?, keepOpen?, left?, right?, page?, grid?, secondary?, remove?}` | `F/padMenu.ts:24-55` |
| Loading veil | `.fx-loading` with a title, a bar (`role=progressbar`) and a mono line | P:1714-1728 |

**Inconsistencies, and the more common form:**
- **Two button kits.** `forge.css:45-66` defines a `.fx-btn` / `.fx-btn--primary|tertiary|danger` kit "adopted by the
  panels through `./ui/kit`". No `.ts` file uses it, and there is no `ui/kit`. Everything uses `fx-tool` plus
  `fx-primary` or `fx-danger`: 10 uses in `page.ts`, 1 in `savesPanel.ts`. **Use `fx-tool`.**
- **Three element helpers.** `el()` is in `page.ts:396`, a private copy is in `F/menuView.ts:23`, and the exported
  `forgeEl()` is in `F/shell/panel.ts:691`. **Use `forgeEl` outside `page.ts`.**
- **Button words.** The page's buttons are sentence case ("Save as", "Share link", "Create lobby", "Reset layout").
  The lobby window is ALL CAPS on purpose, to match the original's lobby.
- **Map labels.** The base list writes "Label · STEM" (P:9834). The Inspector's Map choice writes "STEM · Label"
  (P:4192).
- **Ellipses.** Placeholders and progress use "…" (P:876, "making the lobby…"). The Inspector's reading state uses
  "..." ("(reading the map...)", P:4216).
- **Crispy's own CSS** has four declarations the token rules would refuse, each pinned by name as his:
  `border-radius: 4px`, `font-size: 10px`, `opacity: .8` and `outline: none` (`T/tokens.test.ts:47-52`;
  `forge.css:1660`, `1685`). **Don't add to that list.** It holds his exceptions only.

### 2.3 The helpers a new control should use (signatures)

**Elements and panels:**
- `forgeEl<K>(doc, tag: K, cls = '', text = ''): HTMLElementTagNameMap[K]` (`F/shell/panel.ts:691`)
- `builtPanel(def: Omit<ForgePanel,'mount'>, body: HTMLElement, instance?: Omit<ForgePanelInstance,'dispose'>): ForgePanel`
  (`panel.ts:686`)
- `revealRow(reveal, id, label, value, note): MenuItem` gives a panel its own START row (`panel.ts:699`)

**Numbers:**
- `scrubNumber(input, {rate, digits?}): () => void` for a field with its own rate (`F/scrub.ts:53`)
- every other `input[type=number]` under the body scrubs already, through `scrubAllNumbers(doc.body)` (P:647,
  `scrub.ts:70`)
- the scrub dispatches `fx-scrub` (a `CustomEvent<{value, cancelled?}>`) plus `input` while dragging, and one `change`
  at release (`scrub.ts:7-10`, `91-96`, `119-123`)
- the drag threshold is 3 px; Shift drags ten times finer and Ctrl ten times coarser (`scrub.ts:17-20`, `116`)

**Inspector fields:**
- `showInspectorData(dom, rows, editors: InspectorEditor[])` (`F/panels/inspectorPanel.ts:151`)
- add a field by returning an `InspectorEditor` from the page's `inspectorEditors()` (P:4222)
- the map-copy fields are written once in `copyEditors(kind, ref, own, off, set)` (P:4197)

**Cards (inside `page.ts`):**
- `askConfirm(heading, body, yes = 'Continue', danger = false): Promise<boolean>` (P:1960)
- `askText(heading, body, value, max, yes, extra?, secret?)`, where `extra` takes extra controls such as the lobby's
  toggles (P:1979)
- `askChoice(heading, body, groups, value, yes)`, which takes option groups (P:2008)
- `askSaveFirst(heading, body)` (P:2039)
- `tellCard(heading, body)` (P:2057)
- `padItems(...els)` (P:1954)

Outside `page.ts`, a panel uses `ctx.ui.open(card, {onBack, initialFocus, label, danger?})` (`F/shell/cards.ts:20-33`).

**Words (inside `page.ts`):**
- `say(line, bad?)` for the lasting status line (P:2081)
- `pop(line)` for a toast (P:2082)
- `notifier.refused(msg)` and `notifier.accepted(msg?)`

For a panel, the same come as `ctx.ui.notify/toast/refused/accepted/pulse` (`F/shell/context.ts:17-50`). A toast with
Undo is `notify(msg, {kind:'toast', undo})` (`F/shell/notify.ts:38`). A plain toast lasts 1.8 s; one with an action
lasts 6 s (`notify.ts:98-100`).

**Edits:**
- `personEdit(opId, args, perform, admitted?)` (P:3547)
- `settingsEdit(perform)` (P:3550)
- `entityEdit(opId, args)`, which routes through the agent's own facade and says any refusal (P:4440)
- the guards are `refuseEdit()` (a lobby holds the layout) and `refuseUnderCard()` (a card is open) (P:3230-3242)

**Surface state:** `forgeSurfaceState(...)` gives `{surface, canEdit, canPlace, reason}`, and `FORGE_REFUSALS` holds the
words (`F/shell/state.ts:49-71`).

### 2.4 Words: case, tone, units, refusals

**Ten real examples:**
1. Card title as a question, with a specific yes: "Delete this save?" with "Delete", danger (P:8361).
2. Card title as an order, with a specific yes: "Save this layout" with "Save"; body "A save with this name is
   replaced. It stays in this browser." (P:8368).
3. "Save this layout first?" offers "Cancel", "Don’t save" and "Save first" (P:2039-2044, P:8200).
4. A toast in the past tense: "Saved ${name}", "Opened ${f.name}", "Share link copied", "Lobby link copied" (P:8374,
   P:8436, P:8412, P:8050).
5. Crispy's own toast: "Light rig copied from ${stem}" (P:1136).
6. A refusal as "reason: remedy": "Hostages play in Escort or Extraction: set the game type first (World tab,
   Settings)" (P:6537).
7. A refusal from the surface rules: "Stop Play to edit", "Close the dialog to edit", "Open a base first", "The lobby
   holds this layout: leave it to edit" (`F/shell/state.ts:46-62`).
8. A short refusal: "Close the open card first" (P:3232) and "Locked: Square unlocks it" (P:8473).
9. Not built yet, said plainly: "Scale is not wired yet: a saved layout keeps no scale" (P:2542).
10. A tooltip: "Place a turret: a copy of a disc map's own (the palette's, or Crossroads'), facing the way you look"
    (P:706). A field's title: "${aria} · drag to change, click to type" (`F/panels/inspectorPanel.ts:59`).

**Case.**
- Card titles, buttons, toasts and full-sentence status or refusal lines start with a capital.
- Ongoing-state status lines start lower case: "placing a ${kind}: click the world, or Cross at the centre · Esc
  cancels" (P:6297), "copied 3" and "pasted 3".
- A count from `git blame` over `page.ts`: toasts 17 upper and 0 lower; refusals 10 upper and 4 lower; status lines 27
  upper and 45 lower. Crispy's own lines are 13 upper and 4 lower, and his four lower-case lines continue the
  "placing …" form. **For a new line, a full sentence is capitalised; a running "doing X" line may stay lower case.**

**Separators and marks.**
- Fields are joined with " · " everywhere: titles, values, labels.
- An em dash appears rarely (P:4048).
- Apostrophes are mostly typographic (’) in user strings (P:1124, P:162 "Untitled layout", "Don’t save"). Some are
  straight quotes in older strings.

**Units.**
- Degrees go in the label: "Rotation °" (`inspectorPanel.ts:90`), "Yaw °" (P:4294).
- Seconds go in the dock label: "Round time (s)" (`settingsPanel.ts:36`). The value displays as M:SS
  (`settingsPanel.ts:49`).
- World units are "u" ("${fogFar} u · map’s", `settingsPanel.ts:48`).
- Pixels are shown for the tile size (P:929).
- Rounding: scale uses 3 decimals (`inspectorPanel.ts:65`), position whole numbers (P:4075-4077), angles via `deg()`.

**Tone.** Short and literal. A sentence says what happens and to what, never "Oops" and never "please". A refusal
always names the way out.

**Glyph words.** The pad glyphs in text are ✕ ○ □ △. Menu notes use "← → …" and "✕ chooses …". Tooltips use "pad ○" and
"L1 / R1 another tab" (`panel.ts:345`).

Crispy's stated aim is to remove "AI-sounding text" in a polish pass (devchat:756). He gave no list. The safe reading is
to keep a new string to the short, literal form above.

### 2.5 Behaviour

**Undo and history.**
- Every layout edit is one registered operation and one history step that names its actor and words
  (`F/shell/operations.ts:4-14`, `226-276`).
- The page's handlers call `personEdit`. The Inspector's Data editors call `entityEdit('placement.set', …)`, the same
  entry the agent uses (P:4228).
- A drag already applied is recorded with `admitted = true` (P:4392-4396).
- Settings edits are `settings.set` (P:3550).

**Live preview.**
- A scrub moves the object live and commits on `change` (P:4344-4359).
- An Inspector number field's `preview(value|null)` is called with each scrub value and with null just before the
  commit (`inspectorPanel.ts:140-145`, `180-189`).
- The Light rig previews on `input` and commits on `change` (`F/panels/lightRigEditor.ts:8-12`).

**Escape.**
- In the editor, Escape cancels a queued placement, then deselects (`F/keys.ts:153`).
- With a card open, it is the top card's `onBack` (`keys.ts:140`, `cards.ts:181-187`).
- In the menu, it goes back one level (`keys.ts:123-125`).
- Mid-scrub, it restores the value (`scrub.ts:133-138`).
- In the workspace, it closes it (`panel.ts:287`).
- With a panel holding the focus lease, it releases the lease (`keys.ts:63-67`).

**Enter.**
- In a card that takes text, it submits the `form` (P:2000).
- In an Inspector text or number field, it blurs the field, which commits through `change` (`inspectorPanel.ts:190`).
- Selects and checkboxes commit on change at once (`inspectorPanel.ts:178-181`).
- A redraw never steals the field being typed in (`inspectorPanel.ts:155-158`).

**Focus.**
- A card traps Tab and gives focus back where it was on close (`cards.ts:141-155`, `192-205`).
- A danger card starts on its safe choice (`cards.ts:228`).
- One focus ring serves keyboard and pad (`forge.css:34`; `T/tokens.test.ts:105`).

**Selection.**
- Click selects. In the Outliner, Shift selects a range and Ctrl or Cmd toggles one (P:4565-4588). A locked row is not
  selected from its row (P:4567). Double-click frames (P:4590).
- Read-only map data is selectable but its fields are off (`is-off`, P:4046-4062).
- Select-tool settings decide whether clicks pick map props or user props (P:749-755).

**Multi-select editing.**
- The Inspector shows "N selected".
- Position fields show the group's centre, and typing one moves every member by the difference.
- Yaw is blank, the Data editors are empty, and the resets are hidden (P:4033-4044, P:4375-4389; resets `showResets` P:4090-4100).
- Pitch, Roll and Scale are enabled only for a single piece (P:3988-3990).

### 2.6 Controller (pad) reach

**The START menu.** It is the pad's whole path (`F/padMenu.ts:1-12`). Sections are Play, Build, View, then each panel's
own section, then the registered menu sections, then Panels, then Forge (P:8579-8633). L1 and R1 page between
sections. A row's `page` opens a sub-screen. Square is `secondary` and Triangle is `remove`.

**Panels.** Every registered panel automatically gets a row under **Panels** to show or fold it (`panel.ts:486-496`,
`537-548`). A panel's own `menuSection()` rows (`panel.ts:69`) carry its actions. Examples are the Inspector's and
Outliner's `revealRow` (`F/panels/inspectorPanel.ts:203-207`, `outlinerPanel.ts:70-73`) and Settings' full row list
(`settingsPanel.ts`, `MAP_SETTING_ROWS`). A desktop-first panel may stop at its Panels row (`panel.ts:10-12`, citing
OT.R87 / FUI.R18).

**Focus inside a dock.** L1 and R1 step the tabs, Circle gives focus back to the editor, and other inputs go to the
panel's `pad()` (`panel.ts:605-621`). A panel that wants the d-pad takes the focus lease (`ctx.ui.focus.take(id)`,
`F/shell/context.ts:52-66`).

**Cards.** `PadFocus` walks `[data-pad-item]` in DOM order. Cross presses the item or its `[data-pad="act"]` child;
Square and Triangle press `secondary` and `remove` (`F/shell/padFocus.ts:5-21`). The Saves card is the reference
(`F/savesPanel.ts:4-11`, `75-76`).

**The lobby window** has its own focus list in `LOBBY_CONTROLS` order (`lobbyView.ts:80`, `480-520`). A new lobby
control must be added to that list and to its `labels` and `act` maps.

**Haptics.** Only accepted acts pulse (`notify.ts:21-28`).

**What a new control must do to be reachable:**
- on a card, mark it `data-pad-item`;
- in a panel, provide a START row (`menuSection`) or a `pad()` with the lease;
- in the lobby window, join `LOBBY_CONTROLS`.

### 2.7 Phone and touch

**The early tap.** Toolbar presses made before the page is wired are held and replayed in order
(`F/shell/earlyPress.ts:1-46`, P:1939). Scene controls are made `inert` until then (P:1940-1941). Pinned by
`T/pageEarlyTap.test.ts:80-116`.

**Tap targets.** On a coarse pointer, legend buttons and menu rows are at least 44 px (`forge.css:1208-1210`,
`1626-1631`).

**Narrow screens.** At 760 px or narrower, the docks become 240 px drawers over the viewport, captions are hidden and
the docks start below the touch Menu (`forge.css:1364-1380`; `E/forgePhoneDock.spec.ts`). A narrow window opens with
the docks hidden (P:8443).

**The toolbar** scrolls sideways rather than wrapping (`forge.css:69-91`; `T/toolbarScroll.test.ts`). At 1280, 1440
and 1920 nothing scrolls (`E/forgeToolbar.spec.ts:100-145`).

**Asset tiles.** A long press shows the tooltip (`E/forgePanels.spec.ts:95`).

**The lobby window** must lie inside a phone screen (`E/forgeLobbyPhone.spec.ts:58`).

### 2.8 The agent (MCP) side

**Every layout edit already has an agent operation.**
- The page registers each row of `FORGE_EDIT_OPERATIONS` with the agent's facade as its `run` (P:3541-3544).
- `T/operations.test.ts:107` is a diff test between the page's table and the agent's table.
- The operation list is `socomlegacy/packages/forge-agent-protocol/src/forgeOperations.ts:52` onward. It includes
  `placement.set`, `selection.copy/paste`, `saves.save/load/rename/delete`, `layout.export` and `view.set`.

**A UI act that changes the layout or the saves needs its agent twin.**
- The agent's `placement.set` refuses a piece's pitch today: "is not supported yet: a saved layout keeps a piece's yaw
  only" (`F/agent/commands.ts:189`). `F/transformStubs.ts:9-11` names lifting that refusal as part of switching the
  stubs on.
- View-only acts (dock layout, a tooltip) need no agent command.
- The agent's own panel (`viewer/src/agent/**`) is the AX lane's, not Crispy's (MISSION.md:762-765).

### 2.9 The tests that pin UI

| What | Kind | Where |
|---|---|---|
| Builders in isolation (rows, classes, aria, scrub, reset hidden) | jsdom unit | `T/inspectorPanel.test.ts` (Crispy's), `T/savesPanel.test.ts`, `T/lobbyView.test.ts`, `T/menuView.test.ts`, `T/cards.test.ts`, `T/padFocus.test.ts`, `T/scrub.test.ts` |
| The mounted page (GPU and disc mocked) | jsdom page | `T/pagePanels.test.ts` (mount helper at :1-50; the FC-1 stub case at :264), `T/transformStubsSwitch.test.ts` (flips the switch), `T/pageEarlyTap.test.ts`, `T/pageSaves.test.ts` |
| CSS rules: tokens, ≥12 px text, one focus ring, one disabled look | source | `T/tokens.test.ts:68-205`; `T/toolbarScroll.test.ts` |
| One undo step per operation; agent and person run the same entry | unit | `T/operations.test.ts:75-218` |
| Rendered layout and pointer behaviour | Playwright | `E/forgeToolbar.spec.ts`, `E/forgePanels.spec.ts`, `E/forgeSaves.spec.ts` (pad walk of the Saves card :382), `E/forgePhoneDock.spec.ts`, `E/forgeLobbyPhone.spec.ts` |
| Spec helpers | e2e | `E/forgeBase.ts`: `expectBase`, `newLayoutOn`, `placingTool`, `OUTLINER_ROW`, `OUTLINER_USER_ROW` (OT.R112-aware) |

A new control is pinned by:
- a builder unit test (classes, aria, hidden or disabled states);
- a page test showing it edits through one undo step, or refuses in words;
- an e2e only where layout or touch is the point.

### 2.10 Crispy's stated preferences (devchat, read only that file)

- **The goal:** "Is it easy, intuitive, fluid, and fun to use?" (devchat:425).
- **Make things findable on the map:** billboards for every map object type, and an Outliner that lists every item
  type (devchat:214). The billboard badge is reused on tools, rows and the viewport (P:385-393, P:718-722).
- **He leaves record and server work to the project:** "I tried to add the rotate/scale stuff … better if you add it.
  Not sure if it is needed server side … I added the ui for it, but it does nothing right now" (devchat:217).
- **Mode changes should be more intuitive**, promised for a later merge (devchat:323).
- **A context action line** that tells you what an action does (devchat:479). This is not in this repository.
- **A polish pass to remove AI-sounding text** (devchat:756).
- **He asked whether objects can nest** (devchat:757). Scotho answered "all flat by zipper convention" and offered
  prefabs or saved groups, deferring to Crispy's intuition (devchat:759, 763).

---

## 3. The five additions: where each belongs, what to copy, and the smallest change

### 3.1 Pitch, Roll and Scale; the Scale tool; the tilt rings

- **Where.** Already built and hidden.
  - The Inspector's Rotation row (Pitch and Roll beside Yaw) and its Scale row with reset
    (`F/panels/inspectorPanel.ts:64-104`).
  - The Scale tool in the viewport's gizmo group (P:758-759, P:1686).
  - The R key (`F/keys.ts:128`, P:6816).
  - The tilt rings (P:4896-4900, P:2529-2550).
  - The help card's "W / E / R / G" row (P:1772).
- **What to copy.** Yaw's handlers exactly:
  - a scrub preview (P:4344-4359)
  - a `change` commit through `personEdit('piece.rotate', …, admitted)` (P:4392-4396)
  - the reset's `personEdit` (P:4311-4334)
- **The smallest change.**
  1. Set `FORGE_TRANSFORM_STUBS_HIDDEN_ADAPTATION` to false (`F/transformStubs.ts:13`). This needs a record that keeps
     tilt and scale first, as `transformStubs.ts:9-11` names. That is the A2 scope's work.
  2. Replace `transformStub` (P:4003-4007) and the `resetScale` stub (P:4336) with personEdits.
  3. Make `tiltRingStub` (P:2534-2550) let X and Z through.
  4. Add a scale operation, or a `placement.set` field, to `FORGE_EDIT_OPERATIONS` and to the agent's table, and lift
     `F/agent/commands.ts:189`.
  5. Change the Scale tool's title, which still reads "(not wired yet)" (P:758).
  6. Flip the pinned tests: `T/transformStubsHidden.test.ts`, `T/transformStubsSwitch.test.ts:118-131`, and the FC-1
     case at `T/pagePanels.test.ts:264`. `T/inspectorPanel.test.ts` already pins the rows.
- **Keep.** Pitch, Roll and Scale stay enabled for a single **piece** only (P:3988-3990). Markers keep a yaw alone.

### 3.2 Saved groups and a prefab library

- **Where.** Not the Outliner. It "lists what the layout places", with `Map Data` and `User Data` roots
  (`F/panels/outlinerPanel.ts:72`, P:4450-4453, P:4808). The engine is flat (devchat:759). A library is placeable content, so
  it sits with the left dock's **Assets**. Two shapes fit his layout:
  - (a) a chip in the asset browser's chip row, as **Characters** is: a non-prop list placed by its own tool
    (P:885-888, P:5199);
  - (b) a second left-dock panel with its own tab, say "Groups". The left dock already draws tabs
    (`panel.ts:397`), and a registered panel gets its pad row for free.

  Option (b) is the smaller change and keeps the asset tiles' thumbnail and drag code untouched. Which one Crispy wants
  is question 1 in section 4.
- **Saving a group.** The act belongs to the selection:
  - a `fx-chip` in the Inspector next to **Lock** when a group is shown ("N selected", P:4036);
  - a START › Build row beside "Lock selection" (P:8607-8608);
  - its card is `askText('Save this group', …, 'Save')`, copying Saves' Save as (P:8365-8368).
- **What to copy.**
  - Capture uses `copySelection`'s `ClipItem` (P:6852-6893): offsets about the group's centre, turns, pack content.
  - Placement uses `pasteClipboard` (P:6895-6930) as one `selection.paste` step.
  - Storage uses the saves store's update pattern (`forgeSaves.update`, P:8265-8270), as kept-aside copies do.
- **The smallest change.**
  - Persist the clipboard as a named list in the saves store.
  - Add a left-dock panel listing names with Place, Rename and Delete chips. Copy the Saves rows' pad roles
    (`F/savesPanel.ts:67-76`).
  - "Place" queues a paste at the cursor, through the existing operation.
  - The agent already has `selection.copy` and `selection.paste`. A saved library needs an agent list or read
    operation if agents are to use it.

### 3.3 "Export package" and opening a pack zip

- **Where.** The Saves card's footer, beside **Download** (`F/savesPanel.ts:147-162`). Saves' tooltip already reads
  "Named layouts in this browser, a file, or a share link" (P:682). The footer has one primary (Save as), and an export
  is a secondary act, so it is plain `fx-tool`.
- **What to copy.** `footButton('Download', false, …)` with a new `onExportPackage` in `SavesPanelHandlers`
  (`savesPanel.ts:13-32`). For the file, copy `downloadLayout` (P:8281-8294): a blob link and a "Saved ${name}" toast.
  Refusals go through `notifier.refused` as `shareCurrent`'s do (P:8397-8398).
- **Watch the width.** The footer is `display:flex` with no wrap (`forge.css:1424`), and the card is
  `min(520px, 100vw − 32px)` (`forge.css:1517`). Five buttons at phone width need a check, or a wrap rule.
- **Opening.** The toolbar's **Open** is "Open a layout file". Its hidden input takes `.json` only (P:681, P:689-692),
  and its change handler reads text (P:8430-8438). The smallest change is to widen `accept` to `.zip` and branch on the
  file type there, so one Open opens either.
  - The other entry point is the Content tab's Local files panel (`assetsForgePanel.ts:323-340`), which stages packs.
    A zip that is a layout belongs on Open. A zip that is content belongs in Local files.
  - A bundle opened read-only already turns Saves into "Save as" (P:8428, `saveBundleAs` P:8233). An opened package
    should follow that.
- **The agent.** It has `layout.export` and the chunked `forge.export.begin` (`viewer/src/agent/forgeTarget.ts:178`),
  but no package export. Add one if agents should produce packs.

### 3.4 A "keyboard & mouse allowed" toggle in the lobby popup, and its line in the lobby list

- **Where.** Two places, because the lobby has two faces.
  - **The create card.** `askText('Create lobby', …, extras)` (P:7966-7972). Add a `label.fx-toggle` beside "Show in
    Custom matches", copying `lobbyVisibilityToggle` (`F/lobbyPage.ts:188-205`), and pass the value through
    `createLobby(..., {listed, password})` (P:7979).
  - **The lobby window.** The host's control, copying LISTED/UNLISTED:
    - a new entry in `LOBBY_CONTROLS` (`lobbyView.ts:80`);
    - its upper-case labels, `aria-pressed`, a `busy` hold that keeps the focus, and host-only `hidden`
      (`lobbyView.ts:207-223`, `406-414`, `488-491`);
    - an option pair like `listed()` and `toggleListed()` (`lobbyView.ts:51-55`);
    - a matching row in `lobbyMenuItems` (`F/lobbyPage.ts:39`) for the pad.
- **The list line.** *(Corrected 2026-11-11 for OT.R123's scope.)* No keyboard word goes on the launcher's list. The
  Custom matches row (`viewer/src/console/render/lobbies.ts:71`, `[map, "n/max players", "Password", "In match"]`
  joined with " · ") is the launcher's, and OT.R123 never reaches a seat that arrives through the launcher's SOCOM II
  path: that seat keeps the controller and the mouse's turn cap whatever the lobby's flag says, so a "Keyboard" word
  there would promise what it does not get. The flag is shown only in the Forge's own surfaces, worded "allowed"
  (OT.R123 (2)): the lobby popup, with its host's toggle in the create card and the lobby window above, and the line
  where the Forge itself lists the lobby. This sheet found no lobby list inside `viewer/src/forge` (source inspection):
  FX-14b names that surface, and until one exists the popup is the only place the flag is shown. Central's
  `ForgeLobbySummary` (`viewer/src/modern/lobbies/data.ts:321-350`; `packages/central/src/forgeLobby.ts`) carries the
  field for those Forge surfaces only.
- **Note.**
  - The lobby window and its CSS are Craig's code, styled after the original's lobby, not Crispy's. Its ALL-CAPS words
    are the rule inside it.
  - Ruled: MISSION OT.R123 (the owner, 2026-11-11), which widens OT.R114. A Forge-made lobby's match may allow keyboard
    and mouse by its host's flag, in the Forge and the Test room only; a seat that arrives through the launcher's
    SOCOM II path never gets keyboard and mouse or the lifted turn cap, whatever the lobby's flag says. So FX-14b gates
    on how the seat entered the match, never on the flag alone.

### 3.5 The Inspector's source-map list opened to campaign maps

- **Where.** The Inspector's Data list. The Map select for doors, turrets, ladders, flares, gates, barriers and
  hostages is built by `copyEditors` and `mapChoices` (P:4186-4221, P:4251-4258).
- **The filter.** `copyMaps()` keeps `!e.campaign && /^MP\d+$/` (P:4192).
- **Watch out.** `copyMaps` is also read by:
  - the background census, which reads every listed map once (`askCensus`, P:4157-4164);
  - a preset's hostage lender (`presetHostage`, P:8687).

  Widening it in place changes those too.
- **What to copy.** Keep `InspectorEditor`'s select. Its `options` take `[value, label, greyed?]` and no option groups
  (`inspectorPanel.ts:134`, `166-168`). Campaign maps can follow the multiplayer ones in the same flat list, labelled
  the same way.
- **The smallest change.**
  - Add a separate list, say `copySourceMaps()`, with the multiplayer maps followed by the campaign maps (the base list
    groups them "Multiplayer" then "Campaign", P:9831-9844), and use it in `mapChoices` alone.
  - Leave `copyMaps` for the census lender, or extend the census knowingly.
  - If headed groups are wanted, `showInspectorData` needs `optgroup` support, the way `askChoice` has it (P:2016-2022).
  - The "(reading the map...)" state and the census filter (`F/mapCensus.ts:78-81`) apply unchanged.

---

## 4. Questions for Crispy (each answerable in a line)

1. Saved groups: a chip in the Assets browser (like Characters), or a separate "Groups" tab in the left dock?
2. Should saving a group live on the Inspector's "N selected" head, the toolbar, a right-click, or all of them?
3. "Export package": in the Saves card beside Download, or its own toolbar button?
4. Should the toolbar's Open take a pack zip too, or should zips go only through Content › Local files?
5. Is World about to become **Map** and "Settings" become **"Map Settings"**, as on `forge/custom-maps` `e55e7267bc`?
   Should new refusals name "Map tab, Map Settings"?
6. With Pitch, Roll and Scale live, keep your three-field rows and colour chips as they are, or change anything (for
   example, uniform scale)?
7. For your "AI-sounding text" polish pass: which strings or patterns bother you most, so new text avoids them?
8. Should campaign maps in the Inspector's Map choice sit in a headed group, or follow the multiplayer maps in one list?

## 5. What could not be determined from the code

- **His preferences beyond what is built.** He has written down no style guide. The conventions above come from the
  code and from 11 devchat lines.
- **His unmerged `forge/custom-maps` commit.** Only its tab and refusal renames were read, through the GitHub API. Its
  "better selection workflow" and map-object editing may change the selection rules in 2.5.
- **The context action line** (devchat:479) and his scripting and sound work. None of it is in this repository.
- **Whether campaign archives answer `doorsOf`, `turretsOf`, `hostageLibOf` and `archives.census`** as the multiplayer
  ones do. That needs a disc run.
- **Whether a layout with campaign-sourced copies passes a lobby's `missingArchives` check** on another player's disc.
- **Whether a lobby's match may allow keyboard and mouse.** Settled, not open (corrected 2026-11-11): MISSION OT.R123,
  the Forge and the Test room only, never a seat arriving through the launcher's SOCOM II path. Section 3.4 places the
  flag by that scope.
- **The `.fx-btn` kit.** Nothing uses it. Whether it was meant for removal or for adoption is not stated.
- **How a five-button Saves footer renders at phone width.** No browser was run.
