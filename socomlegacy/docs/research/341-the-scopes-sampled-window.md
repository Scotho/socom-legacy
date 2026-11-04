# 341 -- The scope's sampled window

SCUV-1, simulation track, 2026-10-16. Reading, pending original-source review; no original-running comparison.

## 1. The window

Research 84 section 9 records `ChangeReticule` (`FUN_00213e20`, D:L69434-69510) sampling both scope layers at
0.01-0.99 on both axes. `BitmapReticule_Init` (`FUN_002178c0`, D:L70870-70940) supplies the scope textures.
This host has neither the decompilation nor a scored original capture. The source citation is inherited from that
research note, not independently re-read here; original-source review is outstanding. The port had sampled the
entire 0-1 texture. `reticle.ts` now gives both scope maps offset (0.01, 0.01), repeat (0.98, 0.98), preserving
the original quad sizes, mirroring, bitmap pixels and weapon selection.

## 2. Disc sampling and stroke

Read on this host through `parseZdb` and `zdbMember`, `Zar.parse`, then `parseTextureRecord` and `readReticle`
(`viewer/src/hudBitmaps.ts`, which uses `decodeTexture` and the HUD's own palette). Every one of the 22
`RUN/MP*.ZDB` archives supplies `HUD2_TXR.ZED/textures/ret_scope_01.tif/texdat` and `ret_scope_02.tif/texdat`:
128 by 128 pixels, record `bilinear=true`, bind packet `gs.bilinear=true`, `gs.mipmaps=false`.
The two scope maps therefore use linear minification and magnification without mipmaps. Other reticle maps keep
their existing nearest filters; this task does not assert their original filtering. Disabling the optional UI
sampling experiment restores each scope's linear filters and keeps its UV window.

The decoded scope 01 stroke is two texels wide, not the one texel previously described in research 84:
at row 30, columns 126 and 127 both decode to RGBA (79, 78, 77, 187); column 125 is transparent.
At column 100, rows 0 and 1 have that same colour, row 2 is transparent. The sampled window retains the
inner stroke. Linear sampling's texel coordinate `u * 128 - 0.5` at 0.99 is 126.22, between the two inked
columns; at 0.01 it is 0.78, between the two inked rows. Thus the inset does not erase the aiming cross.
The all-map regression checks these decoded pixels in every archive, not a synthetic bitmap alone.

## 3. Verification and limits

`viewer/test/reticle.test.ts` checks both layers' four quads, UVs, filters, and disabled mipmaps. Its dev-disc
case enumerates all 22 multiplayer archives, reads both bind packets and decoded strokes, checks unchanged
texture data, and exercises experiment on/off restoration and preservation of unscoped nearest sampling.
The dev-disc case skips explicitly without `SOCOM_DISC` or the desktop disc tree under `SOCOM_PC_ROOT`.

Original-source re-reading and a console capture comparison remain owed. These tests inspect renderer inputs,
not GPU output, and establish no visual parity claim. No new placeholders are introduced: the window has a
recorded source, pending its original-source review, and the filtering and pixels were read from the disc.
