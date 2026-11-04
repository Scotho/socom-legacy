import { VIDEO_PICTURE_HD_OFFERED } from '@s2u/ui';
import { experimentalFrameSize, EXPERIMENTAL_MAX_SCALE } from './experimentalResolution';
import {worldSamplingMaximum} from './experimentalWorldSampling';
import type {ResolveFilter} from './experimentalResolve';
import { menuPreviewUrl, type UiSamplingMode } from './experimentalUiSampling';
import { PACK_CHOICE_DEFAULT, type PackIndexEntry, type PackLibrary } from './texturePack';
import { infoButtonMarkup, tipMarkup, wirePanelTips } from './panelTips';

/**
 * A browser adaptation with no original (MISSION, the parity rule): off compiles the original's graph;
 * the owner's experiment exception is HUMAN_TASKS H135. Never stored in the ordinary picture preference.
 */
export interface ExperimentalSettings {
  worldAnisotropy: boolean;
  worldTrilinear: boolean;
  worldLodBias: boolean;
  worldLodBiasValue: number;
  fxaa: boolean;
  resolveFiltering: boolean;
  resolveFilter: ResolveFilter;
  enabled: boolean;
  sharpen: boolean;
  sharpness: number;
  renderScale: number;
  /** GX-21: the chosen texture pack -- a library entry's id, `PACK_CHOICE_DEFAULT` (the map's default pack) or null (Original). */
  localTexturePack: string | null;
  /** OT.R92 (HD-6): the HD pack made for PCSX2 (`hdTexturePack.ts`), served from `experimental-packs/hd/`. */
  hdPack: boolean;
  hudSampling: boolean;
  hudMode: UiSamplingMode;
  hudSharpness: number;
  hudSnap: number;
  menuSampling: boolean;
  menuMode: UiSamplingMode;
  menuSharpness: number;
  menuSnap: number;
  bloom: boolean;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  textureBias: boolean;
  mipBias: number;
  detailAdjust: boolean;
  detailStrength: number;
  detailRange: number;
  characterLight: boolean;
  characterAmbient: number;
  characterDirectional: number;
  grade: boolean;
  exposure: number;
  contrast: number;
  saturation: number;
  highlightRollOff: boolean;
  highlightStrength: number;
  whiteBalance: boolean;
  warmth: number;
  tint: number;
  toneBalance: boolean;
  shadows: number;
  highlights: number;
  bloomTint: boolean;
  bloomRed: number;
  bloomGreen: number;
  bloomBlue: number;
}

// The owner's chosen values, not a reading of the original (H135). Craig, 2026-10-08: character lighting on at ambient
// 0.8; the map texture mip bias on at its default. The local texture pack on with the Experimental view (GX.R8,
// 2026-10-09: "include the option as on while experimental is turned on"): since GX-21 the map's default pack
// (`current.json`'s) is the chooser's default. Craig, 2026-10-11, after his A/B on main 01035996d ("some new
// experimental defaults ... texture pack approved"): the map detail adjustment on at strength 0.55 and distance 1.60;
// FXAA on; the render-scale resolve filter on at bicubic (it applies while the render scale is above 1, as the default
// 1.5 is). None of these run unless the Experimental view is selected.
export const EXPERIMENTAL_DEFAULTS: ExperimentalSettings = {
  worldAnisotropy: false, worldTrilinear: false, worldLodBias: false, worldLodBiasValue: 0,
  fxaa: true, resolveFiltering: true, resolveFilter: 'bicubic',
  enabled: false, sharpen: true, sharpness: 1, renderScale: 1.5, localTexturePack: PACK_CHOICE_DEFAULT, hdPack: false,
  bloom: true, bloomStrength: 0.2, bloomThreshold: 0.6, bloomRadius: 2.5,
  textureBias: true, mipBias: -1, detailAdjust: true, detailStrength: 0.55, detailRange: 1.6,
  characterLight: true, characterAmbient: 0.8, characterDirectional: 1.25,
  grade: true, exposure: 0.08, contrast: 1, saturation: 1.04,
  highlightRollOff: false, highlightStrength: 0.5,
  // Optional browser colour experiments (research 260): neutral/off until chosen.
  whiteBalance: false, warmth: 0, tint: 0, toneBalance: false, shadows: 0, highlights: 0,
  bloomTint: false, bloomRed: 1, bloomGreen: 1, bloomBlue: 1,
  hudSampling: false, hudMode: 'nearest', hudSharpness: 0.5, hudSnap: 1,
  menuSampling: false, menuMode: 'nearest', menuSharpness: 0.5, menuSnap: 1,
};

