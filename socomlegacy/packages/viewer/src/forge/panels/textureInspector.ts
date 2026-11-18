import { pageSettings } from '../../pageStore';
import { scrubNumber, type ScrubDetail } from '../scrub';
import { forgeEl } from '../shell/panel';
import type { Justify, MappingChange, TextureState } from '../geometry/texturing';

/**
 * Geometry mode's texturing in the Inspector, as Source 2 Hammer's face edit panel lays it out (the owner, 2026-11-17:
 * "add texturing the same way source hammer 2 does it. Align, Scale, Shift, Rotate, Fit, Justify, etc."; a browser
 * adaptation, FG.R2): two folding sections in the dock's one section look (`.fx-fold`).
 * - **Texture State**: the selected faces' Scale (world units a texel, U and V), Shift (texels) and Rotate (degrees),
 *   each a field that scrubs or takes a typed value -- blank where the faces differ, and setting it sets them all.
 * - **Modify Texture**: Align (World, Face, View), Scale (halve or double U or V), Shift (a grid step each way), Rotate
 *   (a turn step each way, 90 degrees each way, flip U, flip V), Fit (X by Y repeats across), Justify (left, right, top,
 *   bottom, centre), and "Treat as one" (Fit and Justify over the selection together, else each face alone).
 * Every press is one edit (one undo step), on the faces the Select tool has (a face selection, or whole objects).
 */
export interface TextureInspectorHooks {
  state(): TextureState | null;
  steps(): { shift: number; rotate: number };
  change(change: MappingChange, label: string): void;
  /** A field's drag shown live, no edit (`change` an absolute value); null puts the faces back (Escape, or before the release's edit). */
  preview(change: MappingChange | null): void;
  align(how: 'world' | 'face' | 'view'): void;
  justify(how: Justify, together: boolean, repeat: readonly [number, number]): void;
}

export interface TextureInspector {
  /** The two sections, in order: put into the Inspector's body. */
  sections: HTMLElement[];
  /** The fields read again from the selection (the selection or the geometry changed). */
  refresh(): void;
}

const TREAT_AS_ONE_KEY = 'forge.texture.treatAsOne';

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
  const fields = forgeEl(doc, 'div', 'fx-fields');
  const field = (chip: string, aria: string, rate: number, digits: number, axis: 'x' | 'y' | 'z', set: (v: number) => void, live: (v: number) => MappingChange | null): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-num fx-stepper');
    i.type = 'number';
    i.step = String(10 ** -digits);
    i.setAttribute('aria-label', aria);
    i.title = `${aria} · drag to change, click to type; blank: the selected faces differ`;
    scrubNumber(i, { rate, digits });
    // Its drag (`../scrub`) shown live on the faces, no edit; the release's `change` the one edit, Escape puts them back.
    i.addEventListener('fx-scrub', (e) => {
      const { value, cancelled } = (e as CustomEvent<ScrubDetail>).detail;
      if (cancelled) { hooks.preview(null); return; }
      const c = Number.isFinite(value) ? live(value) : null;
      if (c) hooks.preview(c);
    });
    i.addEventListener('change', () => { const v = Number(i.value); if (i.value !== '' && Number.isFinite(v)) set(v); else hooks.preview(null); });
    i.addEventListener('keydown', (k) => { if (k.key === 'Enter') i.blur(); });
    const label = forgeEl(doc, 'label', `fx-field fx-field--${axis}`);
    label.append(forgeEl(doc, 'span', '', chip), i);
    return Object.assign(i, { fieldLabel: label });
  };
  const row = (caption: string, ...inputs: HTMLInputElement[]): void => {
    const r = forgeEl(doc, 'div', 'fx-field-row');
    r.append(forgeEl(doc, 'div', 'fx-field-caption', caption), ...inputs.map((i) => (i as HTMLInputElement & { fieldLabel: HTMLElement }).fieldLabel));
    fields.append(r);
  };
  const scaleU = field('X', 'Scale X (world units a texel)', 0.005, 4, 'x', (v) => { if (v !== 0) hooks.change({ scaleU: v }, 'Texture scale'); else hooks.preview(null); }, (v) => (v !== 0 ? { scaleU: v } : null));
  const scaleV = field('Y', 'Scale Y (world units a texel)', 0.005, 4, 'y', (v) => { if (v !== 0) hooks.change({ scaleV: v }, 'Texture scale'); else hooks.preview(null); }, (v) => (v !== 0 ? { scaleV: v } : null));
  const shiftU = field('X', 'Shift X (texels)', 1, 2, 'x', (v) => hooks.change({ shiftU: v }, 'Texture shift'), (v) => ({ shiftU: v }));
  const shiftV = field('Y', 'Shift Y (texels)', 1, 2, 'y', (v) => hooks.change({ shiftV: v }, 'Texture shift'), (v) => ({ shiftV: v }));
  const rotate = field('°', 'Rotate (degrees)', 1, 2, 'z', (v) => hooks.change({ rotateTo: v }, 'Texture rotate'), (v) => ({ rotateTo: v }));
  row('Scale', scaleU, scaleV);
  row('Shift', shiftU, shiftV);
  row('Rotate', rotate);
  const count = forgeEl(doc, 'div', 'fx-texture-count');
  const stateSection = section('textureState', 'Texture State', count, fields);

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
    btn('World', 'Align to the world: the axis plane nearest each face (Hammer\'s default)', () => hooks.align('world')),
    btn('Face', 'Align to the face: the axes in each face\'s own plane', () => hooks.align('face')),
    btn('View', 'Align to the view: upright as the camera looks at it', () => hooks.align('view')));
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

  const show = (i: HTMLInputElement, v: number | null | undefined, digits: number): void => {
    if (doc.activeElement === i) return;                       // never under the typing
    i.value = v === null || v === undefined ? '' : String(Math.round(v * 10 ** digits) / 10 ** digits);
    i.placeholder = v === null ? 'mixed' : '';
  };
  const refresh = (): void => {
    const s = hooks.state();
    const none = !s || s.count === 0;
    count.textContent = none ? 'Select faces (Face selection), or objects, to texture them' : `${s.count} face${s.count === 1 ? '' : 's'}`;
    for (const i of [scaleU, scaleV, shiftU, shiftV, rotate]) i.disabled = none;
    for (const b of buttons) b.disabled = none;
    show(scaleU, s?.scaleU, 4); show(scaleV, s?.scaleV, 4);
    show(shiftU, s?.shiftU, 2); show(shiftV, s?.shiftV, 2);
    show(rotate, s?.rotate, 2);
  };
  return { sections: [stateSection, modifySection], refresh };
}
