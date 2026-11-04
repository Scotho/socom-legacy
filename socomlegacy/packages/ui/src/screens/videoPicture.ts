import type { DialogDesign, DialogSubordinate, DialogWidget } from '../dialog';
import type { UiBindingGate, UiCommandHandler } from '../uiCommands';
import { RadioStripWidget } from '../widgets/radioStrip';
import type { Widget } from '../widgets/host';

/**
 * OT.R79 (the owner, 2026-10-23: "please change these video options to our options that are rendered in the test room.
 * MODERN / PS2 / EXPERIMENTAL for now"; LATER 378) -- an intended divergence, a browser adaptation on the product track:
 * VIDEO's VIDEO MODE strip offers the page's three pictures, as `/testroom`'s picture selector names them, in place of the
 * PS2's INTERLACED / PROGRESSIVE SCAN (480p). The strip keeps the original's look -- its boxes are the disc's own
 * `VideoNTSC` / `VideoDTV` CHECKBOX specs (`dlgOptions_Video.rdr`), a third cloned from `VideoDTV` at the disc's own step
 * (200 -> 320, so 440) -- with literal captions in the disc's font, and none of the disc's box scripts: `video_ntsc` /
 * `video_dtv` (`SwitchProgressiveVideo`, the AreYouSure popups and the progressive-scan boot) are superseded. The card's
 * `video_mode` valve is never written here: a console card round-trips with its own value. The choice is the page's
 * (`s2u.viewer.picture`, viewer `./picture`), not the card's.
 */
export const VIDEO_PICTURE_ADAPTATION = 'OT.R79: VIDEO MODE offers the page\'s MODERN / PS2 / EXPERIMENTAL pictures' as const;

export type VideoPicture = 'modern' | 'ps2' | 'experimental';
/** The strip's order (the owner's): MODERN, PS2, EXPERIMENTAL. */
export const VIDEO_PICTURES: readonly VideoPicture[] = ['modern', 'ps2', 'experimental'];
/**
 * The boxes' captions, literal, in the disc's font. HD.R8 (the owner, 2026-10-31, OT.R92): the third is "HD (GoE Soul)"
 * (was EXPERIMENTAL) -- the Experimental picture with the HD texture pack, in every match (viewer `./picture`).
 */
export const VIDEO_PICTURE_CAPTIONS: readonly string[] = ['MODERN', 'PS2', 'HD (GoE Soul)'];
/**
 * HD-HOLD (the owner, 2026-11-01: "Hide/disable the HD pack. It's not ready until after the GPU work. leave it in the
 * build just don't allow people to turn it on"): false, VIDEO's strip shows MODERN and PS2 only, Home's Display "Video"
 * row the same, and the page's keeper (viewer `./picture`) neither stores nor reads the HD picture. True restores the third.
 */
export const VIDEO_PICTURE_HD_OFFERED: boolean = false;
/** The boxes' names: none the disc's scripts know, so no `video_ntsc` / `video_dtv` reaches them. */
export const VIDEO_PICTURE_BOXES: readonly string[] = ['PictureModern', 'PicturePS2', 'PictureExperimental'];
/** The boxes' check animations: none of the disc's sets holds them; the gate (`videoPictureGate`) takes their start. */
export const VIDEO_PICTURE_ANIMATIONS: readonly string[] = ['picture_modern', 'picture_ps2', 'picture_experimental'];
/** The front end's default picture (the merge controller's call B', 2026-10-23): MODERN, what the front end's match drew before OT.R79. */
export const VIDEO_PICTURE_DEFAULT: VideoPicture = 'modern';

export const VIDEO_PICTURE_DIALOG = 'dlgOptions_Video.rdr';
const STRIP = 'video_mode';

type Strip = Extract<DialogWidget, { type: 'RADIOSTRIP' }>;
type Box = Extract<DialogWidget, { type: 'CHECKBOX' }>;

