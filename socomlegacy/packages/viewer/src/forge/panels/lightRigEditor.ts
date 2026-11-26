import type { LightRigSetting } from '../layout';
import { forgeEl } from '../shell/panel';
import { ownButton, presetButton, subsection } from './propGrid';

/**
 * A new empty map's environment, edited (the owner, 2026-11-06; a browser adaptation, FG.R2 -- the game has no editor):
 * the same sections and rows as a disc map's read-only Environment (`../environment` `environmentSections`) -- the light
 * rig, the sky, the fog, the night, the shadows, the reflections and the flares -- each value a field where a new empty
 * map may set its own. Drawn for a blank base only (a disc map keeps its own).
 *
 * The whole environment is one value (`Atmosphere`): a field's `input` (a number scrubbed, a colour being picked)
 * previews it (`hooks.preview`, no edit); its `change` (a release, a typed value, a box ticked) sets it (`hooks.commit`,
 * one edit). Reset puts back the map it is built from's.
 */
export interface Atmosphere {
  rig: LightRigSetting;
  /** The disc map whose sky dome is copied over the floor ('' none: the fog colour clears the sky). */
  sky: string;
  /** The clouds' drift, times the map's own (1 its own; `LayoutSettings.cloudSpeed`). */
  clouds: number;
  fog: { on: boolean; colour: [number, number, number]; near: number; far: number; height: { on: boolean; top: number; bottom: number } };
  /**
   * `NightMission` and `LensFX_NVG`: four floats 0..1, the disc's range (research 84 s14; FP-1b, REVIEW-A 12) -- the
   * colour field shows the rgb as bytes and converts back (`lensHex`, `lensOf`); nothing stores 0..255.
   */
  night: { mission: boolean; lens: [number, number, number, number] };
  /** The world root's `ShadowVector`: the way the characters' shadows fall (its length kept). */
  shadow: [number, number, number];
}

/** The editor's two groups: the lights, shadows and night; the sky and the fog. */
export type AtmospherePart = 'lighting' | 'skyFog';

export interface LightRigHooks {
  /** The environment as it plays now: the layout's own, else the built-from map's. */
  get(): Atmosphere;
  /** Whether the layout holds its own values for a group (its Reset pressable). */
  own(part: AtmospherePart): boolean;
  /** The map it is built from (its words). */
  from(): string;
  /** The disc maps a sky may be copied from: stem, words, whether it is greyed (no dome to copy), and its list's header. */
  skyChoices(): readonly (readonly [string, string, boolean?, string?])[];
  /** Whether the sky shown scrolls (its Cloud speed has something to move). */
  skyScrolls(): boolean;
  preview(a: Atmosphere): void;
  commit(a: Atmosphere): void;
  /** A group back to the map's own values (one edit). */
  reset(part: AtmospherePart): void;
  /** Preset: a disc map's values for a group copied over this one's (the page asks which; one edit). */
  preset(part: AtmospherePart): void;
}

export interface LightRigEditor {
  body: HTMLDivElement;
  /** Where the page puts the layout's Day / night row (under Light rig) and its Fog distance row (under Fog). */
  slots: { dayNight: HTMLDivElement; fogDistance: HTMLDivElement };
  /** Redrawn from the hooks; `force` (a preset, a reset) redraws even the number field being typed in. */
  draw(force?: boolean): void;
}

const RAD = Math.PI / 180;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A unit direction as a heading and an elevation, in degrees, in the port's yaw (0 looking down -z, left positive) --
 * as the read-only rows word it (`../environment` `directionWords`), so the two read the same numbers.
 */
export function headingOf(d: readonly number[]): { heading: number; elevation: number } {
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (!(len > 0)) return { heading: 0, elevation: 45 };
  const [x, y, z] = [d[0]! / len, d[1]! / len, d[2]! / len];
  return { heading: ((Math.atan2(-x, -z) / RAD) % 360 + 360) % 360, elevation: Math.asin(Math.max(-1, Math.min(1, y))) / RAD };
}

/** `headingOf`'s inverse: the unit direction. */
export function directionOf(heading: number, elevation: number): [number, number, number] {
  const h = heading * RAD, e = elevation * RAD;
  return [-Math.cos(e) * Math.sin(h), Math.sin(e), -Math.cos(e) * Math.cos(h)];
}

