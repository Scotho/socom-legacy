# 212 -- The R2 menu drawn: `CWeaponSel`'s column, rows, arrows, words and motion, read from the code

Written 2026-10-05 for web sprint 25, from the owner's report on the alive R2 menu as built: "quickswap menu needs a LOT
of work. i hope this was not approved without a reference or knowledge?" and "The original is the reference. disregard
any past claims that were made." This note is the reading phase. The capture of the original that settles what it
leaves open comes from a separate agent, and the build follows both (§10).

Sources: the retail decompilation `C:/Projects/socom_pc/game/analysis/socom2_game.elf.decomp.c` (`D:L<n>` = its
line); the retail ELF `game/disc/socom2_game.elf`, read by address through its program headers, for the static
initializers the decompiler did not emit, a float the decompilation dropped, `.data` values and strings; the disc's
`RUN/LOCALE/STATES/HUDCLOC.ZAR` through `@s2u/scene` `readLocArchive`; the HUD's bitmaps in the `MP2.ZDB` fixture
through `packages/viewer/src/hudAssets.ts` `readHud`. The member names in §1 are checked against reCOM's `hud.h` (the
public SOCOM I reconstruction, `Not-Enough-Photons/reCOM`, `class CWeaponSel`), which is corroboration only: SOCOM I is
another build. No game or emulator was run. No decompiled text is pasted.

Grades: **reading** = transcribed from the code or the disc and **pending review** (nobody but the author has re-read
it at the source); **unresolved** = the code does not settle it, so a capture is owed. Nothing here is proven.

## 0. Answers

1. **The menu is a column in the left of the frame, above the weapon box, and not a panel on it.** Its backdrop runs
   from x 0 to 160 and from y 168 to 354. Its three rows hold item icons at y 174, 234 and 294, and the highlighted
   row is the middle one. The column's three heights are static-initializer values: `DAT_003e4a90` = 354,
   `DAT_003e4a98` = 230, `DAT_003e4aa0` = 168. The initializer at 0x3fe500 (a constructor-table entry at 0x404d4c)
   writes them as the weapon box's top (`DAT_003e2ff8` = 364.0) less 10, less 134 and less 196. The menu's bottom
   therefore stands 10 px above the weapon box's top (reading, §2).
2. **The port's y of 298 is wrong, and so is its panel.** The grey (80, 80, 80) rectangle, 66 tall at `DAT_003e4a98`,
   is not the menu's backdrop. It is `+0x3b0`, an untextured box the class flashes when the weapon changes while the
   menu is **closed** (§7). The port drew that box with the texture, at the wrong y, as the menu (§8).
3. **The backdrop is `newweapnbkrnd.tif`**, the weapon box's own bitmap (HUD2, 128x64), in three pieces: a 5-px top
   cap, a stretched middle and a 5-px bottom cap. It is drawn at tint 128 and fades in from alpha 0 to 76.8 (0.6) over
   0.5 s from the open (reading, §3.1).
4. **Three rows, each with an icon and no bar.** The rows are the previous takeable slot, the highlighted slot and the
   next takeable slot, each drawn as its item's `IconTextureName` icon at native size and x 14. The highlighted icon
   is at alpha 128 and the two neighbours are at 40. That alpha is the only highlight: the class keeps a pulsing value
   (`+0xcb4`, 0.1..0.7) that nothing draws (reading, §3.2, §5).
5. **Two arrows**: `hud_arrow_off2.tif` 32x32, centred on the column. One points up with its top at y 168. The other
   is turned half a turn, with its bottom at y 354. Their grey pulses 60..120 on the GS's 128 scale at 250/s, at alpha
   70. The arrow on the side stepped toward flashes (reading, §3.3).
6. **The words.** Under the highlighted icon, at scale 0.9 in the HUD's font: the item's DisplayName upper-cased at
   pen (14, 278); `"%d/%d"` (rounds in the slot's magazine / Ammo_Capacity) right-aligned to x 148 on the same line;
   `"$1s MAGS"` or `"1 MAG"` (HUDCLOC 60482 / 60483) at (14, 292). All three are (128, 128, 128) at alpha 80, the
   HUD's colour. The Designator (item 11) shows its name only (reading, §4).
7. **The shoulder tags read "QUICK 1" and "QUICK 2"**, not "L1" and "L2". They are HUDCLOC 60525 and 60526, the
   strings 0xec6d and 0xec6e. A tag is drawn right-aligned to x 148 at y 292, when the highlighted slot is that
   shoulder's. Its colour is the teal (55, 140, 130) at alpha 80 (reading, §4.2).
8. **Motion at 30 Hz** (§6): the open takes 3 frames, the backdrop's fade 15 frames, a step's scroll 2 frames, and
   the close 5 frames. On the close the column, the arrows and the words go at once. The two neighbour icons then
   slide into the middle row, and the middle icon collapses to nothing.
9. **The weapon box stays.** No code that hides or moves it reads the menu's state, and the two do not overlap (reading
   by absence, §7).
10. **The draw goes through the port's own HUD machinery.** The bitmaps are already in `readHud`'s HUD2 and HUDW sets.
    The drawing layer (`./weaponSelect` `drawWeaponSelect`) centres x on the frame. The menu belongs to the weapon box's
    left column, so it takes `./hud`'s left anchor (§9).

## 1. The class and the order it draws in

`CWeaponSel` lives at `CHUD+0x1a50`. `CHUD`'s Init `FUN_001fa360` calls its Init `FUN_0021cd40` (D:L57432) and
registers it on the HUD's list 1 (D:L57433), the render phase 13 list that WEAPON EXCHANGE's slot list also draws on
(`./weaponSelect` `DRAW_ORDER`). The constructor is `FUN_0021d760` (D:L73228-73282). Its parts, with reCOM's names:

