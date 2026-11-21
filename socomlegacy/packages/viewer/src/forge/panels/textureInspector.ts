import { pageSettings } from '../../pageStore';
import { scrubNumber, type ScrubDetail } from '../scrub';
import { forgeEl } from '../shell/panel';
import type { DetailChange, Justify, MappingChange } from '../geometry/texturing';
import type { TextureStateView } from '../geometry/editor';

/**
 * Geometry mode's texturing in the Inspector, as a level editor's face edit panel lays it out (the owner, 2026-11-17:
 * texturing as a level editor does it: Align, Scale, Shift, Rotate, Fit, Justify; a browser
 * adaptation, FG.R2): two folding sections in the dock's one section look (`.fx-fold`).
 * - **Texture State**: the selected faces' Scale (world units a texel, U and V), Shift (texels) and Rotate (degrees),
 *   each a field that scrubs or takes a typed value -- blank where the faces differ, and setting it sets them all.
 * - **Modify Texture**: Align (World, Face, View), Scale (halve or double U or V), Shift (a grid step each way), Rotate
 *   (a turn step each way, 90 degrees each way, flip U, flip V), Fit (X by Y repeats across), Justify (left, right, top,
 *   bottom, centre), and "Treat as one" (Fit and Justify over the selection together, else each face alone).
 * Every press is one edit (one undo step), on the faces the Select tool has (a face selection, or whole objects).
 *
 * The assists for someone new to texturing (the owner, 2026-11-17: "easy ... for noobs ... but also stay standard") are
 * the same numbers shown or set another way, never a state of their own: Units (Texels, a level editor's; or Metres -- Scale as
 * the size of one copy of the texture, Shift as a part of one copy), Reset (world-aligned at the texture's natural size,
 * as the map's own makers laid it), and a warning when the texture is stretched or far off that size, with Fix (Reset).
 *
 * Texture State's Detail (the owner, 2026-11-18: per mesh, as the original holds it): whether the texture's detail pass
 * (its manifest `detail` record) is drawn over the faces -- the visual's `vparams` bit 14 -- and its Distance, the
 * visual's own gate range (`detail_buff`, kept squared; shown as the distance, in world units or metres). Both are the
 * engine's per-visual words (`../geometry/texturing` `DetailChange`): set on faces sharing a draw, they split them into
 * their own, as retexturing does. A texture with no detail record has nothing to set.
 */
export interface TextureInspectorHooks {
  state(): TextureStateView | null;
  /** Reset: world-aligned at each face's texture's natural size. */
  reset(): void;
  steps(): { shift: number; rotate: number };
  change(change: MappingChange, label: string): void;
  /** A field's drag shown live, no edit (`change` an absolute value); null puts the faces back (Escape, or before the release's edit). */
  preview(change: MappingChange | null): void;
  align(how: 'world' | 'face' | 'view'): void;
  /** The detail pass on the faces set (one edit), and its Distance field's drag shown live (null puts them back). */
  detail(change: DetailChange, label: string): void;
  previewDetail(change: DetailChange | null): void;
  justify(how: Justify, together: boolean, repeat: readonly [number, number]): void;
}

export interface TextureInspector {
  /** The two sections, in order: put into the Inspector's body. */
  sections: HTMLElement[];
  /** The fields read again from the selection (the selection or the geometry changed). */
  refresh(): void;
}

const TREAT_AS_ONE_KEY = 'forge.texture.treatAsOne';
const UNITS_KEY = 'forge.texture.units';
/** A texture stretched past this ratio of its two scales, or this far off its natural size either way, is warned of. */
const STRETCH_WARN = 1.25;
const NATURAL_WARN = 2;

