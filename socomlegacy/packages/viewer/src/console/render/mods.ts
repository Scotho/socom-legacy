import { esc, ico } from '../icons';
import { MODS_DROP_ROW, MODS_FIRST_PACK_ROW, MODS_TEXTURE_ROW, modsTestHdRow, type Adapters, type ConsoleState, type ModsRowView } from '../state';
import { TEST_HD_PACK_ABOUT, TEST_HD_PACK_LABEL } from '../adapters/mods';
import { HD_PACK_AUTHOR } from '../../hdPackCredit';
import { screenHead } from './head';
import { rowHtml, stepRowHtml } from './rows';

/**
 * B206 ML-2 (ML.R6; OT.R110): the MODS screen, pushed from Home's Experiments. One drop zone (a drop anywhere on the
 * screen, or Cross / a click for the file picker: a pad cannot drop), the texture pack selector (Original or one
 * installed texture pack, ML.R8), the import's progress and refusals in words, then what is installed -- each pack its
 * name, kind, size, where it applies (ML.R5), its switch and Remove, a data mod's place in the order. What it says is
 * the registry's (`../adapters/mods`); nothing here reads a store. A browser adaptation with no original (ML.R2): the
 * launcher's look, nothing of the game.
 */
export const MODS_TITLE = 'Mods';
const MODS_DESC = 'Mod packs and texture packs kept in this browser. Texture packs change what you see on every page; mods and model packs apply in the test room.';
export const MODS_DROP_LABEL = 'Drop a pack here, or choose a file';
const MODS_DROP_HINT = `A zip or a folder: a mod, a model pack, a texture pack or the HD pack by ${HD_PACK_AUTHOR}, bare or as a Thunderstore package`;
export const MODS_EMPTY = 'Nothing installed yet.';
export const MODS_UNAVAILABLE = 'Mods are not available on this page.';

const KIND_WORDS: Record<ModsRowView['kind'], string> = { hd: 'HD texture pack', texture: 'Texture pack', mod: 'Mod', model: 'Model pack', pack: 'Pack (v2)',
  'custom-map': 'Forge map bundle' };

/** One installed pack: its switch (a real switch button) and its Remove (a real button), in one row group. */
function packRowHtml(r: ModsRowView, index: number, focused: boolean): string {
  // The owner, 2026-11-09: an installed HD pack's row credits its author (`ModsRowView.credit`).
  const hint = [r.credit ? `${KIND_WORDS[r.kind]} by ${r.credit}` : KIND_WORDS[r.kind], r.detail, r.where].filter(Boolean).join(' · ');
  const text = `<span class="cx-r__text"><span class="cx-r__label">${esc(r.name)}</span><span class="cx-r__hint">${esc(hint)}</span></span>`;
  const sw = r.on === null ? '<span class="cx-r__value">Stored</span>'
    : `<button type="button" class="cx-mods__switch${r.on ? ' is-on' : ''}" role="switch" aria-checked="${r.on}" aria-label="${esc(`${r.name}: ${r.on ? 'on' : 'off'}`)}" data-act="mdrow" data-i="${index}"><span class="cx-r__pill" aria-hidden="true"><span class="cx-r__knob"></span></span></button>`;
  const remove = `<button type="button" class="cx-mods__remove" aria-label="${esc(`Remove ${r.name}`)}" data-act="mdremove" data-i="${index}">Remove</button>`;
  return `<div class="cx-r cx-r--toggle cx-mods__pack${r.on ? ' is-on' : ''}${focused ? ' is-focused' : ''}" role="group" aria-label="${esc(r.name)}" tabindex="-1" data-row="${index}" data-act="mdrow" data-i="${index}" data-id="${esc(r.id)}">${text}<span class="cx-r__ctl">${sw}${remove}</span></div>`;
}

export function modsHtml(s: ConsoleState, a: Adapters): string {
  const m = a.mods;
  const head = screenHead(`${ico('flask')}Experiments`, MODS_TITLE, 'Experiments', '', MODS_DESC);
  if (!m) {
    return `<section class="cx-screen" aria-label="${MODS_TITLE}" data-key="mods">${head}<div class="cx-screen__body"><div class="cx-rlist" data-scroll data-key="mods-rows">${rowHtml({ kind: 'info', label: MODS_UNAVAILABLE, value: '' }, { focused: false, index: 0, act: 'mdrow' })}</div></div></section>`;
  }
  const v = m.view();
  const body: string[] = [];
  body.push(rowHtml({ kind: 'drop', id: 'mods-drop', label: MODS_DROP_LABEL, hint: v.busy?.words ?? MODS_DROP_HINT, ...(v.busy ? { progress: v.busy.progress ?? 0 } : {}) },
    { focused: s.md.row === MODS_DROP_ROW, index: MODS_DROP_ROW, act: 'mdrow' }));
  const chosen = v.textures.find((t) => t.id === v.texture)?.label ?? 'Original';
  body.push(stepRowHtml('mdrow', 'mdstep', MODS_TEXTURE_ROW, s.md.row === MODS_TEXTURE_ROW, 'Texture pack', chosen, { about: 'Original or one installed texture pack' }));
  if (v.message) body.push(`<div class="cx-mods__message is-${v.message.tone}" role="status" data-key="mods-message">${esc(v.message.words)}</div>`);
  if (v.storePage) body.push(`<a class="cx-mods__store" href="${esc(v.storePage)}" target="_blank" rel="noopener">Get the HD pack by ${HD_PACK_AUTHOR} on Thunderstore</a>`);
  body.push(rowHtml({ kind: 'header', label: 'Installed' }, { focused: false, index: -1, act: 'mdrow' }));
  if (!v.rows.length) body.push(rowHtml({ kind: 'info', label: v.ready ? MODS_EMPTY : 'Reading what is installed…', value: '' }, { focused: false, index: -1, act: 'mdrow' }));
  v.rows.forEach((r, i) => body.push(packRowHtml(r, MODS_FIRST_PACK_ROW + i, s.md.row === MODS_FIRST_PACK_ROW + i)));
  // TEST_HD_PACK_BUTTON_ADAPTATION (B206 ML-12, ML.R16): the temporary button, last; removed by ML-13 on the owner's word.
  const testRow = modsTestHdRow(v);
  if (testRow >= 0) body.push(rowHtml({ kind: 'action', id: 'mods-test-hd', label: TEST_HD_PACK_LABEL, hint: TEST_HD_PACK_ABOUT }, { focused: s.md.row === testRow, index: testRow, act: 'mdrow' }));
  return `<section class="cx-screen cx-mods" aria-label="${MODS_TITLE}" data-key="mods">
    ${head}
    <div class="cx-screen__body">
      <div class="cx-rlist" role="group" aria-label="${MODS_TITLE}" data-scroll data-key="mods-rows">${body.join('')}</div>
    </div>
  </section>`;
}