/** One control of a group, as markup (GX-21). Ids are written without the panel's `exp-` prefix. */
export type ExperimentalControl =
  | {kind: 'check'; id: string; label: string; checked: boolean}
  | {kind: 'slider'; id: string; label: string; min: number; max: number; step: number; value: number}
  | {kind: 'select'; id: string; label: string; options: readonly {value: string; label: string; selected?: boolean}[]}
  | {kind: 'note'; text: string; id?: string}
  | {kind: 'link'; id: string; text: string}
  | {kind: 'button'; id: string; text: string; disabled?: boolean}
  /** GX-27: a hidden file chooser, opened by a button of its group. */
  | {kind: 'file'; id: string; accept: string};
/** How a row reads its controls: `num` also writes the slider's shown value. `selected`: the Experimental view is chosen. */
export interface ExperimentalReader {selected: boolean; check(id: string): boolean; num(id: string): number; choice(id: string): string}
/**
 * A group of the panel, one row of `EXPERIMENTAL_GROUPS` (GX-21, GX.R11): a new group is a row, not a layout change.
 * `switch` is the control that turns the group off and `off` the settings it then gives; `requires` keeps a control
 * disabled until its prerequisite holds (beyond the panel's own switch); `status` writes the group's notes.
 */
export interface ExperimentalGroup {
  id: string;
  label: string;
  controls: readonly ExperimentalControl[];
  switch?: string;
  read(r: ExperimentalReader): Partial<ExperimentalSettings>;
  requires?: readonly {ids: readonly string[]; when: (s: ExperimentalSettings, r: ExperimentalReader) => boolean}[];
  off: Partial<ExperimentalSettings>;
  status?(s: ExperimentalSettings, r: ExperimentalReader, panel: HTMLElement): void;
}
const D = EXPERIMENTAL_DEFAULTS;
/** The chooser's permanent option for the loaded map's default pack (`current.json`'s); its value survives map changes. */
const DEFAULT_PACK_LABEL = 'Map\'s default pack';
const check = (id: string, label: string, checked: boolean): ExperimentalControl => ({kind: 'check', id, label, checked});
const slider = (id: keyof ExperimentalSettings, label: string, min: number, max: number, step: number): ExperimentalControl =>
  ({kind: 'slider', id, label, min, max, step, value: D[id] as number});