export function buildTextureInspector(doc: Document, hooks: TextureInspectorHooks): TextureInspector {
  const section = (id: string, title: string, ...content: HTMLElement[]): HTMLDetailsElement => {
    const d = forgeEl(doc, 'details', 'fx-fold fx-inspect-section fx-texture-section');
    d.dataset['inspectSection'] = id;
    d.append(forgeEl(doc, 'summary', 'fx-inspect-section-title', title), ...content);
    const key = `forge.inspector.${id}.open`;
    d.open = pageSettings.get(key) !== '0';
    d.addEventListener('toggle', () => { pageSettings.set(key, d.open ? '1' : '0'); });
    return d;
  };

  /* ---------- Texture State ---------- */
  let last: TextureStateView | null = null;
  const unitsSel = forgeEl(doc, 'select', 'fx-select fx-texture-units') as HTMLSelectElement;
  for (const [v, w] of [['texels', 'Texels'], ['metres', 'Metres']] as const) { const o = forgeEl(doc, 'option', '', w) as HTMLOptionElement; o.value = v; unitsSel.append(o); }
  unitsSel.value = pageSettings.get(UNITS_KEY) === 'metres' ? 'metres' : 'texels';
  unitsSel.title = 'Texels: Scale in world units a texel and Shift in texels (a level editor\'s). Metres: Scale as the size of one copy of the texture, Shift as a part of one copy';
  unitsSel.setAttribute('aria-label', 'Units');
  const metres = (): boolean => unitsSel.value === 'metres';
  /** A texture's width (axis 0) or height (1) in metres a copy needs its size; null where the faces' textures differ. */
  const texel = (axis: 0 | 1): number | null => last?.texSize?.[axis] ?? null;
  // The field's shown value from the mapping's, and back: Scale as metres a copy, Shift as a percentage of a copy.
  const shownScale = (v: number, axis: 0 | 1): number | null => (metres() ? (texel(axis) ? v * texel(axis)! * (last?.metresPerUnit ?? 0.1) : null) : v);
  const storedScale = (v: number, axis: 0 | 1): number | null => (metres() ? (texel(axis) ? v / (texel(axis)! * (last?.metresPerUnit ?? 0.1)) : null) : v);
  const shownShift = (v: number, axis: 0 | 1): number | null => (metres() ? (texel(axis) ? (v / texel(axis)!) * 100 : null) : v);
  const storedShift = (v: number, axis: 0 | 1): number | null => (metres() ? (texel(axis) ? (v / 100) * texel(axis)! : null) : v);
  const fields = forgeEl(doc, 'div', 'fx-fields');
  /** Each field's scrub, let go before it is set again for other units (`dress`). */
  const scrubs = new Map<HTMLInputElement, () => void>();
  const field = (chip: string, axis: 'x' | 'y' | 'z', make: (v: number) => MappingChange | null, label: string): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-num fx-stepper');
    i.type = 'number';
    scrubs.set(i, scrubNumber(i, { rate: 1, digits: 2 }));
    // Its drag (`../scrub`) shown live on the faces, no edit; the release's `change` the one edit, Escape puts them back.
    i.addEventListener('fx-scrub', (e) => {
      const { value, cancelled } = (e as CustomEvent<ScrubDetail>).detail;
      if (cancelled) { hooks.preview(null); return; }
      const c = Number.isFinite(value) ? make(value) : null;
      if (c) hooks.preview(c);
    });
    i.addEventListener('change', () => {
      const v = Number(i.value);
      const c = i.value !== '' && Number.isFinite(v) ? make(v) : null;
      if (c) hooks.change(c, label); else hooks.preview(null);
    });
    i.addEventListener('keydown', (k) => { if (k.key === 'Enter') i.blur(); });
    const l = forgeEl(doc, 'label', `fx-field fx-field--${axis}`);
    l.append(forgeEl(doc, 'span', '', chip), i);
    return Object.assign(i, { fieldLabel: l });
  };
  const captions: Record<string, HTMLElement> = {};
  const row = (key: string, caption: string, ...inputs: HTMLInputElement[]): void => {
    const r = forgeEl(doc, 'div', 'fx-field-row');
    captions[key] = forgeEl(doc, 'div', 'fx-field-caption', caption);
    r.append(captions[key]!, ...inputs.map((i) => (i as HTMLInputElement & { fieldLabel: HTMLElement }).fieldLabel));
    fields.append(r);
  };
  const nonZero = (v: number | null): number | null => (v === null || v === 0 || !Number.isFinite(v) ? null : v);
  const scaleU = field('X', 'x', (v) => { const s2 = nonZero(storedScale(v, 0)); return s2 === null ? null : { scaleU: s2 }; }, 'Texture scale');
  const scaleV = field('Y', 'y', (v) => { const s2 = nonZero(storedScale(v, 1)); return s2 === null ? null : { scaleV: s2 }; }, 'Texture scale');
  const shiftU = field('X', 'x', (v) => { const s2 = storedShift(v, 0); return s2 === null ? null : { shiftU: s2 }; }, 'Texture shift');
  const shiftV = field('Y', 'y', (v) => { const s2 = storedShift(v, 1); return s2 === null ? null : { shiftV: s2 }; }, 'Texture shift');
  const rotate = field('°', 'z', (v) => ({ rotateTo: v }), 'Texture rotate');
  row('scale', 'Scale', scaleU, scaleV);
  row('shift', 'Shift', shiftU, shiftV);
  row('rotate', 'Rotate', rotate);
  /** Each field's words, step and scrub rate for the units chosen. */
  const dress = (): void => {
    const m = metres();
    captions['scale']!.textContent = m ? 'Tile size' : 'Scale';
    captions['shift']!.textContent = m ? 'Offset' : 'Shift';
    const set = (i: HTMLInputElement, aria: string, step: number, rate: number, digits: number): void => {
      i.step = String(step);
      i.setAttribute('aria-label', aria);
      i.title = `${aria} · drag to change, click to type; blank: the selected faces differ`;
      scrubs.get(i)?.();
      scrubs.set(i, scrubNumber(i, { rate, digits }));
    };
    set(scaleU, m ? 'Tile width (metres)' : 'Scale X (world units a texel)', m ? 0.1 : 0.01, m ? 0.01 : 0.005, m ? 3 : 4);
    set(scaleV, m ? 'Tile height (metres)' : 'Scale Y (world units a texel)', m ? 0.1 : 0.01, m ? 0.01 : 0.005, m ? 3 : 4);
    set(shiftU, m ? 'Offset X (% of a tile)' : 'Shift X (texels)', 1, 1, m ? 1 : 2);
    set(shiftV, m ? 'Offset Y (% of a tile)' : 'Shift Y (texels)', 1, 1, m ? 1 : 2);
    set(rotate, 'Rotate (degrees)', 1, 1, 2);
  };
  dress();
  unitsSel.addEventListener('change', () => { pageSettings.set(UNITS_KEY, unitsSel.value); dress(); refresh(); });
  const unitsRow = forgeEl(doc, 'label', 'fx-texture-units-row');
  unitsRow.append(forgeEl(doc, 'span', 'fx-field-caption', 'Units'), unitsSel);
  // The warning: stretched, or far off the texture's natural size; Fix is Reset.
  const warn = forgeEl(doc, 'div', 'fx-texture-warn');
  const warnText = forgeEl(doc, 'span', '');
  const fix = forgeEl(doc, 'button', 'fx-tool fx-texture-btn', 'Fix') as HTMLButtonElement;
  fix.type = 'button';
  fix.title = 'Reset: the texture at its natural size, world-aligned';
  fix.addEventListener('click', () => { hooks.reset(); fix.blur(); });
  warn.append(warnText, fix);
  warn.hidden = true;
  // Detail: the pass drawn or not, and its distance (the gate range's square root; metres under Metres).
  const unit = (): number => (metres() ? last?.metresPerUnit ?? 0.1 : 1);
  const detailBox = forgeEl(doc, 'input', 'fx-texture-detail') as HTMLInputElement;
  detailBox.type = 'checkbox';
  detailBox.setAttribute('aria-label', 'Detail texture');
  detailBox.addEventListener('change', () => { hooks.detail({ on: detailBox.checked }, detailBox.checked ? 'Detail texture on' : 'Detail texture off'); detailBox.blur(); });
  const detailToggle = forgeEl(doc, 'label', 'fx-toggle fx-texture-detail-toggle');
  detailToggle.append(detailBox, forgeEl(doc, 'span', '', 'Draw'));
  const detailRow = forgeEl(doc, 'div', 'fx-field-row');
  detailRow.append(forgeEl(doc, 'div', 'fx-field-caption', 'Detail'), detailToggle);
  const distance = forgeEl(doc, 'input', 'fx-num fx-stepper') as HTMLInputElement;
  distance.type = 'number';
  distance.min = '0';
  let distanceScrub = scrubNumber(distance, { rate: 1, digits: 1 });
  const rangeOf = (v: number): number | null => (Number.isFinite(v) && v > 0 ? (v / unit()) ** 2 : null);
  distance.addEventListener('fx-scrub', (e) => {
    const { value, cancelled } = (e as CustomEvent<ScrubDetail>).detail;
    if (cancelled) { hooks.previewDetail(null); return; }
    const r = rangeOf(value);
    if (r !== null) hooks.previewDetail({ range: r });
  });
  distance.addEventListener('change', () => {
    const r = distance.value !== '' ? rangeOf(Number(distance.value)) : null;
    if (r !== null) hooks.detail({ range: r }, 'Detail distance'); else hooks.previewDetail(null);
  });
  distance.addEventListener('keydown', (k) => { if (k.key === 'Enter') distance.blur(); });
  const distanceChip = forgeEl(doc, 'span', '', 'u');
  const distanceLabel = forgeEl(doc, 'label', 'fx-field fx-field--z');
  distanceLabel.append(distanceChip, distance);
  const distanceRow = forgeEl(doc, 'div', 'fx-field-row');
  distanceRow.append(forgeEl(doc, 'div', 'fx-field-caption', 'Distance'), distanceLabel);
  const dressDistance = (): void => {
    const m = metres();
    distanceChip.textContent = m ? 'm' : 'u';
    const aria = m ? 'Detail distance (metres)' : 'Detail distance (world units)';
    distance.step = m ? '1' : '10';
    distance.setAttribute('aria-label', aria);
    distance.title = `${aria}: the detail texture is drawn while the face's centre is this near the camera (the original's per-mesh range; View's Detail distance multiplies it outside the PS2 picture) · drag to change, click to type`;
    distanceScrub();
    distanceScrub = scrubNumber(distance, { rate: m ? 0.1 : 1, digits: 1 });
  };
  dressDistance();
  unitsSel.addEventListener('change', dressDistance);
  const detailFields = forgeEl(doc, 'div', 'fx-fields fx-texture-detail');
  detailFields.append(detailRow, distanceRow);
  const count = forgeEl(doc, 'div', 'fx-texture-count');
  const stateSection = section('textureState', 'Texture State', count, unitsRow, fields, detailFields, warn);

  /* ---------- Modify Texture ---------- */
  const modify = forgeEl(doc, 'div', 'fx-texture-modify');
  const buttons: HTMLButtonElement[] = [];
  const btn = (label: string, title: string, press: () => void): HTMLButtonElement => {
    const b = forgeEl(doc, 'button', 'fx-tool fx-texture-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => { press(); b.blur(); });
    buttons.push(b);
    return b;
  };
  const line = (caption: string, ...kids: HTMLElement[]): void => {
    const r = forgeEl(doc, 'div', 'fx-texture-row');
    const g = forgeEl(doc, 'div', 'fx-texture-buttons');
    g.append(...kids);
    r.append(forgeEl(doc, 'div', 'fx-field-caption', caption), g);
    modify.append(r);
  };
  const treat = forgeEl(doc, 'input', 'fx-texture-treat');
  treat.type = 'checkbox';
  treat.checked = pageSettings.get(TREAT_AS_ONE_KEY) === '1';
  treat.addEventListener('change', () => pageSettings.set(TREAT_AS_ONE_KEY, treat.checked ? '1' : '0'));
  const repeat = (aria: string): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-num fx-texture-repeat');
    i.type = 'number';
    i.min = '0.25';
    i.step = '1';
    i.value = '1';
    i.setAttribute('aria-label', aria);
    i.title = `${aria}: how many times the texture repeats across`;
    return i;
  };
  const fitX = repeat('Fit X'), fitY = repeat('Fit Y');
  const repeats = (): [number, number] => [Math.max(0.01, Number(fitX.value) || 1), Math.max(0.01, Number(fitY.value) || 1)];
  const step = (): { shift: number; rotate: number } => hooks.steps();
  line('Align',
    btn('World', 'Align to the world: the axis plane nearest each face (a level editor\'s default)', () => hooks.align('world')),
    btn('Face', 'Align to the face: the axes in each face\'s own plane', () => hooks.align('face')),
    btn('View', 'Align to the view: upright as the camera looks at it', () => hooks.align('view')),
    btn('Reset', 'Reset: world-aligned at the texture\'s natural size (as the map\'s own makers laid it), shift and rotation zeroed', () => hooks.reset()));
  line('Scale',
    btn('X −', 'Scale X down: the texture half as wide (twice as many repeats)', () => hooks.change({ scaleU: 0.5, relative: true }, 'Texture scale')),
    btn('X +', 'Scale X up: the texture twice as wide', () => hooks.change({ scaleU: 2, relative: true }, 'Texture scale')),
    btn('Y −', 'Scale Y down: the texture half as tall', () => hooks.change({ scaleV: 0.5, relative: true }, 'Texture scale')),
    btn('Y +', 'Scale Y up: the texture twice as tall', () => hooks.change({ scaleV: 2, relative: true }, 'Texture scale')));
  line('Shift',
    btn('←', 'Shift left one grid step', () => hooks.change({ nudgeU: -step().shift }, 'Texture shift')),
    btn('→', 'Shift right one grid step', () => hooks.change({ nudgeU: step().shift }, 'Texture shift')),
    btn('↑', 'Shift up one grid step', () => hooks.change({ nudgeV: -step().shift }, 'Texture shift')),
    btn('↓', 'Shift down one grid step', () => hooks.change({ nudgeV: step().shift }, 'Texture shift')));
  line('Rotate',
    btn('⟲', 'Rotate one turn step counter-clockwise', () => hooks.change({ rotate: -step().rotate }, 'Texture rotate')),
    btn('⟳', 'Rotate one turn step clockwise', () => hooks.change({ rotate: step().rotate }, 'Texture rotate')),
    btn('−90°', 'Rotate 90° counter-clockwise', () => hooks.change({ rotate: -90 }, 'Texture rotate')),
    btn('+90°', 'Rotate 90° clockwise', () => hooks.change({ rotate: 90 }, 'Texture rotate')),
    btn('⇋', 'Flip horizontally (mirror X)', () => hooks.change({ flipU: true }, 'Texture flip')),
    btn('⇵', 'Flip vertically (mirror Y)', () => hooks.change({ flipV: true }, 'Texture flip')));
  const fitLabel = (chip: string, i: HTMLInputElement): HTMLElement => { const l = forgeEl(doc, 'label', 'fx-texture-repeat-field'); l.append(forgeEl(doc, 'span', '', chip), i); return l; };
  line('Fit',
    btn('Fit', 'Fit the texture across the selected faces, X by Y times (Treat as one: across them all)', () => hooks.justify('fit', treat.checked, repeats())),
    fitLabel('X', fitX), fitLabel('Y', fitY));
  line('Justify',
    btn('Left', 'Justify left: the texture\'s left edge on the faces\' left edge', () => hooks.justify('left', treat.checked, repeats())),
    btn('Right', 'Justify right', () => hooks.justify('right', treat.checked, repeats())),
    btn('Top', 'Justify top', () => hooks.justify('top', treat.checked, repeats())),
    btn('Bottom', 'Justify bottom', () => hooks.justify('bottom', treat.checked, repeats())),
    btn('Center', 'Centre the texture on the faces', () => hooks.justify('center', treat.checked, repeats())));
  const treatRow = forgeEl(doc, 'label', 'fx-toggle fx-texture-treat-row');
  treatRow.append(treat, forgeEl(doc, 'span', '', 'Treat as one'));
  treatRow.title = 'Fit and Justify over the selected faces as one surface; off, each face on its own';
  modify.append(treatRow);
  const modifySection = section('modifyTexture', 'Modify Texture', modify);

  const show = (i: HTMLInputElement, v: number | null | undefined, digits: number, mixed = 'mixed'): void => {
    if (doc.activeElement === i) return;                       // never under the typing
    i.value = v === null || v === undefined ? '' : String(Math.round(v * 10 ** digits) / 10 ** digits);
    i.placeholder = v === null ? mixed : '';
  };
  function refresh(): void {
    const s2 = hooks.state();
    last = s2;
    const none = !s2 || s2.count === 0;
    count.textContent = none ? 'Select faces (Face selection), or objects, to texture them' : `${s2.count} face${s2.count === 1 ? '' : 's'}${s2.texture ? ` · ${s2.texture}` : ''}`;
    const m = metres();
    // In Metres a size is needed: faces wearing different textures show blank and take no value.
    const sized = !m || !!s2?.texSize;
    for (const i of [scaleU, scaleV, shiftU, shiftV]) i.disabled = none || !sized;
    rotate.disabled = none;
    for (const b of buttons) b.disabled = none;
    const mixed = sized ? 'mixed' : 'textures differ';
    const conv = (v: number | null | undefined, f: (x: number, a: 0 | 1) => number | null, a: 0 | 1): number | null | undefined => (v === null || v === undefined ? v : f(v, a));
    show(scaleU, conv(s2?.scaleU, shownScale, 0), m ? 3 : 4, mixed); show(scaleV, conv(s2?.scaleV, shownScale, 1), m ? 3 : 4, mixed);
    show(shiftU, conv(s2?.shiftU, shownShift, 0), m ? 1 : 2, mixed); show(shiftV, conv(s2?.shiftV, shownShift, 1), m ? 1 : 2, mixed);
    show(rotate, s2?.rotate, 2);
    // Detail: only faces whose texture binds a detail pass have one to set.
    const d = s2?.detail;
    const bound = !none && !!d && d.faces > 0;
    detailBox.disabled = !bound;
    detailBox.checked = bound && d.on !== false;
    detailBox.indeterminate = bound && d.on === null;
    distance.disabled = !bound || d.on === false;
    show(distance, bound ? (d.range === null ? null : Math.sqrt(d.range) * unit()) : undefined, 1);
    detailToggle.title = none ? '' : bound
      ? `Draw the texture's detail texture over the selected faces${d.faces < s2.count ? ` (${d.faces} of ${s2.count}: the others' textures have none)` : ''}`
      : 'The selected faces’ texture has no detail texture';
    // Stretched (its two scales apart), or far off the texture's natural size.
    let why = '';
    if (!none && s2.scaleU !== null && s2.scaleV !== null) {
      const ratio = Math.abs(s2.scaleU / s2.scaleV);
      if (ratio > STRETCH_WARN || ratio < 1 / STRETCH_WARN) why = `Stretched ${Math.round((ratio >= 1 ? ratio : 1 / ratio) * 100) / 100} : 1`;
      else if (s2.natural) {
        const k = Math.abs(s2.scaleU) / s2.natural;
        if (k > NATURAL_WARN) why = `${Math.round(k * 10) / 10}× its natural size`;
        else if (k < 1 / NATURAL_WARN) why = `${Math.round((1 / k) * 10) / 10}× smaller than its natural size`;
      }
    }
    warnText.textContent = why;
    warn.hidden = !why;
  }
  return { sections: [stateSection, modifySection], refresh };
}