| offset | part | reCOM name |
|---|---|---|
| +0x20, +0xa0, +0x120, +0x1a0 | four icon bitmaps (stride 0x80): previous, highlighted, next, incoming | `m_weaponicon[4]` |
| +0x220..+0x22c | the four icons' slots | -- |
| +0x230, +0x2b0, +0x330 | the backdrop: middle, top cap, bottom cap | `m_weaponselbkrnd` (one bitmap in SOCOM I) |
| +0x3b0 | the closed menu's change flash (§7) | `m_selectionback` |
| +0x430, +0x620 | the up and down arrows (two `C2DBitmapPoly`) | `m_arrow[2]` |
| +0x810, +0x8a8 | the QUICK 1 and QUICK 2 tags (`CHudBrightText`, vtable 0x4050c0) | `m_hotswapL1text`, `m_hotswapL2text` |
| +0x940 | the name (`CHudBrightText`) | `m_weaponname` |
| +0x9d8, +0xa70 | a description and an ammo type (`C2DString`), always hidden (§4) | `m_weapondescription`, `m_ammotype` |
| +0xb08, +0xba0 | the rounds and the magazines (`CHudBrightText`) | `m_ammocount`, `m_magcount` |
| +0xc58 | the state, 0..7 | `m_openstate` |
| +0xc64, +0xc68 | the icon inset, 4.0 and 4.0 (D:L73264-73265) | `m_iconoffsetx/y` |
| +0xc6c, +0xc70 | the goal x, y | `m_menugoalx/y` |
| +0xc74..+0xc80, +0xc84..+0xc90 | the four icons' x and y | `m_menuposx[4]`, `m_menuposy[4]` |
| +0xc94, +0xc98, +0xc9c, +0xca0 | the icon's centre line, start x, current and goal height | `m_menucentery` ... `m_goalheight` |
| +0xcb4 / +0xcb8 | the pulsing value nothing draws (§5) | `m_curcolor`, `m_incCurcolor` |
| +0xcbc / +0xcc0 | the arrows' grey and its direction | `m_arrowcolor`, `m_arrowincrement` |
| +0xcc4, +0xcc8, +0xccc | `.TCM_SELECT`, `.TCM_SLIDE`, `.TCM_SLIDE` (D:L73209-73213) | `m_selectsound`, `m_scrollupsound`, `m_scrolldownsound` |

**The draw order** (reading). The Init appends each part to the class's own list with `FUN_001feae0`, which inserts
before the list's head (a push to the back), in this order (D:L73061-73147): the middle backdrop (+0x230), the flash
box (+0x3b0), the previous icon (+0x20), the incoming icon (+0x1a0), the next icon (+0x120), the highlighted icon
(+0xa0), the up arrow (+0x430), the down arrow (+0x620), QUICK 1 (+0x810), QUICK 2 (+0x8a8), the name (+0x940),
+0x9d8, +0xa70, the rounds (+0xb08), the magazines (+0xba0), the top cap (+0x2b0), the bottom cap (+0x330). The class
draws through vtable slot +0xc, `FUN_00364e70` (D:L262104-262115). When the class is visible, that function walks the
list from its first entry forward and draws each child (D:L262113). So the parts draw in the list's order. The two
caps draw last, over the arrows' rows, but the arrow bitmap's transparent rows sit there (§3.3), so nothing is
covered in practice.

The parts show and hide through the 2D object's flag bit 6. Vtable +0x18 (`FUN_00364e50`, D:L262096) clears it and
+0x1c (`FUN_00364e30`, D:L262086) sets it. Vtable +0x34 sets the alpha: a bitmap's +0x3c (`FUN_00364860`,
D:L261832) and a string's +0x54 (`FUN_001f9150`).

## 2. The column's place: `+0xc88`, `DAT_003e4a98` and their writers

**`+0xc88`, the highlighted row's y** (the icon's top is `+0xc88` + 4). It is written:

- by the Init, to `DAT_003e4a98` (D:L73166);
- by the open `FUN_0021c6f0`, to `DAT_003e4a98` (D:L72895), with the goal y `+0xc70` the same (D:L72845);
- by state 1 `FUN_0021c4e0`, moving it toward `+0xc70` at 475/s (D:L72760-72772), where it already is;
- by the scroll states 4 and 5 (`FUN_0021b820` D:L72392-72472, `FUN_0021b500` D:L72311-72390), as the rows move, and
  by the rotation at a scroll's end (`FUN_0021a700` D:L71890-71943, `FUN_0021a8d0` D:L71945-71998). The rotation hands
  the highlighted row's y back to the row arriving at the middle, so between steps it is always `DAT_003e4a98`.

**`+0xc78`, the highlighted row's x** (the icon's left is `+0xc78` + 4). It is written:

- by the Init, to 30.0 (D:L73165), a value no draw shows;
- by the open, to 0 (D:L72894), with the goal x `+0xc6c` set to 10.0 (D:L72846);
- by state 1, toward 10 at 475/s (D:L72747-72759);
- by state 7, back toward the start x `+0xc98` (0, set at the open, D:L72896) at 475/s (D:L71647-71668);
- by the rotations, as `+0xc88` is.

So in state 3, the menu as it stands, x is 10 and the icon's left edge is at 14.

**`DAT_003e4a98` and its two neighbours.** The ELF's image holds 0.0 at 0x3e4a90, 0x3e4a98 and 0x3e4aa0. No function
the decompiler emitted stores to them; it only reads them (D:L71786, L71867, L71873, L72845, L72895, L73053,
L73166-73171). A scan of the ELF's instructions for `lui`/`addiu`-based accesses finds the one writer at
0x3fe500-0x3fe544. It is a static initializer the decompiler did not emit, listed in the constructor table at
0x404d4c between 0x3fe490 and 0x3fe550. It loads `DAT_003e2ff8` and stores:

| global | value | what it is |
|---|---|---|
| `DAT_003e4a90` | `DAT_003e2ff8` - 10 = **354** | the column's bottom (the down arrow's bottom, the bottom cap's lower edge) |
| `DAT_003e4a98` | `DAT_003e4a90` - 124 = **230** | the highlighted row's y (`+0xc88`); the flash box's top (§7) |
| `DAT_003e4aa0` | `DAT_003e4a90` - 186 = **168** | the column's top (the up arrow's top, the top cap's upper edge) |

`DAT_003e2ff8` is 364.0 in the ELF's `.data` (0x43b60000). No instruction stores to it, and the same scan finds only
reads. It is the weapon box's top: `CHUD`'s Init writes 364 to its panel's y (D:L57284, `0x43b60000`), and the port's
`HUD_LAYOUT.ammo.panel` starts at 364. A second static initializer derives the info box from it the same way
(`DAT_003e4f60` = `DAT_003e2ff8` + 35, D:L327805).