const note = (text: string, id?: string): ExperimentalControl => (id === undefined ? {kind: 'note', text} : {kind: 'note', text, id});
const SAMPLING_MODES = [['nearest', 'Nearest neighbour'], ['bilinear', 'Bilinear'], ['integer', 'Integer nearest'], ['sharpen', 'Nearest + sharpening']] as const;
function samplingGroup(group: 'hud' | 'menu'): ExperimentalGroup {
  const label = group === 'hud' ? 'HUD' : 'Menu';
  const menuExtras: ExperimentalControl[] = group === 'hud' ? [] : [
    note('Nearest shows crisp pixels; bilinear softens edges. Sharpening affects RGB only: compare 0 with 1 on coloured detail; uniform-colour icons with only alpha edges will not change. Integer step chooses whole multiples that fit inside the existing box. HUD content stays centred; fills, stretched panels and scope masks keep their coverage. Different integer steps can produce the same size.'),
    {kind: 'link', id: 'menu-preview', text: 'Open menu preview'},
    note('Open menu preview does not affect the settings panel. At 1920 x 1080 physical pixels, all integer steps fit at 2x.'),
    note('The link carries menu settings to a new tab. Integer nearest fits the entire 640 x 448 menu frame in the window. Existing menu tabs keep their settings; open the link again after changes. Nothing is stored.'),
  ];
  return {
    id: group, label: `${label} sampling`, switch: `${group}Sampling`,
    controls: [
      check(`${group}Sampling`, `${label} sampling`, D[`${group}Sampling`]),
      ...(group === 'hud' ? [note('The HUD and the reticle drawn with another filter: nearest shows crisp pixels, bilinear softens edges. Visible in Play with the HUD/reticle shown (Explore draws neither).')] : []),
      {kind: 'select', id: `${group}Mode`, label: 'Sampling', options: SAMPLING_MODES.map(([value, text]) => ({value, label: text, selected: value === D[`${group}Mode`]}))},
      slider(`${group}Sharpness`, 'UI sharpness', 0, 1, 0.05),
      slider(`${group}Snap`, 'Integer step', 1, 4, 1),
      note('', `${group}-status`),
      ...menuExtras,
    ],
    read: r => ({[`${group}Sampling`]: r.check(`${group}Sampling`), [`${group}Mode`]: r.choice(`${group}Mode`) as UiSamplingMode,
      [`${group}Sharpness`]: r.num(`${group}Sharpness`), [`${group}Snap`]: r.num(`${group}Snap`)}),
    requires: [
      {ids: [`${group}Mode`], when: s => s[`${group}Sampling`]},
      {ids: [`${group}Sharpness`], when: s => s[`${group}Sampling`] && s[`${group}Mode`] === 'sharpen'},
      {ids: [`${group}Snap`], when: s => s[`${group}Sampling`] && s[`${group}Mode`] === 'integer'},
    ],
    off: {[`${group}Sampling`]: false},
    status(s, _r, panel) {
      const active = s.enabled && s[`${group}Sampling`];
      panel.querySelector(`#exp-${group}-status`)!.textContent = !active ? 'Off: turn on Effects and this group.'
        : group === 'menu' ? 'Use Open menu preview after each change.'
        : 'The original reticle already uses nearest; compare Bilinear in Play.';
      if (group === 'menu') panel.querySelector<HTMLAnchorElement>('#exp-menu-preview')!.href = menuPreviewUrl(panel.ownerDocument.baseURI, {
        enabled: s.enabled && s.menuSampling, mode: s.menuMode, sharpness: s.menuSharpness, snap: s.menuSnap,
      });
    },
  };
}
/** A plain switched group: its checkbox, its sliders (gated by the checkbox), its notes. */
function switched(id: keyof ExperimentalSettings, label: string, sliders: ExperimentalControl[], notes: ExperimentalControl[], extra: Partial<ExperimentalGroup> = {}): ExperimentalGroup {
  const ids = sliders.map(c => (c as {id: string}).id);
  return {
    id, label, switch: id, controls: [check(id, label, D[id] as boolean), ...sliders, ...notes],
    read: r => Object.fromEntries([[id, r.check(id)], ...ids.map(k => [k, r.num(k)])]) as Partial<ExperimentalSettings>,
    requires: [{ids, when: s => s[id] as boolean}], off: {[id]: false}, ...extra,
  };
}

/**
 * The panel, one row per group, in its order on the page (GX-21, GX.R11). The markup and the settings object are built
 * from this table; with every group off the settings are those of before (`experimentalPanelTable.test.ts`).
 */
