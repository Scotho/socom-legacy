import type { KeptAside, NamedSave, UnreadableSave } from './saves';

/**
 * FORGE: the saves card (a browser adaptation, no original). The page owns the confirm and the name question; this
 * only draws the list and reports which button was pressed. FUI-2 (the review's IA-2, PAD-1, PAD-4): the pad walks it
 * (`./shell/padFocus`) -- each row and each footer button is a `[data-pad-item]`; on a save's row Cross is Open, Square
 * Rename and Triangle Delete (`data-pad`), on a kept copy's Cross Download and Triangle Delete.
 */

/** FUI-2: a row's control the pad's Cross, Square or Triangle presses (`./shell/padFocus` `PadItemRole`). */
function padRole(b: HTMLElement, role: 'act' | 'secondary' | 'remove'): HTMLElement { b.dataset['pad'] = role; return b; }

export interface SavesPanelHandlers {
  saves: readonly NamedSave[];
  /** Entries this build cannot read, kept as they were (#348's re-review): named, never opened. */
  unreadable?: readonly UnreadableSave[];
  /** The link last copied, or '' when there is none yet. */
  shareUrl: string;
  onOpen(id: string): void;
  onRename(id: string): void;
  onDelete(id: string): void;
  /** A saved list this build cannot read: moved aside, as it was, so saving works again. */
  onSetAside?(): void;
  /** LATER 214: the copies kept aside (`./saves` `keptAside`); none, no section. */
  kept?: readonly KeptAside[];
  onKeptDownload?(k: KeptAside): void;
  onKeptDelete?(k: KeptAside): void;
  onSaveAs(): void;
  onDownload(): void;
  onShare(): void;
  onClose(): void;
}

function when(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The card the page puts in its modal. */
export function savesCard(doc: Document, h: SavesPanelHandlers): HTMLElement {
  const card = doc.createElement('div');
  card.className = 'fx-card fx-saves';
  const title = doc.createElement('h2');
  title.textContent = 'Saves';
  const note = doc.createElement('p');
  note.textContent = 'Named layouts kept in this browser. The one you are editing is also kept as you go.';
  const list = doc.createElement('ul');
  list.className = 'fx-saves-list';
  if (h.saves.length === 0 && !h.unreadable?.length) {
    const empty = doc.createElement('li');
    empty.className = 'fx-empty';
    empty.textContent = 'No named saves yet';
    list.append(empty);
  }
  for (const s of h.saves) {
    const li = doc.createElement('li');
    li.dataset['saveId'] = s.id;
    li.dataset['padItem'] = '';
    const name = doc.createElement('span');
    name.className = 'fx-save-name';
    name.textContent = s.name;
    const time = doc.createElement('span');
    time.className = 'fx-dim';
    time.textContent = when(s.savedAt);
    const button = (label: string, act: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-tool';
      b.textContent = label;
      b.addEventListener('click', act);
      return b;
    };
    li.append(name, time, padRole(button('Open', () => h.onOpen(s.id)), 'act'), padRole(button('Rename', () => h.onRename(s.id)), 'secondary'),
      padRole(button('Delete', () => h.onDelete(s.id)), 'remove'));
    list.append(li);
  }
  for (const u of h.unreadable ?? []) {
    const li = doc.createElement('li');
    li.className = 'fx-save-unreadable';
    const name = doc.createElement('span');
    name.className = 'fx-save-name';
    name.textContent = u.name;
    const why = doc.createElement('span');
    why.className = 'fx-dim';
    why.textContent = `unreadable here (${u.why}); kept as it was`;
    li.append(name, why);
    if (u.whole && h.onSetAside) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'fx-tool';
      b.textContent = 'Set aside';
      b.title = 'Keep this list as it was, under its own name in this browser, so saving works again';
      b.addEventListener('click', () => h.onSetAside?.());
      li.dataset['padItem'] = '';
      li.append(padRole(b, 'act'));
    }
    list.append(li);
  }
  // LATER 214 (the merge controller's call on the words): what the page kept aside, given back -- Download and Delete.
  const kept = doc.createElement('section');
  if (h.kept?.length) {
    kept.className = 'fx-kept';
    kept.dataset['keptAside'] = '';
    const head = doc.createElement('h3');
    head.textContent = 'Kept aside';
    const why = doc.createElement('p');
    why.textContent = 'Copies kept as they were. Download one to keep it outside this browser.';
    const rows = doc.createElement('ul');
    rows.className = 'fx-saves-list';
    for (const k of h.kept) {
      const li = doc.createElement('li');
      li.dataset['keptId'] = k.id;
      li.dataset['padItem'] = '';
      const name = doc.createElement('span');
      name.className = 'fx-save-name';
      name.textContent = k.name;
      const dim = doc.createElement('span');
      dim.className = 'fx-dim';
      const kb = Math.max(1, Math.round(new TextEncoder().encode(k.text).length / 1024));
      dim.textContent = `${k.readable ? 'kept as it was' : 'not readable here'} \u00b7 ${kb} KB`;
      const button = (label: string, act: () => void): HTMLButtonElement => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'fx-tool';
        b.textContent = label;
        b.addEventListener('click', act);
        return b;
      };
      li.append(name, dim, padRole(button('Download', () => h.onKeptDownload?.(k)), 'act'), padRole(button('Delete', () => h.onKeptDelete?.(k)), 'remove'));
      rows.append(li);
    }
    kept.append(head, why, rows);
  }
  const shareLabel = doc.createElement('label');
  shareLabel.className = 'fx-share-label';
  shareLabel.textContent = 'Share link';
  const share = doc.createElement('input');
  share.type = 'text';
  share.readOnly = true;
  share.className = 'fx-search fx-share-link';
  share.dataset['shareLink'] = '';
  share.value = h.shareUrl;
  share.placeholder = 'Share link copies a link here';
  shareLabel.append(share);
  const foot = doc.createElement('footer');
  const footButton = (label: string, primary: boolean, act: () => void): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = primary ? 'fx-tool fx-primary' : 'fx-tool';
    b.textContent = label;
    b.dataset['padItem'] = '';
    b.addEventListener('click', act);
    return b;
  };
  foot.append(
    footButton('Save as', true, () => h.onSaveAs()),
    footButton('Download', false, () => h.onDownload()),
    footButton('Share link', false, () => h.onShare()),
    footButton('Close', false, () => h.onClose()),
  );
  card.append(title, note, list, ...(h.kept?.length ? [kept] : []), shareLabel, foot);
  return card;
}
