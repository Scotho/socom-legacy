import type { ForgeSurface } from './state';

/**
 * FUI-4 (the review's IA-7, VP-5, VP-13, AI-2's page half; principle 3; a browser adaptation, FG.R2): the status bar's
 * chip strip. Every lasting state has one always-visible chip with a word, never the colour alone -- the save, Build /
 * Walk / Play, the lobby's lock, the agent, the issues -- drawn as the design system's `s2u-chip` with its
 * `s2u-lamp` (shared/ds README, "s2u-chip"; the tones are its `is-live` / `is-ready` / `is-wait` / `is-alert` /
 * `is-empty` on the `--s2u-state-*` lamps). A panel adds its own through `registerStatusChip` (its context's `ui`); a
 * chip marked `inMatch` is mirrored beside the match's Back, where the editor's status bar is covered. The strip is
 * read-only for the pad: each chip's panel is reached through its menu section. Nothing here changes what the game does.
 */

export type StatusTone = 'live' | 'ready' | 'wait' | 'alert' | 'empty';

/** What a chip says now: its word (null hides it: nothing to say), its tone, and an optional longer title. */
export interface StatusChipView { text: string | null; tone: StatusTone; title?: string }

export interface StatusChipSpec {
  id: string;
  /** Its place in the strip, least first (`FORGE_CHIP_ORDER` for the page's own). */
  order: number;
  /** The word, always shown with the lamp; null hides the chip. */
  text(): string | null;
  tone(): StatusTone;
  title?(): string;
  /** A click opens what the chip is about (its panel): the chip is then a button. */
  onOpen?(): void;
  /** Mirrored beside the match's Back while a match covers the editor (the agent's). */
  inMatch?: boolean;
  /** A one-press action beside the word (the agent's Stop); null when there is none now. */
  action?(): { label: string; run(): void } | null;
}

export interface StatusChipHandle {
  /** Re-read this chip now (the strip also re-reads every chip at its own `update`). */
  update(): void;
  remove(): void;
}

export interface StatusChips {
  /** The strip, in the status bar. */
  readonly element: HTMLElement;
  /** The mirror of the `inMatch` chips, placed beside the match's Back by the page. */
  readonly matchElement: HTMLElement;
  register(spec: StatusChipSpec): StatusChipHandle;
  /** Re-read every chip; a chip whose word, tone, title and action are unchanged is not touched. */
  update(): void;
  ids(): string[];
  dispose(): void;
}

/** The page's own chips' places (a panel's own sits after them unless it says otherwise). */
export const FORGE_CHIP_ORDER = { save: 10, mode: 20, lobby: 30, agent: 40, issues: 50 } as const;

const TONES: readonly StatusTone[] = ['live', 'ready', 'wait', 'alert', 'empty'];

interface Drawn {
  spec: StatusChipSpec;
  /** In the strip, and in the match's mirror when `inMatch`. */
  views: { root: HTMLElement; chip: HTMLElement; word: HTMLElement; action: HTMLButtonElement | null }[];
  stamp: string;
  run: (() => void) | null;
}