export const EXPERIMENTAL_GROUPS: readonly ExperimentalGroup[] = [
  {
    id: 'master', label: 'Effects', switch: 'enabled',
    controls: [check('enabled', 'Effects on', true),
      note('Applies globally to maps and player models. Switch off for an A/B with the original picture; your settings are kept. World effects and UI sampling have their own switches.'),
      note('Select Experimental above.', 'status')],
    read: r => ({enabled: r.selected && r.check('enabled')}), off: {enabled: false},
    status(s, r, panel) {
      panel.querySelector('#exp-status')!.textContent = !r.selected ? 'Select Experimental above.'
        : s.enabled ? 'On: the world and player models.' : 'Original picture; settings kept for A/B.';
    },
  },
  switched('sharpen', 'Sharpening', [slider('sharpness', 'Sharpness', 0, 1.5, 0.05)],
    [note('Compare 0 with 1.5 on existing world edges. Flat colours have no detail to sharpen.')]),
  {
    id: 'resolution', label: 'Render scale', switch: 'resolution',
    controls: [check('resolution', 'Render scale', true), slider('renderScale', 'Scale', 1, EXPERIMENTAL_MAX_SCALE, 0.25),
      note('4x requests 16 times the pixels; 6x requests 36 times. Actual size is limited to 4096 pixels per edge. Bilinear downsampling can still miss fine detail at very high scales.'),
      note('', 'render-info')],
    read: r => ({renderScale: r.check('resolution') ? r.num('renderScale') : (r.num('renderScale'), 1)}),
    requires: [{ids: ['renderScale'], when: (_s, r) => r.check('resolution')}], off: {renderScale: 1},
  },
  switched('bloom', 'Bloom', [slider('bloomStrength', 'Strength', 0, 0.6, 0.02), slider('bloomThreshold', 'Threshold', 0.6, 0.98, 0.02), slider('bloomRadius', 'Spread', 0.5, 2.5, 0.25)],
    [note('Compare strength 0 with 0.6 on bright areas. Threshold 0.6 admits more highlights than 0.98; spread changes the glow\'s width. Sky and pale surfaces can glow too. Pauses during flashbang glow.')]),
  {
    // GX-21 (GX.R10): the texture pack chooser. Its options are the loaded map's library (`showPackLibrary`).
    id: 'pack', label: 'Texture pack', switch: 'texturePack',
    controls: [
      {kind: 'select', id: 'texturePack', label: 'Texture pack', options: [{value: '', label: 'Original'}, {value: PACK_CHOICE_DEFAULT, label: DEFAULT_PACK_LABEL, selected: D.localTexturePack === PACK_CHOICE_DEFAULT}]},
      // GX-27 (the owner's word, 2026-10-15): import a base pack's zip with replaced PNGs; it is built and kept in this
      // browser only (`texturePackRuntime.ts` wires these by id). A browser adaptation, H135.
      {kind: 'button', id: 'pack-import', text: 'Import pack (.zip)', disabled: true},
      {kind: 'button', id: 'pack-remove', text: 'Remove', disabled: true},
      {kind: 'file', id: 'pack-file', accept: '.zip,application/zip'},
      note('Import a base pack zip whose PNGs you replaced at 2x or 4x; it is checked, built and kept in this browser only.', 'pack-import-status'),
      note('Packs come from the current map\'s local library; generation is a separate local tool. Original applies none. A pack that does not follow the conventions is refused with its reason; missing or incompatible textures keep their originals.'),
      note('Original textures active.', 'pack-status'),
    ],
    read: r => ({localTexturePack: r.choice('texturePack') || null}), off: {localTexturePack: null},
  },
  // OT.R92 (HD-6, plan 2026-10-31-hd-texture-pack-parity): a PCSX2 replacement pack over every decoded texture --
  // world, characters, weapons, effects, HUD -- transparency allowed. Off by default; a browser adaptation, H135.
  switched('hdPack', 'HD texture pack - PCSX2', [], [
    // HD-HOLD (the owner, 2026-11-01): the switch is drawn but disabled and reads off while the HD picture is held; a
    // switch left out of the markup broke every test-room boot (its read found no control).
    ...(VIDEO_PICTURE_HD_OFFERED ? [] : [note('Held until after the GPU work.', 'hd-pack-held')]),
    note('Applies the local HD pack (experimental-packs/hd, made by tools/hd-pack-from-pcsx2.ts) to every texture it binds at the 98-99% bar. While on, the map texture pack above is held at Original.'),
    note('HD pack off.', 'hd-pack-status'),
  ], {read: r => ({hdPack: VIDEO_PICTURE_HD_OFFERED && r.check('hdPack')})}),
  // GX-24 (H135): all new renderer groups are opt-in browser adaptations.
  switched('worldAnisotropy', 'Anisotropic filtering', [], [
    note('', 'world-anisotropy-status'),
    note('Applied per eligible texture when enabled.'),
    note('Existing mipmapped world base textures only. Names shared with props, characters, weapons, detail layers or other roles stay original. Uses derivative LOD and trilinear filtering; overrides Mip bias on those bases. Mip levels past the disc\'s authored ones are the loader\'s filtered tail, not the original\'s: the original depth-based LOD never reaches that tail; derivative sampling does.'),
  ], {
    requires: [{ids:['worldAnisotropy'], when: () => worldSamplingMaximum() > 1}],
    status(_s, _r, panel) { panel.querySelector('#exp-world-anisotropy-status')!.textContent = worldSamplingMaximum() > 1
      ? 'Device maximum: ' + worldSamplingMaximum() + 'x.'
      : 'Unsupported on this device (none above 1x).'; },
  }),
  switched('worldTrilinear', 'Trilinear filtering', [], [
    note('Uses derivative LOD instead of the original depth-based LOD, on existing mipmapped world bases only. The original already interpolates its authored mip levels. Shared texture names stay original; textures without mipmaps are unsupported. Overrides Mip bias on eligible bases. Mip levels past the disc\'s authored ones are the loader\'s filtered tail, not the original\'s: the original depth-based LOD never reaches that tail; derivative sampling does.'),
  ]),
  switched('worldLodBias', 'Derivative LOD bias', [slider('worldLodBiasValue', 'Bias', -2, 2, 0.25)], [
    note('Requires Trilinear or a supported Anisotropic filtering. Negative selects finer mip levels and may shimmer; positive selects coarser ones. Zero is neutral within that derivative path.'),
  ], {requires:[{ids:['worldLodBiasValue'], when:s => s.worldLodBias && (s.worldTrilinear || (s.worldAnisotropy && worldSamplingMaximum() > 1))}]}),
  switched('fxaa', 'FXAA', [], [
    note('Smooths the final world picture after colour and resolve, before the HUD. May soften fine detail. Adds one display-sized intermediate and one pass; OFF releases the intermediate. No original-game equivalent.'),
  ]),
  {
    id:'resolveFiltering', label:'Resolve filter', switch:'resolveFiltering',
    controls:[check('resolveFiltering', 'Resolve filter', D.resolveFiltering),
      {kind:'select', id:'resolveFilter', label:'Filter', options:['nearest','bilinear','bicubic'].map(value => ({value,label:value,selected:value === D.resolveFilter}))},
      note('Requires render scale above 1. Nearest preserves hard pixels; bilinear is the existing filter; bicubic uses 16 taps per lookup (up to 80 in the picture pass) and may ring. OFF keeps the exact existing pass. This is reconstruction, not an area-average of every supersample.')],
    read:r => ({resolveFiltering:r.check('resolveFiltering'), resolveFilter:r.choice('resolveFilter') as ResolveFilter}),
    requires:[{ids:['resolveFilter'], when:s => s.resolveFiltering && s.renderScale > 1}], off:{resolveFiltering:false},
  },
  switched('textureBias', 'Mip bias', [slider('mipBias', 'Bias', -2, 2, 0.25)],
    [note('Negative keeps sharper existing mip levels farther away; positive softens. Textures already at full detail cannot become sharper. Strong negative bias may shimmer.')]),
  switched('detailAdjust', 'Map detail', [slider('detailStrength', 'Strength', 0, 2, 0.05), slider('detailRange', 'Distance', 0.5, 2, 0.1)],
    [note('Modern already shows these detail layers on surfaces that have them. This switch adjusts their strength and distance; switching it off restores the original. Distance only changes how far the layers reach. No new textures or surface detail are added.'), note('', 'detail-status')]),
  switched('characterLight', 'Character light', [slider('characterAmbient', 'Ambient', 0, 2, 0.05), slider('characterDirectional', 'Directional', 0, 2, 0.05)],
    [note('Requires a visible character or worn gear; the map will not change. Compare 0 with 2 for each light; 1 uses the map\'s original lighting. Ambient lifts shaded areas; directional light emphasizes the existing shape.')]),
  switched('grade', 'Colour', [slider('exposure', 'Exposure', -1, 1, 0.02), slider('contrast', 'Contrast', 0.75, 1.4, 0.01), slider('saturation', 'Saturation', 0, 1.6, 0.02)],
    [note('Exposure -1 to +1 darkens to brightens; saturation 0 removes colour. Exposure 0, contrast 1 and saturation 1 are neutral.')]),
  switched('whiteBalance', 'Warmth / tint', [slider('warmth', 'Warmth', -1, 1, 0.05), slider('tint', 'Tint', -1, 1, 0.05)],
    [note('Enable this group, then compare -1 with +1. Warmth: cool blue to warm red. Tint: green to magenta. Zero keeps the existing colour.')]),
  switched('toneBalance', 'Shadows / highlights', [slider('shadows', 'Shadows', -1, 1, 0.05), slider('highlights', 'Highlights', -1, 1, 0.05)],
    [note('Compare -1 with +1 in dark or bright areas. Zero is neutral; middle grey and pure black do not change. Cannot recover detail missing from the source.')]),
  switched('bloomTint', 'Bloom colour', [slider('bloomRed', 'Red', 0, 2, 0.05), slider('bloomGreen', 'Green', 0, 2, 0.05), slider('bloomBlue', 'Blue', 0, 2, 0.05)],
    [note('Requires Bloom with positive strength and pixels above its threshold. Compare one channel at 0 and 2 on visible glow; 1 is neutral. Pauses during flashbang glow.'), note('', 'colour-status')], {
      requires: [{ids: ['bloomRed', 'bloomGreen', 'bloomBlue'], when: s => s.bloomTint && s.bloom && s.bloomStrength > 0}],
      status(s, _r, panel) {
        const colourStates = [
          'Warmth/tint: ' + (!s.whiteBalance ? 'off' : s.warmth === 0 && s.tint === 0 ? 'neutral' : 'on'),
          'Shadow/highlight: ' + (!s.toneBalance ? 'off' : s.shadows === 0 && s.highlights === 0 ? 'neutral' : 'on'),
          'Bloom colour: ' + (!s.bloomTint ? 'off' : !s.bloom || s.bloomStrength === 0 ? 'needs Bloom with positive strength' : s.bloomRed === 1 && s.bloomGreen === 1 && s.bloomBlue === 1 ? 'neutral' : 'on'),
        ];
        panel.querySelector('#exp-colour-status')!.textContent = s.enabled ? colourStates.join('. ') + '.' : 'Bypassed while Effects are off.';
      },
    }),
  switched('highlightRollOff', 'Highlight roll-off', [slider('highlightStrength', 'Softness', 0, 1, 0.05)],
    [note('Compare 0 with 1 in bright areas. Keeps darker tones unchanged. Cannot restore detail already clipped in the source image.')]),
  samplingGroup('hud'),
  samplingGroup('menu'),
  {
    id: 'about', label: 'Reset',
    controls: [note('Browser adaptation: these effects have no original console counterpart. Switching them off restores the original picture.'),
      note('Only the optional local pack loads replacement textures. Modern and PS2 keep the original renderer. First use of an effect may pause briefly. Settings reset on reload.'),
      {kind: 'button', id: 'reset', text: 'Reset all'}],
    read: () => ({}), off: {},
  },
];
/**
 * TRS-CONDENSE (the owner, 2026-11-01: "reorganize them into logical categories"; a browser adaptation, product track):
 * the rows above in five folded categories on the page, the master switch above them and Reset below. The table's own
 * order, its keys, defaults and ids are untouched; only where a row is drawn changes.
 */
