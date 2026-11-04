import { applyStarter, previewStarter, STARTERS, type StarterChoices, type StarterContext, type StarterEditor, type StarterId, type StarterPreview } from './examples';
import { ForgeAgentError } from '../forge/agent/api';
import type { ForgePanelContext } from '../forge/shell/context';
import type { ForgePanel } from '../forge/shell/panel';

/** Creator UX adaptation. The page injects actual catalogue/map context and its existing atomic import facade. */
export interface ExamplesPanelHandlers extends StarterEditor {
  getContext(): StarterContext | Promise<StarterContext>;
  preview?(id: StarterId, choices: StarterChoices): Promise<StarterPreview>;
  applyPreview?(preview: StarterPreview, choices: StarterChoices): ReturnType<StarterEditor['execute']>;
  onClose(): void;
}

/** Uses the existing Forge card and controls; no state is written until the explicit Apply click. */
export function createExamplesPanel(doc: Document, h: ExamplesPanelHandlers): HTMLElement {
  return createExamplesCard(doc, h).element;
}

interface ExamplesCard {
  element: HTMLElement;
  update(): void;
  dispose(): void;
}

/** The mounted panel owns admission and invalidates work when its card leaves that lifetime. */
function createExamplesCard(doc: Document, h: ExamplesPanelHandlers, canEdit: () => boolean = () => true): ExamplesCard {
  // FUI-22 (D2): in the dock, the one section style (`.fx-section`, forge.css) over the card's own.
  const card = doc.createElement('div'); card.className = 'fx-card fx-section'; card.dataset['creatorExamples'] = '';
  const title = doc.createElement('h2'); title.textContent = 'Starter experiences';
  const adaptation = doc.createElement('p'); adaptation.className = 'fx-dim'; adaptation.textContent = 'Browser adaptation · authored examples';
  const note = doc.createElement('p');
  note.textContent = 'Select the base first: Stranglehold for a campaign arena, Frostfire for trees. Preview an example, then Apply when ready. Your own loaded assets supply the map and props. Save first to keep both layouts.';
  const list = doc.createElement('ul'); list.className = 'fx-saves-list';
  const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const requirements = doc.createElement('p');
  const change = doc.createElement('p');
  const details = doc.createElement('details'), summary = doc.createElement('summary'); summary.textContent = 'Recipe details';
  const raw = doc.createElement('pre'); raw.className = 'fx-dim'; raw.style.whiteSpace = 'pre-wrap'; raw.style.overflowWrap = 'anywhere';
  details.append(summary, raw);
  const selections = doc.createElement('div');
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'fx-tool'; b.textContent = label; b.addEventListener('click', action); return b;
  };
  let preview: StarterPreview | null = null, generation = 0;
  let disposed = false, admitted: boolean | null = null;
  const previewButtons: HTMLButtonElement[] = [];
  let previewChoices: StarterChoices = {};
  let selectedCover = '', selectedCrate = '', selectedTree = '', treeInspected = false;
  const apply = button('Apply preview', () => { void applyCurrent(); });
  apply.dataset['applyStarter'] = ''; apply.disabled = true;
  const clear = (): void => { preview = null; apply.disabled = true; generation++; };
  const update = (): boolean => {
    const now = h.read(), allowed = !disposed && canEdit() && now.ready && now.mode === 'forge-editor';
    for (const b of previewButtons) b.disabled = !allowed;
    if (!allowed) {
      clear();
      status.textContent = !now.ready ? 'Wait for the editor to finish loading.' : 'Return to Build before previewing a starter.';
    } else if (preview && now.revision !== preview.expectedRevision) {
      clear(); status.textContent = 'The editor changed. Preview again to preserve your edits.';
    } else if (admitted === false) {
      status.textContent = 'The editor is ready. Preview again.';
    }
    admitted = allowed;
    return allowed;
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; clear();
    for (const b of previewButtons) b.disabled = true;
  };
  const populateSelections = (context: StarterContext): void => {
    selections.replaceChildren();
    let inspection: HTMLInputElement | null = null;
    const picker = (label: string, value: string, change: (v: string) => void): void => {
      const wrap = doc.createElement('label'); wrap.textContent = label;
      const select = doc.createElement('select'); select.className = 'fx-tool'; select.style.maxWidth = '100%';
      const auto = doc.createElement('option'); auto.value = ''; auto.textContent = 'Discover from current catalogue'; select.append(auto);
      for (const a of context.assets) {
        const option = doc.createElement('option'); option.value = a.ref;
        option.textContent = `${a.asset} — collision ${a.collision.state}, ${a.geometry.parts} parts`; select.append(option);
      }
      select.value = value;
      select.addEventListener('change', () => { change(select.value); clear(); status.textContent = 'Selection changed. Preview again.'; });
      wrap.append(select); selections.append(wrap);
    };
    picker('Cover prototype ', selectedCover, (v) => { selectedCover = v; });
    picker('Crate prototype ', selectedCrate, (v) => { selectedCrate = v; });
    picker('Tree prototype ', selectedTree, (v) => { selectedTree = v; treeInspected = false; if (inspection) inspection.checked = false; });
    const label = doc.createElement('label'), checked = doc.createElement('input'); checked.type = 'checkbox'; checked.checked = treeInspected;
    inspection = checked;
    checked.addEventListener('change', () => { treeInspected = checked.checked; clear(); status.textContent = 'Tree inspection changed. Preview again.'; });
    label.append(checked, doc.createTextNode(' I visually inspected the selected whole prototype as a tree. A model name alone is insufficient.')); selections.append(label);
  };
  const plan = async (id: StarterId): Promise<void> => {
    if (!update()) return;
    clear(); const token = generation;
    status.textContent = 'Checking loaded source, floors and placement…'; raw.textContent = ''; requirements.textContent = ''; change.textContent = '';
    try {
      const context = await h.getContext();
      if (token !== generation || !update() || token !== generation) return;
      populateSelections(context);
      const choices: StarterChoices = {
        ...(selectedCover ? { coverRef: selectedCover } : {}), ...(selectedCrate ? { crateRef: selectedCrate } : {}),
        ...(selectedTree ? { treeRefs: treeInspected ? [selectedTree] : [] } : {}),
      };
      const next = h.preview ? await h.preview(id, choices) : await previewStarter(id, { ...context, ...choices });
      if (token !== generation || !update() || token !== generation) return;
      preview = next;
      previewChoices = choices;
      const now = h.read();
      const compatible = now.ready && now.mode === 'forge-editor' && now.revision === next.expectedRevision;
      apply.disabled = !next.record || next.diagnostics.length > 0 || !compatible;
      status.textContent = next.diagnostics.length ? next.diagnostics.map((d) => d.message).join('\n')
        : !compatible ? 'The editor changed or is in Play/live mode. Preview again in the editor.'
        : `${next.title}: ready to apply. Check routes and movement in normal Play. One Undo restores your previous layout.`;
      requirements.textContent = `Requirements: ${next.requirements.join('; ')}.`;
      if (next.record) {
        const r = next.record, label = context.archives.find(a => a.stem === r.base)?.label ?? r.base;
        change.textContent = `${label}: ${r.pieces.length} props, ${r.spawns.length} team starts, ${r.npcs?.length ?? 0} NPCs${r.settings ? ', preset settings' : ''}${r.objectives?.gameType === 2 ? ', a bomb pickup and two planting sites' : ''}. Apply replaces the current layout. One Undo restores it.`;
      }
      raw.textContent = JSON.stringify({ diagnostics: next.diagnostics, record: next.record }, null, 2);
    } catch (error) {
      if (token !== generation) return;
      clear(); status.textContent = error instanceof Error ? error.message : 'Preview failed. Load the source and try again.';
    }
  };
  const applyCurrent = async (): Promise<void> => {
    if (!update()) return;
    if (!preview || apply.disabled) return;
    const planned = preview; clear(); const token = generation;
    status.textContent = 'Applying starter…';
    try {
      const result = h.applyPreview ? await h.applyPreview(planned, previewChoices) : await applyStarter(planned, h);
      if (token !== generation) return;
      status.textContent = result.ok ? 'Starter applied. Undo restores the previous layout. Use Save or Export to keep this recipe.' : result.message ?? 'The importer refused this change. Preview again.';
      if (!result.ok) raw.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      if (token === generation) status.textContent = error instanceof Error ? error.message : 'Import failed.';
    }
  };
  for (const def of STARTERS) {
    const row = doc.createElement('li'), text = doc.createElement('span'); text.textContent = `${def.title} — ${def.description}`;
    const previewButton = button(`Preview ${def.title}`, () => { void plan(def.id); }); previewButton.dataset['starterId'] = def.id;
    previewButtons.push(previewButton);
    row.append(text, previewButton); list.append(row);
  }
  card.append(title, adaptation, note, list, selections, requirements, change, status, apply, button('Close', () => { dispose(); h.onClose(); }), details);
  update();
  return { element: card, update, dispose };
}

