import { setScreenFilterTail } from './brightness';
import type { ColourFilter } from './videoSettings';

/**
 * VS-5 (VS.R6; the video settings design §4.2, §7): the Colour filter row -- a colour-vision-deficiency simulation over
 * the game's whole picture. A browser adaptation with no original: the game has no such filter. It remaps every pixel
 * by the same matrix (the HUD included: the match's HUD draws into the match's canvas, `Hud.render` on its renderer) and
 * changes nothing the game draws or decides.
 *
 * The mechanism is the brightness pass's (`./brightness`, research 358): a CSS `filter` on the screen element. The matrix
 * is an SVG `feColorMatrix` the document holds once, referenced by `url("#...")` (the serialized form, quoted) after
 * the brightness term on the same element (`setScreenFilterTail`): the two compose, brightness then the matrix, and
 * neither replaces the other.
 *
 * The matrices: Machado, Oliveira and Fernandes, "A Physiologically-based Model for Simulation of Color Vision
 * Deficiency", IEEE TVCG 15(6), 2009 -- the published severity-1.0 (dichromat) matrices for protanopia, deuteranopia and
 * tritanopia, applied in linear RGB as the model is (`color-interpolation-filters="linearRGB"`). Each row sums to 1 (to the
 * table's six decimals): white and greys are kept.
 */
export const COLOUR_FILTER_ADAPTATION = 'VS.R6: colour-blindness simulation filters over the picture; a browser adaptation, no original' as const;

type Row = readonly [number, number, number];
type Matrix = readonly [Row, Row, Row];

/** Machado et al. 2009, severity 1.0, RGB rows (linear RGB). */
export const COLOUR_FILTER_MATRICES: Readonly<Record<Exclude<ColourFilter, 'off'>, Matrix>> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const IDENTITY: Matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** A kind's `feColorMatrix` values: the 4x5 row-major matrix, no offsets, alpha kept. Off is the identity. */
export function colourMatrixValues(kind: ColourFilter): number[] {
  const m = kind === 'off' ? IDENTITY : COLOUR_FILTER_MATRICES[kind];
  return [...m[0], 0, 0, ...m[1], 0, 0, ...m[2], 0, 0, 0, 0, 0, 1, 0];
}

/** The filter's element id in the document. */
export function colourFilterId(kind: Exclude<ColourFilter, 'off'>): string { return `s2u-colour-filter-${kind}`; }

const SVG = 'http://www.w3.org/2000/svg';
const DEFS_ID = 's2u-colour-filters';

/** The three filters' definitions in this document, made once: a zero-size, hidden SVG holding three `<filter>`s. */
function ensureDefinitions(doc: Document): void {
  if (doc.getElementById(DEFS_ID)) return;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('id', DEFS_ID);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
  for (const kind of Object.keys(COLOUR_FILTER_MATRICES) as Exclude<ColourFilter, 'off'>[]) {
    const f = doc.createElementNS(SVG, 'filter');
    f.setAttribute('id', colourFilterId(kind));
    f.setAttribute('color-interpolation-filters', 'linearRGB');
    const fe = doc.createElementNS(SVG, 'feColorMatrix');
    fe.setAttribute('type', 'matrix');
    fe.setAttribute('values', colourMatrixValues(kind).join(' '));
    f.append(fe);
    svg.append(f);
  }
  (doc.body ?? doc.documentElement).append(svg);
}

/**
 * The Colour filter on one of the game's screens (the match's canvas; a separate HUD element takes it the same way):
 * the kind's matrix after the brightness on the element's filter, or, for Off, the matrix removed (the brightness kept;
 * no inline style left at the brightness's default).
 */
export function colourFilter(canvas: HTMLElement, kind: ColourFilter): void {
  if (kind === 'off') { setScreenFilterTail(canvas, 'none'); return; }
  ensureDefinitions(canvas.ownerDocument);
  setScreenFilterTail(canvas, `url("#${colourFilterId(kind)}")`);
}
