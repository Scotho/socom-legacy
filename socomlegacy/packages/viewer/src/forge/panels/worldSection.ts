import { FOV_HALF_MAX, FOV_HALF_MIN, LOADING_DESCRIPTION_MAX, LOADING_TITLE_MAX, REVERB_SECONDS_MAX } from '@s2u/creator-contracts';
import type { LayoutSettings, LoadingSetting, ReverbSetting } from '../layout';
import { fovForVertical, SURFACE_CHOICES, verticalDegrees } from '../worldSettings';
import { forgeEl } from '../shell/panel';
import { ownButton, presetButton, propRow, subsection } from './propGrid';

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
  /** The disc's campaign missions (the owner, 2026-11-25: every map list offers them), under their own header. */
  campaignMaps?: readonly (readonly [string, string])[];
  locked: boolean;
}

export interface WorldSection {
  body: HTMLElement;
  draw(view: WorldView): void;
  onChange(cb: (patch: Partial<LayoutSettings>) => void): void;
  /** Reverb's Preset pressed: the page asks which disc map's reverb to copy in. */
  onPreset(cb: (group: 'reverb') => void): void;
}

/** The slider's ends, full vertical degrees (from the contract's half-angle bounds). */
const FOV_MIN_DEG = Math.ceil(verticalDegrees(FOV_HALF_MIN)), FOV_MAX_DEG = Math.floor(verticalDegrees(FOV_HALF_MAX));
/** The zones the panel shows a list at least (the disc's maps name one or two). */
const ZONES_SHOWN = 2;

/**
 * `mapTable`: the Map group's rows, where the Default surface and the loading screen's rows go (the owner, 2026-11-25:
 * no Surface & view group of one row; "move the loading screen group into the map group"); without one, they are the
 * section's first.
 */