export const EXPERIMENTAL_CATEGORIES: readonly {id: string; label: string; groups: readonly string[]}[] = [
  {id: 'textures', label: 'Textures & HD', groups: ['pack', 'hdPack']},   // HD-HOLD: drawn always, disabled while held
  {id: 'resolution', label: 'Resolution', groups: ['resolution', 'resolveFiltering', 'sharpen', 'fxaa']},
  {id: 'detail', label: 'Detail', groups: ['detailAdjust', 'textureBias', 'worldAnisotropy', 'worldTrilinear', 'worldLodBias']},
  {id: 'colour', label: 'Light & colour', groups: ['grade', 'bloom', 'bloomTint', 'characterLight', 'whiteBalance', 'toneBalance', 'highlightRollOff']},
  {id: 'ui', label: 'HUD & menus', groups: ['hud', 'menu']},
];
/** The settings keys a row reads (a probe read; no document). */
export const groupKeys = (g: ExperimentalGroup): string[] =>
  Object.keys(g.read({selected: false, check: () => false, num: () => 0, choice: () => ''}));

function controlMarkup(c: ExperimentalControl): string {
  switch (c.kind) {
    case 'check': return `<label class="s2u-check"><input id="exp-${c.id}" type="checkbox"${c.checked ? ' checked' : ''} /> <span>${c.label}</span></label>`;
    case 'slider': return `<label class="s2u-range"><span>${c.label}</span><input id="exp-${c.id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}" /><output id="exp-${c.id}-out">${c.value}</output></label>`;
    case 'select': return `<label class="s2u-field"><span>${c.label}</span><select class="s2u-select" id="exp-${c.id}">${c.options.map(o => `<option value="${o.value}"${o.selected ? ' selected' : ''}>${o.label}</option>`).join('')}</select></label>`;
    case 'note': return `<p class="s2u-field__note"${c.id === undefined ? '' : ` id="exp-${c.id}"`}>${c.text}</p>`;
    case 'link': return `<a class="s2u-button" id="exp-${c.id}" target="_blank" rel="noopener">${c.text}</a>`;
    case 'button': return `<button type="button" class="s2u-button" id="exp-${c.id}"${c.disabled ? ' disabled' : ''}>${c.text}</button>`;
    case 'file': return `<input id="exp-${c.id}" type="file" accept="${c.accept}" hidden aria-hidden="true" tabindex="-1" />`;
  }
}