All of this is a reading. The values come from instructions and `.data`, and a capture checks them (§10, C1).

## 3. The sprites

### 3.1 The backdrop (+0x230, +0x2b0, +0x330)

- **Texture**: `newweapnbkrnd.tif` (`PTR_s_newweapnbkrnd_tif_003e3048`, D:L73047, `+0xc38`). It is in `HUD2_TXR`
  and is 128x64. Measured through `readHud` on `MP2.ZDB`, every row is the same: x 0-122 are (34, 45, 50) at alpha
  209/255 and x 123-127 are (62, 82, 91) at alpha 239/255. That is a dark slate with a lighter strip at the right
  edge, about 6 px wide once the bitmap is stretched to 160. It is the weapon box's panel bitmap
  (`HUD_LAYOUT.ammo.panel`).
- **Rectangles** (the Init, D:L73167-73172; the bottom one's last corner, which the decompilation drops, is 354 in the
  instructions at 0x21d458-0x21d480). The width is `DAT_0040c108` = 160 (D:L73037).
  - top cap (+0x2b0): x 0..160, y 168..173;
  - middle (+0x230): x 0..160, y 173..349;
  - bottom cap (+0x330): x 0..160, y 349..354.
- **Texture rows** (the constructor's `FUN_00364830`, D:L73277-73279; `FUN_003646d0` sets only the rectangle and the
  texture, D:L261748-261769, so these survive the Init). The top cap samples rows 0 .. 0.078125 (5 of 64), the middle
  the single row at 0.5, and the bottom cap rows 0.921875 .. 1. Every row of this bitmap is the same, so the column
  looks like one 160x186 quad of the bitmap.
- **Tint** 128 (the 2D quad's default corner colours, research 112 §1). Nothing in the class sets it.
- **Alpha**: shown at the open (D:L72897-72899). Each frame `FUN_00219c80` adds the frame's time to `DAT_003dc620`
  (reset to 0 at the open, D:L72928) and sets the three pieces' alpha to min(2t, 1) x `DAT_003e3000` (D:L71670-71684).
  `DAT_003e3000` is 76.8 in `.data`, the weapon box panel's 0.6 (`HUD_COLOURS.panel`). The fade stops at t = 0.5
  (`DAT_003dc620` = -1, D:L71682).
- **Hidden** at once by every close (§6.4).

### 3.2 The icons (+0x20, +0xa0, +0x120, +0x1a0)

- **Texture**: the slot's item record's icon (`FUN_005be110`, D:L474800-474827). It returns the record's +0xbc, the
  texture of its `IconTextureName`: key 0x3fcb20 into +0x14 (D:L322514-322517), resolved into +0xbc by `FUN_003c4700`
  (D:L316303-316312). A slot at or past the kit's count, or an empty one, gives 0, and a textured quad with no texture
  draws nothing (research 112 §1). The icons are in `HUDW_TXR`. Measured: `m4carbine_icon.tif` 128x32,
  `mark23_icon.tif` 64x32, `grenade_frag_icon.tif` 32x32, `claymore_icon.tif` 64x32, `detonator_icon.tif` 32x32,
  `thermal_icon.tif` 64x32.
- **Size**: native. `FUN_00364770` sets the quad's size from the texture's header (D:L261773-261806).
- **Place in state 3** (`FUN_00219a80`, D:L71562-71600, each at the row's x and y + the 4/4 inset):
  - previous (+0x20): (14, 174), at y `+0xc84` = 230 - 60;
  - highlighted (+0xa0): (14, 234);
  - next (+0x120): (14, 294), at y `+0xc8c` = 230 + 60.

  The 60 is `+0xc70` = 60.0, set at the end of state 1 (D:L72779), and state 2 places the neighbours from it
  (D:L71626-71633).
- **Alpha**: 40 for all four and 128 for the highlighted one, set at the open (D:L72923-72927) and again after every
  scroll (D:L71931-71935, L71986-71990). During a scroll the outgoing and incoming middle icons cross between 127 and
  40 (§6.2).
- **The incoming icon** (+0x1a0) is shown only while a scroll runs: at the far row of the side being scrolled from,
  at alpha 40 (§6.2).

### 3.3 The arrows (+0x430 up, +0x620 down)

- **Texture**: `hud_arrow_off2.tif` (`FUN_001fba30(0, PTR_s_hud_arrow_off2_tif_003e3068)`, D:L73049). It is in
  `HUD2_TXR` and is 32x32. Measured: its ink is in rows 8-22 (the tip at row 8, the base x 5-26 at rows 21-22). It
  points up, top row first, as `./weaponSelect` `ARROW_ORIENT` measured.
- **Geometry**: built in state 2 by `FUN_0021a5c0` (D:L71849-71888) with `C2DBitmapPoly`'s Load `FUN_00359590`
  (D:L71870, L71874), from four corners each. The width w and height h are the texture's (32, 32), and the x span is
  (160 - w)/2 .. (160 + w)/2 = 64..96.
  - up: the texture's corners (0,0), (0,1), (1,1), (1,0) at (64, 168), (64, 200), (96, 200), (96, 168). It stands
    upright and points up.
  - down: the same corners at (96, 354), (96, 322), (64, 322), (64, 354). That is the up arrow turned half a turn, so
    it points down. A half turn of this left-right symmetric arrow is the same as `ARROW_ORIENT.down`'s top-to-bottom
    mirror.
  - The up arrow alone gets UVs (0, 0.05) .. (1, 1) on its four corners (`FUN_00359140`, D:L73079). That is a 5% crop
    of its top rows, which hold no ink (unresolved whether Load resets UVs; either way it changes no pixel).
- **Colour and alpha**: the Init sets both to grey 50 and alpha 70 (D:L73081-73084). The arrows' colour goes through
  the polygon's vertex colour (`FUN_003590e0` SetColor), on the scale `./weaponSelect` reads as
  `ARROW_TINT_SCALE_READING`.
  - Idle (state 3, both greys equal, `FUN_0021bb50` D:L72474-72550): the grey `+0xcbc` moves at 250/s, up to 120 then
    down to 60 and back (D:L72522-72545). It starts at 50 rising (D:L73085-73086), so the pulse's period is 0.48 s.
  - A step: the arrow on the side stepped toward goes to alpha 128 and grey 100, the other to grey 60 (Up:
    D:L72084-72086; Down: the converse, D:L72153-72155). After the scroll (state 3 again) both are set to alpha 70
    (D:L71923, L71978). The lit grey then falls at 500/s to the other's (D:L72495-72520). When it reaches it, that
    arrow's alpha is set to 100 (D:L72503) and the shared pulse resumes. So after the first step, the last-lit arrow
    stays at alpha 100 and the other at 70 (reading; how the vertex alpha slot of the polygon class maps is
    unresolved, C4).
- **Shown** in state 2. A scroll leaves them shown and only recolours them (D:L72084-72086); every close hides them at
  once (§6.4).

## 4. The words

All five strings use the HUD's font (`+0xc50`, `CHUD+0x498`: `font_text_01`, D:L57277-57279) at scale 0.9
(`0x3f666666`, the first argument of every vtable +0x7c call, which sets the scale and calls the Load
`C2DString_Load_PCcP7C2DFontii`). Their colour is the string's +0x48..+0x54 (r, g, b, a), which the draw reads
(`FUN_00362900`, D:L260696-260705). The y passed is the y `./hud` treats as the baseline: the weapon box's `"%d/%d"`
at 382 goes through the same class and font (`./hudFont` `TEXT_V`, research 87 §3).

### 4.1 The item's name, rounds and magazines (`FUN_002193d0`, D:L71389-71460)

`FUN_002193d0` runs at the end of the open (state 2, D:L71878) and after each scroll (D:L71936, L71991). It places the
words at pen x `+0xc78` + 4 = 14 and y `+0xc88` + 48 = 278 (D:L71401-71402):

- **name** (+0x940): the record's DisplayName (`FUN_005be240` -> `FUN_003d2830`, the record's +8, which the parser
  fills from the `DisplayName` key with `FUN_003d2b30`, D:L322168-322172). It is copied to an 80-byte buffer
  (D:L71416) and upper-cased (`FUN_001fcd00`, D:L58289-58307: `toupper` per byte), then drawn at (14, 278).
- **rounds** (+0xb08): `"%d/%d"` (the string at 0x3e4ae8, D:L71424) of the slot's magazine rounds (`FUN_005c38a0`:
  the slot's current magazine in the kit's ten per slot, kit +0x1d4) and the record's Ammo_Capacity (`FUN_005c3cf0`
  -> `FUN_003d2810`, the record's +0x28). It is placed at x 94 and y 278, then measured (`FUN_00362b70`) and moved to
  x = int(148 - width) (D:L71426-71431), which right-aligns it to 148. It is hidden when the capacity is 0
  (D:L71420-71421).
