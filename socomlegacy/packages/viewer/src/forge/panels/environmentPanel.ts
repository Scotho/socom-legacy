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
}

export function buildEnvironment(doc: Document, lightingRows: readonly HTMLElement[]): EnvironmentDom {
  const body = forgeEl(doc, 'div', 'fx-environment fx-section');
  const info = forgeEl(doc, 'div', 'fx-environment-info');
  body.append(forgeEl(doc, 'h3', '', 'Layout lighting'), ...lightingRows, info);
  return { body, info };
}

/** The read-only sections drawn: a heading and its source each, then its rows (a swatch where a row has a colour). */
export function drawEnvironment(dom: EnvironmentDom, sections: readonly EnvironmentSection[]): void {
  const doc = dom.info.ownerDocument;
  if (sections.length === 0) {
    dom.info.replaceChildren(forgeEl(doc, 'h3', '', 'Map'), forgeEl(doc, 'p', 'fx-dim fx-setting-note', 'Load a map to see its light rig, fog and the rest.'));
    return;
  }
  const out: HTMLElement[] = [];
  for (const s of sections) {
    const head = forgeEl(doc, 'h3', '', s.title);
    head.title = s.source;
    const list = forgeEl(doc, 'dl', 'fx-env-rows');
    list.dataset['envSection'] = s.title;
    for (const r of s.rows) {
      const dt = forgeEl(doc, 'dt', '', r.label);
      const dd = forgeEl(doc, 'dd', '');
      if (r.swatch) {
        const sw = forgeEl(doc, 'span', 'fx-env-swatch');
        sw.style.background = r.swatch;
        sw.title = r.swatch;
        dd.append(sw);
      }
      dd.append(forgeEl(doc, 'span', '', r.value));
      if (r.note) dd.title = r.note;
      list.append(dt, dd);
    }
    out.push(head, forgeEl(doc, 'p', 'fx-dim fx-setting-note', `Read only · ${s.source}`), list);
  }
  dom.info.replaceChildren(...out);
}

export function environmentPanel(dom: EnvironmentDom): ForgePanel {
  return builtPanel({ id: 'environment', title: 'Environment', dock: 'right', order: 35, defaultOpen: true, tab: 'World',
    padLegend: [{ button: 'dpad', label: 'Change' }] }, dom.body);
}
