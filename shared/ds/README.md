# Legacy design system

The launcher, gameplay chrome and project pages share the **Briefing** tokens, base styles, components and local fonts.
The `s2u-*` CSS namespace stays stable for compatibility. Public product branding is SOCOM 2 Legacy.
The original Briefing reference pages (`docs/briefing/`: the component previews and their notes) were removed on
2026-10-30 on the owner's word, as long outdated; a new component set is being made by a contributor (phil). Until it
lands, the live styles here (`tokens.json`, `base.css`, `components.css`) are the reference.

## Use

Viewer HTML entry points link `/src/ds/index.css`. The Vite alias in `shared/vite.ts` resolves that URL here, and
aliases `/fonts/` to `shared/fonts/`. Fonts and their OFL licenses are included in each build without a CDN.
Project-page layouts use the shared tokens in `projectSite/site.css`; the disc page's layout lives in the viewer's
`styles.css`.
See [chrome.md](chrome.md) for navigation boundaries.

The system uses layered CSS (`tokens`, `base`, `components`); application layout remains unlayered.
`aria-disabled="true"` on an anchor is only presentation. Use a disabled button or remove the link to prevent action.
`body.s2u-crt` enables scanline styling; `[data-density="compact"]` adjusts the game panel's spacing and type.

## Change tokens and fonts

Never edit generated `tokens.css`. Edit `tokens.json`, run `npm run tokens -w shared` from the repository root, bump `VERSION` when
changing the system contract, and run `npm test -w shared`. The tests cover token generation, CSS, fonts and contrast.
Font tooling (`npm run fonts -w shared`, `npm run fonts:metrics -w shared`) maintains the local WOFF2 faces and fallbacks.

After changing components, inspect the launcher and project pages at desktop and mobile widths. The retired
sister-project landing pages and gallery are no longer build or test dependencies.

Engineering tokens the artifact does not define (the gutter, the durations, the z-order, and 1.1.0's launcher
tokens) live in `base.css`'s first `:root` block, not in `tokens.json`: `tokens.test.ts` pins `tokens.json` to the
artifact's bytes and reads that block beside `tokens.css` for its contrast pairs.

## The launcher components (1.1.0)

Added for the launcher (the plan `socomlegacy/docs/plans/2026-10-09-modern-ui-parallel.md`, rulings MU.R19 and MU.R20;
the design in `socomlegacy/docs/plans/briefs/modern-ui-launcher-layout.md`, sections 2 to 4). The launcher is the
project's own page, a browser adaptation (MU.R1): nothing here draws a screen of the original game. Additive: no
earlier class or token is renamed or changes value (two equivalences: base.css's `:focus-visible` ring now reads
the focus tokens, the same 2px / 2px; under reduced motion the duration tokens are `0s`, where every transition was
already off). They live in `components.css` after the `---- part C` mark. `css.test.ts` and `tokens.test.ts` hold
each rule below. No page uses them yet; the modern UI moves onto them in tasks LU-1 to LU-4.

### Tokens