- **magazines** (+0xba0): n = the slot's magazines holding rounds (`FUN_005c4970`, the ten counted) less 1, or 0 when
  none hold rounds (D:L71432-71436). For n = 0 it is hidden. For n = 1 it shows HUDCLOC 0xec43 = 60483, "1 MAG"
  (D:L71441). For n of 2 or more it shows 0xec42 = 60482, "$1s MAGS" with n (`FUN_001fe120`, D:L71444). It is drawn
  at (14, 278 + 14 = 292) (D:L71447-71449).
- **the Designator**: when the slot's record is item 11, the ammo type, the rounds and the magazines are hidden
  (D:L71451-71456), so the Designator shows its name only.
- The description (+0x9d8) and the ammo type (+0xa70) are hidden on every call (D:L71404-71405). The class carries
  them, but SOCOM II never shows them.
- **Colour**: the Init copies `DAT_00408e40..4c` into each of the five (D:L73109-73140). `CHUD`'s Init sets those to
  128, 128, 128 and alpha 80 before it calls this Init (D:L57244-57247). That replaces a static initializer's (120, 60,
  95, 80) (`FUN_003fda40`, D:L327576-327585). This is the HUD's text colour (`HUD_COLOURS.text`).

For a throwable, the ten magazine counts were not traced in this note's original pass (C5). MLS-EQ re-read their
independent initialization, selected-slot decrement and display accessors in research 361 §1-2 (2026-10-23,
reading, pending review): the current magazine over capacity, with nonempty magazines less one for MAGS.

### 4.2 The QUICK tags (`FUN_002196f0`, D:L71464-71520)

`FUN_002196f0` runs at the end of the open (D:L71877), after each scroll (D:L71937, L71992) and after an L1 or L2
assignment inside the menu (D:L72641, L72657). It reads the controller's shoulder slots (`ctrl+0x224` L1, `+0x228` L2,
D:L71477-71479). When the two differ (D:L71482):

- if the highlighted row's slot (`+0x224` of the class, the middle icon's) is L1's, +0x810 gets HUDCLOC 0xec6d =
  60525, **"QUICK 1"** (D:L71487). Otherwise it is hidden.
- if it is L2's, +0x8a8 gets 0xec6e = 60526, **"QUICK 2"** (D:L71503). Otherwise it is hidden.

Each tag is first placed at x int(`+0xc78` + 80) = 90, then measured and moved to x = int(148 - width), y =
int(`+0xc88` + 62) = 292 (D:L71483-71495, L71499-71511). That right-aligns it to 148 on the magazines' line.

**Colour**: the Init writes the tags' +0x48..+0x54 as 55, 140, 130, 80 (D:L73093-73104), a teal at alpha 80. The
constructor's alpha is 80 too (D:L73237, L73240). The strings in the ELF at 0x3e4b30 / 0x3e4b38 ("l1" / "l2") are only
the Init's and the open's placeholder captions (D:L72913-72918, L73203-73208). `FUN_002196f0` replaces them before
either tag is first shown.

The strings, read from `HUDCLOC.ZAR` with `readLocArchive`: 60482 `_60482_MAGS_MSG_sCount` "$1s MAGS"; 60483
`_60483_MAG_MSG` "1 MAG"; 60525 `_60525_QUICK1_MSG` "QUICK 1"; 60526 `_60526_QUICK2_MSG` "QUICK 2".

