# The old editor's affordances and the contributor's (FC2-4)

Product track (a test harness; the Forge has no original, FG.R2). The tests that drive the MOUNTED Forge page were
written against the editor before the contributor's import (`e8acb4d970`, MISSION OT.R112: the Forge's UI is his).
This table maps every selector and affordance those tests use to what his editor has at `agent/fc2-import`
`3da6c3e078`, read from the source only (nothing run). The helpers in `./editor.ts` reach each row by his UI and throw
an Error naming the row where his UI has no such thing, so a test fails with a sentence, never a null click.

Status words: **SAME** (the selector still holds); **MOVED** (the thing exists, reached another way); **GONE** (his
UI has no such thing; the line that says so); **BROKEN** (built but never attached, with no other way in). Line numbers
are `socomlegacy/packages/viewer/src/forge/` at `3da6c3e078`.

## Docks and their folds (`shell/dockShell.ts`, page.ts:1303-1331)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| D1 | `.fx-left` (the left dock) | the dock group holding the Assets tab: `.fx-dg-group[data-dock-group="g-assets"]` by default (page.ts:1305) | `dockOf(doc, 'assets')` | MOVED |
| D2 | `.fx-right` (one right dock, its tabs Object / World / Content) | no one element: a column split (`.fx-dg-split.fx-dg-column`) of two groups -- `g-outliner` (tabs `object`, `map`, `content`, `agent`) over `g-inspector` (tab `inspector`) (page.ts:1307-1310) | a panel by `panel(doc, id)` / `showPanel(doc, id)`; a group by `dockOf(doc, key)` | GONE as one element |
| D3 | `.fx-dock-center` | the group holding the viewport: `.fx-dg-group.fx-dg-viewport` (dockShell.ts:356) | `dockOf(doc, 'viewport')` | MOVED |
| D4 | `.fx-dock` (a dock's class; CSS `.fx-dock .fx-panel > .fx-section`) | `.fx-dg-body` (a tab's body, dockShell.ts:314-326) | none -- a stylesheet pin | GONE (CSS) |
| D5 | `[data-forge-tabs]` (a dock's tab strip) | `.fx-dg-tabs[role="tablist"]` (dockShell.ts:358-364) | `dockOf(doc, key).querySelector('.fx-dg-tabs')` | MOVED |
| D6 | `[data-forge-tab="<key>"]`: `assets`, `viewport`, `object`, `world`, `content` | `.fx-dg-tab[data-forge-tab="<key>"]` (dockShell.ts:369-372); keys `assets`, `viewport`, `object`, `map`, `content`, `agent`, `inspector`. `world` is GONE: World's panels are under `map` (panels' `tab: 'Map'`) | `tabButton(doc, key)`, `showTab(doc, key)` | SAME attribute; `world` -> `map` |
| D7 | `.fx-dock-target--center`, `.fx-dock-target--floating` | `.fx-dg-target--center` in the drag compass, hidden unless a tab is dragged (dockShell.ts:206-217); no floating target | none (a drag) | GONE (`--floating`); MOVED (`--center`) |
| D8 | a panel `details.fx-panel[data-forge-panel="<id>"]` as a dock's child (`:scope >`) | the same element and attributes (dockShell.ts:654-674), drawn inside `.fx-dg-body` only while its tab is its group's active one; otherwise it waits in the hidden `.fx-dg-stash` (dockShell.ts:192-195, 239) | `panel(doc, id)` (refuses a panel in the stash), `showPanel(doc, id)` (presses its tab first); every panel drawn, in the page's order, `drawnPanels(doc)` | MOVED |
| D9 | a section's fold (`details.open`), kept across a reload | the same, but a tab of ONE section draws it always open and its fold is neither taken nor kept (dockShell.ts:162, 173 `sectionOpen`; the toggle's listener returns for one section, dockShell.ts:660): the Outliner (alone in Object) and the Inspector (alone in its tab) do not fold; a section of the Map tab (Map Settings, Light rig, Rules, Starter experiences) does, kept under the dock's key | `panel(doc, id).open` | SAME (a several-section tab's); GONE (a one-section tab's fold) |
| D10 | docks shown / hidden (`fx-docks-off`, the Docks button, H) | the same class; Docks in `.fx-group--help` (page.ts:1034); hidden, only the viewport is drawn (page.ts:1327) | `toolbarButton(doc, 'Docks')` | SAME |
| D11 | `.fx-top [data-forge="reset-layout"]` | built (page.ts:951-952), never attached: off the page by his design (page.ts:1032-1033); Window > Reset layout (page.ts:12229) | `pressMenubar(doc, 'Window', 'Reset layout')` | GONE from the toolbar |

The panels and their tabs (each panel's `tab`, slugged; none, its id): `asset-browser` -> `assets` (page.ts:1335);
`viewport` -> `viewport` (page.ts:2052); `outliner` -> `object` (panels/outlinerPanel.ts:83); `inspector` ->
`inspector` (panels/inspectorPanel.ts:238); `settings`, `environment`, `rules`, `starters` -> `map`
(panels/settingsPanel.ts:291, panels/environmentPanel.ts:65, panels/rulesPanel.ts:179, page.ts:13240);
`creator-assets` -> `content` (creator/assetsForgePanel.ts:356); `agent` -> `agent` (agent/install.ts:145). The
default tree shows `assets`, `viewport`, `object` and `inspector`; `map`, `content` and `agent` wait until pressed.

## The toolbar (page.ts:837-1044)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| T1 | `[data-forge="menu"]` (the forge menu's button) | built with that attribute (page.ts:961-963), never attached: `top.append` (page.ts:1030-1044) leaves it out and says why (page.ts:1032-1033: "the menu button and Reset layout off the page (M and START open the menu ...)"). A pointer's way in: Controls, then the card's "Forge menu (M)" (page.ts:2111), whose press presses the detached button (page.ts:2303-2308) -- the same toggle and the same pointer hint as the old button; the keyboard's: M (keys.ts:133; page.ts:10281) | `pressForgeMenu(doc)` / `openMenu(doc)` (Controls card); `menuKey()` (M); `menuButton(doc)` throws | GONE by his design (the review's BROKEN reading: the element is built but not attached; his own comment makes it deliberate) |
| T2 | New, `button[title^="Start a new layout"]` | removed from the page (page.ts:12233); File > New... (page.ts:12207); START > Build > New layout (row `base`, page.ts:12427) | `pressNew(doc)` | MOVED |
| T3 | Open, title `Open a layout file` | removed (page.ts:12233); File > Open... (page.ts:12208); Ctrl+O (keys.ts:150; page.ts:10256) | `pressOpen(doc)` | MOVED |
| T4 | Saves, `[data-forge="saves"]` | removed (page.ts:12233; the attribute kept on the detached button, page.ts:850); File > Saves... (page.ts:12209); Ctrl+S; START > Forge > Saves (row `save`, page.ts:12463) | `pressSaves(doc)` | MOVED |
| T5 | `[data-forge="undo"]`, `[data-forge="redo"]` | the same, on the toolbar (page.ts:956-957, 1036) | `document.querySelector` as before | SAME |
| T6 | Select and Place, `.fx-tool`; Place found by its title `Place the chosen prop` | the same buttons in `.fx-group--modes` (page.ts:1037); Place's title is now `Place: the object chosen -- ...` (page.ts:862) | `toolbarButton(doc, 'Place')` (by its word) | MOVED (title) |
| T7 | Duplicate, Delete (`button[title^="Duplicate"]`, ...) | built, off the page by his design (page.ts:1038-1039); Edit > Duplicate / Delete (page.ts:12219-12220); Ctrl+D, Del | `pressMenubar(doc, 'Edit', 'Duplicate')` | GONE from the toolbar |
| T8 | Check `[data-forge="check"]`, Create lobby `[data-forge="lobby"]`, Walk, Save map, Play `.fx-play` | the same (page.ts:968-969, 1042-1043) | as before; `toolbarButton(doc, 'Check')` | SAME |
| T9 | Controls, Docks | `.fx-group--help` (page.ts:1034) | `toolbarButton(doc, 'Controls')` | SAME |
| T10 | `.fx-tools-row` (the placing tools) | the same (page.ts `toolsRow`); a spawn, bomb or hostage tool wears its billboard badge (`markBadge`, `aria-hidden`, its glyph in its text: 'Ss' on Spawn SEAL); since PR #5 a press spawns at the view's centre and selects (`spawnAtCentre`), no tool armed | `toolbarButton(doc, 'Spawn SEAL')` (its word less the badge) | CHANGED |
| T11 | `.fx-group--base` holding New / Open / Saves | holds the layout's name and the file input only once New / Open / Saves leave (page.ts:1028, 12233) | none -- a layout pin | GONE (its buttons) |
| T12 | (none) | the menu bar `.fx-menubar`: File, Edit, Window (page.ts:12129-12234), each list drawn at the body while open (`.fx-menubar-list.fx-menubar-floating`) | `menubarRow(doc, menu, label)`, `pressMenubar(...)` | NEW |

## The forge menu (START / M; `menuView.ts`, unchanged by the import)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| M1 | `.fx-menu` card, `li[data-forge-menu-row]`, `.fx-menu-label`, `.fx-menu-value`, `.fx-menu-step`, `.fx-menu-act`, `.fx-menu-more`, `.fx-menu-list`, `[data-forge-menu-section]`, `[data-forge-menu-back]` | the same (menuView.ts:73-140) | `menuRow(doc, id)` once the menu is open | SAME |
| M2 | row ids `props`, `base`, `outliner-screen`, `frame-selection`, `lobby-create`, `save`, `panel-<id>` (`panel-starters`, `panel-rules`), `view-renderScale`, `gametype` | the same ids (page.ts:12413-12470; dockShell.ts:597-606) | `menuRow(doc, id)` | SAME (each row's own behaviour not re-read here) |
| M3 | the menu opened by the toolbar's button: the pointer's hint | the Controls card's "Forge menu (M)" presses the same button (`menuByPointer` true, page.ts:12494-12498); M gives the keys' hint | `openMenu(doc)` | MOVED |

## The cards (New, Open, Saves, Save as)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| C1 | the Saves card, its Save as / Rename / Share link | opened by the same button's listener (page.ts:12126), pressed from File > Saves... | `pressSaves(doc)`, then the card as before | MOVED (the way in); the card's inside not re-read at stage 1 |
| C2 | the New card (`openNew`), the base chooser | `newBtn`'s listener (page.ts:11879), pressed from File > New... | `pressNew(doc)` | MOVED (the way in) |
| C3 | Open's file chooser | `openBtn`'s listener (page.ts:12128) | `pressOpen(doc)` | MOVED (the way in) |
| C4 | `.fx-check-card`, `.fx-check-sheet`, the confirm cards `.fx-card` | the same (page.ts:2067-2068, 2191-2208, 11105, 11125) | as before | SAME |

## The outliner's tree (page.ts:6840-7342)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| O1 | `ul.fx-outliner` | the same (panels/outlinerPanel.ts:59), in the `object` tab | `outliner(doc)` | SAME |
| O2 | `li.fx-tree-branch[data-tree-branch="<kind>"]` (`mapProps`, `userProps`, `userSpawns`, `rules`, ...) | no row sets either: the tree is two section rows, `li.fx-outliner-section[data-outliner-section="user"]` (User Objects) then `"map"` (Map Objects) (page.ts:7272-7273, 7319-7330), the rows one level under each. Only reads of the old names remain (page.ts:7339-7340, 7543-7545) | `outlinerSection(doc, 'user' / 'map')`; `treeBranch(doc, kind)` throws | GONE |
| O3 | `.fx-tree-toggle` (a branch's fold, its `aria-expanded`) | a section row's own click folds it, `aria-expanded` on the row (page.ts:7274-7284; its `.fx-tree-caret` is `aria-hidden`) | `outlinerSection(doc, id).click()`; `treeToggle(doc, kind)` throws | GONE (MOVED to the section row) |
| O4 | a placement's row `li[data-user-prop="<i>"]` | the same (page.ts:6979), under User Objects | `userRows(doc)` | SAME |
| O5 | the map's own rows | `li.fx-map-data[data-map-data]`, `li.fx-spawn-slot[data-spawn-slot]`, the map props' rows (page.ts:7131-7141, 7230-7257), under Map Objects | `outlinerSection(doc, 'map')` and its following rows | MOVED |
| O6 | the outliner's type filter, a `select` in `.fx-outliner-tools` | a dropdown as the View's: `details.fx-viewport-modes.fx-outliner-filter`, its summary `Filter`, beside the search (panels/outlinerPanel.ts:65-71); no `select` in the tools | `outlinerFilter(doc)` | MOVED |

## The Inspector (panels/inspectorPanel.ts)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| I1 | `.fx-right [data-forge-panel="inspector"]` | its own tab and group (`g-inspector`), always drawn by default | `inspector(doc)` | MOVED |
| I2 | `input[data-label="<label>"]`, `.fx-inspect-head`, `.fx-inspect-name`, `.fx-inspect-kind`, `.fx-position-fields`, `.fx-rotation-fields`, `.fx-scale-fields` | the same (inspectorPanel.ts:45-92) | `inspectorField(doc, label)` | SAME |
| I3 | the Inspector following the Outliner in one dock (`previousElementSibling` is `outliner`) | separate groups | none -- a layout pin | GONE |

## The status bar (page.ts:2024-2034; shell/statusBar.ts)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| S1 | `.fx-status`, `.fx-status-msg`, `.fx-cell--mode/counts/cam/speed/fps`, `[data-forge-chip]`, `[data-forge-chips="match"]`, `.fx-toast`, `.fx-loading-bar` | the same | `statusLine(doc)`, `chipWord(doc, id)` | SAME |

## The viewport's snaps (page.ts:1491-1539, 7701-7702)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| V1 | `.fx-viewport-snap-summary` (`is-on` while the snap is on) | two pills, `.fx-snap-pill[aria-label="Workplane snap"]` and `[aria-label="Rotation snap"]`, each a `.fx-snap-toggle` (`is-on`, `aria-pressed`) and a step menu `details.fx-viewport-snap` | `snapToggle(doc, 'Workplane snap' / 'Rotation snap')` | MOVED |

## The assets list (page.ts:1047-1186)

| Row | Old | His | How a test reaches it | Status |
| --- | --- | --- | --- | --- |
| A1 | `.fx-left ul.fx-assets > li[data-asset]` | `ul.fx-assets > li[data-asset]` in the `asset-browser` panel (page.ts:1071, 8029, 8150), Props its first kind tab (page.ts:3187) | `assetList(doc)`, `assetTiles(doc)`, `assetTile(doc, asset)` | MOVED (the dock) |
| A2 | `.fx-asset-filters`, `[aria-label="Asset view options"]`, `#fx-asset-view-popup`, `.fx-asset-display-modes`, `input[aria-label="Asset preview on hover"]`, `.fx-asset-tip` | the same (page.ts:1060-1145; assetTooltip.ts:41) | inside `panel(doc, 'asset-browser')` | SAME |
| A3 | (none) | the kind tabs `.fx-asset-tabs` (Props, then each placed object) (page.ts:1154-1170) | inside `panel(doc, 'asset-browser')` | NEW |
| A4 | `.fx-right [data-forge-panel="creator-assets"]` (Local files) | the `content` tab | `showPanel(doc, 'creator-assets')` | MOVED |

No row is BROKEN in the sense above: every element built and not attached is either reached another way by his UI
(T1, T2-T4, T7, D11) or is a layout his UI dropped.
