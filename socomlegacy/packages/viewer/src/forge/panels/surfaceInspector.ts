import { pageSettings } from '../../pageStore';
import { forgeEl } from '../shell/panel';
import { MATERIAL_COUNT, materialLabel, reverbZoneNote, type HullReverb } from '../hull';
import type { SurfaceStateView } from '../geometry/editor';
import { CLIMB_FLAGS, COLLISION_TYPES, type SurfaceChange } from '../geometry/hullGeometry';

/**
 * Geometry mode's Surface section in the Inspector, on the Collision layer (the owner, 2026-11-20: "lets start with 1" --
 * a level editor's face properties for the collision's own words; a browser adaptation, FG.R2). Each field is a word or
 * bit of the selected faces' surface (`../geometry/hullGeometry` `SurfaceFields`), shown where they share it and "mixed"
 * where they differ; setting one sets it on them all, one edit (one undo step), every other word kept:
 * - **Material**: the material table's index (`@s2u/scene` `materialTable`; 0 the map's default surface): the steps'
 *   sound, the shots' marks and how far they go through.
 * - **Area**, Outdoor or Indoor (`m_inside`), and the **Reverb zone** (bit 27): read off the floor under the camera
 *   (`FUN_00295b00`, research 81 §9): which of the map's reverb lists, and which of its entries, is heard; the Area also
 *   the ambience's side (the owner, 2026-11-20: named for what they do, the Area a two-way switch).
 * - **Camera**, "Blocks the camera" (`m_cameratype` bit 1 clear): off, the camera's probes go through the faces.
 * The region (the zones drawn from the floor, `../../regionCull`) is kept on every face but not shown (the owner,
 * 2026-11-20: too complex for the editor's users).
 * A note says when some of the faces are not floors the camera stands over, whose Area and zone are never read.
 */
export interface SurfaceInspectorHooks {
  state(): SurfaceStateView | null;
  change(change: SurfaceChange, label: string): void;
  /** The map's default surface's name and its reverb zones (the layout's over the map's own), for the fields' words. */
  words(): { defaultMaterial: string | null; reverb: HullReverb | null };
}

export interface SurfaceInspector {
  section: HTMLElement;
  refresh(): void;
}

const MIXED = '';