const amp = (s: string): string => s.replace(/&/g, '&amp;');
const isExplanation = (c: ExperimentalControl): c is {kind: 'note'; text: string} => c.kind === 'note' && c.id === undefined;
/**
 * One row on the page (TRS-CONDENSE): its first control with an info button beside it, its other controls, and its
 * explanations -- the notes without an id -- folded into the button's tooltip (`./panelTips`). A note with an id is a
 * live status and stays on the page.
 */
function groupMarkup(g: ExperimentalGroup): string {
  const tip = g.controls.filter(isExplanation).map(c => c.text).join(' ');
  const [first, ...rest] = g.controls.filter(c => !isExplanation(c));
  const info = tip ? infoButtonMarkup(`exp-info-${g.id}`, `exp-tip-${g.id}`, g.label, tip) : '';
  return `<div class="exp-group" id="exp-group-${g.id}"><div class="panel-info-row">${first ? controlMarkup(first) : ''}${info}</div>`
    + `${rest.map(controlMarkup).join('')}${tip ? tipMarkup(`exp-tip-${g.id}`, tip) : ''}</div>`;
}
function panelMarkup(): string {
  const row = (id: string): string => groupMarkup(EXPERIMENTAL_GROUPS.find(g => g.id === id)!);
  const cats = EXPERIMENTAL_CATEGORIES.map(c => `<details class="s2u-disclosure exp-cat" id="exp-cat-${c.id}"><summary>${amp(c.label)}</summary>`
    + `<section class="section">${c.groups.map(row).join('')}</section></details>`).join('');
  return `<summary>Experimental (adaptation)</summary><section class="section">${row('master')}${cats}${row('about')}</section>`;
}

