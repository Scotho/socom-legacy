import { FOV_HALF_MAX, FOV_HALF_MIN, LOADING_DESCRIPTION_MAX, LOADING_TITLE_MAX, REVERB_SECONDS_MAX } from '@s2u/creator-contracts';
import type { LayoutSettings, LoadingSetting, ReverbSetting } from '../layout';
import { fovForVertical, SURFACE_CHOICES, verticalDegrees } from '../worldSettings';
import { forgeEl } from '../shell/panel';

/**
 * The Map Settings panel's Surface, sound & view section (a browser adaptation over `../worldSettings`; the owner,
 * 2026-11-10): the default surface, the field of view, the reverb's zones and the loading screen -- each the map's own
 * until set, each control an edit of its setting, and Map's own clearing it.
 */
export interface WorldView {
  settings: LayoutSettings;
  /** The map's own values (the base, a blank floor's library): its surface, reverb zones, camera half-angles, title. */
  own: {
    material: string | null;
    reverb: ReverbSetting | null;
    fov: { hfov: number; vfov: number } | null;
    title: string | null;
  };
  maps: readonly (readonly [string, string])[];
  locked: boolean;
}

export interface WorldSection {
  body: HTMLElement;
  draw(view: WorldView): void;
  onChange(cb: (patch: Partial<LayoutSettings>) => void): void;
}

/** The slider's ends, full vertical degrees (from the contract's half-angle bounds). */
const FOV_MIN_DEG = Math.ceil(verticalDegrees(FOV_HALF_MIN)), FOV_MAX_DEG = Math.floor(verticalDegrees(FOV_HALF_MAX));
/** The zones the panel shows a list at least (the disc's maps name one or two). */
const ZONES_SHOWN = 2;