## 5. The rows: which items, how many

- **Three rows are visible**: the previous, the highlighted and the next. At the open the highlighted row is the slot
  in the hand (`FUN_005be040`, D:L72814, L72848). The previous is the first slot below it, going down and wrapping
  over the kit's count, that `FUN_005bdc30` lets be taken up. The next is the first such slot above it
  (D:L72849-72884). So only takeable slots appear. With two takeable slots, the other one shows both above and below.
  With one, the slot shows in all three rows. The search would not end with none, but the open is refused before that.
- **A fourth icon** shows only during a scroll (§6.2).
- **The selection highlight is only the alpha**: 128 for the middle row and 40 for the others. There is no bar,
  frame or tint. The pulsing value `+0xcb4` (0.1..0.7 at 0.3/s, D:L72588-72619) is written each state-3 frame but read
  by nothing in the class (searched: the class's functions D:L71389-73282 read `+0xcb4` only to step it). It is SOCOM
  I's `m_curcolor`, left behind.
- **The words** are the highlighted row's only (§4). The neighbours carry icons and nothing else.

## 6. Motion, at 30 Hz (dt = 1/30 s)

### 6.1 The open (states 0, 1, 2)

1. **Frame 0, the press** (`FUN_00219c80` state 0, D:L71615-71621 -> `FUN_0021c6f0`):
   - The backdrop is shown, and the fade gives it alpha min(2/30, 1) x 76.8 = 5.1.
   - The highlighted icon is shown at height 0, so it is invisible. `FUN_00219940` (D:L71523-71560) draws the icon
     between `+0xc94` (17.5) +/- half of `+0xc9c`, the current height. That height is `+0xca0` (35) x (x - start) /
     goal, and it is 0 at x = 0.
2. **Frame 1, state 1** (`FUN_0021c4e0`, D:L72734-72798):
   - x moves 0 -> 10. At 475/s it would take 15.8 px a frame, so it is clamped and arrives at once.
   - The height becomes 35, so the icon shows whole at (14, 234). The clamp limits the height to the texture's own,
     D:L71546-71551.
   - The state ends: the two neighbours are shown at the middle row's place, under the highlighted icon, which draws
     after them (D:L72774-72795).
3. **Frame 2, state 2** (D:L71626-71633):
   - The neighbours move to +/-60.
   - `FUN_0021a5c0` builds and shows the arrows, writes the QUICK tag and the words, sets state 3 and plays
     `.TCM_SELECT` (D:L71877-71883).
4. **Frame 3**: the first frame that reads a button.
5. **Frame 14**: the backdrop reaches 76.8.

### 6.2 A step (states 4 and 5)

Up (pad byte +5) runs `FUN_0021abf0` (D:L72041-72109), state 4:

- The incoming slot (the next takeable after the next) is shown at (14, 294) at alpha 40.
- The up arrow is lit (§3.3), and `.TCM_SLIDE` plays.
- The tags and the words are hidden (D:L72097-72103).

Each frame of state 4 (`FUN_0021b820`), at 950/s (475 x 2):

- The highlighted icon rises toward y 170 and the next toward 230, while the previous and the incoming stay put.
- The two that move cross their alphas: the outgoing middle is (1 - f) x 87 + 40 and the arriving one f x 87 + 40, f
  going 0 -> 1 (D:L72457-72463).

At 30 Hz:

- frame 1 moves 31.7 px, with alphas 81 and 86;
- frame 2 arrives, and the rotation `FUN_0021a700` (D:L71890-71943) renames the rows, hides the incoming icon, resets
  the alphas (40 / 128), writes the words and the tag, and returns to state 3.

So the scroll is visible for 2 frames, and frame 3 reads buttons again.

Down (+6) is the mirror: `FUN_0021ae50` (D:L72111-72178), state 5 `FUN_0021b500`, and the rotation `FUN_0021a8d0`. The
previous icon comes down into the middle row, and the incoming icon waits at (14, 174).

At a step's end both rotations set `CHUD`-side flag `+0xb1` (via the class's +0x18, D:L71926, L71981). The reticle's
update reads that flag to hold its change (`FUN_00216770` region, D:L70392-70410). That is the reticle, not this
menu's look, and it is not modelled here.

### 6.3 Inside, idle

The arrows pulse (§3.3). Nothing else moves. Assigning L1 or L2 rewrites the tag at once (D:L72641, L72657).

### 6.4 Closing (states 6 and 7)

Every close enters state 6 with the same block: on Triangle (D:L72661-72679), on a confirm or the 5 s idle
(D:L72705-72721), on death inside the menu (D:L72571-72587), and from `FUN_0021b3e0` and `FUN_0021cba0`. The block:

- hides the backdrop's three pieces and both arrows **at once** (no fade-out);
- hides the tags and the five words;
- clears the reticle hold.

Then:

1. **State 6** (`FUN_0021b140`, D:L72201-72280): the previous and the next icons slide to the middle row at 475/s,
   15.8 px a frame. At 30 Hz they sit at 185.8 / 274.2, 201.7 / 258.3 and 217.5 / 242.5. In the fourth frame they
   arrive, and the state ends in that frame: both are hidden, and the height is reset to 35 for state 7
   (D:L72262-72277).
2. **State 7** (`FUN_00219c80`, D:L71647-71668): x returns 10 -> 0 at 475/s, which is clamped to one frame. The
   height becomes 35 x (x / 10) = 0, so the highlighted icon collapses to nothing. `FUN_0021aaa0` (D:L72000-72037)
   then hides every part and sets state 0.

So the close takes 5 frames. Frames 1-3 show the three icons converging, frame 4 the highlighted icon alone, and frame
5 nothing. A death seen by `CHUD` (`DAT_00408f08` set and the body not alive) closes it in one frame instead: it calls
`FUN_0021b3e0`, `FUN_0021b0a0` and `FUN_0021aaa0` together (D:L56632-56636).

## 7. The weapon box, and the flash the port mistook for the menu