export function createStatusChips(doc: Document): StatusChips {
  const element = doc.createElement('div');
  element.className = 'fx-chips';
  element.dataset['forgeChips'] = '';
  element.setAttribute('aria-label', 'Status');
  const matchElement = doc.createElement('div');
  matchElement.className = 'fx-chips fx-chips--match';
  matchElement.dataset['forgeChips'] = 'match';
  matchElement.setAttribute('aria-label', 'Status');
  const drawn = new Map<string, Drawn>();
  let disposed = false;

  const sorted = (): Drawn[] => [...drawn.values()].sort((a, b) => (a.spec.order - b.spec.order) || a.spec.id.localeCompare(b.spec.id));
  const place = (): void => {
    const list = sorted();
    element.replaceChildren(...list.map((d) => d.views[0]!.root));
    matchElement.replaceChildren(...list.filter((d) => d.spec.inMatch).map((d) => d.views[1]!.root));
  };
  const build = (d: Drawn): Drawn['views'][number] => {
    const { spec } = d;
    // A chip that opens something is a button (shared/ds README); its action a sibling button, never nested in it.
    const chip = doc.createElement(spec.onOpen ? 'button' : 'span');
    if (chip instanceof HTMLButtonElement) {
      chip.type = 'button';
      chip.addEventListener('click', () => spec.onOpen?.());
    }
    const lamp = doc.createElement('span');
    lamp.className = 's2u-lamp s2u-lamp--small s2u-chip__lamp';
    lamp.setAttribute('aria-hidden', 'true');
    const word = doc.createElement('span');
    word.className = 's2u-chip__word';
    chip.append(lamp, word);
    let action: HTMLButtonElement | null = null;
    let root: HTMLElement = chip;
    if (spec.onOpen || spec.action) {
      root = doc.createElement('span');
      root.className = 'fx-chip-group';
      root.append(chip);
      if (spec.action) {
        action = doc.createElement('button');
        action.type = 'button';
        action.className = 'fx-chip-action';
        action.dataset['forgeChipAction'] = spec.id;
        action.addEventListener('click', () => d.run?.());
        root.append(action);
      }
    }
    root.dataset['forgeChip'] = spec.id;
    return { root, chip, word, action };
  };
  const draw = (d: Drawn): void => {
    const text = d.spec.text();
    const tone = d.spec.tone();
    const title = d.spec.title?.() ?? '';
    const act = d.spec.action?.() ?? null;
    d.run = act ? act.run : null;
    const stamp = `${text ?? '\u0000'}|${tone}|${title}|${act?.label ?? ''}`;
    if (stamp === d.stamp) return;
    d.stamp = stamp;
    for (const v of d.views) {
      v.root.hidden = text === null;
      v.word.textContent = text ?? '';
      v.chip.className = `s2u-chip fx-chip is-${tone}`;
      if (title) v.chip.title = title; else v.chip.removeAttribute('title');
      if (v.action) { v.action.hidden = act === null; v.action.textContent = act?.label ?? ''; }
    }
  };

  const chips: StatusChips = {
    element,
    matchElement,
    register(spec) {
      if (disposed) return { update: () => undefined, remove: () => undefined };
      if (!TONES.includes(spec.tone())) throw new Error(`${spec.id}: a chip's tone is one of ${TONES.join(', ')}`);
      drawn.get(spec.id)?.views.forEach((v) => v.root.remove());
      const d: Drawn = { spec, views: [], stamp: '', run: null };
      d.views.push(build(d));
      if (spec.inMatch) d.views.push(build(d));
      drawn.set(spec.id, d);
      draw(d);
      place();
      return {
        update: () => { if (drawn.get(spec.id) === d) draw(d); },
        remove: () => {
          if (drawn.get(spec.id) !== d) return;
          drawn.delete(spec.id);
          for (const v of d.views) v.root.remove();
        },
      };
    },
    update() { for (const d of drawn.values()) draw(d); },
    ids: () => sorted().map((d) => d.spec.id),
    dispose() {
      disposed = true;
      drawn.clear();
      element.replaceChildren();
      matchElement.replaceChildren();
    },
  };
  return chips;
}

/* ---------- the page's own chips' words (pure: the transitions are tested on these) ---------- */

/** Build / Walk / Play (FUI.R8's names); a lobby's hold reads Locked, its server match Play. */
export function modeChip(surface: ForgeSurface, matchOn: boolean): StatusChipView {
  if (surface === 'build') return { text: 'Build', tone: 'ready' };
  if (surface === 'walk') return { text: 'Walk', tone: 'live' };
  if (surface === 'play' || matchOn) return { text: 'Play', tone: 'live' };
  return { text: 'Locked', tone: 'wait' };
}

/** The lobby's lock (IA-7: the button relabels, but never said "edits locked"); none without a lobby. */
export function lobbyChip(lobby: { open: boolean; role?: 'host' | 'joiner' }): StatusChipView {
  if (!lobby.open) return { text: null, tone: 'empty' };
  return lobby.role === 'joiner'
    ? { text: 'Lobby · edits locked', tone: 'wait', title: 'You are in a lobby: this is its host’s layout, and it takes no edit here' }
    : { text: 'Lobby · edits locked', tone: 'wait', title: 'Your lobby is open: the layout takes no edit until you close it' };
}

/**
 * What became of the last edit in this browser: written (`saved`), its 300 ms write due (`saving`), refused by the
 * record's bounds (`refused`), an earlier autosave kept aside until the player edits (`kept`), or a joiner's page that
 * never writes over this browser's autosave (`off`). FUI-9 adds the named save's own state beside it.
 */
export type ForgeSaveState = 'saved' | 'saving' | 'refused' | 'kept' | 'off';

export function saveChip(state: ForgeSaveState): StatusChipView {
  switch (state) {
    case 'saved': return { text: 'Autosaved', tone: 'ready', title: 'Every edit is kept in this browser' };
    case 'saving': return { text: 'Saving…', tone: 'wait' };
    case 'refused': return { text: 'Not saved', tone: 'alert', title: 'This layout is over the record’s bounds: the status line says which' };
    case 'kept': return { text: 'Not saved yet', tone: 'wait', title: 'An earlier autosave is kept until you edit this layout' };
    case 'off': return { text: 'Host’s layout', tone: 'empty', title: 'A lobby’s layout is not written over this browser’s autosave' };
  }
}

/** The last map check (a person's or the agent's), until an edit makes it stale; null when none is current. */
export function issuesChip(issues: number | null): StatusChipView {
  if (issues === null) return { text: 'Not checked', tone: 'empty', title: 'Check the map to list its problems' };
  if (issues === 0) return { text: 'No issues', tone: 'ready' };
  return { text: `${issues} issue${issues === 1 ? '' : 's'}`, tone: 'alert', title: 'Check the map to see them' };
}
