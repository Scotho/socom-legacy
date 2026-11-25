import { ownButton, propRow, subsection } from './propGrid';
import type { EnvironmentSection } from '../environment';
import { builtPanel, forgeEl, type ForgePanel } from '../shell/panel';

/**
 * The Environment panel (a browser adaptation, FG.R2): the map's lighting and atmosphere in one place, under World.
 * Its top is the layout's own lighting -- Day / night and Fog distance, the Settings panel's controls mounted here
 * (`../panels/settingsPanel` `SettingsDom.lightingRows`), wired, saved and undone by the page as before. Below, read
 * only, what the disc holds (`../environment` `environmentSections`): the light rig, the fog, the night, the shadows,
 * the reflections and the flares, each section naming its source. The light rig's directions are drawn in the viewport
 * too (Billboards › Light directions).
 */
export interface EnvironmentDom {
  body: HTMLDivElement;
  /** The read-only sections, redrawn by `drawEnvironment` with each base. */
  info: HTMLDivElement;
  /**
   * Where the layout's Day / night and Fog distance rows go on a disc map: first in Lighting, and in Fog before its
   * distance (the owner, 2026-11-25: no Layout lighting group of their own). On a new empty map the page puts them in
   * the light rig's own groups (`../panels/lightRigEditor` slots).
   */
  slots: { dayNight: HTMLDivElement; fogDistance: HTMLDivElement };
  /** The Lighting and Fog groups' Resets on a disc map (Night / day and Fog distance back to the map's own): the page's. */
  resets: { lighting: HTMLButtonElement; fog: HTMLButtonElement };
}

export function buildEnvironment(doc: Document, lightingRows: readonly HTMLElement[]): EnvironmentDom {
  // Sub-sections only (the owner, 2026-11-25): the layout's lighting, then the map's own read-only groups.
  const body = forgeEl(doc, 'div', 'fx-environment fx-section fx-subfolds');
  const info = forgeEl(doc, 'div', 'fx-environment-info fx-subfolds');
  const dayNight = forgeEl(doc, 'div', 'fx-light-rig__slot');
  const fogDistance = forgeEl(doc, 'div', 'fx-light-rig__slot');
  const [dayNightRow, fogRow] = lightingRows;
  if (dayNightRow) dayNight.append(dayNightRow);
  if (fogRow) fogDistance.append(fogRow);
  body.append(info);
  const lighting = ownButton(doc, 'Back to the map’s own night / day', false, false);
  lighting.dataset['envReset'] = 'lighting';
  const fog = ownButton(doc, 'Back to the map’s own fog distance', false, false);
  fog.dataset['envReset'] = 'fog';
  return { body, info, slots: { dayNight, fogDistance }, resets: { lighting, fog } };
}

/** The read-only sections drawn: a heading and its source each, then its rows (a swatch where a row has a colour). */
export function drawEnvironment(dom: EnvironmentDom, sections: readonly EnvironmentSection[]): void {
  const doc = dom.info.ownerDocument;
  if (sections.length === 0) {
    const none = subsection(doc, 'Map');
    none.table.append(propRow(doc, 'Map', forgeEl(doc, 'span', 'fx-dim', 'None loaded')));
    dom.info.replaceChildren(none.fold);
    return;
  }
  const out: HTMLElement[] = [];
  for (const s of sections) {
    // A read-only group: a sub-section of name and value rows, its source on hover (no line of explanation).
    const reset = s.title === 'Lighting' ? dom.resets.lighting : s.title === 'Fog' ? dom.resets.fog : null;
    const sub = subsection(doc, s.title, { reset });
    sub.fold.title = `Read only · ${s.source}`;
    sub.table.dataset['envSection'] = s.title;
    if (s.title === 'Lighting') sub.table.append(dom.slots.dayNight);
    for (const r of s.rows) {
      if (s.title === 'Fog' && r.label === 'Distance') sub.table.append(dom.slots.fogDistance);
      const parts: HTMLElement[] = [];
      if (r.swatch) {
        const sw = forgeEl(doc, 'span', 'fx-env-swatch');
        sw.style.background = r.swatch;
        sw.title = r.swatch;
        parts.push(sw);
      }
      parts.push(forgeEl(doc, 'span', '', r.value));
      const row = propRow(doc, r.label, ...parts);
      if (r.note) row.title = r.note;
      sub.table.append(row);
    }
    out.push(sub.fold);
  }
  dom.info.replaceChildren(...out);
}

export function environmentPanel(dom: EnvironmentDom): ForgePanel {
  // Titled Light rig (the owner, 2026-11-06); its id kept, so a saved dock layout and the tests still find it.
  return builtPanel({ id: 'environment', title: 'Light rig', dock: 'right', order: 35, defaultOpen: true, tab: 'Map',
    padLegend: [{ button: 'dpad', label: 'Change' }] }, dom.body);
}