/**
 * A library entry's option text: "<name> (<scale>x, <method>)"; a long method is cut (the full one is the title). An
 * uploaded pack (GX-27) reads "<name> (<scale>x, <method>, uploaded)".
 */
export function packOptionLabel(e: PackIndexEntry, uploaded = false): string {
  if ('refused' in e) return `${e.name} (${e.kind}, refused)`;
  return `${e.name} (${e.scale}x, ${e.method.length > 40 ? e.method.slice(0, 37) + '...' : e.method}${uploaded ? ', uploaded' : ''})`;
}
/**
 * GX-21: the chooser's options from the loaded map's library -- Original, the permanent "Map's default pack" (its value
 * `PACK_CHOICE_DEFAULT` survives map changes; the runtime resolves it per map, and Reset returns to it), then each entry
 * in the index's order. An empty library neither moves nor sends the choice (it disables the previous map's packs)
 * (review 2). A chosen pack this map does not list (another map's) moves to the map's default, sent as a change so the
 * runtime's choice and the select agree.
 */
export function showPackLibrary(doc: Document, library: PackLibrary): void {
  const select = doc.getElementById('exp-texturePack') as HTMLSelectElement | null;
  if (!select) return;
  if (library.entries.length === 0) {
    // Review 3: the previous map's packs cannot be chosen here; Original and the map's default stay, the value kept.
    for (const o of select.options) o.disabled = o.value !== '' && o.value !== PACK_CHOICE_DEFAULT;
    return;
  }
  const was = select.value;
  const keep = was === '' || was === PACK_CHOICE_DEFAULT || library.entries.some(e => e.id === was) ? was : PACK_CHOICE_DEFAULT;
  const option = (value: string, text: string, title?: string): HTMLOptionElement => {
    const o = doc.createElement('option'); o.value = value; o.textContent = text; if (title) o.title = title; o.defaultSelected = value === PACK_CHOICE_DEFAULT; return o;
  };
  select.replaceChildren(option('', 'Original'), option(PACK_CHOICE_DEFAULT, DEFAULT_PACK_LABEL),
    ...library.entries.map(e => option(e.id, packOptionLabel(e, library.uploaded?.includes(e.id) ?? false), 'method' in e ? e.method : undefined)));
  select.value = keep;
  if (select.value !== was) select.dispatchEvent(new Event('change'));
}

/**
 * Mounted only by the test room, after its ordinary PS2/Modern switch has been wired. No scene/map changes. It also wires
 * the settings panel's info buttons (`./panelTips`, TRS-CONDENSE) -- the static sections' as well as this panel's -- on
 * any page that holds the panel, before the test-room check.
 */