**The box stays** (reading by absence). The weapon box is `CHUD+0x1a700`. It is hidden by `FUN_00237de0` and shown by
`FUN_00237e50`. Their callers are the tactical map's toggles `FUN_001f71c0` / `FUN_001f7030`, the scope's
(D:L56217-56229), the zoom's, the scoreboard's (D:L56810) and the HUD's show (D:L57180). None reads `CWeaponSel`'s
state (`CHUD+0x26a8`). No reference to it is found in the decompilation. The menu's bottom (354) is 10 px above the
box's top (364), so the two never overlap.

**The flash** (`+0x3b0`): this is what the port drew as the menu.

- **Built**: the Init builds it as an untextured box (vtable +0x20 with 0, D:L73052). It spans (0, `DAT_003e4a98`) to
  (160, `DAT_003e4a98` + 66), so x 0..160 and y 230..296 (D:L73053). Its tint is (80, 80, 80) (D:L73054), it is
  alpha-blended (D:L73055), and it starts at alpha 0 and hidden.
- **When it shows**: `FUN_0021a1f0` (D:L71763-71830) runs every frame, open or closed. With the body alive and the box
  hidden, it shows the box when the kit's "changed" flag is set (kit +4, D:L71778). The take-up `FUN_005c4b10` sets
  that flag whenever a different slot is taken up (D:L478841), for example by a plain L1 or L2 press. Then, when the
  highlighted icon (+0xa0) is not already showing, it does two things:
  - it puts the slot in the hand's icon at (14, 234) (D:L71786);
  - it writes the shoulder's QUICK tag at x 90, right-aligned to 148, y 292, at alpha 0 (D:L71789-71815).

  The flag is cleared every frame (D:L71825).
- **Animation** (`FUN_00219fb0`, D:L71692-71760, run every frame), while the menu is closed:
  - the box's alpha rises at 512/s (`+0x3cc` = 2.0 x 256) to 64. The 64 is the argument the decompilation drops at
    D:L71731, read from the instructions at 0x21a0b8-0x21a0dc;
  - it then falls at 256/s to 0, which takes 0.125 s up and 0.25 s down, about 4 and 8 frames;
  - the tag's alpha rises at 320/s, is set to 80 at the peak and falls at 160/s;
  - at 0 the box, the icon and the tag are hidden.

  While the menu is open (state not 0), the box is hidden at once (D:L71749-71754).

So on every weapon change outside the menu, the original flashes a dim grey box over the middle of the column's
place. The box holds the new item's icon and, when the item is on a shoulder, its QUICK tag. The port has no such
flash (searched `inventoryMenu.ts`, `hud.ts`, `main.ts`).

## 8. The port as built, against this reading

`packages/viewer/src/inventoryMenu.ts` at this branch's base (73a157ea) draws one panel, one icon and one tag:

| the port | this reading |
|---|---|
| `INVENTORY_PANEL_READING` {x 0, y 298, w 160, h 66}: `newweapnbkrnd.tif` | the backdrop is x 0..160, y 168..354 (§3.1). The 66 tall and the 80 tint are the flash box's (§7), which is untextured and at y 230, not 298 |
| `INVENTORY_PANEL_RGB_READING` (80, 80, 80) at alpha 128 | the backdrop's tint is 128 at alpha 76.8 after a 0.5 s fade. The 80 is the flash box's |
| the icon at (4, 302) | three icons at (14, 174 / 234 / 294), alpha 40 / 128 / 40 (§3.2) |
| `INVENTORY_BIND_TEXT_READING` "L1" / "L2" in (128, 128, 128) at alpha 128, right to 148 at 360 | "QUICK 1" / "QUICK 2" in (55, 140, 130) at alpha 80, right to 148 at 292 (§4.2) |
| no arrows, no name, no rounds, no magazines | two arrows; name, rounds and magazines (§3.3, §4.1) |
| no open, scroll or close motion | §6 |
| `drawWeaponSelect`'s x, centred on the frame | the weapon box's left anchor (§9) |
| -- | the closed menu's change flash (§7) |

`INVENTORY_ICON_INSET` (4), `INVENTORY_BIND_TAG.right` (148), `.dy` (62) and `.scale` (0.9) agree with this reading.
The behaviour named in research 94 §4.6 (the buttons, the gates, the per-body reset) is not touched by any of this.
One timing difference from the original stood in the behaviour as first built: the original reads no button until
frame 3 after the open (§6.1) and none during a scroll's 2 frames (§6.2), while the port's menu read from the next
frame. The review round of 2026-10-05 found what it cost: a Down in the frame after R2 (the development keyboard's I
then ArrowDown, always) started a scroll over the open's unfinished rows -- the incoming icon at (4, 4), the middle
sliding from x 4, and no arrows for the rest of that open. The port now reads, as the original does, only in state 3:
a button in states 1-2 or 4-5 is lost and the idle count stands (`InventoryMenu.press`). `INVENTORY_OPEN_INPUT_READING`
is retired (§14).

## 9. In the port: the machinery to reuse