| Token | Value | Use |
|---|---|---|
| `--s2u-bar-h` | `space-12 + space-2` = 56px | the top bar |
| `--s2u-shelf-h` / `--s2u-shelf-h-compact` | `2 x space-12 + space-8` = 128px / `space-12` = 48px | the shelf at home / opened |
| `--s2u-action-h` | `2 x space-8` = 64px | the action bar |
| `--s2u-hero-h` | `clamp(200px, 38vh, 360px)` | the hero (home only) |
| `--s2u-bar-h-narrow`, `--s2u-shelf-h-narrow`, `--s2u-action-h-narrow` | 48, 64, 88px (from the space scale) | the same at <= 720px |
| `--s2u-icon-16` / `-20` / `-24` / `-40` | 16, 20, 24, 40px | inline, in a control, the authored grid, a tile |
| `--s2u-focus-w`, `--s2u-focus-offset` | 2px, 2px | the focus ring (its colour is `--s2u-focus`) |
| `--s2u-dur-signature` | 360ms | the one signature step, START arming (MU.R13 F6), beside `dur-fast` 120 and `dur-base` 200 |
| `--s2u-state-live` / `-ready` / `-wait` / `-alert` | `cyan-boot` / `glyph-triangle` / `text-dim` / `warn` | a state (live: a lamp's fill only, never text) |
| `--s2u-status-operational` / `-degraded` / `-maintenance` / `-down` / `-unknown` / `-unreachable` | aliases of `state-live` / `state-alert` / `gold` / `glyph-circle` / `state-wait` / `glyph-cross` | the public status page's lamps; the word and the shape carry the state |
| `--s2u-surface-raised` / `-card` / `-hover` / `-active` | `panel-edge` / `tab` / `tab-lit` / `highlight` | surfaces, darkest to lit; only `text-strong` on `active` |
| `--s2u-scrim` | `ground` at 88% over transparent | behind a dialog and under the hero's words |
| `--s2u-z-osk` | 34 | an on-screen keyboard: over a dialog (30), under the scanlines (40); kept in 2.0.0, whose part C no longer draws one |

None of the spacing tokens the layout tokens are built on is touched by the density switch. Opened at 1440x900 the
content region is 900 - 56 - 48 - 64 = **732px**. Gaps come only from the `--s2u-space-*` scale (4/8/12/16/24/32/48);
the page gutter stays `--s2u-gutter`. Breakpoints: two panes from 960px; the phone frame at <= 720px. Under
`prefers-reduced-motion` every duration token is `0s` and base.css stops every transition and animation, as before,
so a script that times itself by a token takes no time either.

Contrast, every pair in `tokens.test.ts`: every text colour on `surface-raised` clears 4.5:1 (`text-dim` 6.13,
`gold` 7.23, `text` 9.52, `text-strong` 13.96); `state-live` on ground, panel, tab, tab-lit and raised: 10.71, 8.40,
9.01, 7.29, 9.78; `ground` on `gold-display` (START launching) 10.32; on the scrim over pure white (the worst
backdrop) `text-dim` 4.98, `gold` 5.87, `text` 7.73. The other new names are aliases of pairs the table already holds,
asserted again under the new names.

### The focus ring

One ring for keyboard and pad: `:focus-visible` and `.is-pad-focused` (set by the page's pad walker), `--s2u-focus-w`
solid `--s2u-focus` at `--s2u-focus-offset`, instant (MU.R13 F2). base.css draws it for `:focus-visible` everywhere;
part C adds `.is-pad-focused` on every control inside `.s2u-launcher`, `.s2u-shelf` and `.s2u-dialog`
(scoped, so a page that does not use the launcher is unchanged). Do: let the ring show; an element whose ring must sit
inside its box sets `--s2u-focus-offset` locally (for example `calc(-1 * var(--s2u-focus-w))`, as a compact shelf's
tiles do) -- an `outline-offset` set on the element loses to the scoped ring rule. Don't: animate it, or draw a
second focus style. A `.s2u-tile` inside the launcher keeps its one ring: the tile draws it (`:focus-within`, or
`:has(.is-pad-focused)` for the pad), and the link stretched over it draws none.

### `s2u-launcher` -- the frame

Purpose: one fixed frame where only the content scrolls (brief 2.8). Anatomy: `.s2u-topbar`, `.s2u-hero` (home only),
`.s2u-shelf`, `.s2u-launcher__content`, `.s2u-actionbar`, placed by grid area. States: home; `.is-opened` (the hero
folds over `--s2u-dur-base`, the shelf compacts to 48px). A two-pane section is `.s2u-launcher__panes` of two
`.s2u-launcher__pane`: stacked under 960px (the content scrolls), side by side from 960px (each pane scrolls in itself,
contained). At <= 720px the frame is one column that scrolls as a whole, the top bar and shelf held at the top and the
action bar at the foot (sticky), so the hero and the content move together between them. Tokens: the layout tokens,
`--s2u-gutter`. Do: give the page's `body` no scroll of its own; set `inert` on the folded hero. Don't: push the frame
with a dialog; measure heights in script (the grid gives the room).

```html
<div class="s2u-launcher is-opened">
  <header class="s2u-topbar">…</header>
  <section class="s2u-hero">…</section>
  <nav class="s2u-shelf" aria-label="Launcher">…</nav>
  <main class="s2u-launcher__content">
    <div class="s2u-launcher__panes"><section class="s2u-launcher__pane">…</section><section class="s2u-launcher__pane">…</section></div>
  </main>
  <footer class="s2u-actionbar">…</footer>
</div>
```

### `s2u-topbar` -- brand, badge, status, account

Purpose: who and what, at a glance. Anatomy: `.s2u-topbar__brand` (the page's `h1`, `panel-heading` in gold), one
`.s2u-label.s2u-topbar__badge` (the one adaptation badge), `.s2u-topbar__status` (chips),
`.s2u-chip.s2u-topbar__account`. States: signed out (the chip reads "Sign in"), `.is-in` (the name in gold),
`.is-agreement` (the agreement is owed: a warn edge). Items marked `.s2u-topbar__fold` hide at <= 720px (the script
mirrors them into the account menu). Tokens: `--s2u-bar-h`, `ground`, the 1px `panel-edge` rule. Don't: a second
badge or a second brand.

```html
<header class="s2u-topbar">
  <h1 class="s2u-topbar__brand">SOCOM 2 Legacy</h1><span class="s2u-label s2u-topbar__badge">Browser launcher</span>
  <div class="s2u-topbar__status"><span class="s2u-chip is-live"><span class="s2u-lamp s2u-lamp--small s2u-chip__lamp"></span><span class="s2u-chip__word">Online 41</span></span></div>
  <button class="s2u-chip s2u-topbar__account" type="button"><span class="s2u-chip__word">Sign in</span></button>
</header>
```

### `s2u-hero` -- the focused tile's one screen

Purpose: what the focused tile is and its one next action (brief 3.1). Anatomy: `.s2u-hero__backdrop` (an `img` or
`video` under the scrim; `ground-deep` when absent), `.s2u-hero__body` with `.s2u-hero__title` (`screen-title`,
`gold-display`, its glow), `.s2u-hero__count` (one count line), `.s2u-hero__actions` (one primary `.s2u-tab`),
`.s2u-hero__line` (one news line, cut with an ellipsis); an optional `.s2u-hero__media` composed with
`.s2u-tile__frame` (`.is-blank` before the disc). States: with / without the picture; `.is-loading` (the count line
dimmed; set `aria-busy`); `.is-changing` (the script's 120ms cross-fade when the focused tile changes). At <= 720px no
picture and an even scrim. Do: keep the words in the left part (the scrim is opaque there for every text colour).
Don't: a game asset before the disc (MU.R3); more than one primary.

```html
<section class="s2u-hero" aria-labelledby="hero-title">
  <div class="s2u-hero__backdrop" aria-hidden="true"><img src="startup/menu-poster.jpg" alt=""></div>
  <div class="s2u-hero__body">
    <h2 class="s2u-hero__title" id="hero-title">Play online</h2>
    <p class="s2u-hero__count">12 rooms · 3 games · 41 players</p>
    <div class="s2u-hero__actions"><button class="s2u-tab" type="button">Open lobbies</button></div>
    <p class="s2u-hero__line">News: No server messages.</p>
  </div>
  <figure class="s2u-hero__media s2u-tile__frame is-blank"><span>Map</span></figure>
</section>
```

### `s2u-shelf` -- the tiles

Purpose: the one row of destinations (L1 / R1 move along it). Anatomy: `.s2u-shelf__tile` (a `button`) with
`.s2u-shelf__icon` (the 40px authored icon), `.s2u-shelf__word` and `.s2u-shelf__sub` ("Disc"); one `.s2u-shelf__ink`
the script places with `--s2u-ink-x` / `--s2u-ink-w` (it glides over `--s2u-dur-base`). States: rest; hover
(`surface-card`); focused and pad-focused (raised: `surface-hover` and the lift, plus the ring, instant); selected
(`aria-selected` / `aria-current` / `.is-on`: the word in gold, the ink under it); `.is-locked` (needs the disc: the
sub-label shows, the tile stays focusable and opens on its lock line); disabled (`aria-disabled`, faded); compact
(`.is-compact`, or inside `.s2u-launcher.is-opened`: 48px, icon 20 beside the word). It scrolls in itself and snaps
on a phone. Don't: hide a locked tile; colour the word for a state.

```html
<nav class="s2u-shelf" aria-label="Launcher">
  <button class="s2u-shelf__tile" type="button" aria-current="page"><svg class="s2u-shelf__icon" viewBox="0 0 24 24" aria-hidden="true">…</svg><span class="s2u-shelf__word">Play</span><span class="s2u-shelf__sub">Disc</span></button>
  <button class="s2u-shelf__tile is-locked" type="button">…</button>
  <span class="s2u-shelf__ink" aria-hidden="true"></span>
</nav>
```

### `s2u-prompts` -- glyph + verb

Purpose: say what each pad button does here (the Deck's footer; brief 2.9). Anatomy: `.s2u-prompts` (a list) of
`.s2u-prompt` (an `li`, or a `button` that does what the press does) holding a `.s2u-prompt__glyph` with its
`--cross` / `--circle` / `--square` / `--triangle` (an `svg`, `aria-hidden`), or `.s2u-prompt__key`s for L1 R1 L2 R2
Options, then the verb. Cross, Square and Triangle in their glyph colours; **Circle in the text colour** (MU.R20, the
brief's Q5: no Circle colour until the owner names one; the older `.s2u-hint__glyph--circle`, in warn, is unchanged).
Hidden on a touch screen unless `.is-pad` (set while a pad is live). Do: change them with focus; give the glyph its
name for a screen reader (`.s2u-visually-hidden`). Don't: show a prompt for a press that does nothing.

```html
<ul class="s2u-prompts is-pad">
  <li class="s2u-prompt"><svg class="s2u-prompt__glyph s2u-prompt__glyph--cross" viewBox="0 0 14 14" aria-hidden="true">…</svg><span class="s2u-visually-hidden">Cross:</span>Open</li>
  <li class="s2u-prompt"><span class="s2u-prompt__key" aria-hidden="true">L1</span><span class="s2u-prompt__key" aria-hidden="true">R1</span>Tiles</li>
</ul>
```

### `s2u-chip` -- a state at a glance

Purpose: the disc, the server, the controller and microphone lamps, the account. Anatomy: `.s2u-chip` (a `span`, or a
`button` when it opens something) with `.s2u-lamp.s2u-lamp--small.s2u-chip__lamp` and `.s2u-chip__word`. States: the
disc's `.is-empty` (a dim word) / `.is-reading` / `.is-ready` / `.is-error` (a warn edge); a lamp's `.is-live` /
`.is-wait` / `.is-alert`; hover (a button: `surface-hover`, gold); disabled. The state is always in the word too,
never in the colour alone. Tokens: `surface-card`, the `state-*` lamps.

```html
<button class="s2u-chip is-ready" type="button"><span class="s2u-lamp s2u-lamp--small s2u-chip__lamp"></span><span class="s2u-chip__word">SCUS-97275 ready</span></button>
```

### `s2u-actionbar` and `s2u-start` -- the prompts and the launch cluster

Purpose: one primary, always in one place, its precondition beside it (brief 2.2). Anatomy:
`.s2u-prompts.s2u-actionbar__prompts` at the left; `.s2u-actionbar__cluster` at the right, the disc chip immediately
left of `.s2u-tab.s2u-start`, whose room suffix is `.s2u-start__room`. START's states: disabled (`disabled`, the tab's
own), `.is-armed` (ground on gold, the screen's one highest-contrast object), `.is-launching` (`gold-display` over
`--s2u-dur-signature`; set `aria-busy`). At <= 720px the bar is the cluster only (the prompts with a pad only). The
removed status rows' words go into START's accessible name and one `.s2u-visually-hidden` `role="status"` line.
Don't: a second launch surface (MU.R20).

```html
<footer class="s2u-actionbar">
  <ul class="s2u-prompts s2u-actionbar__prompts">…</ul>
  <div class="s2u-actionbar__cluster">
    <button class="s2u-chip is-ready" type="button">…</button>
    <button class="s2u-tab s2u-start is-armed" type="button"><svg class="s2u-icon" aria-hidden="true">…</svg>Launch<span class="s2u-start__room"> · Alpha</span></button>
  </div>
</footer>
```

### `s2u-settings` -- one settings home

Purpose: a category list beside its page (brief 2.7). Anatomy: `.s2u-settings__list` of `.s2u-settings__group`s
(`.s2u-settings__head`, an optional `.s2u-settings__lock` line, a `ul.s2u-tabs.s2u-tabs--column` of
`.s2u-tab.s2u-settings__item`); `.s2u-settings__page` with `.s2u-settings__title` and its `.s2u-settings__where`
(the group), then the existing `.s2u-field`s. States: the selected category (`aria-current`, lit); a group
`.is-locked` (its items dimmed and still focusable, under one lock line: "Needs disc", "Sign in to change"); under
960px the list, then the page (`.is-paged`), Circle back; from 960px each pane scrolls in itself. Don't: hide a locked
setting; a lock line per row.

```html
<div class="s2u-settings is-paged">
  <nav class="s2u-settings__list" aria-label="Settings">
    <section class="s2u-settings__group"><h3 class="s2u-settings__head">This browser</h3>
      <ul class="s2u-tabs s2u-tabs--column"><li><button class="s2u-tab s2u-settings__item" type="button" aria-current="true">Controller</button></li></ul></section>
    <section class="s2u-settings__group is-locked"><h3 class="s2u-settings__head">Account</h3><p class="s2u-settings__lock">Sign in to change</p>…</section>
  </nav>
  <section class="s2u-settings__page"><h3 class="s2u-settings__title">Controller <span class="s2u-settings__where">This browser</span></h3>…</section>
</div>
```

### `s2u-dialog` -- a confirm or a small form

Purpose: sign-in, the USER AGREEMENT, the log-off and decline confirms. Anatomy: `.s2u-dialog` (the fixed scrim)
holding `.s2u-dialog__box` with `.s2u-dialog__title`, `.s2u-dialog__body` and `.s2u-dialog__actions` (two
`.s2u-tab`s, **No first**, focused first). It is a `div role="dialog" aria-modal="true"`,
not a `<dialog>` opened with `showModal()`: the top layer would sit over a page's own on-screen keyboard
(`--s2u-z-osk`) and make it inert, where that keyboard types into the dialog's fields. States: open (`hidden` removed); `.is-busy` (the buttons inert while a request runs). The script traps focus inside it, Circle cancels, focus returns
where it was, L1 / R1 are inert under it. Don't: push the frame; close a confirm on a scrim click.

```html
<div class="s2u-dialog" role="dialog" aria-modal="true" aria-labelledby="logoff-title">
  <div class="s2u-dialog__box"><h2 class="s2u-dialog__title" id="logoff-title">Log off</h2>
    <div class="s2u-dialog__body"><p>Log off?</p></div>
    <div class="s2u-dialog__actions"><button class="s2u-tab" type="button">No</button><button class="s2u-tab" type="button">Yes</button></div></div>
</div>
```

### The on-screen keyboard (retired from part C in 2.0.0)

Part C's keyboard is retired: no page drew it (CX-29 of the console plan). The console's keyboard is part G's
`.cx-osk`. The `--s2u-z-osk` token stays (the table above).

### Utilities

`.s2u-visually-hidden` (words for a screen reader only, such as the launcher's `role="status"` line) and `.s2u-icon`
(an authored stroke icon at 20px; `--16`, `--24`, `--40`).

## From the public site (1.2.0)

Adopted from the public site's design guide (the plan `socomlegacy/docs/plans/2026-10-09-modern-ui-parallel.md`, rulings
MU.R19, MU.R21, MU.R22; the verdicts in `socomlegacy/docs/plans/briefs/modern-ui-teaser-scope.md`, section 1). Source,
read only at the teaser's pinned commit: `teaser@185764c3:socomlegacy/packages/viewer/src/teaser/DESIGN.md` (the guide),
`teaser@185764c3:socomlegacy/packages/viewer/src/teaser/patterns.css` (its action, link and focus rules),
`teaser@185764c3:socomlegacy/packages/viewer/src/teaser/icons.ts` and
`teaser@185764c3:socomlegacy/packages/viewer/src/teaser/emblem.svg` (the marks). Additive: no earlier class or token is renamed or changes value (`s2u-tab` and its modifiers are untouched).
Rules live in `components.css` after the `---- part D` mark and the tokens in `base.css`'s first `:root` block;
`css.test.ts`, `tokens.test.ts` and `icons.test.ts` hold each line below.

### Actions: `s2u-action` (three levels, selected and disabled)

Written as classes, not the guide's page-ID selectors. `.s2u-action` is the secondary look: `tab` fill, 1px `text-dim`
edge, `text-strong` label (`type-tab`); hover `tab-lit` with a gold edge and `gold-display` label; press
`highlight-pressed`. `.s2u-action--primary`: `gold` fill and edge, `ground-deep` label; hover `gold-display`; press
`text-strong`; one per screen. `.s2u-action--tertiary`: a `gold-display` link, underlined, no container (editorial and
source links, "Clear filters"). `.s2u-action--large` raises the height to 48px (`--s2u-hit-primary`), for a primary
launcher button; every action is at least 44px (`--s2u-hit-min`). **Selected** (`aria-pressed="true"`, `aria-current`,
`.is-on`): a gold label and edge and a 2px bottom rule, so the state is shape as well as colour (keep the attribute). A selected primary keeps its `ground-deep` label and draws a `ground-deep` bar (gold on gold would be unreadable); a selected tertiary has no container, so it draws no bar: its underline thickens to 2px and the label is `text-strong`.
**Disabled** (`:disabled`, `aria-disabled="true"`): `tab` fill, `highlight` edge, `text-dim` label, no hover, no glow;
leave the status text that explains why. Every state also draws the one ring: `:focus-visible` and `.is-pad-focused`
at `--s2u-focus-w` and `--s2u-focus-offset` (our 2px; the guide's 3px is not adopted); `.s2u-focus-inset` moves it
inside, only where a scroller would clip it. A press and a hover are never offered to a disabled control. Contrast, in
`tokens.test.ts`: `ground-deep` on `gold`, `gold-display`, `text-strong` 4.5:1; `text-strong` on `tab`, `tab-lit`,
`highlight-pressed` 4.5:1; `gold-display` and `text-dim` on `tab` 4.5:1; the edges (`text-dim`, `gold` on `tab`) 3:1.

```html
<button class="s2u-action s2u-action--primary s2u-action--large" type="button">Play</button>
<button class="s2u-action" type="button" aria-pressed="true">Maps</button>
<button class="s2u-action" type="button" disabled>Needs disc</button>
<a class="s2u-action s2u-action--tertiary" href="#">Clear filters</a>
```

### Type roles

Actions `type-tab`; navigation `type-subtitle`; compact reading and helper copy `type-body-small`; numeric metadata
`type-readout`. Never shrink an action label to `type-stat-caption` or `type-readout-caption` to make a layout fit.
A page hero is `type-story-title`, stepping down to `type-screen-title` on a phone; a section title is
`type-stat-number`; a panel's label is `type-panel-heading`.

### Rhythm and the reading width

`space-2` between an icon and its label and between related controls; `space-3` compact interiors; `space-4` mobile
gutters and small panels; `space-6` desktop panel padding and card gaps; `space-8` between major blocks; `space-12`
between reading sections. The reading measure is `--s2u-measure-reading` (1040px); `.s2u-reading` is that measure plus
the page gutters, centred.

### Surfaces

A panel is `panel` or `tab` with a 1px `highlight` edge. `.s2u-panel--callout` adds a 2px `gold` top rule to the body
(a gradient layer, not an edge: the edge guard stays at 1px). `gold-source` is decoration, never a readable label (the CSS
test refuses it in a component). No hover lift on an informational card: nothing moves when it is pointed at.
`.s2u-panel--backdrop`: a panel whose `.s2u-panel__body` shows an image set by the page as `--s2u-backdrop-image` on the
panel (the head stays plain), under the shade `--s2u-backdrop-shade` (the scrim, 88% `ground`; `gold`, `gold-display`, `text` and `text-strong` clear 4.5:1 on it over pure white even at
the guide's lightest 82%, and `text-dim` at the scrim's own 88%, not at 82%: darken the shade, never lighten it). With no image it is the plain panel (the teal fallback); forced colours remove the image
and the shade. The image is context, never evidence; it is authored or shipped media only -- **no game screenshots**
(MU.R22). The class carries no image itself.

```html
<section class="s2u-panel s2u-panel--backdrop" style="--s2u-backdrop-image: url(phase.jpg)">
  <h3 class="s2u-panel__head">Phase</h3>
  <div class="s2u-panel__body"><p>Words over the shaded image.</p></div>
</section>
```

### Icons and the emblem (authored)

`icons.ts`: eleven marks drawn by the project -- play, news, roadmap, journey, archive, playtest, external, back, server, status, leaderboard -- and
`emblem.svg`: the project emblem, renamed "SOCOM 2 Legacy" in its accessible name (the guide's was "II"), in token
colours only. Licence: the project's own work, the repository's GPL-3.0 (the teaser's repository is the same
author's); nothing third-party, so no entry is needed beside the fonts' OFL texts in `shared/fonts/`. `icon(name,
size)` returns an inline `<svg class="s2u-icon">` on the ds scale **16, 20, 24, 40** (nav icons 20, the briefing icon
24, the emblem 40); marks are decorative (`aria-hidden`, `currentColor`, no `title`), the control's visible words name
the control. Not adopted: the guide's 18px and 28px sizes (off our scale; the guide disagrees with its own code
there) and its page-ID focus offset of 3px; the four brand marks of `icons.ts` (YouTube, Discord, X, GitHub) --
third-party logos with their own terms, and which community links may appear is the owner's question (scope brief,
Q2); the teaser's `--s2u-teaser-header-height` and `--s2u-teaser-launch-height` (ours, `--s2u-bar-h` and
`--s2u-action-h`, name the same reservations); the guide's brand name "SOCOM II Legacy" (ours is "SOCOM 2 Legacy",
Q3); its hover-first pattern as the only state (every state here has the pad ring).

## From the live site (1.3.0)

Taken from the live public site's launcher page (the plan `socomlegacy/docs/plans/2026-10-09-modern-ui-parallel.md`,
rulings MU.R19, MU.R23, MU.R24; the verdicts in `socomlegacy/docs/plans/briefs/modern-ui-live-site-scope.md`, section
2.1, and task DS-3 of its section 6). The live site is the `wt-lobby-armory` build at 803f2671, read only:
`wt-lobby-armory@803f2671:socomlegacy/packages/viewer/src/startup.css` (the launcher's layout),
`wt-lobby-armory@803f2671:socomlegacy/packages/viewer/src/teaser/patterns.css` (its nav and action rules) and
`wt-lobby-armory@803f2671:socomlegacy/packages/viewer/index.html` (the markup, l.36-150). The pattern comes over, never
its content: no playtest framing, build checklist, social link or person (MU.R23, MU.R22), and
**no game screenshots**. Additive: no earlier class or token is renamed or changes value; at zero safe-area insets every frame
height is the 1.1.0 one. Rules live in `components.css` after the `---- part E` mark, tokens in `base.css`'s first
`:root` block (1.3.0 lines); `css.test.ts`, `tokens.test.ts` and `icons.test.ts` hold each line below. Two
conventions shape every adoption: a live border 2px or wider is a gradient layer here (the edge guard stays at 1px),
and a live `gold-source` frame is the `highlight` edge (`gold-source` is decoration, refused in a component).

| Class or rule | Live source (`startup.css` unless named) | What |
|---|---|---|
| `s2u-slot` | l.21-37, 133-136; `index.html` l.66-72 | the memory-card slot |
| `s2u-facts` | l.224-233, 243-258; `index.html` l.36-65 | the briefing callout with fact columns |
| `s2u-summary`, `s2u-summaries` | the scope brief, section 3 (no live original) | the home's summary card and its grid |
| `s2u-navlinks` | `patterns.css` l.104-130; l.236-253 | the project nav as icon + word |
| `s2u-start--large` | l.113-114, 263 | START at 48px with the play triangle |
| `s2u-actionbar.is-ready`, `s2u-actionbar.is-error` | l.115-119, 247-250 | the bar's ready rule and its error growth |
| safe-area insets, `scroll-padding-block` | l.7, 109, 236 | the frame's insets and the content's reservation |
| `s2u-tip[data-side]` | l.205-208 | the tip's arrow |
| `s2u-tile__frame.is-guide` | l.187-196 | the look card's frame guide |

### `s2u-slot` -- the memory-card slot

Purpose: the disc as a save slot, its state at a glance (the scope brief: the home's disc + card summary and the
Settings > Memory card head; inserting stays the action bar's chip, MU.R16/R20). Anatomy: `.s2u-slot__label` (the
readout row across the top -- "Memory card (PS2)" / "Slot 1" -- `type-readout`, gold, upper case, a 1px `highlight`
rule under), `.s2u-slot__icon` (the disc's 40px drawing on a `ground-deep` tile with a `highlight` edge; inside it a
`.s2u-slot__groove` and a `.s2u-slot__check`), `.s2u-slot__copy` (`.s2u-slot__title`, `.s2u-slot__file`,
`.s2u-slot__status`), `.s2u-slot__action`. The panel has a 4px left edge (`--s2u-slot-edge-w`, in
`--s2u-slot-edge`: gold), a 1px `highlight` frame and the lift. States: `.is-empty` (the status line hidden),
`.is-reading` (the icon turns once per 5 x `dur-slow`; still under reduced motion), `.is-ready` (the edge and frame
`state-ready`, the fill `--s2u-slot-ready-fill` = `highlight-pressed` 85% over `ground`, the title, label and icon
`text-strong`, the check in place of the groove), `.is-error` (the edge `state-alert`, the frame and status `warn`),
`.is-over` (the ring while a file is dragged over the page). Forced colours: a `CanvasText` frame, no edge layer.
Don't: `text-dim` on the ready fill (3.14:1); a second insert control (the chip is the one).

```html
<section class="s2u-slot is-ready" aria-labelledby="slot-title">
  <p class="s2u-slot__label"><span>Memory card (PS2)</span><span>Slot 1</span></p>
  <span class="s2u-slot__icon" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26"/><path class="s2u-slot__groove" d="M15 32a17 17 0 0 1 17-17"/><path class="s2u-slot__check" d="m17 33 10 10 22-23"/></svg></span>
  <div class="s2u-slot__copy"><h3 class="s2u-slot__title" id="slot-title">Disc loaded</h3><p class="s2u-slot__file">SCUS-97275.iso</p><p class="s2u-slot__status" role="status">Ready</p></div>
</section>
```

### `s2u-facts` -- a callout with fact columns

Purpose: one read of a few facts, each column headed (the launcher's **Ready check**: Disc / Controller / Signed in,
each a link one step to its fix). Named `s2u-facts` because `.s2u-briefing` is part A's tabs grid and is not touched.
Anatomy: `.s2u-facts__title` (`type-subtitle`, `text-strong`) in a 240px column beside `.s2u-facts__lede`;
`.s2u-facts__grid` of `.s2u-facts__col`s, each a `.s2u-facts__head` (`type-nav`, gold) over a list
(`s2u-list--check is-done` / `is-todo`, or plain), ruled apart by 1px `highlight`; `.s2u-facts__note` across the foot.
Surface: a 2px gold top rule over the `panel` -> `tab` 120deg gradient. Three equal columns; two at <= 900px; one at <=
640px, where the title column stacks over the lede. Links are `gold-display`, underlined. Not adopted: the live
column weights (3.2fr 1fr 1fr -- shaped by its long checklist, the content not the pattern).

### `s2u-summary` and `s2u-summaries` -- the home's cards

Purpose: one destination's state in at most three short lines, one press from its section (MU.R23 (2); the scope brief,
section 3). Anatomy: `.s2u-summary__icon` (24px, gold), `.s2u-summary__title` (`type-panel-heading`) holding
`.s2u-summary__link` (stretched over the card), `.s2u-summary__lines` (a fourth line is hidden; each cut with an
ellipsis), `.s2u-summary__action` at the foot with its `.s2u-summary__prompt` (the Cross glyph, shown with the pad
focus only). Surface: `panel`, 1px `highlight` edge; hover and focus `tab-lit`. The card draws the one ring for a
keyboard or the pad (`:has(:focus-visible, .is-pad-focused)`; a mouse click draws none); the link draws none. At <= 720px a card is a row: icon, title, one line.
`.s2u-summaries`: one column, two from 720px, three from 1100px (the brief's gap 10).

### `s2u-navlinks` -- the project nav, icon + word

Purpose: the project's pages from the launcher's top bar and the reading pages' header. Anatomy: `nav.s2u-navlinks` of
`a.s2u-navlinks__link`, each an `s2u-icon` (20px; the live 18px is not adopted) and its word, `type-subtitle`, 44px;
hover `gold-display`; `aria-current` gold with a 2px bottom rule; the ring inside the link. In a `.s2u-topbar` at <=
640px the nav wraps to its own second row of plain words (`type-body-small`, no capitals), spread across the width.
Inside `.s2u-launcher` that two-row bar is `--s2u-bar-h-narrow-nav` high (the narrow 48px bar + one 44px row = 92px,
plus the top inset), and the sticky shelf and the frame's scroll reservation follow it; outside the launcher the bar
simply grows.

### `s2u-start--large`, the action bar's ready rule and error growth

`.s2u-start--large` (compose with `.s2u-tab.s2u-start`): 48px (`--s2u-hit-primary`), at least `--s2u-start-min-w`
180px (`--s2u-start-min-w-narrow` 124px at <= 640px), `type-tab`, a CSS play triangle before the word in the text
colour; `.s2u-start`'s states are unchanged. `.s2u-actionbar.is-ready`: the bar's top rule turns gold (a 1px gradient
layer in place of the `panel-edge` rule) when START can run. `.s2u-actionbar.is-error`: the bar grows to
`--s2u-action-h-error` (64 + `space-12` = 112px; 136px at <= 720px, the live bar's +48) and shows
`.s2u-actionbar__error` (warn, `type-body-small`, wrapped, never clipped; hidden in any other state).

### The frame's safe areas and the content's scroll reservation

The top bar takes `env(safe-area-inset-top)` on its height and padding, the action bar `env(safe-area-inset-bottom)`,
and every row (top bar, shelf, content, action bar) `max(gutter, the side inset)`, so a notched phone in landscape keeps
START's edge; the grid's first row holds the top inset and its last is the action bar's own height. `.s2u-launcher__content`
sets `scroll-padding-block: var(--s2u-space-6)`, so a control the pad walker scrolls into view is never flush to a bar;
on the phone frame, which scrolls as a whole under sticky bars, the frame reserves the bars plus `space-6` plus the
top and bottom insets, and the sticky shelf sits below the top bar's inset.

### `s2u-tip` -- a tip with its arrow

Ours, not the live look (a `ground` fill, a 1px `focus` edge, `text-strong`: legible beside the ring); the live arrow
only. Fixed, placed by the page; `data-side="below"` draws the arrow on its top edge pointing up, `"above"` on its
bottom; the page sets `--s2u-tip-arrow` to the arrow's x (50% by default). `z-index: --s2u-z-tip` (36: over the OSK,
under the scanlines). Forced colours: a `CanvasText` frame, no arrow. Not adopted: the live `panel` fill,
`gold-source` edge and 2px gold top.

### `s2u-tile__frame.is-guide` -- the empty picture's frame guide

An empty picture (a look card before its capture ships) draws a `ground-deep` frame, 72% x 78% (`.s2u-tile__frame--4x3`:
46%), over a 24px `panel-edge` grid on `panel`, instead of a black box; an `img` without `src` inside it is hidden.
`.s2u-tile__frame--4x3` only narrows the guide box; the frame's own aspect ratio is the page's to set.
Authored CSS, no asset (MU.R3). Forced colours: no grid, a `CanvasText` frame.

### The `server` mark (authored)

`icons.ts` gains `server` (two rack units, each with its lamp and a vent, in the guide marks' 1.5 stroke) for the
Server tile and the reading pages' nav: the live site has no such mark. The project's own work, the repository's
GPL-3.0; decorative like the others.

### Contrast

In `tokens.test.ts`: on the slot's ready fill `text-strong` 7.15, `text` 4.88, the `state-ready` edge 3.31 (`text-dim`
3.14 -- refused there); on the `ground-deep` icon tile `gold` 8.47, `text-strong` 16.37; on `panel` the slot's label
`gold` 6.21, its error `warn` 7.00, the fact panel's `gold-display` link 8.10 and `text-dim` 5.26; `text-strong` on
`tab` (the gradient's far end) 12.86; on `ground` the bar's error line `warn` 8.92, the ready rule `gold` 7.91, the
tip's edge `focus` 8.11.

### Not adopted

The community row and the four brand marks (MU.R22). The launcher's one Discord link is outside this set (LATER 291:
the console, Discord's official white symbol). The live 18px icons and its 3px focus offset (our 20px and 2px);
its `--s2u-teaser-*` reservations (ours: `--s2u-bar-h`, `--s2u-action-h`); the tip's live look, and its width:
ours stays 320px where the live override is 300px (`startup.css` l.205, over its own 320px at l.42); the fact columns'
3.2fr weights; the playtest's copy and any build note (MU.R23). The public name is LS-1/LS-2's rename (MU.R24, Q-A):
`emblem.svg` and this README still say "SOCOM 2 Legacy" until it lands.

## The check list's marks (1.4.0)

`s2u-list--check is-marks` (`components.css`, part F; the rendered design review r1, item 13): each item a grid row,
a 16px mark beside the text, every child under the text (a fix below its line); done draws the slot's authored check,
to-do the empty ring (the slot's circle), centred on the first line, in the item's colour; forced colours keep them.
Additive: the base list's `[X]` / `[ ]` glyphs stay for the reading pages. The mark is CSS only, so each item starts
with its state in words, visually hidden (it takes no grid cell):
`<li><span class="s2u-visually-hidden">Done: </span>Controller</li>` (or `To do: `).

## The Console launcher (1.5.0)

`components.css`, part G: the launcher's console layer, `cx-*`, from the owner's design export of 2026-10-11
(`components/bundle.css`, its "Console launcher (cx-*)" block, and the component READMEs). It is a 1920x1080 stage
drawn in rem (1rem = 16 design px) that the page scales by setting the root font-size: a header row, the crossbar
with its action list and readout, pushed screens (rooms, options), the legend with the disc chip and START, dialogs,
the on-screen keyboard, the launch screen and toasts, over one backdrop picture under graded veils.

Part G is the export's block verbatim, in its own `@layer s2u.components` block after parts A-F, with one mechanical
change: it reads the system's tokens by their `--s2u-` names (the export's `var(--gold)` is `var(--s2u-gold)` here),
so it needs no page tokens of its own. The 1.5.0 tokens it adds live in `base.css`'s first `:root` block, beside
1.1.0's, prefixed like every other: the backdrop veils (`--s2u-veil-strong`, `--s2u-veil`, `--s2u-veil-soft`,
`--s2u-veil-faint`, `--s2u-veil-clear`: `ground` at 95, 80, 40, 25 and 0%), `--s2u-row-veil` (`tab` at 95%) and
`--s2u-panel-veil` (`panel` at 95%), the stage's lengths (`--s2u-cx-safe-x` 6rem and `--s2u-cx-safe-y` 3.375rem, 5% of
the stage; `--s2u-cx-header-h`, `--s2u-cx-legend-h`, `--s2u-cx-cat-pitch`, `--s2u-cx-row-h`, `--s2u-cx-key-h`,
`--s2u-cx-list-w`), and the Console type roles (`--s2u-type-cx-title` to `--s2u-type-cx-figure`, each with its tracking
and italic). Text over the art sits on `row-veil` or `panel-veil`, never on the plain veils (`tokens.test.ts` holds
every text colour on both at 4.5:1 over white art).

The page must patch the DOM in place -- change a class, a text, the track's transform -- and never replace the
stage on every press: the crossbar's glide, the marks' scale and the focus transitions run only on elements that
stay. Focus is drawn as the export draws it: `.is-focused` on the element, and the ring on
`:root[data-input="pad"]`, so a pointer click draws none.

Part G is not held by the Briefing guards of parts A-F (square corners, no glow but the tokens): its pills, rounded
keys and gold glows are the export's own design. `css.test.ts` ("1.5.0") holds it instead: the block's hash with the
prefix taken off, every token it reads declared, its only colour literals the alpha-suffixed token colours it lists
(gold-display glows, the text-strong roll, the ground-deep scanlines, the panel fade), and no `!important`.

The backdrop is `backdrops/crossroads.jpg`: an authored picture of the Crossroads plaza at dusk made for the project,
project art, not a game picture -- no game screenshot ships with the page. A page shows it as the `img` inside
`.cx-backdrop` (the viewer reaches `shared/ds/` as `/src/ds/`, so `/src/ds/backdrops/crossroads.jpg`).

The fifteen components, each a README in the export: ConsoleFrame (the frame: the rem scaling, the backdrop's
states and veils, the safe area, the input mode and the motion rule; its classes `cx-app`, `cx-backdrop`, `cx-roll`,
`cx-toast`),
ConsoleHeader, Crossbar, ActionList, Readout, ScreenHead, RoomTable, RoomDrawer, OptionRows, ConsoleLegend,
SignInDialog, OnScreenKeyboard, Confirm, Toast and LaunchScreen. One class a README names has no rule: `cx-key`
(ConsoleLegend, ScreenHead: the L1 / R1 / L2 / R2 words), which the export draws as `.cx-shoulder` outlines; a page
uses those until the export says otherwise.

## The select-backed roller (part H, 1.6.0)

`components.css`, part H (MU2-8 of the SOCOM Legacy modern UI polish plan): part G's `.cx-roller` over a native `select`,
for a page whose rows are read by the browser's own controls (the modern UI's Settings and loadout editor) rather than a
console grammar. Part G stays the export's bytes; part H sits in the A-F block after part F, under A-F's guards.

```html
<div class="cx-roller cx-roller--select">
  <span class="cx-roller__label" id="row-1">Sound mode</span>
  <span class="cx-roller__ctl">
    <span class="cx-roller__step" data-step="-1" aria-hidden="true"><svg class="cx-ico">…</svg></span>
    <select class="cx-roller__value" aria-labelledby="row-1">…</select>
    <span class="cx-roller__step" data-step="1" aria-hidden="true"><svg class="cx-ico">…</svg></span>
  </span>
</div>
```

The select is the row's one stop (the pad's walk, the tab order, the arrows, a screen reader's name). The step marks
are the pointer's: no button and no tab stop, hidden from assistive technology, a press steps the select as its arrows
do. The page puts part G's `.is-focused` on the row while the select has the focus (the gold bar and the lit pill), as
the console's grammar puts it on its focused row. A disabled select keeps its value readable in `text-dim`, its marks
hidden; no opacity. Sized for a panel's row (`--s2u-hit-min`, `--s2u-type-tab`), not the console's stage.

## The Circle glyph's colour (1.7.0)

`--s2u-glyph-circle` (`#ee5a52`, `base.css`'s engineering tokens, so `tokens.json` stays the artifact's file) is the
○ glyph's red: **the owner's word, 2026-10-16** ("red, like the reference", the touch pad's reference image; the
SOCOM Legacy plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, MP-1). It names the Circle colour MU.R20 waited
for, brightened as the other glyphs are to read on the panels (4.6:1 on panel; 3:1 as a mark on every ground,
`tokens.test.ts`). The touch pad's ○ wears it. The hint bar's `.s2u-hint__glyph--circle` (warn), the prompts'
`.s2u-prompt__glyph--circle` and the console's `.cx-btn--circle` (the text colour) are unchanged until a change moves
them to it.

## The extraction popover (part I, 1.8.0)

`components.css`, part I (DX-2 of the SOCOM Legacy plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, FI.R7): the
console's dialog while the page copies the disc's files into the browser's storage, a browser adaptation with no
original (the original reads its own disc). Part G stays the export's bytes; part I sits in the A-F block after part H,
under A-F's guards, and each of its rules is one class more specific than the part G rule it meets.

```html
<div class="cx-scrim" data-key="extract"><div class="cx-dialog cx-extract is-copy" role="dialog" aria-modal="true">
  <h2 class="cx-dialog__title">EXTRACTING</h2>
  <div class="cx-extract__scene" aria-hidden="true">
    <svg class="cx-extract__disc">…<circle class="cx-extract__groove" …/>…</svg>
    <span class="cx-extract__lane"><i class="cx-extract__chip"></i><i class="cx-extract__chip"></i><i class="cx-extract__chip"></i></span>
    <span class="cx-extract__store"><span class="cx-extract__level" style="--s2u-progress: 0.43"></span><svg>…</svg></span>
  </div>
  <p class="cx-extract__file">MOVIES/…</p>
  <dl class="cx-extract__figs"><div><dt>Files</dt><dd>11 of 96</dd></div>…</dl>
  <div class="cx-bar cx-extract__bar" role="progressbar" aria-valuenow="43" …><i style="--s2u-progress: 0.43"></i></div>
  <p class="cx-extract__where">Kept in this browser's storage: the origin private file system.</p>
  <div class="cx-extract__legend"><button class="cx-extract__cancel is-focused">…</button>…</div>
</div></div>
```

The phase is the dialog's class: `.is-plan`, `.is-copy` and `.is-verify` turn the disc (`cx-extract-turn`, once per
5 x `dur-slow`, the slot's turn); only `.is-copy` streams the three file chips along the lane into the box
(`cx-extract-flow`, staggered); `.is-done` (the box in the ready colour) and `.is-error` stand still. The bar,
`.cx-bar.cx-extract__bar`, is part G's `.cx-bar` made determinate: its sweep off, its fill scaled by `--s2u-progress`
(0..1, set on the element, as `.s2u-loading__bar` reads it), and the box's `.cx-extract__level` rises by the same
value. Motion is the duration tokens only. Under `prefers-reduced-motion` it stands still -- base's 0s durations, and
part I's own block: no turning, no stream (the chips are not drawn) -- while the bar still fills, its value being the
markup's. Forced colours draw the chips, the level and the fill in `CanvasText`.

The words carry everything the scene draws (the scene is `aria-hidden`): the file in hand by its disc path, the files
and the bytes, where the files are kept, and DA.R3's line that the disc's files stay in the browser and are never
uploaded. A refusal uses part G's `.cx-field__error` and two `.cx-toggle` rows, each with its pad glyph (a focused
row's glyph turns `ground-deep`). Colours: text-strong, text, text-dim, warn and gold on `panel`; the marks (gold,
gold-display, the box's text) 3:1 on `panel` and `tab` (`tokens.test.ts`, "1.8.0").

At a phone's width the popover fits the viewport with a 16px gutter and wraps its lines, with no horizontal overflow:
its scrim's track may shrink below the dialog's content (`.cx-scrim:has(> .cx-extract)`, the one rule part I writes
outside `.cx-extract`, by its child only), the dialog is capped at the viewport less 2rem, and under 760px its padding
and title tighten. Part G's `.cx-scrim` and `.cx-dialog` are the export's and stay as they are. The SOCOM Legacy spec
`e2e/discExtract.spec.ts` holds it at 412x915.

## The home's scrolling list (part J, 1.9.0)

`components.css`, part J (CX-LEGEND of the SOCOM Legacy plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, issue
#238): the crossbar home's action list scrolls inside the stage, a browser adaptation with no original. Part G draws the
home for its 1920x1080 stage and gives it no scroll above the phone rule: `.cx-home` is laid over the stage and its
`.cx-home__body` is as tall as its `.cx-list`. Where the stage is shorter than the design's -- a page whose fit floors
the scale (the SOCOM Legacy console's 0.8 at 1280x720 and 1366x768), or a larger interface size -- a category with more
actions than the stage holds drew its lower rows past the stage, under `.cx-legend`, which comes later in the page and
took their clicks (Options > Account at 1280x720).

Above the phone rule (`width > 760px`) part J lets the body take the room the crossbar leaves (`flex: 1 1 0`) and
makes the list its own scroll container, stretched to that room, so the last row scrolls clear of the legend: the
wheel and touch scroll it natively, and a page keeps the pad's focused row in view by moving the list's `scrollTop`
(SOCOM Legacy marks it `data-scroll`, as its other lists, `src/console/render/frame.ts` `keepInView`). Its bar is hidden,
as `.s2u-shelf` and `.s2u-bar__nav` hide theirs. The list's padding is the room the pad's focus ring needs (part G
draws it `--s2u-focus-w` wide at a 3px offset past a focused `.cx-item`), given back by a negative margin above and
at the sides and added to its width, so the actions keep `--s2u-cx-list-w` and their place; none is taken below, so the
box ends where the stage does. A list that fits the stage is drawn where part G draws it; its box reaches the stage's
foot but draws nothing there. At 760px and below part G's own rule scrolls the stage and part J does not apply. Part G stays the
export's bytes; part J sits in the A-F block after part I, under A-F's guards, each rule one class more specific than
the part G rule it meets. The SOCOM Legacy spec `e2e/consoleRows.spec.ts` holds every row of every category to the pointer
at 1280x720, 1366x768 and 412x915.

## The screen head's Back (part K, 2.1.0)

`components.css`, part K (CX-37 of the SOCOM Legacy plan `docs/plans/2026-10-18-launcher-menu-and-history.md`): a pushed
launcher page draws a Back control (`.cx-back`) at the screen head's left, before the eyebrow and the title. A browser adaptation
with no original. The control is a chevron and the parent's name, clickable and tappable, and it acts as Circle (the
pad's Circle glyph shows while the page is in pad mode). It is hidden on Home. Part G's `.cx-screenhead` stays the
export's bytes; the button and the title share `.cx-screenhead__id`, so the head's checks stay at the other end. Part
K sits in the A-F block after part J, under A-F's guards, and reads tokens only.

Every pushed page has a header Back and a history entry. Back, Circle, the header Back and the browser's Back are one
action. A dialog has no path of its own; Back closes it first. The launcher in an iframe (overlay mode) never pushes
a history entry.

## The launcher's motion polish (2.2.0)

CX-54 (CX.R19, the owner, 2026-10-20: "a UI animation polish pass leaning towards the sony / socom feel of it").
Part L, from the A-F block after part K, under A-F's guards: part G stays the export's bytes, and each rule is one
class or element more specific than the part G rule it meets. Additive: one engineering token; no earlier class or
token is renamed.

- `--s2u-ease-settle` (base.css): `cubic-bezier(0.22, 1.12, 0.36, 1)` -- quick out, a slight overshoot, then rest. A
  dialog (`.cx-scrim .cx-dialog`, `cx-settle-pop`: up 0.5rem as it scales from 0.96) and the toast (`body .cx-toast`,
  `cx-settle-in`) settle in on it.
- The focused row (`.cx-app .cx-item.is-focused`) settles in by transform alone (`cx-focus`), and a soft gold glow
  (`--s2u-title-glow`) breathes on its `::after` (`cx-glow`, four `--s2u-dur-slow`), opacity only, taking no pointer.
  A split row keeps its plain focus.
- A press scales the focused row a touch (`scale(0.985)`): a pad's Cross through the root's `data-press="cross"`,
  which the page sets for the press, and a click through `:active`; START's `:active` the same.
- Reduced motion stops all of it, as everything else (base.css: every duration token `0s`, every transition and
  animation off). Nothing changes a box's size or place: no layout shift, and the animated properties are the
  compositor's (transform, opacity).

## The launcher's themes (part M, 2.3.0)

LR-1 of the SOCOM Legacy launcher redesign plan (`socomlegacy/docs/plans/2026-10-26-launcher-redesign.md`; LR.R8: the
artifact's new pieces are product-track adaptations and every colour is a `--s2u-*` token). A browser adaptation: the
launcher's look only, nothing of the game.

- base.css's first `:root` block carries the owner's Claude Design artifact's colours as `--s2u-lx-*` engineering
  tokens: the palette roles that stay the same under every theme (`--s2u-lx-accent`, `-accent-hi`, `-on-accent`,
  `-ink`, `-ink-hi`, `-good`, `-bad`, `-section`, the right panel's `-panel` and `-panel-from`, `-toast`, `-edge`,
  `-ring-ground`, `-meter`), the seven themes' sets (`--s2u-lx-theme-<id>-top|bottom|sheet|glow|trim`: Navy & Gold, Deep Water,
  Blackout, Night Ops, Jungle, Desert and Frost, the artifact's THEMES table transcribed), and the radii it draws
  (`--s2u-radius-lx-row` 4px, `--s2u-radius-lx-tile` 10px), and its motion (LR.R11: its timing is the bar):
  `--s2u-dur-lx-slide` 450ms (the rail's slide, the panel's entry), `--s2u-dur-lx-fade` 350ms (the label's fade),
  `--s2u-dur-lx-item` 380ms on `--s2u-ease-lx-pop` (an item's settle, its slight overshoot), each 0s under reduced
  motion as the system's durations are.
- The five live theme tokens (`--s2u-lx-sky-top`, `-sky-bottom`, `-sheet`, `-glow`, `-trim`) default to Navy & Gold.
  Part M, in the A-F block after part L, has one rule per theme on `:root[data-s2u-theme="<id>"]` pointing them at that
  theme's set; it styles nothing else. The launcher page sets the mark and draws its sheet backdrop from the same table
  (`socomlegacy/packages/viewer/src/console/render/theme.ts`, held equal to these tokens by its test).
- tokens.test.ts holds every value to the artifact's and every text role at 4.5:1 on the panel and the toast over each
  theme's sky and over white.

## The leaderboard mark (2.4.0)

LCM-16 of the LIVE cards plan (LCM.R18 (e)): `icons.ts` gains `leaderboard` (three podium blocks on a base line and a
medal over the tallest, in the guide marks' 1.5 stroke on the 24 grid) for the reading pages' nav, whose seventh link,
Leaderboard, it draws. Additive: no earlier mark, class or token changes. The project's own work, the repository's
GPL-3.0; decorative like the others. A browser adaptation: nothing of the game.

## Voice

For words on a page or a control: sentence case for supporting copy; the least text that makes it clear (MU.R19);
plain about what is not done -- say "Needs disc" or "Not available yet", never a flourish; keep the explanatory text beside a
disabled control; a player's words, no internals (agents, commits, sprint numbers) on a hand-written page -- a
generated section may show the repository's record, that is its point (MU.R7). A label says what happens, not how.
A status says the next step (1.3.0, from the live launcher's "Insert your disc to begin"): what to do, not what is
wrong.