/** An rgb (1 full) as a colour (its hue at full) and an intensity (its brightest lane). */
export function colourOf(rgb: readonly number[]): { hex: string; intensity: number } {
  const intensity = Math.max(rgb[0]!, rgb[1]!, rgb[2]!, 0);
  const lane = (v: number): string => Math.round(Math.max(0, Math.min(1, intensity > 0 ? v / intensity : 1)) * 255).toString(16).padStart(2, '0');
  return { hex: `#${lane(rgb[0]!)}${lane(rgb[1]!)}${lane(rgb[2]!)}`, intensity };
}

/** `colourOf`'s inverse. */
export function rgbOf(hex: string, intensity: number): [number, number, number] {
  const n = /^#([0-9a-f]{6})$/i.exec(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
  return [((n >> 16) & 255) / 255 * intensity, ((n >> 8) & 255) / 255 * intensity, (n & 255) / 255 * intensity];
}

/** 0..255 rgb as `#rrggbb`, and back. */
const byteHex = (rgb: readonly number[]): string => `#${rgb.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const bytesOf = (hex: string): [number, number, number] => {
  const n = /^#([0-9a-f]{6})$/i.exec(hex) ? parseInt(hex.slice(1), 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** A lens's 0..1 rgb as the colour field's `#rrggbb` (FP-1b: converted at the field only), and back. */
const lensHex = (lens: readonly number[]): string => byteHex([lens[0]! * 255, lens[1]! * 255, lens[2]! * 255]);
const lensOf = (hex: string): [number, number, number] => bytesOf(hex).map((v) => v / 255) as [number, number, number];