/** VIDEO's design with the strip's three picture boxes (OT.R79); a design without the disc's two boxes as it was. */
export function videoPictureDesign(design: DialogDesign): DialogDesign {
  const at = design.controls.findIndex((c) => c.name === STRIP && c.widget.type === 'RADIOSTRIP');
  if (at < 0) return design;
  const strip = design.controls[at]!.widget as Strip;
  const ntsc = strip.subordinates.find((s) => s.name === 'VideoNTSC'), dtv = strip.subordinates.find((s) => s.name === 'VideoDTV');
  if (!ntsc || !dtv || ntsc.widget.type !== 'CHECKBOX' || dtv.widget.type !== 'CHECKBOX') return design;
  const step = dtv.x - ntsc.x;                                                  // the disc's 120
  const box = (from: DialogSubordinate, i: number): DialogSubordinate => {
    const w = from.widget as Box;
    return {
      ...from, name: VIDEO_PICTURE_BOXES[i]!, x: ntsc.x + step * i,
      widget: {
        ...w, button: { ...w.button, caption: VIDEO_PICTURE_CAPTIONS[i]! },
        onCheck: { ...w.onCheck, animation: VIDEO_PICTURE_ANIMATIONS[i]!, argument: null },
      },
    };
  };
  const subordinates = VIDEO_PICTURE_HD_OFFERED ? [box(ntsc, 0), box(dtv, 1), box(dtv, 2)] : [box(ntsc, 0), box(dtv, 1)];
  return { ...design, controls: design.controls.map((c, i) => (i === at ? { ...c, widget: { ...strip, subordinates } } : c)) };
}

/** A dialog lookup with VIDEO's design passed through `videoPictureDesign` once (the lookup caches its designs). */
export function videoPictureLookup(lookup: (name: string) => DialogDesign | null): (name: string) => DialogDesign | null {
  let patched: { from: DialogDesign; to: DialogDesign } | null = null;
  return (name) => {
    const d = lookup(name);
    if (!d || name.toLowerCase() !== VIDEO_PICTURE_DIALOG.toLowerCase()) return d;
    if (patched?.from !== d) patched = { from: d, to: videoPictureDesign(d) };
    return patched.to;
  };
}

/** Whether a built design is VIDEO's with the picture boxes. */
export function isVideoPictureDesign(design: DialogDesign): boolean {
  const strip = design.controls.find((c) => c.name === STRIP)?.widget;
  return strip?.type === 'RADIOSTRIP' && strip.subordinates.some((s) => s.name === VIDEO_PICTURE_BOXES[0]);
}

/** The gate that takes a picture box's check (its animation, no disc set's) and hands the page the picture. */
export function videoPictureGate(set: (picture: VideoPicture) => void): UiBindingGate {
  return (b) => {
    const i = b.animation === null ? -1 : VIDEO_PICTURE_ANIMATIONS.indexOf(b.animation.toLowerCase());
    if (i < 0) return false;
    if (VIDEO_PICTURES[i] === 'experimental' && !VIDEO_PICTURE_HD_OFFERED) return true;   // HD-HOLD
    set(VIDEO_PICTURES[i]!);
    return true;
  };
}

/**
 * `CheckVideoMode` (UI command 126, `FUN_0027c070` D:L125311-125332): whether the PS2's output is in the mode named --
 * `NTSC` the interlaced mode 0 (`DAT_004a44f5` 0), `DTV` progressive 2. The page draws the 448-line frame always (mode
 * 0): `NTSC` true, `DTV` false -- except on VIDEO, where OT.R79's strip shows the page's picture and the disc's
 * `Initialize_Options_Stuff` / `OnVideoBack` must not move it: there both answer false.
 */
export function checkVideoMode(dialog: () => string | null): UiCommandHandler {
  return (cmd) => {
    if ((dialog() ?? '').toLowerCase() === VIDEO_PICTURE_DIALOG.toLowerCase()) return false;
    return cmd.arg.toUpperCase() === 'NTSC';
  };
}

/** The strip set to the page's picture when VIDEO is built (before its first tick applies and checks the box). */
export function selectVideoPicture(widgets: { get(name: string): Widget | undefined }, picture: VideoPicture): boolean {
  const strip = widgets.get(STRIP);
  if (!(strip instanceof RadioStripWidget)) return false;
  strip.selection = Math.max(0, VIDEO_PICTURES.indexOf(picture));
  return true;
}