export function buildWorldSection(doc: Document, mapTable?: HTMLElement): WorldSection {
  const body = forgeEl(doc, 'div', 'fx-world fx-subfolds');
  let mapRows: HTMLElement[] = [];
  let listeners: ((p: Partial<LayoutSettings>) => void)[] = [];
  let presetListeners: ((group: 'reverb') => void)[] = [];
  let stamp = '';
  const tell = (p: Partial<LayoutSettings>): void => { for (const l of listeners) l(p); };
  const option = (value: string, label: string): HTMLOptionElement => { const o = forgeEl(doc, 'option', '', label); o.value = value; return o; };
  /** A Map's own reset for setting `reset` (cleared to the map's own on its press). */
  const own = (reset: 'fov' | 'reverb' | 'loading', on: boolean, locked: boolean, title: string): HTMLButtonElement => {
    const b = ownButton(doc, title, on, locked);
    b.dataset['worldReset'] = reset;
    b.addEventListener('click', () => tell({ [reset]: null }));
    return b;
  };
  /** The disc's maps as a list's groups: Multiplayer, then Campaign (where the disc holds any). */
  const mapGroups = (v: WorldView): HTMLOptGroupElement[] => ([['Multiplayer', v.maps], ['Campaign', v.campaignMaps ?? []]] as const)
    .filter(([, rows]) => rows.length > 0)
    .map(([label, rows]) => { const g = forgeEl(doc, 'optgroup', ''); g.label = label; g.append(...rows.map(([stem, words]) => option(stem, words))); return g; });
  /** A value read beside its control (a slider's degrees or percent): the readout's face, a fixed width. */
  const readout = (text: string): HTMLSpanElement => forgeEl(doc, 'span', 'fx-setting-value fx-prop-readout', text);

  const draw = (v: WorldView): void => {
    const s = v.settings;
    const next = JSON.stringify([s.defaultMaterial, s.reverb, s.ambience, s.fov, s.loading, v.own, v.locked, v.maps.length, v.campaignMaps?.length ?? 0]);
    if (next === stamp) return;                                    // unchanged: focus and typing kept
    stamp = next;
    // One sub-section of its own (the owner, 2026-11-25): Reverb; the Default surface and the loading screen rows of the
    // Map group.
    // Sound (the owner, 2026-11-25: "add the ambient sound"): the ambience, then the reverb zones; its Reset both.
    const reverbPreset = presetButton(doc, "Use a disc map's ambience and reverb zones in this map", v.locked);
    reverbPreset.dataset['worldPreset'] = 'reverb';
    reverbPreset.addEventListener('click', () => { for (const l of presetListeners) l('reverb'); });
    const soundReset = ownButton(doc, 'Back to the map’s own ambience and reverb zones', !!s.reverb || !!s.ambience, v.locked);
    soundReset.dataset['worldReset'] = 'reverb';
    soundReset.addEventListener('click', () => tell({ reverb: null, ambience: null }));
    const reverbFold = subsection(doc, 'Sound', { preset: reverbPreset, reset: soundReset });
    const ambience = forgeEl(doc, 'select', 'fx-select');
    ambience.dataset['world'] = 'ambience';
    ambience.setAttribute('aria-label', 'Ambience');
    ambience.title = 'The background sound outdoors and indoors: a disc map’s, played in Play';
    ambience.append(option('', 'Map’s own'), ...mapGroups(v));
    ambience.value = s.ambience ?? '';
    ambience.disabled = v.locked;
    ambience.addEventListener('change', () => tell({ ambience: ambience.value === '' ? null : ambience.value }));
    reverbFold.table.append(propRow(doc, 'Ambience', ambience));
    body.replaceChildren(reverbFold.fold);

    // The default surface (`DefaultMaterial`).
    const surface = forgeEl(doc, 'select', 'fx-select');
    surface.dataset['world'] = 'surface';
    surface.setAttribute('aria-label', 'Default surface');
    surface.append(option('', `Map’s own${v.own.material ? ` (${v.own.material})` : ''}`), ...SURFACE_CHOICES.map((n) => option(n, n)));
    surface.value = s.defaultMaterial ?? '';
    surface.disabled = v.locked;
    surface.addEventListener('change', () => tell({ defaultMaterial: surface.value === '' ? null : surface.value }));
    const surfaceRow = propRow(doc, 'Default surface', surface);

    // No field of view row (the owner, 2026-11-25: "remove the field of view property from the surface and view section"):
    // a layout's own value, where it has one, is kept as it was read; nothing here sets it.

    // The reverb (`IndoorReverb` / `OutdoorReverb`): a row a zone -- its depth (dry to wet), the percent, its echo fade-in seconds.
    const lists: ReverbSetting = s.reverb ?? v.own.reverb ?? { indoor: [], outdoor: [] };
    const padded = (l: [number, number][]): [number, number][] => [...l, ...Array.from({ length: Math.max(0, ZONES_SHOWN - l.length) }, () => [0, 1] as [number, number])];
    const shown: ReverbSetting = { indoor: padded(lists.indoor), outdoor: padded(lists.outdoor) };
    const pct = (n: number): string => `${Math.round(n * 100)}%`;
    // Zone by zone, indoor then outdoor (the owner, 2026-11-25: "Indoor 1, Outdoor 1, Indoor 2, Outdoor 2").
    const zones = Math.max(shown.indoor.length, shown.outdoor.length);
    for (let zone = 0; zone < zones; zone++) for (const list of ['indoor', 'outdoor'] as const) {
      const at = shown[list][zone];
      if (!at) continue;
      {
        const [depth, seconds] = at;
        const word = `${list === 'indoor' ? 'Indoor' : 'Outdoor'} ${zone + 1}`;
        const d = forgeEl(doc, 'input', 'fx-range');
        d.type = 'range'; d.min = '0'; d.max = '1'; d.step = '0.01'; d.value = String(depth);
        d.title = 'Depth: dry to wet';
        // FC2 (ours; the dock's one stepper control, FUI-22 D2, as every docked number field): `fx-stepper`.
        const t = forgeEl(doc, 'input', 'fx-num fx-setting-num fx-stepper fx-prop-num');
        t.type = 'number'; t.min = '0'; t.max = String(REVERB_SECONDS_MAX); t.step = '0.1'; t.value = String(seconds);
        t.title = 'Echo fade-in, seconds: how long the echo takes to reach this zone’s depth when you step into it (the background sound is not faded by it)';
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
        const depthValue = readout(pct(depth));
        d.addEventListener('input', () => { depthValue.textContent = pct(Number(d.value)); });   // follows the drag
        depthValue.classList.add('fx-prop-readout--pct');           // its whole percent shown, never clipped
        // The fade-in seconds named beside its field (the owner, 2026-11-25: "add an ease in label"; renamed "Echo fade-in":
        // it times the reverb's depth alone, `snd_AutoReverb`'s ramp, not the ambience's change).
        const easeLabel = forgeEl(doc, 'span', 'fx-prop-unit', 'Echo fade-in');
        easeLabel.title = t.title;
        const seconds_ = forgeEl(doc, 'span', 'fx-prop-unit', 's');
        reverbFold.table.append(propRow(doc, word, d, depthValue, easeLabel, t, seconds_));
      }
    }

    // The loading screen (research 125): its map, title and description, and the custom picture's button.
    const l: LoadingSetting = s.loading ?? { from: null, title: null, description: null };
    const write = (patch: Partial<LoadingSetting>): void => {
      const n = { ...l, ...patch };
      tell({ loading: n.from === null && n.title === null && n.description === null ? null : n });
    };
    const from = forgeEl(doc, 'select', 'fx-select');
    from.dataset['world'] = 'loading-from';
    from.setAttribute('aria-label', 'Loading screen map');
    // The multiplayer maps alone (the owner, 2026-11-25: "remove the campaign from the loading screen list").
    from.append(option('', 'Map’s own'), ...mapGroups({ ...v, campaignMaps: [] }));
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
    // The Map group's rows from this section, put back in place of the last draw's (the group has no Reset: a loading
    // screen field cleared is the map's own again).
    const rowsForMap = [
      surfaceRow,
      propRow(doc, 'Loading screen', from),
      propRow(doc, 'Loading title', text('title', LOADING_TITLE_MAX, v.own.title ?? 'The map’s own title')),
      propRow(doc, 'Loading description', text('description', LOADING_DESCRIPTION_MAX, 'The map’s own description')),
      propRow(doc, 'Loading picture', custom),
      unsupported,
    ];
    for (const r of mapRows) r.remove();
    if (mapTable) mapTable.append(...rowsForMap);
    else body.prepend(...rowsForMap);
    mapRows = rowsForMap;
  };

  return { body, draw, onChange: (cb) => { listeners = [...listeners, cb]; }, onPreset: (cb) => { presetListeners = [...presetListeners, cb]; } };
}