export function buildWorldSection(doc: Document): WorldSection {
  const body = forgeEl(doc, 'div', 'fx-world fx-prop-table');
  let listeners: ((p: Partial<LayoutSettings>) => void)[] = [];
  let stamp = '';
  const tell = (p: Partial<LayoutSettings>): void => { for (const l of listeners) l(p); };
  const option = (value: string, label: string): HTMLOptionElement => { const o = forgeEl(doc, 'option', '', label); o.value = value; return o; };
  const head = (label: string, reset: string | null, on: boolean, locked: boolean, value?: string): HTMLElement => {
    const h = forgeEl(doc, 'span', 'fx-setting-head');
    h.append(forgeEl(doc, 'span', '', label));
    if (value !== undefined) h.append(forgeEl(doc, 'span', 'fx-setting-value', value));
    if (reset) {
      const b = forgeEl(doc, 'button', 'fx-chip fx-setting-reset', 'Map’s own');
      b.type = 'button';
      b.dataset['worldReset'] = reset;
      b.disabled = locked || !on;
      b.addEventListener('click', () => tell({ [reset]: null }));
      h.append(b);
    }
    return h;
  };
  /** A slider with its two ends' words under it (what moving it each way does), as the Day / night row's. */
  const withEnds = (input: HTMLInputElement, left: string, right: string): HTMLElement => {
    const w = forgeEl(doc, 'div', 'fx-world-slider');
    const ends = forgeEl(doc, 'div', 'fx-setting-head fx-world-ends');
    ends.append(forgeEl(doc, 'span', '', left), forgeEl(doc, 'span', '', right));
    w.append(input, ends);
    return w;
  };

  const draw = (v: WorldView): void => {
    const s = v.settings;
    const next = JSON.stringify([s.defaultMaterial, s.reverb, s.fov, s.loading, v.own, v.locked, v.maps.length]);
    if (next === stamp) return;                                    // unchanged: focus and typing kept
    stamp = next;
    body.replaceChildren(forgeEl(doc, 'h3', '', 'Surface, sound & view'));

    // The default surface (`DefaultMaterial`).
    const surface = forgeEl(doc, 'select', 'fx-select');
    surface.dataset['world'] = 'surface';
    surface.setAttribute('aria-label', 'Default surface');
    surface.append(option('', `Map’s own${v.own.material ? ` (${v.own.material})` : ''}`), ...SURFACE_CHOICES.map((n) => option(n, n)));
    surface.value = s.defaultMaterial ?? '';
    surface.disabled = v.locked;
    surface.addEventListener('change', () => tell({ defaultMaterial: surface.value === '' ? null : surface.value }));
    const surfaceRow = forgeEl(doc, 'label', 'fx-setting');
    surfaceRow.append(head('Default surface', null, false, v.locked), surface);
    body.append(surfaceRow, forgeEl(doc, 'p', 'fx-dim fx-setting-note', 'What a floor with no material of its own sounds and marks like: steps, bullet impacts, C4.'));

    // The field of view (`m_hfov` / `m_vfov`), as a full vertical angle at the map's own frame.
    const own = v.own.fov;
    const vNow = s.fov?.v ?? own?.vfov ?? null;
    const fov = forgeEl(doc, 'input', 'fx-range');
    fov.type = 'range';
    fov.dataset['world'] = 'fov';
    fov.min = String(FOV_MIN_DEG); fov.max = String(FOV_MAX_DEG); fov.step = '1';
    fov.value = vNow === null ? '49' : String(verticalDegrees(vNow));
    fov.setAttribute('aria-label', 'Field of view, vertical degrees');
    fov.disabled = v.locked || !own;
    fov.addEventListener('change', () => { if (own) tell({ fov: fovForVertical(Number(fov.value), own) }); });
    const fovHead = head('Field of view', 'fov', !!s.fov, v.locked, vNow === null ? '—' : `${Math.round(verticalDegrees(vNow))}°`);
    // The readout follows the drag; the setting is written when it is let go.
    const fovValue = fovHead.querySelector<HTMLElement>('.fx-setting-value')!;
    fov.addEventListener('input', () => { fovValue.textContent = `${Math.round(Number(fov.value))}°`; });
    const fovRow = forgeEl(doc, 'div', 'fx-setting');
    fovRow.append(fovHead, withEnds(fov, 'Narrow (zoomed in)', 'Wide'));
    body.append(fovRow, forgeEl(doc, 'p', 'fx-dim fx-setting-note', 'In Play. It also sets the aim’s spread, as the game derives it from the view.'));

    // The reverb (`IndoorReverb` / `OutdoorReverb`): each zone's depth and ramp seconds.
    const lists: ReverbSetting = s.reverb ?? v.own.reverb ?? { indoor: [], outdoor: [] };
    const padded = (l: [number, number][]): [number, number][] => [...l, ...Array.from({ length: Math.max(0, ZONES_SHOWN - l.length) }, () => [0, 1] as [number, number])];
    const shown: ReverbSetting = { indoor: padded(lists.indoor), outdoor: padded(lists.outdoor) };
    const reverbRow = forgeEl(doc, 'div', 'fx-setting');
    reverbRow.append(head('Reverb', 'reverb', !!s.reverb, v.locked));
    const grid = forgeEl(doc, 'div', 'fx-world-reverb');
    grid.append(forgeEl(doc, 'span', ''), forgeEl(doc, 'span', 'fx-dim', 'Depth'), forgeEl(doc, 'span', ''), forgeEl(doc, 'span', 'fx-dim', 'Ease-in (s)'));
    const pct = (n: number): string => `${Math.round(n * 100)}%`;
    for (const list of ['indoor', 'outdoor'] as const) {
      shown[list].forEach(([depth, seconds], zone) => {
        const word = `${list === 'indoor' ? 'Indoor' : 'Outdoor'} ${zone + 1}`;
        const d = forgeEl(doc, 'input', 'fx-range');
        d.type = 'range'; d.min = '0'; d.max = '1'; d.step = '0.01'; d.value = String(depth);
        const t = forgeEl(doc, 'input', 'fx-num fx-setting-num');
        t.type = 'number'; t.min = '0'; t.max = String(REVERB_SECONDS_MAX); t.step = '0.1'; t.value = String(seconds);
        for (const [input, part] of [[d, 'depth'], [t, 'seconds']] as const) {
          Object.assign(input.dataset, { world: 'reverb', list, zone: String(zone), part });
          input.setAttribute('aria-label', `${word} reverb ${part}`);
          input.disabled = v.locked;
          input.addEventListener('change', () => {
            const out: ReverbSetting = { indoor: shown.indoor.map((z) => [z[0], z[1]] as [number, number]), outdoor: shown.outdoor.map((z) => [z[0], z[1]] as [number, number]) };
            const n = Number(input.value);
            const clamp = part === 'depth' ? Math.min(1, Math.max(0, n)) : Math.min(REVERB_SECONDS_MAX, Math.max(0, n));
            out[list][zone]![part === 'depth' ? 0 : 1] = Number.isFinite(clamp) ? clamp : 0;
            tell({ reverb: out });
          });
        }
        const depthValue = forgeEl(doc, 'span', 'fx-setting-value', pct(depth));
        d.addEventListener('input', () => { depthValue.textContent = pct(Number(d.value)); });   // follows the drag
        grid.append(forgeEl(doc, 'span', 'fx-dim', word), withEnds(d, 'Dry', 'Wet'), depthValue, t);
      });
    }
    reverbRow.append(grid);
    body.append(reverbRow, forgeEl(doc, 'p', 'fx-dim fx-setting-note', 'The echo where the camera stands: depth 0 to 1 and the seconds it eases in. Zones are the map’s own areas.'));

    // The loading screen (research 125): its map, title and description.
    const l: LoadingSetting = s.loading ?? { from: null, title: null, description: null };
    const write = (patch: Partial<LoadingSetting>): void => {
      const n = { ...l, ...patch };
      tell({ loading: n.from === null && n.title === null && n.description === null ? null : n });
    };
    const from = forgeEl(doc, 'select', 'fx-select');
    from.dataset['world'] = 'loading-from';
    from.setAttribute('aria-label', 'Loading screen map');
    // Under its header, as every map list of the Forge (the asset browser's): the multiplayer maps.
    const group = forgeEl(doc, 'optgroup', '');
    group.label = 'Multiplayer';
    group.append(...v.maps.map(([stem, label]) => option(stem, label)));
    from.append(option('', 'Map’s own'), group);
    from.value = l.from ?? '';
    from.disabled = v.locked;
    from.addEventListener('change', () => write({ from: from.value === '' ? null : from.value }));
    const text = (key: 'title' | 'description', max: number, placeholder: string): HTMLInputElement => {
      const i = forgeEl(doc, 'input', 'fx-search');
      i.type = 'text';
      i.maxLength = max;
      i.dataset['world'] = `loading-${key}`;
      i.placeholder = placeholder;
      i.value = l[key] ?? '';
      i.setAttribute('aria-label', `Loading screen ${key}`);
      i.disabled = v.locked;
      i.addEventListener('change', () => write({ [key]: i.value.trim() === '' ? null : i.value.trim().slice(0, max) }));
      return i;
    };
    // TODO (the owner, 2026-11-10: a placeholder, "basically a todo"): a custom picture for the loading screen -- a
    // browser adaptation with no original (the picture is the binding's `load_picture` bitmap, research 125). Its storage
    // is not decided (in the layout as a data URL, or a content pack's asset), so the button only says so.
    const custom = forgeEl(doc, 'button', 'fx-chip', 'Custom picture…');
    custom.type = 'button';
    custom.dataset['world'] = 'loading-custom';
    custom.title = 'Use your own image as the loading screen picture (not supported yet)';
    custom.disabled = v.locked;
    const unsupported = forgeEl(doc, 'p', 'fx-setting-note fx-world-error', '');
    unsupported.setAttribute('role', 'alert');
    unsupported.hidden = true;
    custom.addEventListener('click', () => {
      unsupported.textContent = 'Custom loading pictures are not supported yet. Ask a developer to implement it.';
      unsupported.hidden = false;
    });
    const loadRow = forgeEl(doc, 'div', 'fx-setting');
    loadRow.append(head('Loading screen', 'loading', !!s.loading, v.locked), from,
      text('title', LOADING_TITLE_MAX, v.own.title ?? 'The map’s own title'), text('description', LOADING_DESCRIPTION_MAX, 'The map’s own description'),
      custom, unsupported);
    body.append(loadRow, forgeEl(doc, 'p', 'fx-dim fx-setting-note', 'Shown when Play starts through the loading screen (Play settings › Start).'));
  };

  return { body, draw, onChange: (cb) => { listeners = [...listeners, cb]; } };
}