export function buildSurfaceInspector(doc: Document, hooks: SurfaceInspectorHooks): SurfaceInspector {
  const d = forgeEl(doc, 'details', 'fx-fold fx-inspect-section fx-surfprops-section') as HTMLDetailsElement;
  d.dataset['inspectSection'] = 'surface';
  d.append(forgeEl(doc, 'summary', 'fx-inspect-section-title', 'Surface'));
  const openKey = 'forge.inspector.surface.open';
  d.open = pageSettings.get(openKey) !== '0';
  d.addEventListener('toggle', () => { pageSettings.set(openKey, d.open ? '1' : '0'); });

  const count = forgeEl(doc, 'div', 'fx-texture-count fx-surfprops-count');
  const rows = forgeEl(doc, 'div', 'fx-surfprops-rows');
  const row = (caption: string, control: HTMLElement, title: string, into: HTMLElement = rows, tag: 'label' | 'div' = 'label'): HTMLElement => {
    const r = forgeEl(doc, tag, 'fx-surfprops-row');
    r.title = title;
    r.append(forgeEl(doc, 'span', 'fx-field-caption', caption), control);
    into.append(r);
    return r;
  };
  const select = (aria: string): HTMLSelectElement => {
    const s = forgeEl(doc, 'select', 'fx-select') as HTMLSelectElement;
    s.setAttribute('aria-label', aria);
    return s;
  };
  const option = (s: HTMLSelectElement, value: string, text: string): HTMLOptionElement => {
    const o = forgeEl(doc, 'option', '', text) as HTMLOptionElement;
    o.value = value;
    s.append(o);
    return o;
  };
  const toggle = (aria: string, word: string): HTMLInputElement => {
    const i = forgeEl(doc, 'input', '') as HTMLInputElement;
    i.type = 'checkbox';
    i.setAttribute('aria-label', aria);
    const l = forgeEl(doc, 'span', 'fx-toggle');
    l.append(i, forgeEl(doc, 'span', '', word));
    return Object.assign(i, { box: l });
  };

  // Collision: the type (the owner, 2026-11-20: "add the collision type into the surface panel"), a climbable's flag as
  // its own entry, as the Surface section's tabs and the Climbable tab's menu set them.
  const collision = select('Collision type');
  const collisionMixed = option(collision, MIXED, 'mixed');
  collisionMixed.disabled = true;
  for (const t of COLLISION_TYPES) {
    if (t.type !== 'climbable') { option(collision, t.type, t.label).title = t.note; continue; }
    for (const c of CLIMB_FLAGS) option(collision, `climbable:${c.flag}`, `${t.label} · ${c.label}`).title = t.note;
  }
  collision.addEventListener('change', () => {
    const [type, flag] = collision.value.split(':');
    if (type) hooks.change({ type: type as SurfaceChange['type'], ...(flag ? { climb: Number(flag) } : {}) }, 'Set collision type');
    collision.blur();
  });
  row('Collision', collision, 'How players move on the faces: stand on a floor, are stopped by a wall, pass through, or climb (by the climb flag)');

  // Material: "mixed" while the faces differ, then every index of the table.
  const material = select('Material');
  const materialMixed = option(material, MIXED, 'mixed');
  materialMixed.disabled = true;
  const materialOptions: HTMLOptionElement[] = [];
  for (let i = 0; i < MATERIAL_COUNT; i++) materialOptions.push(option(material, String(i), `${i} · ${materialLabel(i)}`));
  material.addEventListener('change', () => {
    if (material.value !== MIXED) hooks.change({ material: Number(material.value) }, 'Set material');
    material.blur();
  });
  row('Material', material, 'What the faces are made of: the steps\' sound, the shots\' marks and how far they go through (0 the map\'s default surface)');

  // Area: Outdoor or Indoor, two tabs (the owner, 2026-11-20: "a switch between indoor/outdoor"), neither lit while mixed.
  const area = forgeEl(doc, 'div', 'fx-asset-tabs fx-surfprops-area');
  area.setAttribute('role', 'radiogroup');
  area.setAttribute('aria-label', 'Area');
  const areaTabs = ([[false, 'Outdoor'], [true, 'Indoor']] as const).map(([on, word]) => {
    const b = forgeEl(doc, 'button', 'fx-asset-tab', word) as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset['inside'] = String(on);
    b.addEventListener('click', () => { hooks.change({ inside: on }, on ? 'Set indoor' : 'Set outdoor'); b.blur(); });
    area.append(b);
    return { on, b };
  });
  row('Area', area, 'With the camera over this floor: Indoor plays the map\'s indoor reverb and ambience, Outdoor its outdoor ones (map scripts that ask "is the camera indoors" read it too)', rows, 'div');

  const zone = select('Reverb zone');
  const zoneMixed = option(zone, MIXED, 'mixed');
  zoneMixed.disabled = true;
  const zoneOptions = [option(zone, '0', 'Zone 0'), option(zone, '1', 'Zone 1')];
  zone.addEventListener('change', () => {
    if (zone.value !== MIXED) hooks.change({ reverbZone: zone.value === '1' ? 1 : 0 }, 'Set reverb zone');
    zone.blur();
  });
  row('Reverb zone', zone, 'Which entry of the map\'s indoor or outdoor reverb list the camera over this floor takes (World settings, Reverb, sets each entry\'s depth and time)');

  // Blocks the camera: on is the ordinary face, off the camera bit set (`cameraThrough`).
  const blocks = toggle('Blocks the camera', 'Blocks the camera');
  blocks.addEventListener('change', () => { hooks.change({ cameraThrough: !blocks.checked }, blocks.checked ? 'Camera blocked' : 'Camera passes through'); blocks.blur(); });
  row('Camera', (blocks as HTMLInputElement & { box: HTMLElement }).box, 'On: the third-person camera stops at these faces and pulls in in front of them. Off: it passes through (foliage, nets, thin rails); players and shots still collide');

  // The region (the visibility zones) is not shown (the owner, 2026-11-20: "remove the regions for now. maybe too complex
  // for our users"): every edit here keeps each face's own, and a new face takes its object's.

  const note = forgeEl(doc, 'p', 'fx-dim fx-setting-note fx-surfprops-note');
  d.append(count, rows, note);

  function refresh(): void {
    const s = hooks.state();
    const none = !s;
    const w = hooks.words();
    count.textContent = none ? 'Select faces (Face selection), or objects, to set their surface' : `${s.count} face${s.count === 1 ? '' : 's'}`;
    for (const c of [collision, material, zone, blocks, ...areaTabs.map((t) => t.b)]) c.disabled = none;
    if (doc.activeElement !== collision) collision.value = !s || s.collision === null ? MIXED : s.collision;
    materialOptions[0]!.textContent = `0 · ${materialLabel(0, w.defaultMaterial)}`;
    if (doc.activeElement !== material) material.value = s?.material === null || !s ? MIXED : String(s.material);
    for (const t of areaTabs) { const on = !!s && s.inside === t.on; t.b.classList.toggle('is-on', on); t.b.setAttribute('aria-checked', String(on)); }
    blocks.checked = s?.cameraThrough === false;
    blocks.indeterminate = !!s && s.cameraThrough === null;
    if (doc.activeElement !== zone) zone.value = s?.reverbZone === null || !s ? MIXED : String(s.reverbZone);
    // Each zone's depth on its option: the side the faces are on, both sides while they differ.
    zoneOptions.forEach((o, z) => {
      const zz = z as 0 | 1;
      const words = s?.inside === true ? reverbZoneNote(w.reverb, true, zz) : s?.inside === false ? reverbZoneNote(w.reverb, false, zz)
        : `indoors ${reverbZoneNote(w.reverb, true, zz)}; outdoors ${reverbZoneNote(w.reverb, false, zz)}`;
      o.textContent = `Zone ${z} · ${words}`;
    });
    note.textContent = !s ? ''
      : s.read === 0 ? 'None of these is a floor the camera stands over: their Area and Reverb zone are never read (the Material is).'
      : s.read < s.count ? `${s.count - s.read} of these ${s.count} are not floors the camera stands over: their Area and Reverb zone are never read.`
      : '';
    note.hidden = !note.textContent;
  }
  // Not drawn here: its hooks read the page's state, drawn by the page's first `refresh` once the section is shown.
  return { section: d, refresh };
}