export function buildLightRigEditor(doc: Document, hooks: LightRigHooks): LightRigEditor {
  // Sub-sections only (the owner, 2026-11-25: "merge some groups, remove some groups that are not needed"): Lighting
  // (the lights, the shadows, the night) and Sky & fog -- each a foldable group of name and control rows.
  const body = forgeEl(doc, 'div', 'fx-light-rig fx-subfolds');
  // Each group's Preset and Reset in its heading (the owner, 2026-11-25).
  const WORDS: Record<AtmospherePart, string> = { lighting: 'lights, shadows and night', skyFog: 'sky and fog' };
  const resets = new Map<AtmospherePart, HTMLButtonElement>();
  const buttonsOf = (part: AtmospherePart): { preset: HTMLButtonElement; reset: HTMLButtonElement } => {
    const preset = presetButton(doc, `Copy a disc map's ${WORDS[part]} into this map`, false);
    preset.dataset['rigPreset'] = part;
    preset.addEventListener('click', () => hooks.preset(part));
    const reset = ownButton(doc, `Back to the map's own ${WORDS[part]}`, true, false);
    reset.dataset['rigReset'] = part;
    reset.addEventListener('click', () => hooks.reset(part));
    resets.set(part, reset);
    return { preset, reset };
  };

  // The fields, each telling the editor when it moves (`input`) and when it is set (`change`).
  const fields: HTMLElement[] = [];
  const num = (label: string, min: number, max: number, step: number): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-num fx-setting-num fx-stepper fx-light-rig__num');
    i.type = 'number';
    i.min = String(min); i.max = String(max); i.step = String(step);
    i.setAttribute('aria-label', label);
    i.title = `${label} · drag to change, click to type`;
    fields.push(i);
    return i;
  };
  const colour = (label: string): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-light-rig__colour');
    i.type = 'color';
    i.setAttribute('aria-label', label);
    i.title = label;
    fields.push(i);
    return i;
  };
  const check = (label: string): HTMLInputElement => {
    const i = forgeEl(doc, 'input', 'fx-light-rig__check');
    i.type = 'checkbox';
    i.setAttribute('aria-label', label);
    fields.push(i);
    return i;
  };
  const text = (t: string): HTMLSpanElement => forgeEl(doc, 'span', 'fx-dim', t);
  /** The sub-section the rows that follow go into (`section` opens the next). */
  let table: HTMLDivElement = forgeEl(doc, 'div', 'fx-prop-table');
  const section = (title: string, source: string, part: AtmospherePart): void => {
    const sub = subsection(doc, title, buttonsOf(part));
    sub.fold.title = source;                                   // where the values come from: on hover, not drawn
    body.append(sub.fold);
    table = sub.table;
  };
  /**
   * A property row (the owner, 2026-11-12: "Property Text | Widget, where all the widgets are all left aligned to the
   * largest text in that property table"): its label in the panel's label column (`.fx-prop-table`), its widgets after.
   */
  const row = (label: string, ...kids: (HTMLElement | string)[]): HTMLElement => {
    const r = forgeEl(doc, 'div', 'fx-light-rig__row fx-prop-row');
    const value = forgeEl(doc, 'div', 'fx-prop-value');
    value.append(...kids.map((k) => (typeof k === 'string' ? text(k) : k)));
    r.append(forgeEl(doc, 'span', 'fx-light-rig__label fx-prop-label', label), value);
    table.append(r);
    return r;
  };

  // LIGHT RIG: the layout's Day / night first (the page's row, `slots.dayNight`), then each light's colour and strength
  // and where it shines from, and the ambient's colour and strength.
  section('Lighting', "GlobalLighting: three directional lights and an ambient; the world root's ShadowVector, NightMission and LensFX_NVG", 'lighting');
  const dayNight = forgeEl(doc, 'div', 'fx-light-rig__slot');
  table.append(dayNight);
  const lights = [0, 1, 2].map((k) => {
    const l = {
      colour: colour(`Light ${k + 1} colour`), intensity: num(`Light ${k + 1} intensity`, 0, 2, 0.05),
      heading: num(`Light ${k + 1} heading (°)`, 0, 359, 1), elevation: num(`Light ${k + 1} elevation (°)`, -90, 90, 1),
    };
    row(`Light ${k + 1}`, l.colour, l.intensity, l.heading, l.elevation);   // each field named on hover (no words between)
    return l;
  });
  const ambient = { colour: colour('Ambient colour'), intensity: num('Ambient intensity', 0, 2, 0.05) };
  row('Ambient', ambient.colour, ambient.intensity);

  // SHADOWS: the world root's ShadowVector -- the way the characters' shadows fall.
  const castHeading = num('Shadows fall toward (heading °)', 0, 359, 1), castDown = num('Shadows fall this steeply (° down)', 1, 90, 1);
  row('Shadows', castHeading, castDown);

  // NIGHT: NightMission (night vision offered) and LensFX_NVG (its lens).
  const nightOn = check('Night mission');
  row('Night mission', nightOn);
  const lensColour = colour('Night vision lens colour'), lensAlpha = num('Night vision lens alpha', 0, 1, 0.01);
  row('Night vision lens', lensColour, lensAlpha);

  // SKY & FOG: a disc map's own dome over the floor (`../skyDome`), or none; then the camera record's fog.
  section('Sky & fog', "A disc map's own sky dome, copied over the floor; cameras/camera: the map's own fog", 'skyFog');
  const skySel = forgeEl(doc, 'select', 'fx-select fx-light-rig__sky');
  skySel.setAttribute('aria-label', 'Sky');
  fields.push(skySel);
  row('Sky', skySel);
  const cloudSpeed = num('Cloud speed (%)', 0, 400, 10);
  row('Cloud speed', cloudSpeed, '%');

  // The fog: on, its colour, its distance (near - far), its height band.
  const fogOn = check('Fog on');
  row('Fog', fogOn);
  const fogColour = colour('Fog colour');
  row('Fog colour', fogColour);
  // The layout's Fog distance (the page's row, `slots.fogDistance`), then its near - far.
  const fogDistance = forgeEl(doc, 'div', 'fx-light-rig__slot');
  table.append(fogDistance);
  const fogNear = num('Fog near (u)', 0, 100000, 10), fogFar = num('Fog far (u)', 100, 100000, 100);
  row('Fog near – far', fogNear, '–', fogFar);
  const heightOn = check('Height fog on');
  const fogBottom = num('Height fog bottom (u)', -10000, 10000, 1), fogTop = num('Height fog top (u)', -10000, 10000, 1);
  row('Height fog', heightOn, fogBottom, '–', fogTop);


  /** The environment the fields hold now. */
  const read = (): Atmosphere => {
    const was = hooks.get();
    const n = (i: HTMLInputElement, min: number, max: number, at: number): number => {
      const v = Number(i.value);
      return Number.isFinite(v) && i.value.trim() !== '' ? Math.min(max, Math.max(min, v)) : at;
    };
    const len = Math.hypot(...was.shadow) || 1;
    const cast = directionOf(n(castHeading, 0, 360, 0), -n(castDown, 1, 90, 45));
    return {
      rig: {
        directions: lights.map((l, k) => directionOf(n(l.heading, 0, 360, 0), n(l.elevation, -90, 90, 45 - k * 10))) as LightRigSetting['directions'],
        colours: lights.map((l) => rgbOf(l.colour.value, n(l.intensity, 0, 2, 1))) as LightRigSetting['colours'],
        ambient: rgbOf(ambient.colour.value, n(ambient.intensity, 0, 2, 0.3)),
      },
      sky: skySel.value,
      clouds: n(cloudSpeed, 0, 400, was.clouds * 100) / 100,
      fog: {
        on: fogOn.checked, colour: bytesOf(fogColour.value),
        near: n(fogNear, 0, 100000, was.fog.near), far: n(fogFar, 100, 100000, was.fog.far),
        height: { on: heightOn.checked, bottom: n(fogBottom, -10000, 10000, was.fog.height.bottom), top: n(fogTop, -10000, 10000, was.fog.height.top) },
      },
      night: { mission: nightOn.checked, lens: [...lensOf(lensColour.value), n(lensAlpha, 0, 1, was.night.lens[3])] },
      shadow: [cast[0] * len, cast[1] * len, cast[2] * len],
    };
  };
  for (const f of fields) {
    f.addEventListener('input', () => hooks.preview(read()));
    f.addEventListener('change', () => hooks.commit(read()));
  }

  return {
    body,
    slots: { dayNight, fogDistance },
    draw(force = false) {
      const a = hooks.get();
      const active = doc.activeElement;
      // Only a number being typed in is left as it is (never a colour, a box or the sky's list); a preset redraws all.
      const put = (i: HTMLInputElement, v: string): void => { if (force || i !== active || i.type !== 'number') i.value = v; };
      lights.forEach((l, k) => {
        const { heading, elevation } = headingOf(a.rig.directions[k]!);
        const { hex, intensity } = colourOf(a.rig.colours[k]!);
        put(l.colour, hex); put(l.intensity, String(round2(intensity)));
        put(l.heading, String(round1(heading))); put(l.elevation, String(round1(elevation)));
      });
      const amb = colourOf(a.rig.ambient);
      put(ambient.colour, amb.hex); put(ambient.intensity, String(round2(amb.intensity)));
      {
        const want: (readonly [string, string, boolean?, string?])[] = [['', 'None (the fog colour)'], ...hooks.skyChoices()];
        const opts = [...skySel.options];
        if (opts.length !== want.length || want.some(([v, w, off], i) => opts[i]?.value !== v || (i > 0 && (opts[i]?.textContent !== w || opts[i]?.disabled !== !!off)))) {
          // None first, then the maps under their header, as every map list of the Forge (the asset browser's).
          const opt = ([v, w, off]: readonly [string, string, boolean?, string?]): HTMLOptionElement => { const o = forgeEl(doc, 'option', '', w); o.value = v; o.disabled = !!off; return o; };
          // Under their headers (Multiplayer, then Campaign), in the hooks' order.
          const groups = new Map<string, HTMLOptGroupElement>();
          for (const row of want.slice(1)) {
            const label = row[3] ?? 'Multiplayer';
            let g = groups.get(label);
            if (!g) { g = forgeEl(doc, 'optgroup', ''); g.label = label; groups.set(label, g); }
            g.append(opt(row));
          }
          skySel.replaceChildren(opt(want[0]!), ...groups.values());
        }
        skySel.value = a.sky;
        // No disc map's sky offered (an official map keeps its own dome, its world's): the field says so, unchangeable.
        const none = hooks.skyChoices().length === 0;
        skySel.options[0]!.textContent = none ? 'The map’s own sky' : 'None (the fog colour)';
        skySel.disabled = none;
      }
      put(cloudSpeed, String(Math.round(a.clouds * 100)));
      // A still sky has no drift to speed up (none is made up): the field says so.
      const scrolls = hooks.skyScrolls();
      cloudSpeed.disabled = !scrolls;
      cloudSpeed.title = scrolls ? 'Cloud speed (%) · drag to change, click to type' : 'This sky’s clouds do not move';
      fogOn.checked = a.fog.on;
      put(fogColour, byteHex(a.fog.colour));
      put(fogNear, String(Math.round(a.fog.near))); put(fogFar, String(Math.round(a.fog.far)));
      heightOn.checked = a.fog.height.on;
      put(fogBottom, String(Math.round(a.fog.height.bottom))); put(fogTop, String(Math.round(a.fog.height.top)));
      fogBottom.disabled = fogTop.disabled = !a.fog.height.on;
      nightOn.checked = a.night.mission;
      put(lensColour, lensHex(a.night.lens)); put(lensAlpha, String(round2(a.night.lens[3])));
      const cast = headingOf(a.shadow);
      put(castHeading, String(round1(cast.heading))); put(castDown, String(round1(Math.max(1, -cast.elevation))));
      const from = hooks.from();
      for (const [part, b] of resets) {
        b.disabled = !hooks.own(part);
        b.title = `Back to ${from}'s own ${WORDS[part]}`;
      }
    },
  };
}
