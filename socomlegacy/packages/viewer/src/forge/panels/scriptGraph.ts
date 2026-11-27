import { forgeEl } from '../shell/panel';
import { showInspectorData, type InspectorEditor } from './inspectorPanel';
import { closeStepMenu, openStepMenu, STEP_COMMAND, STEP_FAMILY } from './stepMenu';
import { pageSettings } from '../../pageStore';

/**
 * The Script editor's node view (the Forge's owner (crispy, OT.R112), 2026-11-13: "a nice nodal ui that makes sense for our custom scripting ... a
 * nodal view of the same underlying data"; then "the node parameters inside the node ... the node editor sideways ... the
 * + more obvious"; a browser adaptation, FG.R2): a script's steps -- the one `ScriptStep` list the Inspector's rows edit
 * -- drawn as a flow of nodes, left to right as the game runs a program's commands. Its event first (When pulled, When
 * destroyed, From the round's start); a step a node, its command (SOUND, CALL, WAIT ...) and its own rows (the
 * Inspector's editors, the same ones) inside it; an If its lanes one over another (its Else ifs, its Otherwise, a lane
 * passing by where it has none) joined again at its End if; a While its body above a line back to its head. Every wire
 * carries a + that adds a step there. Nothing here holds the script: each draw is of the list as it is
 * (`ScriptGraphModel`), each change the page's own edit (`ScriptGraphHooks`).
 */

/** A step as the graph draws it: its command (`ScriptStep['do']`) and the words of what it does. */
export interface GraphStep { do: string; detail: string }

/** A flag's use in a script: whose, which step, a write (SET) or a read (IF, ELSE IF, WHILE); `go` shows it. */
export interface FlagUse { who: string; k: number; write: boolean; go(): void; kind?: string }
/** The legend's flag: its name, whether the script shown uses it, its uses everywhere. */
export interface LegendFlag { name: string; here: boolean; uses: readonly FlagUse[] }

export interface ScriptGraphModel {
  /** Whose script: the selection's name. */
  owner: string;
  /** When it runs: its event node's words. */
  event: string;
  steps: readonly GraphStep[];
  selected: number | null;
  locked: boolean;
  /** The steps a wire's + offers (`do`, words). */
  addKinds: readonly (readonly [string, string])[];
  /** Read only (an original map's program): each node its words, no rows, no +, no remove. */
  readOnly?: boolean;
}

/** The legend at the editor's left: every flag of the layout's scripts, and the game's own values a script may read. */
export interface ScriptLegend { flags: readonly LegendFlag[]; games: readonly (readonly [string, string])[]; sequences?: readonly LegendSequence[] }
/** The legend's sequence: its name, whose script, whether it is the one shown, its Call / Stop steps, `go` opens it. */
export interface LegendSequence { name: string; who: string; here: boolean; uses: readonly FlagUse[]; go(): void;
  /** One of the script shown's own (renamed, removed here). */
  mine?: boolean }

export interface ScriptGraphHooks {
  select(k: number | null): void;
  /**
   * A step of `kind` put at `at` (a While or an If with its closer); `otherwise`: an Otherwise (ELSE) put there first, the
   * step its lane's first (an If's passing lane), or the Otherwise alone where `kind` is `else`.
   */
  insert(at: number, kind: string, otherwise?: boolean): void;
  /** Step `k` removed (a block with its closers). */
  remove(k: number): void;
  /** Every step's rows, as the Inspector draws them, each tagged with its step (`InspectorEditor.scriptStep`). */
  rows(): InspectorEditor[];
}

/** The engine's own word for each command, and its family (`./stepMenu`, the menus' and the nodes' one table). */
const COMMAND = STEP_COMMAND;
/** A step's family: its own, or an engine command no script step stands for (an original program's: `native`, grey). */
const familyOf = (d: string): string => FAMILY[d] ?? (/^[A-Z_0-9]+$/.test(d) ? 'native' : 'flow');
const FAMILY = STEP_FAMILY;

type Item =
  | { t: 'step'; k: number }
  | { t: 'if'; k: number; branches: { k: number; body: Item[] }[]; end: number | null }
  | { t: 'while'; k: number; body: Item[]; end: number | null };