- **Bitmaps**: `newweapnbkrnd.tif` and `hud_arrow_off2.tif` are in `HUD_LIBRARIES.HUD2`. The icons are `HUDW`'s,
  loaded by `IconTextureName` (`readHud`'s `weaponIcons`, `main.ts` `slotIcon`). The font is `FONT_TEXT_01`. Nothing
  new needs loading.
- **Text**: `./hudFont` `layoutText` and `textWidth`, with the shadow pass, as `drawWeaponSelect` already does for
  the strings. Right-alignment is `148 - textWidth(text, 0.9)`.
- **The anchor**: `./hud` `hudLayout` draws the weapon box with `L(x) = x * s` (the left edge) and `Y(y) = y * s`.
  `drawWeaponSelect` uses `X(x) = width/2 + (x - 320) * s`, which agrees only in the 4:3 PS2 presentation. On a wide
  canvas, the centred x puts the column right of the box's column. The menu draw should take the left anchor, through
  an option on `drawWeaponSelect` or a draw of its own on the same quads.
- **The arrows**: `./weaponSelect`'s `ARROW_ORIENT.up` / `.down` and `ARROW_TINT_SCALE_READING` serve as they stand.
- **The layer**: the overlay's layer 1 (`hud.setOverlay`), as now. The original registers the class on `CHUD`'s list 1
  (§1), and the menu overlaps nothing of the in-round HUD.
- **The pass**: `e2e/hud.spec.ts` checks the HUD's elements against `console_spawn_slot8.png` within a pixel, by
  cross-correlation over each element's box. A menu frame from the capture can be scored the same way.

## 10. Unresolved, and what would settle each

| # | what | why the code does not settle it | settled by |
|---|---|---|---|
| C1 | the column's place on the console frame (168..354, rows at 174 / 234 / 294) | read from instructions and `.data`; the GS's screen offset (`DAT_0049ea00/04`) is runtime, as the HUD's fit already treats it | a PCSX2 frame with R2 held in a round: the backdrop's edges and the three icons' boxes |
| C2 | the words' vertical, against the icons | the font's runtime offsets (`./hudFont` `TEXT_V`, `PEN_NUDGE`) are fitted on the weapon box's lines only | the same frame: the name's and the tags' ink rows |
| C3 | the backdrop's and the tags' look in alpha | the GS blend of a 209/255 bitmap at 76.8/128, and a teal at 80/128 over the world | the same frame, a plain and a busy background |
| C4 | the arrows' alpha after a step (100 / 70) and their grey on screen | the polygon class's vtable +0x34 and its vertex colour scale are not traced (`ARROW_TINT_SCALE_READING`) | two frames, before and after a step |
| C5 | what "MAGS" reads for a throwable or equipment slot | the original pass left the slot's ten magazines untraced; source read in MLS-EQ, research 361 §1-2 (reading, pending review) | source review; original-runtime frame after a throw still owed |
| C6 | the open, scroll and close frame counts | read at 30 Hz from the rates; the game's frame time on the console is assumed 1/30 | a capture at the console's rate through one open, one step and one close |
| C7 | the flash on a plain L1 / L2 swap (§7) | read; not yet seen | a capture of an L1 press with the menu closed |

After the capture (§11), C1, C2 and C6 are checked as far as the capture can check them, C3 agrees within the
capture's colour measurements, C5 is answered for a full throwable (3/3, no MAGS), and C4 and C7 remain open (§14).

## 11. The capture of the original, against this reading (2026-10-05)

The capture: our recompilation of the original (`socom_pc` 60d2dad6, its own frame file, 640x448), in an online
Frostfire match on our local server, by a separate capture agent. Images in that agent's scratch, not in the tree
(goldens wait for their own task, RS.R8). Key frames: `a02_hud_no_menu`, `c01_menu_open_still`, `c02_menu_open`; the
rows Down and Up `d01`-`d12`; the time-out `d13`-`d15`; L1 / L2 inside `e00`-`e10`; Cross `g00`-`g04`; a grenade in
hand `h00`, `h01`; bursts at about 150 ms. Grades below: **capture** = measured on those frames, by the capture agent
or by this note's author where it says so.

| what | this reading | the capture | verdict |
|---|---|---|---|
| the column | x 0..160, y 168..354 | x 0-159, y 168-353, flush left, a 10 px gap above the weapon box (y 364-439) | agree |
| the backdrop | `newweapnbkrnd.tif` at 0.6, lighter strip from texel 123 (x 154 on 160) | blended about 43% toward (34, 45, 50), a strip at x 154-159 about 49% toward (62, 82, 91); the box the same | agree |
| the highlighted icon | (14, 234), the texture's own size | the author's cross-correlation of the two M4A1 icons on `c02`: the menu's is the weapon box's moved by exactly (-6, -155), i.e. at (14, 234) given the box's (20, 389), which `e2e/hud.spec.ts` holds within a pixel; the agent's ink edges (x 13, y 232-262) are the icon's ink, not its texture rows | agree |
| the neighbours | (14, 174) and (14, 294), alpha 40 of 128 | top y about 175-200, bottom about 300-330, "faint, about 30% contrast", no text | agree (40/128 = 31%) |
| the order | Down = the previous slot, Up the next | Down from the M4A1: HE, M67, MARK 23, M4A1 (the kit's slots 3, 2, 1, 0) | agree |
| the arrows | 32x32 at x 64..96; ink x 69-90; up ink y 176-190, down 331-345 | x 69-90; y about 172-189 and 331-346; "the shade pulses (dark, light, invisible)" | agree within the background (the previous icon lies under the up arrow); the pulse is the grey 60..120 on a dark bitmap |
| the words | name at pen (14, 278), rounds right to 148, MAGS at (14, 292) | line 1 ink y 265-277: the name at x 14, the count right to x 147; line 2 279-291: "5 MAGS" (guns only) and the tag | agree (the port's font fit puts a 0.9 line's ink 13 rows above its baseline) |
| the text colour | (128, 128, 128) at 80, the HUD's | about (170, 170, 171), the same as the weapon box's text | agree |
| the tag | "QUICK 1" / "QUICK 2", (55, 140, 130) at 80 | "QUICK 1" / "QUICK 2" in about (78, 171, 171), on the highlighted item only | agree (55/128 and 140/128 of the font's white at 80/128 over the slate give about (84, 174, 174)) |
| a throwable | its count over Ammo_Capacity; MAGS from its magazines | "HE 3/3", "M67 3/3", no MAGS line | agree for a full throwable |
| the highlight | alpha only, no bar | "no highlight bar: centred, full opacity, with text" | agree |
| the open | stacked one frame, spread the next; the backdrop fading 0.5 s | icons stacked at +0.16 s, the panel, text and arrows by +0.2-0.35 s | agree within the sampling (about 150 ms, from a pad file's press) |
| the close | 5 frames; the column, arrows, words at once | panel, text, arrows gone by +0.2 s while the neighbours slide in; all gone by +0.37 s | agree within the sampling |
| a row change | 2 frames; the words hidden meanwhile | text hidden while the icons slide (+0.1-0.2 s), new text by +0.3 s | agree within the sampling |
| the weapon box | stays, unchanged | keeps the item in hand while the menu is open; changes when Cross equips | agree |
| the time-out | 5.0 s (L72705) | open at 3 s, closed at 6 s | agree |
| Cross / Triangle / L1 / L2 | take and close; close; set a unique tag and stay open | the same; the tag moves off its old holder | agree (the behaviour of research 94 §4.6) |
| the shoulders after a round restart | -- | QUICK 2 put on the M67 at 03:52 (`e05`) still on it at 04:03 (`l02`, `l03`), round timers between showing restarts | see §12 |

Nothing in the capture contradicts the reading. Where the agent's numbers differ by a pixel or two (the icon's edges,
the up arrow's top), the difference is the bitmap's ink against its texture rows or the busy background under the up
arrow. The author's own correlation and profiles, taken on the same frames, agree with the reading to the pixel.

## 12. The shoulders across a respawn and a round's restart

The port reset L1 and L2 to slots 0 and 1 at every spawn, reading "a new body" from the SEAL factory `FUN_00599690`
(L455422), which calls the controller's constructor `FUN_00598280` (`CSealCtrl_ctor`, L454785-454786: +0x224 = 0,
+0x228 = 1.0). The capture shows the shoulders surviving round restarts. The code agrees:

- A respawn or a round's restart does not run the factory. It runs `FUN_005994a0` (`FUN_00547350`, L412713) ->
  `FUN_00599b60` (`CZSealBody_ReCreate`). ReCreate saves the body's controller (`+0xc0`, D:L455634), re-makes the body
  in place and hands the same controller to `FUN_00599f00` (`CZSealBody_PostCreateSeal`, D:L455674). No
  `FUN_00598280` runs on that path.
- The stores to `+0x224` / `+0x228` in `FUN_00599f00` (D:L455838-455839) are to the body (its first argument), not to
  the controller.

So the shoulders are reset only when a new controller is made: the factory, on a body's first creation (the match's
registration, `FUN_002bf070` L162596). The port now resets them on a new map's first body (`InventoryMenu.spawned`,
from `main.ts` `show`), and keeps them through every respawn (`InventoryMenu.respawned`, from `spawnKit`). This is a
reading, pending review, and the capture is consistent with it.

## 13. The build (2026-10-05)

`packages/viewer/src/inventoryMenu.ts` draws the class as §1-§6 read it, frame by frame:

- `MenuVisual` holds the class's draw state: the state 0-7, the four icons' slots, places, shown and alpha, the
  heights, the fade, and the arrows.
- `openVisual`, `stepVisual` and `closeVisual` set a press's state, and `pressedTick` runs that frame's remainder.
  `tickVisual` runs a frame of `FUN_00219c80` with no press.
- `inventoryLayout` turns the state into the draw list, in the class's list order.
- `InventoryMenu.frame` runs the behaviour and then the draw's frame. `draw` hands the list to `./weaponSelect`
  `drawWeaponSelect` with the weapon box's left anchor (`anchor: 'left'`, new).
- A sprite may now name a window of its bitmap (`WsSprite.src`), for the backdrop's caps.

The words come from the page (`InventoryHost.info`, `main.ts` `slotInfo`):

- the record's id and DisplayName;
- a firearm's magazine as the weapon box reads it (`Fire.magazineOf`, new);
- an equipment slot's count left over its Ammo_Capacity.

The behaviour changes the capture and the coordinator asked for:

- A confirm the page refuses leaves the menu open (`take` false).
- The menu's gate is `FUN_005a8cb0` whole (`main.ts` `kitChangeGate`: the page's half and the mover's, on the ground
  with no action). A confirm asks the shoulder press's gate (`shoulderGate`).