export function mountExperimentalGraphics(doc: Document, changed: (settings: ExperimentalSettings) => void, previewModern: () => void): void {
  const panelBody = doc.getElementById('panel-body');
  if (panelBody) wirePanelTips(panelBody);
  if (!doc.body.classList.contains('test-room') || doc.getElementById('experimental-settings')) return;
  const look = doc.getElementById('look'), advanced = doc.getElementById('advanced');
  const modern = look?.querySelector<HTMLButtonElement>('[data-look="modern"]');
  if (!look || !advanced || !modern) return;
  const ordinary = Array.from(look.querySelectorAll<HTMLButtonElement>('[data-look]'));
  const button = doc.createElement('button');
  button.type = 'button'; button.className = 's2u-tab'; button.dataset['experimental'] = '';
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = 'Experimental<span class="s2u-tab__what">local graphics lab</span>';
  look.append(button);
  const panel = doc.createElement('details');
  panel.id = 'experimental-settings'; panel.className = 's2u-disclosure';
  panel.innerHTML = panelMarkup();
  advanced.after(panel);
  if (!panelBody) wirePanelTips(panel);
  const input = (id: string): HTMLInputElement => panel.querySelector<HTMLInputElement>(`#exp-${id}`)!;
  const advancedDetail = doc.getElementById('detail') as HTMLInputElement | null;
  const showDetailState = (): void => {
    panel.querySelector('#exp-detail-status')!.textContent = advancedDetail?.checked === false
      ? 'Advanced detail is off: turn it on there to see changes.'
      : 'Compare strength between 0 and 2 on a nearby surface with detail.';
  };
  advancedDetail?.addEventListener('change', showDetailState);
  showDetailState();
  let selected = false;
  let lastSettings = {...EXPERIMENTAL_DEFAULTS};
  const canvas = doc.querySelector<HTMLCanvasElement>('canvas#view');
  const showResolution = (): void => {
    const note = panel.querySelector('#exp-render-info')!;
    if (!lastSettings.enabled || !canvas) { note.textContent = 'Applies while Effects are on.'; return; }
    const size = experimentalFrameSize(canvas.width, canvas.height, lastSettings.renderScale);
    note.textContent = 'World image: ' + size.width + ' × ' + size.height + ' (' + size.scale.toFixed(2) + 'x)' + (size.limited ? ' — resolution limit reached.' : '.');
  };
  const Observer = doc.defaultView?.MutationObserver;
  if (canvas && Observer) new Observer(showResolution).observe(canvas, {attributes: true, attributeFilter: ['width', 'height']});
  const reader: ExperimentalReader = {
    get selected() { return selected; },
    check: id => panel.querySelector<HTMLInputElement>(`#exp-${id}`)?.checked ?? false,
    num: id => {
      const field = panel.querySelector<HTMLInputElement>(`#exp-${id}`);
      if (!field) return Number(EXPERIMENTAL_DEFAULTS[id as keyof ExperimentalSettings]);
      const value = Number(field.value);
      panel.querySelector(`output#exp-${id}-out`)!.textContent = value.toFixed(2);
      return value;
    },
    choice: id => panel.querySelector<HTMLSelectElement>(`#exp-${id}`)!.value,
  };
  const emit = (): void => {
    const settings = Object.assign({}, ...EXPERIMENTAL_GROUPS.map(g => g.read(reader))) as ExperimentalSettings;
    // Keep each gate visible: unchecked groups and irrelevant mode sliders cannot suggest a live effect.
    for (const control of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) control.disabled = !settings.enabled;
    input('enabled').disabled = !selected;
    for (const g of EXPERIMENTAL_GROUPS) for (const r of g.requires ?? []) {
      const active = r.when(settings, reader);
      for (const id of r.ids) input(id).disabled = !settings.enabled || !active;
    }
    if (!VIDEO_PICTURE_HD_OFFERED) input('hdPack').disabled = true;   // HD-HOLD: shown, never on
    for (const g of EXPERIMENTAL_GROUPS) g.status?.(settings, reader, panel);
    lastSettings = settings;
    changed(settings);
    showResolution();
  };
  const deselect = (): void => { selected = false; button.setAttribute('aria-pressed', 'false'); emit(); };
  for (const b of ordinary) b.addEventListener('click', deselect);
  doc.getElementById('ps2look')?.addEventListener('change', deselect);
  button.addEventListener('click', () => {
    previewModern(); // native resolution, aspect and detail preset, without remembering this preview
    selected = true; input('enabled').checked = true;
    for (const b of ordinary) b.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true'); panel.open = true; emit();
  });
  for (const el of panel.querySelectorAll('input')) el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', emit);
  for (const el of panel.querySelectorAll('select')) el.addEventListener('change', emit);
  panel.querySelector('#exp-reset')!.addEventListener('click', () => {
    for (const el of panel.querySelectorAll('input')) { el.value = el.defaultValue; el.checked = el.defaultChecked; }
    for (const el of panel.querySelectorAll('select')) el.value = Array.from(el.options).find(o => o.defaultSelected)!.value;
    emit();
  });
  emit();
}