/** The flat list read as blocks: an If to its End if, its Else ifs and its Otherwise its lanes; a While to its End while. */
function parse(steps: readonly GraphStep[]): Item[] {
  let i = 0;
  const closesIf = (d: string): boolean => d === 'elseif' || d === 'else' || d === 'end';
  const seq = (stop: (d: string) => boolean): Item[] => {
    const out: Item[] = [];
    while (i < steps.length && !stop(steps[i]!.do)) {
      const d = steps[i]!.do;
      if (d === 'if') {
        const k = i++;
        const branches = [{ k, body: seq(closesIf) }];
        while (i < steps.length && (steps[i]!.do === 'elseif' || steps[i]!.do === 'else')) { const b = i++; branches.push({ k: b, body: seq(closesIf) }); }
        const end = i < steps.length && steps[i]!.do === 'end' ? i++ : null;
        out.push({ t: 'if', k, branches, end });
      } else if (d === 'while') {
        const k = i++;
        const body = seq((x) => x === 'endWhile');
        const end = i < steps.length && steps[i]!.do === 'endWhile' ? i++ : null;
        out.push({ t: 'while', k, body, end });
      } else out.push({ t: 'step', k: i++ });
    }
    return out;
  };
  const top: Item[] = [];
  while (i < steps.length) top.push(...seq(() => false));
  return top;
}

/** The last step an item holds: where a step after it goes, one past. */
function lastOf(it: Item): number {
  if (it.t === 'step') return it.k;
  if (it.end !== null) return it.end;
  if (it.t === 'while') return it.body.length ? lastOf(it.body[it.body.length - 1]!) : it.k;
  const b = it.branches[it.branches.length - 1]!;
  return b.body.length ? lastOf(b.body[b.body.length - 1]!) : b.k;
}

/** The sequence tabs' presses (`ScriptGraph.setSequences`). */
export interface SequenceHooks {
  pick(i: number | null): void;
  add(): void;
  rename(i: number, name: string): void;
  remove(i: number): void;
}

/** Which script the editor shows: the map's own, the selection's, or an original map's program (read only). */
export type ScriptView = 'map' | 'selection' | 'disc';

export interface ScriptGraph {
  root: HTMLElement;
  /** Its bar's switch (the map's script, the selection's, an original map's): the one shown, and what a press does. */
  setView(view: ScriptView, pick: (view: ScriptView) => void): void;
  /**
   * The Original map tab's pickers (the Forge's owner (crispy, OT.R112), 2026-11-13: "see the official maps' map scripting node network"): the
   * base map's programs, each with its sequences; the one shown; what a choice does. Null: none (a blank floor).
   */
  setDisc(programs: readonly { name: string; sequences: readonly string[] }[] | null, at: { program: string; sequence: number }, pick: (at: { program: string; sequence: number }) => void): void;
  /**
   * The script's sequences (the Forge's owner (crispy, OT.R112), 2026-11-13: "call sequence and end sequence"): Main, then its named ones, the one
   * shown (`at`, null Main), and what a press does -- show one, add one, rename one (a double click), remove one. Null:
   * none shown (an original map's, which has its own picker).
   */
  setSequences(s: { names: readonly string[]; at: number | null; locked: boolean } | null, hooks: SequenceHooks): void;
  draw(model: ScriptGraphModel | null, hooks: ScriptGraphHooks, emptyWords: string, emptyAction?: { label: string; run(): void }): void;
  /** The legend drawn (only when it changed). */
  legend(l: ScriptLegend): void;
}