- The shoulders survive a respawn (§12).

In the review round (2026-10-05), outside the menu: the weapon box drew its three fire-mode rounds with a grenade in
hand, where the capture's `h00` / `h01` show none. `FUN_005bc300` refuses the item in the hand's class (grenade,
explosive, gear, armour, turret) and the caller hides the four cells (L85207-85219); `./hud` `HudModel.fireModeRow`,
set off by `main.ts` while a throwable, a charge or the Detonator is up.

Not built: the closed menu's change flash (§7). The sounds remain unwired. The open's and a scroll's unread frames are
built in the review round (§8).

Tests:

- `test/inventoryMenu.test.ts` covers the layout constants, each part's place, size, colour and alpha, the draw order,
  the open, a step each way and the close frame by frame at 30 Hz, the arrows' pulse, the tags, the left anchor and the
  capture's measured shift.
- `test/inventoryMenuDisc.test.ts` (dev-disc) checks the four strings against HUDCLOC and the two bitmaps against
  `MP2.ZDB`.
- `test/fire.test.ts` covers `magazineOf`.

## 14. Readings

| name | what is unknown | reading | settled by |
|---|---|---|---|
| `INVENTORY_ARROW_ALPHA_READING` | the arrows' alpha through the polygon class (`C2DBitmapPoly`) vtable +0x34 | read as its alpha, as every 2D object's: 70 idle, 128 on the side stepped toward, 100 once settled (§3.3) | the polygon vtable's +0x34 read, or two frames before and after a step |
| `INVENTORY_THROWABLE_COUNT_READING` | original-runtime result after a throw not yet measured | current slot magazine over Ammo_Capacity; MAGS is that slot's nonempty magazines less one. The disc's hand throwable/charge records carry one magazine, so no MAGS line (research 361 §1-2, reading, pending review); the earlier capture shows full HE/M67 3/3 | MLS-EQ source read, pending independent review; capture after a throw still owed |
| `INVENTORY_CHANGE_FLASH_READING` (*note only*) | the closed menu's change flash (§7): not built | read: the grey box at y 230..296, alpha up to 64 and down over 0.375 s, with the new item's icon and its QUICK tag | a capture of an L1 press with the menu closed, then the build |
| `INVENTORY_OPEN_INPUT_READING` (*retired* 2026-10-05, the review round) | -- | built: only state 3 reads a button, the open's states 1-2 and a scroll's 4-5 none (§8) | -- |
| `INVENTORY_PANEL_READING` (*retired* 2026-10-05) | -- | replaced by `INVENTORY_COLUMN` (§2) | -- |
| `INVENTORY_PANEL_RGB_READING` (*retired* 2026-10-05) | -- | replaced by `INVENTORY_FADE` (§3.1) | -- |
| `INVENTORY_BIND_TEXT_READING` (*retired* 2026-10-05) | -- | replaced by `INVENTORY_TAG` (§4.2) | -- |
