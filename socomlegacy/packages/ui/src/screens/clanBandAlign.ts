import type { DialogDesign, DialogRecord } from '../dialog';

/**
 * CLAN_BAND_ALIGN_ADAPTATION (product track; **an intended divergence** from the original, on the owner's knowing word,
 * 2026-11-18, relayed by the main controller: "the home page clan messages area has a bug where it has a left padding
 * whereas the news of the day section does not. Please fix that" -- and, told it is the disc's own layout: "Please fix
 * that, i know it's an adation from the original and it's a prefered one").
 *
 * The disc (`dlgWorldOfSOCOM.rdr`; `tools/dump-dialogs.ts --dialog dlgWorldOfSOCOM.rdr --tree`) holds SOCOM II ONLINE's
 * MESSAGES pane as the news band `DescFieldMid` (a CONTROLS IMAGE at x 176, 448 wide), the news title `DescriptionText`
 * (x 185) and the news body `motd` (a WRAPPEDTEXT at x 205), with the "Clan messages" band as `motd`'s children: a second
 * `DescFieldMid` (`brown_back.tif`, at -14 from `motd`: x 191, 450 wide -- inset 15 and past the window's right edge),
 * `ClanMessageText` #775 and `ClanMessages` (at -5: x 200). The page moves those three only: the band to the news band's
 * x and width, the title to the news title's x, the text to the news body's x -- each read off the same design, so the
 * patch follows the disc's own figures. Everything else -- the rows, the heights, the scripts -- is the disc's, and the
 * disc's design is untouched underneath (a new design is returned).
 */
export const CLAN_BAND_ALIGN_ADAPTATION =
  "the clan messages band and text aligned with the news band and text -- an intended divergence, the owner's word: \"i know it's an adation from the original and it's a prefered one\"" as const;

export const CLAN_BAND_DIALOG = 'dlgWorldOfSOCOM.rdr';
const PARENT = 'motd';

/** `dlgWorldOfSOCOM.rdr`'s design with the clan band aligned (`CLAN_BAND_ALIGN_ADAPTATION`); a design without the parts, as it is. */
export function clanBandAlignDesign(design: DialogDesign): DialogDesign {
  const all = [...design.controls, ...design.objects];
  const top = (name: string): DialogRecord | undefined => all.find((r) => r.name === name && r.childOf === null);
  const motd = top(PARENT), newsBand = top('DescFieldMid'), newsTitle = top('DescriptionText');
  if (!motd || !newsBand || !newsTitle || newsBand.widget.type !== 'IMAGE') return design;
  const width = newsBand.widget.image.size[0];
  const move = (r: DialogRecord): DialogRecord => {
    if (r.childOf !== PARENT) return r;
    if (r.name === 'DescFieldMid' && r.widget.type === 'IMAGE') {
      return { ...r, x: newsBand.x - motd.x, widget: { ...r.widget, image: { ...r.widget.image, size: [width, r.widget.image.size[1]] } } };
    }
    if (r.name === 'ClanMessageText') return { ...r, x: newsTitle.x - motd.x };
    if (r.name === 'ClanMessages') return { ...r, x: 0 };
    return r;
  };
  return { ...design, controls: design.controls.map(move), objects: design.objects.map(move) };
}

/** A dialog lookup with SOCOM II ONLINE's design passed through `clanBandAlignDesign` once (the lookup caches its designs). */
export function clanBandAlignLookup(lookup: (name: string) => DialogDesign | null): (name: string) => DialogDesign | null {
  let patched: { from: DialogDesign; to: DialogDesign } | null = null;
  return (name) => {
    const d = lookup(name);
    if (!d || name.toLowerCase() !== CLAN_BAND_DIALOG.toLowerCase()) return d;
    if (patched?.from !== d) patched = { from: d, to: clanBandAlignDesign(d) };
    return patched.to;
  };
}
