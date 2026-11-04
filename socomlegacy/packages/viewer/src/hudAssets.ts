import { Zar, zdbMember, type ZdbEntry } from '@s2u/archive';
import { PaletteTable, type Rgba } from '@s2u/gs';
import { decodeNamedTextures } from './hudBitmaps';

/**
 * The in-game HUD's bitmaps (socomlegacy/docs/research/87-hud.md): four texture libraries every `MP*.ZDB` carries under
 * `RUN\COMMON\`, each decoded against its **own** `_PAL` (research 72's caveat; `./hudBitmaps` for the reticle's
 * pair) -- `HUD_TXR` (37: the context-action icons and the pad's button faces), `HUD2_TXR` (72: the ammo box's
 * panel, the compass, the team list's pieces, the reticles), `HUDW_TXR` (65: the weapon icons and the fire-mode
 * round) and `FONT_TXR` (the HUD's font, `font_text_01.tif`, PSMT4 -- `@s2u/gs` reads it since this note -- and its pad
 * glyphs' `font_special_01.tif`).
 *
 * **The HUD's bitmaps are stored bottom row first.** Decoded as the world's are (row 0 of the decode is row 0 of
 * the stored texels), every one of them comes out upside down against the console frame: the M4's icon with its
 * magazine up, the compass's `N` mirrored, the font's `A` row at the bottom where `fonts.rdr`'s `UL (2 0)` puts it at
 * the top (measured 2026-09-28, research 87 §2). The reader flips them once here, so every consumer indexes them
 * top row first -- as `fonts.rdr`'s glyph rectangles and the frame's pixels do.
 */

/** Which bitmaps the HUD reads out of which library. The action icons are research 87 §5's list. */
export const HUD_LIBRARIES = {
  HUD: [
    'action_victory_dance.tif', 'action_climb.tif', 'action_slide.tif', 'action_door_open.tif', 'action_door_close.tif',
    'action_pickup_item.tif', 'action_pickup_item1.tif', 'action_pickup_item2.tif', 'action_mp_bomb.tif',
    'action_drop_mp_bomb.tif', 'action_defuse.tif', 'action_place_c4.tif', 'action_button.tif',
    'action_pull_lever.tif', 'action_mount_turret.tif', 'action_dismount_turret.tif', 'action_x.tif',
    'action_escortee.tif',                       // HX-4a: FOLLOW! / HOLD POSITION's (research 189 s3; 199 s6)
    // MATCH-05 (research 170 §5.2, §3.1): the voice element's icons (`FUN_00239570` D:L85949-85984, `FUN_00238f50`) and the
    // name tag's talk icon (`FUN_00227340`, S:0x3e5500), all HUD_TXR's on MP2, MP6 and MP72.
    'action_tune_team.tif', 'action_tune_defense.tif', 'action_tune_offense.tif', 'action_dead_zone.tif',
    'action_tune_spectators.tif', 'action_no_talk2.tif', 'action_ok_talk2.tif', 'action_channel_busy.tif',
  ],
  HUD2: [
    'tcm.tif', 'tcmarrow.tif',
    'newweapnbkrnd.tif', 'compass_lo.tif', 'compass_bkrnd.tif', 'team_background.tif', 'teammate_health.tif',
    // The tactical map's and the compass marks' (research 87 §9, §10): the view cone, the edge arrows, the marks' arrow,
    // and the nav letters C..Z.
    'fov.tif', 'hud_arrow_off2.tif', 'ret_triangle.tif',
    ...Array.from({ length: 24 }, (_, i) => `ret_nav_${String(i + 1).padStart(2, '0')}.tif`),
    // HX-5 (research 239 s5): EXTRACTION's compass marks, types 4 and 6 (`FUN_002126f0` D:L68576), 16x16 on MP2 and MP6.
    'ret_hostage.tif', 'ret_extraction.tif',
    // XR-06 (research 214 s3; 87 s1.7, HUD2 16x16; 239 s5.1, s9): the bomb's and the base's compass marks, types 1 and 2-3
    // (`FUN_002126f0` D:L68576) -- unlisted until now, so never read and never drawn.
    'ret_bomb.tif', 'ret_base.tif',
    // MATCH-05 (research 170 C9): the `WhoIsTalking` compass mark, type 9 (`FUN_002126f0` D:L68613).
    'hud_talk.tif',
  ],
  HUDW: ['m4carbine_icon.tif', 'mark23_icon.tif', 'firemode.tif', 'grenade_frag_icon.tif', 'grenade_he_icon.tif', 'grenade_smoke_icon.tif', 'grenade_flashbang_icon.tif', 'claymore_icon.tif', 'detonator_icon.tif'],
  // The face's second atlas, its pad glyphs (research 95 §5.4; `./hudFont` `FONT_SPECIAL_01`): WEAPON EXCHANGE's prompt.
  FONT: ['font_text_01.tif', 'font_special_01.tif'],
} as const;

export type HudBitmaps = Record<string, Rgba>;

/** The HUD's bitmaps that are no weapon icon (the others -- `HUDW_TXR`'s `*_icon.tif`, `m60e.tif` ... -- are icons). */
export const NOT_ICONS: ReadonlySet<string> = new Set([...HUD_LIBRARIES.HUD, ...HUD_LIBRARIES.HUD2, ...HUD_LIBRARIES.FONT, 'firemode.tif']);

/** A bitmap turned top row first (research 87 §2): the rows reversed, nothing else touched. */
export function flipRows(rgba: Rgba): Rgba {
  const { width, height } = rgba;
  const row = width * 4, out = new Uint8ClampedArray(rgba.data.length);
  for (let y = 0; y < height; y++) out.set(rgba.data.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return { width, height, data: out };
}

/**
 * The HUD's bitmaps out of a map archive, keyed by their lower-case file name, top row first. `weaponIcons` are more
 * of `HUDW_TXR`'s (web sprint 4: every firearm's `IconTextureName`, research 94 §C9 -- the weapon box's icon is the
 * held item's, `FUN_005be050` L85226-85230). A library that will not read costs its bitmaps and a diagnostic line,
 * never the map; the HUD draws what it has.
 */
export function readHud(bytes: Uint8Array, toc: ZdbEntry[], weaponIcons: readonly string[] = []): { bitmaps: HudBitmaps; diagnostics: string[] } {
  const bitmaps: HudBitmaps = {};
  const diagnostics: string[] = [];
  const libraries: Record<string, readonly string[]> = { ...HUD_LIBRARIES, HUDW: [...new Set([...HUD_LIBRARIES.HUDW, ...weaponIcons])] };
  for (const [lib, names] of Object.entries(libraries)) {
    let txr: Zar, pal: Zar;
    try {
      txr = Zar.parse(zdbMember(bytes, toc, `${lib}_TXR.ZED`));
      pal = Zar.parse(zdbMember(bytes, toc, `${lib}_PAL.ZED`));
    } catch (e) {
      diagnostics.push(`hud: ${lib}_TXR/${lib}_PAL.ZED: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const keys = txr.find('textures')?.children ?? [];
    const texdat = (name: string): Uint8Array | null => {
      const key = keys.find((k) => k.name.toLowerCase() === name);
      const child = key ? txr.child(key, 'texdat') : undefined;
      return key && child ? txr.data(child) : null;
    };
    const decoded = decodeNamedTextures(texdat, PaletteTable.fromZars([pal]), names);
    for (const d of decoded.diagnostics) diagnostics.push(`hud: ${d}`);
    for (const [name, rgba] of Object.entries(decoded.textures)) bitmaps[name] = flipRows(rgba);
  }
  return { bitmaps, diagnostics };
}
