import type { DialogDesign, DialogWidget } from '../dialog';
import { decodedCodes, engineCodes, locTextBytes } from './codes';

/**
 * A caption to the codes its text node draws (web research 111 §2, §7). A dialog's `CAPTION` goes to the text setter
 * with translation on (`FUN_003792f0` D:L273035 -> `FUN_003631f0` D:L260984-261045): a `_<n>_..._MSG` name the loaded
 * tables hold becomes that string; any other caption -- a literal, or a name no table holds -- is shown as it stands.
 * The id-to-text service is PLAT-04's `LocService` (`@s2u/scene`), taken here by its shape so the package needs no
 * import of it.
 */

/** `LocService.caption`'s answer (`@s2u/scene` `CaptionText`). */
export type CaptionResolution =
  | { kind: 'loc'; id: number; table: string; text: string }
  | { kind: 'literal'; text: string }
  | { kind: 'unresolved'; id: number | null; ref: string };

/**
 * What resolves a caption: `LocService` fits. `command` is its lookup of a `Caption` command's string id (the s16 at
 * +0xc, `FUN_0036fcc0` D:L268063-268070): with it a source also answers the scripts' `#NNN` captions and the popups'
 * texts (`locTextOf`); without it those draw nothing (ONL-01, research 144 §5).
 */
export interface CaptionSource {
  caption(caption: string): CaptionResolution;
  command?(cmd: { loc: number; arg: string }): CaptionResolution;
}

/** A UIMnLOC string by id through a source's `command`, for the widgets' and the popup's `locText`; null without one. */
export function locTextOf(captions: CaptionSource | null | undefined): (id: number) => string | null {
  return (id) => { const r = captions?.command?.({ loc: id, arg: '' }); return r?.kind === 'loc' ? r.text : null; };
}

/**
 * The codes a caption draws. A table's string is already decoded at load (`decodeLocText`, which agrees with the
 * engine's reader on the tables' bytes: research 111 §2), so its characters are its codes; a literal or an unresolved
 * name is the dialog's own bytes, read through the engine's decoder (`engineCodes`).
 */
export function captionCodes(caption: string, loc: CaptionSource | null): { codes: number[]; resolution: CaptionResolution } {
  const r: CaptionResolution = loc ? loc.caption(caption) : { kind: 'literal', text: caption };
  if (r.kind === 'loc') return { codes: decodedCodes(r.text), resolution: r };
  return { codes: engineCodes(r.kind === 'literal' ? r.text : r.ref), resolution: r };
}

/**
 * The bytes a caption's text node holds, as a byte string (one character a byte) -- what a setter that walks bytes
 * takes (WRAPPEDTEXT's `wrapLines`): a table's string back to its bytes (`locTextBytes`, LOC_TEXT_BYTES_READING), a
 * literal or an unresolved name as the dialog holds it.
 */
export function captionBytes(caption: string, loc: CaptionSource | null): string {
  const r: CaptionResolution = loc ? loc.caption(caption) : { kind: 'literal', text: caption };
  if (r.kind === 'loc') return locTextBytes(r.text);
  return r.kind === 'literal' ? r.text : r.ref;
}

/** `FUN_0036aff0` (D:L265383-265411; SECURETEXT's setter): one `*` for each character, the text not translated. */
export function secureCodes(codes: readonly number[]): number[] {
  return codes.map(() => 0x2a);
}

/** A caption a dialog holds, where it stands, and the face its widget names (`FONT`, else null). */
export interface DialogCaption { path: string; type: string; caption: string; font: string | null }

/**
 * Every caption of a dialog's design: its controls' and objects' (a text's `CAPTION`, a button's), a RADIOSTRIP's
 * subordinates', a HANDLERBUTTON's subordinate's, a MAPCONTROL's elements', and each LISTBOX option's cells.
 */
export function dialogCaptions(design: DialogDesign): DialogCaption[] {
  const out: DialogCaption[] = [];
  const visit = (path: string, w: DialogWidget): void => {
    switch (w.type) {
      case 'TEXT': case 'SECURETEXT': case 'CLOCK': case 'TELETYPE': case 'WRAPPEDTEXT': case 'SCROLLINGTEXT': case 'COUNTER':
        if (w.text.caption !== null) out.push({ path, type: w.type, caption: w.text.caption, font: w.text.font });
        return;
      case 'BUTTON': case 'HANDLERBUTTON': case 'SLIDERBAR': case 'CHECKBOX': case 'RADIOSTRIP':
        if (w.button.caption !== null) out.push({ path, type: w.type, caption: w.button.caption, font: w.button.font });
        if (w.type === 'RADIOSTRIP') for (const s of w.subordinates) visit(`${path}/${s.name}`, s.widget);
        if (w.type === 'HANDLERBUTTON' && w.subordinate) visit(`${path}/${w.subordinate.name}`, w.subordinate.widget);
        return;
      case 'LISTBOX':
        w.options.forEach((o, i) => o.captions.forEach((c, j) => out.push({ path: `${path}/option${i}/${j}`, type: w.type, caption: c, font: w.font })));
        return;
      case 'MAPCONTROL':
        w.elements.forEach((e, i) => visit(`${path}/element${i}`, e.widget));
        return;
      default:
        return;
    }
  };
  for (const r of design.controls) visit(r.name, r.widget);
  for (const r of design.objects) visit(r.name, r.widget);
  return out;
}