/**
 * FUI-1 (a browser adaptation, FG.R2): the starters registered as a Forge panel in the
 * right dock after the agent's, folded until START > Panels shows it. Every edit goes through
 * the panel context's facade (`ctx.forge`), as the agent's do; the page supplies only the catalogue's context.
 */
export function examplesForgePanel(getContext: ExamplesPanelHandlers['getContext']): ForgePanel {
  let ctx: ForgePanelContext | null = null;
  const open = (): void => {
    const state = ctx?.state();
    if (!ctx || !state) return;
    if (!state.canEdit) { ctx.ui.toast(state.reason ?? 'The layout takes no edit now'); return; }
    ctx.ui.reveal('starters');
  };
  return {
    id: 'starters', title: 'Starter experiences', dock: 'right', order: 60, defaultOpen: false,
    padLegend: [{ button: 'cross', label: 'Show' }],
    menuSection: () => [{ id: 'starters', label: 'Starters', heading: true },
      { id: 'panel-starters', label: 'Starter experiences', note: 'Authored examples on this base · ✕ shows them in the dock', act: open }],
    mount(host, context) {
      ctx = context;
      const api = context.forge;
      const build = (): ExamplesCard => createExamplesCard(context.doc, {
        getContext, read: () => api.read(), execute: (...args) => api.execute(...args),
        preview: async (id, choices) => {
          const result = await api.execute('starters.preview', { id, ...choices });
          if (!result.ok) throw new ForgeAgentError(result.code ?? 'REFUSED', result.message ?? 'Starter preview refused');
          return result.data as StarterPreview;
        },
        applyPreview: (preview, choices) => api.execute('starters.apply', { id: preview.id, ...choices }, preview.expectedRevision),
        onClose: () => context.ui.collapse('starters'),
      }, () => !context.signal.aborted && context.state().canEdit);
      // The card is built while the panel is open and dropped when it folds (a fresh card each opening, as the modal's
      // was): folded, none of its rows sit in the page beside the Saves card's own list.
      let card: ExamplesCard | null = null, disposed = false;
      const dropCard = (): void => { card?.dispose(); card?.element.remove(); card = null; };
      const sync = (): void => {
        if (disposed) return;
        const open = (host as HTMLDetailsElement).open !== false;
        if (open && !card) { card = build(); host.append(card.element); }
        else if (!open) dropCard();
        card?.update();
      };
      const dispose = (): void => {
        if (disposed) return;
        disposed = true; dropCard(); ctx = null;
        host.removeEventListener('toggle', sync);
        context.signal.removeEventListener('abort', dispose);
      };
      host.addEventListener('toggle', sync, { signal: context.signal });
      context.signal.addEventListener('abort', dispose, { once: true });
      if (context.signal.aborted) dispose();
      else sync();
      return { update: sync, dispose };
    },
  };
}