export function buildScriptGraph(doc: Document): ScriptGraph {
  const root = forgeEl(doc, 'div', 'fx-sg');
  const bar = forgeEl(doc, 'div', 'fx-sg-bar');
  const title = forgeEl(doc, 'span', 'fx-sg-title', 'Program');
  const zoomOut = forgeEl(doc, 'button', 'fx-tool fx-sg-zoom', '−');
  const zoomWord = forgeEl(doc, 'button', 'fx-tool fx-sg-zoom fx-sg-zoom-word', '100%');
  const zoomIn = forgeEl(doc, 'button', 'fx-tool fx-sg-zoom', '+');
  for (const [b, t] of [[zoomOut, 'Zoom out'], [zoomWord, 'Back to 100%'], [zoomIn, 'Zoom in']] as const) { b.type = 'button'; b.title = t; b.setAttribute('aria-label', t); }
  const zooms = forgeEl(doc, 'span', 'fx-sg-zooms');
  zooms.append(zoomOut, zoomWord, zoomIn);
  // Which script: the map's own (from the round's start), or the selected object's.
  const views = forgeEl(doc, 'span', 'fx-sg-views');
  views.setAttribute('role', 'tablist');
  const viewBtn = (v: ScriptView, words: string, tip: string): HTMLButtonElement => {
    const b = forgeEl(doc, 'button', 'fx-tool fx-sg-view', words);
    b.type = 'button';
    b.title = tip;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { if (viewNow !== v) pickView?.(v); });
    views.append(b);
    return b;
  };
  const mapBtn = viewBtn('map', 'Map Program', "The map's own program: from the round's start, its loops and tests on the game's own valves and yours");
  const selBtn = viewBtn('selection', 'Selected Object Program', "The selected switch's, damage trigger's or effect's program");
  const discBtn = viewBtn('disc', 'Original Map Program', "The base map's own programs, as the game has them (its round's `objectives` first): read only, to see how it does things");
  let viewNow: ScriptView = 'selection';
  let pickView: ((v: ScriptView) => void) | null = null;
  // The Original map tab's pickers: a program, then one of its sequences.
  const discPicks = forgeEl(doc, 'span', 'fx-sg-disc');
  const programSel = forgeEl(doc, 'select', 'fx-select fx-sg-disc-program') as HTMLSelectElement;
  const sequenceSel = forgeEl(doc, 'select', 'fx-select fx-sg-disc-sequence') as HTMLSelectElement;
  programSel.title = "The base map's program";
  sequenceSel.title = 'Its sequence (each one runs on its own)';
  const discLabel = (words: string, sel: HTMLSelectElement): HTMLElement => {
    const l = forgeEl(doc, 'label', 'fx-sg-disc-field');
    l.append(forgeEl(doc, 'span', 'fx-sg-disc-label', words), sel);
    return l;
  };
  discPicks.append(discLabel('Program', programSel), discLabel('Sequence', sequenceSel));
  discPicks.hidden = true;
  let discPick: ((at: { program: string; sequence: number }) => void) | null = null;
  let discSig = '';
  programSel.addEventListener('change', () => discPick?.({ program: programSel.value, sequence: 0 }));
  sequenceSel.addEventListener('change', () => discPick?.({ program: programSel.value, sequence: Number(sequenceSel.value) }));
  const left = forgeEl(doc, 'span', 'fx-sg-bar-left');
  left.append(views, discPicks, title);
  // The script's sequences: Main and its named ones, a tab each; + adds one.
  // The script shown's sequences (`setSequences`): drawn in the legend (the Forge's owner (crispy, OT.R112), 2026-11-13: "I don't want that top
  // sequence bar anymore. Have the new sequence button in the left bar too").
  let seqNow: { sq: { names: readonly string[]; at: number | null; locked: boolean }; hooks: SequenceHooks } | null = null;
  let seqSig = '';
  bar.append(left, zooms);
  const canvas = forgeEl(doc, 'div', 'fx-sg-canvas');
  const graph = forgeEl(doc, 'div', 'fx-sg-graph');
  canvas.append(graph);
  // The legend (the Forge's owner (crispy, OT.R112), 2026-11-13: "a little legend on the left to show all the flags"): beside the canvas.
  const legendEl = forgeEl(doc, 'aside', 'fx-sg-legend');
  legendEl.setAttribute('aria-label', 'Valves, sequences and game valves');
  const body = forgeEl(doc, 'div', 'fx-sg-body');
  // Its width the person's (the Forge's owner (crispy, OT.R112), 2026-11-13: "make the sidebar list either wider, resizable"): a drag on its edge,
  // kept in this browser (a per-viewer convenience; none kept, its default).
  const LEGEND_KEY = 's2u-forge-program-sidebar';
  const LEGEND_MIN = 200, LEGEND_MAX = 560;
  const setLegendWidth = (w: number): number => { const v = Math.round(Math.min(LEGEND_MAX, Math.max(LEGEND_MIN, w))); legendEl.style.flexBasis = `${v}px`; return v; };
  { const kept = Number(pageSettings.get(LEGEND_KEY)); if (kept) setLegendWidth(kept); }   // none kept or unreadable: its default
  const grip = forgeEl(doc, 'div', 'fx-sg-legend-grip');
  grip.title = 'Drag to resize';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = e.clientX, from = legendEl.getBoundingClientRect().width;
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('is-dragging');
    let last = from;
    const move = (m: PointerEvent): void => { last = setLegendWidth(from + m.clientX - start); };
    const up = (): void => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
      grip.classList.remove('is-dragging');
      pageSettings.set(LEGEND_KEY, String(Math.round(last)));   // refused: this session only
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => { legendEl.style.flexBasis = ''; pageSettings.remove(LEGEND_KEY); });
  body.append(legendEl, grip, canvas);
  root.append(bar, body);
  let legendSig = '';
  const open = new Set<string>();                       // the flags unfolded to their uses
  let legendNow: ScriptLegend = { flags: [], games: [] };
  const drawLegend = (): void => {
    const l = legendNow;
    const head = (words: string, n: number | null): HTMLElement => {
      const h = forgeEl(doc, 'div', 'fx-sg-legend-head', words);
      if (n !== null) h.append(forgeEl(doc, 'span', 'fx-sg-legend-count', String(n)));
      return h;
    };
    const items: HTMLElement[] = [head('Valves', l.flags.length)];
    if (!l.flags.length) items.push(forgeEl(doc, 'p', 'fx-sg-legend-none', 'No valves yet. A Set a valve command makes one; any program can test it.'));
    for (const f of l.flags) {
      const writes = f.uses.filter((u) => u.write).length, reads = f.uses.length - writes;
      const row = forgeEl(doc, 'div', `fx-sg-flag${f.here ? ' is-here' : ''}${open.has(f.name) ? ' is-open' : ''}`);
      const top = forgeEl(doc, 'button', 'fx-sg-flag-top');
      top.type = 'button';
      top.title = f.here ? 'Used in this program. Show its uses' : 'Show its uses';
      top.append(forgeEl(doc, 'span', 'fx-sg-flag-caret', open.has(f.name) ? '\u25be' : '\u25b8'), forgeEl(doc, 'span', 'fx-sg-flag-name', f.name));
      if (f.here) top.append(forgeEl(doc, 'span', 'fx-sg-flag-here', 'here'));
      // Its health: set and tested; tested and never set (stays 0: a misspelt name?); set and never tested.
      const warn = writes === 0 ? 'never set' : reads === 0 ? 'never tested' : null;
      const meta = forgeEl(doc, 'span', `fx-sg-flag-meta${warn ? ' is-warn' : ''}`, warn ?? `${writes} set \u00b7 ${reads} tested`);
      if (warn) meta.title = writes === 0 ? 'Tested, but no program sets it: it stays 0 (a misspelt name?)' : 'Set, but no program tests it';
      top.append(meta);
      top.addEventListener('click', () => { if (open.has(f.name)) open.delete(f.name); else open.add(f.name); drawLegend(); });
      row.append(top);
      if (open.has(f.name)) {
        const uses = forgeEl(doc, 'div', 'fx-sg-flag-uses');
        for (const u of f.uses) {
          const b = forgeEl(doc, 'button', `fx-sg-use ${u.write ? 'is-write' : 'is-read'}`);
          b.type = 'button';
          b.title = 'Show this command';
          b.append(forgeEl(doc, 'span', 'fx-sg-use-kind', u.write ? 'SET' : 'TEST'), forgeEl(doc, 'span', 'fx-sg-use-who', `${u.who} \u00b7 #${u.k + 1}`));
          b.addEventListener('click', () => u.go());
          uses.append(b);
        }
        row.append(uses);
      }
      items.push(row);
    }
    // The sequences of every script (the Forge's owner (crispy, OT.R112), 2026-11-13: "add our sequences to the left hand side bar").
    // The script shown's first (its Main, then its own, each renamed by a double click or removed by its x), then the rest.
    const seqs = [...(l.sequences ?? [])].sort((a, b) => Number(b.mine === true) - Number(a.mine === true));
    const cur = seqNow;
    items.push(head('Sequences', seqs.length));
    if (cur) {
      const row = forgeEl(doc, 'div', `fx-sg-flag fx-sg-seq-item${cur.sq.at === null ? ' is-here' : ''}`);
      const top = forgeEl(doc, 'div', 'fx-sg-flag-top');
      const name = forgeEl(doc, 'button', 'fx-sg-seq-open') as HTMLButtonElement;
      name.type = 'button';
      name.title = "The program's first sequence, run: its own commands, from its start";
      name.append(forgeEl(doc, 'span', 'fx-sg-flag-name', 'run'), forgeEl(doc, 'span', 'fx-sg-seq-who', 'this program'));
      name.addEventListener('click', () => cur.hooks.pick(null));
      top.append(forgeEl(doc, 'span', 'fx-sg-seq-caret'), name, forgeEl(doc, 'span', 'fx-sg-flag-meta', 'from the start'));
      row.append(top);
      items.push(row);
    }
    if (!seqs.length && !cur) items.push(forgeEl(doc, 'p', 'fx-sg-legend-none', 'No sequences yet. Show a program to add one.'));
    for (const q of seqs) {
      const key = `seq:${q.who}:${q.name}`;
      const calls = q.uses.filter((u) => u.write).length;
      const row = forgeEl(doc, 'div', `fx-sg-flag fx-sg-seq-item${q.here ? ' is-here' : ''}${open.has(key) ? ' is-open' : ''}`);
      const top = forgeEl(doc, 'div', 'fx-sg-flag-top');
      const caret = forgeEl(doc, 'button', 'fx-sg-flag-caret fx-sg-seq-caret', open.has(key) ? '\u25be' : '\u25b8') as HTMLButtonElement;
      caret.type = 'button';
      caret.title = 'Show its Call and Stop commands';
      caret.addEventListener('click', () => { if (open.has(key)) open.delete(key); else open.add(key); drawLegend(); });
      const name = forgeEl(doc, 'button', 'fx-sg-seq-open') as HTMLButtonElement;
      name.type = 'button';
      name.title = 'Open this sequence';
      name.append(forgeEl(doc, 'span', 'fx-sg-flag-name', q.name), forgeEl(doc, 'span', 'fx-sg-seq-who', q.who));
      name.addEventListener('click', () => q.go());
      // No Call names it: the runner starts it with the rest (the game's own rule, effectRunner's `called`; research 89 §12).
      const warn = calls === 0 ? 'never called: runs at start' : null;
      const meta = forgeEl(doc, 'span', `fx-sg-flag-meta${warn ? ' is-warn' : ''}`, warn ?? `${calls} call${calls === 1 ? '' : 's'}`);
      if (warn) meta.title = "No Call sequence command in its own program calls it, so it runs from the start with the rest (the game's own rule)";
      top.append(caret, name, meta);
      const own = q.mine && cur ? cur.sq.names.indexOf(q.name) : -1;
      if (cur && own >= 0 && !cur.sq.locked) {
        // A double click renames it in place: Enter or leaving keeps the new name, Escape lets it go.
        name.title = 'Open this sequence. Double-click to rename';
        name.addEventListener('dblclick', () => {
          const input = forgeEl(doc, 'input', 'fx-search fx-sg-seq-input') as HTMLInputElement;
          input.value = q.name;
          input.maxLength = 24;
          let done = false;
          const finish = (keep: boolean): void => {
            if (done) return;
            done = true;
            const v = input.value.trim();
            if (keep && v && v !== q.name) cur.hooks.rename(own, v); else drawLegend();
          };
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
          input.addEventListener('blur', () => finish(true));
          name.replaceWith(input);
          input.focus();
          input.select();
        });
        const x = forgeEl(doc, 'button', 'fx-sg-seq-remove', '\u2715') as HTMLButtonElement;
        x.type = 'button';
        x.title = 'Remove this sequence (its Call and Stop commands go with it)';
        x.setAttribute('aria-label', `Remove ${q.name}`);
        x.addEventListener('click', () => cur.hooks.remove(own));
        top.append(x);
      }
      row.append(top);
      if (open.has(key)) {
        const uses = forgeEl(doc, 'div', 'fx-sg-flag-uses');
        if (!q.uses.length) uses.append(forgeEl(doc, 'p', 'fx-sg-legend-none', 'No command calls or stops it.'));
        for (const u of q.uses) {
          const b = forgeEl(doc, 'button', `fx-sg-use ${u.write ? 'is-write' : 'is-read'}`);
          b.type = 'button';
          b.title = 'Show this command';
          b.append(forgeEl(doc, 'span', 'fx-sg-use-kind', u.kind ?? (u.write ? 'CALL' : 'STOP')), forgeEl(doc, 'span', 'fx-sg-use-who', `${u.who} \u00b7 #${u.k + 1}`));
          b.addEventListener('click', () => u.go());
          uses.append(b);
        }
        row.append(uses);
      }
      items.push(row);
    }
    if (cur && !cur.sq.locked) {
      const add = forgeEl(doc, 'button', 'fx-tool fx-sg-seq-add', '+ Sequence') as HTMLButtonElement;
      add.type = 'button';
      add.title = "A new sequence in the program shown: it waits until a Call sequence command calls it, then runs beside the rest";
      add.addEventListener('click', () => cur.hooks.add());
      items.push(add);
    }
    items.push(head('Game valves', null));
    for (const [name, words] of l.games) {
      const g = forgeEl(doc, 'div', 'fx-sg-game');
      g.title = "The game's own valve: any program may test it (If, While: A game valve is), none writes it";
      g.append(forgeEl(doc, 'span', 'fx-sg-flag-name', name), forgeEl(doc, 'span', 'fx-sg-flag-meta', words));
      items.push(g);
    }
    legendEl.replaceChildren(...items);
  };

  let zoom = 1;
  const setZoom = (z: number): void => {
    zoom = Math.round(Math.min(2, Math.max(0.3, z)) * 100) / 100;
    // `zoom`, not a transform: the scroll area follows the graph's size.
    graph.style.setProperty('zoom', String(zoom));
    zoomWord.textContent = `${Math.round(zoom * 100)}%`;
  };
  zoomOut.addEventListener('click', () => setZoom(zoom - 0.1));
  zoomIn.addEventListener('click', () => setZoom(zoom + 0.1));
  zoomWord.addEventListener('click', () => setZoom(1));
  // The wheel zooms (the Forge's owner (crispy, OT.R112), 2026-11-13: "add scrolling to the node editor to zoom in/out"), about the pointer: the
  // point under it stays under it. A drag of the empty space pans. Over an open dropdown list, the wheel is the list's.
  canvas.addEventListener('wheel', (e) => {
    // A dropdown's own list scrolled (its options are its select's; the Forge's owner (crispy, OT.R112), 2026-11-13: "don't scroll when I am in a
    // dropdown scroll list"), or the + menu: theirs, not a zoom. Any node's list open: the wheel left to it too.
    if ((e.target as HTMLElement).closest('select, option, .fx-sg-menu')) return;
    try { if (canvas.querySelector('select:open')) return; } catch { /* `:open` unknown to this browser: the target's test above */ }
    e.preventDefault();
    const before = zoom;
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    if (zoom === before) return;
    const c = canvas.getBoundingClientRect();
    const mx = e.clientX - c.left, my = e.clientY - c.top;
    canvas.scrollLeft = (canvas.scrollLeft + mx) * (zoom / before) - mx;
    canvas.scrollTop = (canvas.scrollTop + my) * (zoom / before) - my;
  }, { passive: false });
  // The empty space dragged: the graph panned (its scroll); a click there lets the chosen node go.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.fx-sg-node, .fx-sg-add, .fx-sg-menu, .fx-sg-empty button')) return;
    const sx = e.clientX, sy = e.clientY, l = canvas.scrollLeft, t = canvas.scrollTop;
    let moved = false;
    canvas.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void => {
      if (Math.abs(m.clientX - sx) + Math.abs(m.clientY - sy) > 3) { moved = true; canvas.classList.add('is-panning'); }
      canvas.scrollLeft = l - (m.clientX - sx); canvas.scrollTop = t - (m.clientY - sy);
    };
    const up = (): void => {
      canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.classList.remove('is-panning');
      if (!moved && modelNow?.selected !== null) hooksNow?.select(null);
    };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  });

  // The + menu: the steps a wire takes (`./stepMenu`, the Step rows' menu too).
  const closeMenu = (): void => { closeStepMenu(); };
  const openMenu = (anchor: HTMLElement, at: number, otherwise = false): void => {
    // An If's passing lane: another Else if (the Forge's owner (crispy, OT.R112), 2026-11-13: "immediately show the else if"), its Otherwise made, empty or with the command chosen in it.
    const offered: (readonly [string, string])[] = otherwise ? [['elseif', 'Else if (another test)'], ['else', 'Otherwise only (an empty lane)'], ...(modelNow?.addKinds ?? [])] : [...(modelNow?.addKinds ?? [])];
    openStepMenu(doc, anchor, offered, (kind) => hooksNow?.insert(at, kind, otherwise));
  };

  let modelNow: ScriptGraphModel | null = null;
  let hooksNow: ScriptGraphHooks | null = null;
  let sig = '';
  /** Each node's rows list, by its step: filled on every draw (`showInspectorData` skips what has not changed). */
  let nodeRows = new Map<number, HTMLDListElement>();
  let nodeEls = new Map<number, HTMLElement>();

  /** A wire: its line, and its + always shown (`otherwise`: an If's passing lane, which makes its Otherwise). */
  const wire = (at: number, grow = false, otherwise = false): HTMLElement => {
    const w = forgeEl(doc, 'div', `fx-sg-wire${grow ? ' is-grow' : ''}${otherwise ? ' is-pass' : ''}`);
    if (modelNow && !modelNow.locked) {
      const add = forgeEl(doc, 'button', 'fx-sg-add', '+');
      add.type = 'button';
      add.title = otherwise ? 'Add an Otherwise (ELSE) here' : 'Add a command here';
      add.setAttribute('aria-label', add.title);
      add.addEventListener('click', (e) => { e.stopPropagation(); openMenu(add, at, otherwise); });
      w.append(add);
    }
    return w;
  };
  /** A node: its command, its number, its remove; then its own rows (the step's editors). */
  const node = (k: number, extra = ''): HTMLElement => {
    const st = modelNow!.steps[k]!;
    const n = forgeEl(doc, 'div', `fx-sg-node fx-sg-fam-${familyOf(st.do)}${extra}`);
    n.dataset['step'] = String(k);
    const head = forgeEl(doc, 'div', 'fx-sg-node-head');
    head.tabIndex = 0;
    head.setAttribute('role', 'button');
    head.title = 'Choose it (its rows marked in the Inspector)';
    head.append(forgeEl(doc, 'span', 'fx-sg-cmd', COMMAND[st.do] ?? st.do.toUpperCase()), forgeEl(doc, 'span', 'fx-sg-num', `#${k + 1}`));
    if (!modelNow!.locked && st.do !== 'endWhile' && st.do !== 'end') {
      const x = forgeEl(doc, 'button', 'fx-sg-remove', '✕');
      x.type = 'button';
      x.title = st.do === 'if' || st.do === 'while' ? 'Remove (with its whole block)' : 'Remove';
      x.setAttribute('aria-label', x.title);
      x.addEventListener('click', (e) => { e.stopPropagation(); hooksNow?.remove(k); });
      head.append(x);
    }
    n.append(head);
    // Read only: its words. Else its rows: none on a block's closer (End if, End while) -- nothing of its own to set.
    if (modelNow!.readOnly) { if (st.detail) n.append(forgeEl(doc, 'div', 'fx-sg-detail', st.detail)); }
    else if (st.do !== 'endWhile' && st.do !== 'end') {
      const dl = forgeEl(doc, 'dl', 'fx-inspect-data fx-sg-rows') as HTMLDListElement;
      n.append(dl);
      nodeRows.set(k, dl);
    }
    nodeEls.set(k, n);
    // Its head chooses it (or lets it go); a field inside it chooses it too, never letting it go.
    const toggle = (): void => hooksNow?.select(modelNow?.selected === k ? null : k);
    head.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.fx-sg-remove')) toggle(); });
    head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    n.addEventListener('focusin', (e) => { if (!head.contains(e.target as Node) && modelNow?.selected !== k) hooksNow?.select(k); });
    return n;
  };
  /** A sequence, left to right: a wire before each item, then one after the last (`grow` to its lane's end). */
  const sequence = (items: Item[], startAt: number, grow: boolean): HTMLElement => {
    const row = forgeEl(doc, 'div', `fx-sg-seq${grow ? ' is-grow' : ''}`);
    let at = startAt;
    for (const it of items) {
      row.append(wire(at), block(it));
      at = lastOf(it) + 1;
    }
    row.append(wire(at, grow));
    return row;
  };
  const block = (it: Item): HTMLElement => {
    if (it.t === 'step') {
      const loops = modelNow!.steps[it.k]!.do === 'loop';
      const n = node(it.k, loops ? ' fx-sg-back' : '');
      if (loops) n.append(forgeEl(doc, 'div', 'fx-sg-note', '↺ back to the start'));
      return n;
    }
    if (it.t === 'while') {
      // Its head, its body, its End while; the line back runs from the End while down, along under the body, and up into
      // the head (its arrow there). Head and End each stand in a column of their own (`post`), their drop the line's ends.
      const w = forgeEl(doc, 'div', `fx-sg-while${it.end !== null ? ' has-return' : ''}`);
      const post = (n: HTMLElement, cls: string): HTMLElement => {
        const col = forgeEl(doc, 'div', `fx-sg-post ${cls}`);
        col.append(forgeEl(doc, 'div', 'fx-sg-post-top'), n, forgeEl(doc, 'div', 'fx-sg-post-drop'));
        return col;
      };
      const loop = forgeEl(doc, 'div', 'fx-sg-loop');
      loop.append(sequence(it.body, it.k + 1, false));
      w.append(post(node(it.k), 'is-head'), loop);
      if (it.end !== null) w.append(post(node(it.end, ' fx-sg-pill'), 'is-end'));
      return w;
    }
    // An If: its node, then its lanes one over another -- each a row: its condition in a column of its own (the If's own
    // "then", an Else if's node, an Otherwise's node, or the passing lane's), its steps after, in a column of their own --
    // a bar down their starts and their ends; its End if after.
    const b = forgeEl(doc, 'div', 'fx-sg-if');
    const lanes = forgeEl(doc, 'div', 'fx-sg-lanes');
    const head = (inner: HTMLElement | null, tag: string | null): HTMLElement => {
      const h = forgeEl(doc, 'div', 'fx-sg-lane-head');
      if (inner) h.append(inner);
      else {
        // No node of its own: a line through the column, its word on it.
        h.classList.add('is-line');
        h.append(forgeEl(doc, 'div', 'fx-sg-line'), forgeEl(doc, 'div', 'fx-sg-tag', tag ?? ''), forgeEl(doc, 'div', 'fx-sg-line'));
      }
      return h;
    };
    it.branches.forEach((br, i) => {
      const lane = forgeEl(doc, 'div', `fx-sg-lane is-${i === 0 ? 'then' : modelNow!.steps[br.k]!.do}`);
      // Each branch's own condition heads its lane, the If's too (the Forge's owner (crispy, OT.R112), 2026-11-13: "if, else if ... else ... stacked
      // on top of each other"): the chain reads down its first column, each lane's steps to its right.
      lane.append(forgeEl(doc, 'div', 'fx-sg-stub'), head(node(i === 0 ? it.k : br.k), null), sequence(br.body, br.k + 1, true));
      lanes.append(lane);
    });
    if (!it.branches.some((br) => modelNow!.steps[br.k]!.do === 'else')) {
      // No Otherwise: a lane passing by, as the game goes on to its End if; its + makes the Otherwise.
      const lane = forgeEl(doc, 'div', 'fx-sg-lane fx-sg-lane-pass');
      lane.append(forgeEl(doc, 'div', 'fx-sg-stub'), head(null, 'otherwise'),
        it.end !== null ? wire(it.end, true, true) : forgeEl(doc, 'div', 'fx-sg-wire is-grow is-pass'));
      lanes.append(lane);
    }
    b.append(lanes);
    if (it.end !== null) b.append(node(it.end, ' fx-sg-pill'));
    return b;
  };

  /** Each node's rows, from the page's one list (the Inspector's editors; their labels without the step's number). */
  const drawRows = (): void => {
    const h = hooksNow;
    if (!h || nodeRows.size === 0) return;
    const all = h.rows();
    for (const [k, dl] of nodeRows) {
      const rows = all.filter((e) => e.scriptStep === k)
        .map((e) => ({ ...e, gap: false, focus: false, label: e.label.replace(/^[·\s]*\d+\.\s*/, '') || 'Command' }));
      showInspectorData({ data: dl }, [], rows);
    }
  };

  return {
    root,
    legend(l) {
      const sig = JSON.stringify([l.flags.map((f) => [f.name, f.here, f.uses.map((u) => [u.who, u.k, u.write])]), l.games,
        (l.sequences ?? []).map((q) => [q.name, q.who, q.here, q.mine, q.uses.map((u) => [u.who, u.k, u.write])])]);
      legendNow = l;
      if (sig === legendSig) return;
      legendSig = sig;
      drawLegend();
    },
    setView(view, pick) {
      viewNow = view;
      pickView = pick;
      for (const [b, v] of [[mapBtn, 'map'], [selBtn, 'selection'], [discBtn, 'disc']] as const) {
        b.classList.toggle('is-on', view === v);
        b.setAttribute('aria-selected', String(view === v));
      }
      discPicks.hidden = view !== 'disc';
      // The flags legend is the layout's: beside its own scripts, not an original's.
      legendEl.hidden = view === 'disc';
      grip.hidden = view === 'disc';
    },
    setSequences(sq, hooks) {
      const sig = JSON.stringify(sq);
      seqNow = sq ? { sq, hooks } : null;
      if (sig === seqSig) return;
      seqSig = sig;
      drawLegend();
    },
    setDisc(programs, at, pick) {
      discPick = pick;
      const sig = JSON.stringify(programs);
      if (sig !== discSig) {
        discSig = sig;
        programSel.replaceChildren(...(programs ?? []).map((p) => { const o = forgeEl(doc, 'option', '', p.name) as HTMLOptionElement; o.value = p.name; return o; }));
      }
      programSel.disabled = !programs?.length;
      programSel.value = at.program;
      const seqs = programs?.find((p) => p.name === at.program)?.sequences ?? [];
      sequenceSel.replaceChildren(...seqs.map((s, i) => { const o = forgeEl(doc, 'option', '', `${i + 1}. ${s}`) as HTMLOptionElement; o.value = String(i); return o; }));
      sequenceSel.disabled = seqs.length < 2;
      sequenceSel.value = String(at.sequence);
    },
    draw(model, hooks, emptyWords, emptyAction) {
      hooksNow = hooks;
      // Drawn anew when its shape changes (its steps' kinds, its lock, its owner); a value changed redraws the rows alone.
      const nextSig = model ? JSON.stringify([model.owner, model.event, model.steps.map((s) => s.do), model.locked, model.addKinds.length])
        : `none:${emptyWords}:${emptyAction?.label ?? ''}`;
      modelNow = model;
      if (nextSig !== sig) {
        sig = nextSig;
        closeMenu();
        nodeRows = new Map();
        nodeEls = new Map();
        if (!model) {
          title.textContent = 'Program';
          const empty = forgeEl(doc, 'div', 'fx-sg-empty');
          empty.append(forgeEl(doc, 'p', '', emptyWords));
          if (emptyAction) {
            const b = forgeEl(doc, 'button', 'fx-tool', emptyAction.label);
            b.type = 'button';
            b.addEventListener('click', () => emptyAction.run());
            empty.append(b);
          }
          graph.replaceChildren(empty);
        } else {
          title.textContent = `${model.owner} · program`;
          const flow = forgeEl(doc, 'div', 'fx-sg-flow');
          const ev = forgeEl(doc, 'div', 'fx-sg-node fx-sg-event');
          ev.append(forgeEl(doc, 'div', 'fx-sg-node-head', 'EVENT'), forgeEl(doc, 'div', 'fx-sg-detail', model.event));
          const done = forgeEl(doc, 'div', 'fx-sg-node fx-sg-pill fx-sg-done', 'END');
          flow.append(ev, sequence(parse(model.steps), 0, false), done);
          graph.replaceChildren(flow);
        }
      }
      // The chosen node marked, its rows drawn: neither rebuilds a node (a field being typed in keeps its focus).
      for (const [k, n] of nodeEls) n.classList.toggle('is-on', model?.selected === k);
      drawRows();
    },
  };
}
