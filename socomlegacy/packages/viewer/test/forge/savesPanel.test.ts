// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { KeptAside } from '../../src/forge/saves';
import { savesCard, type SavesPanelHandlers } from '../../src/forge/savesPanel';

/**
 * LATER 214 (the merge controller's product-track call on the words, 2026-10-21): the Saves card shows what the page
 * kept aside (`../../src/forge/saves` `keptAside`) under "Kept aside", each with Download and Delete; nothing kept, no
 * section. Each row says whether this build reads it now. A browser adaptation (OT.R28): nothing of the game.
 */
const kept: KeptAside[] = [
  { id: 'autosave:0', name: 'Earlier autosave 1', text: 'x'.repeat(3000), readable: false },
  { id: 'saves', name: 'Earlier saved list', text: 'y', readable: true },
];

function card(over: Partial<SavesPanelHandlers> = {}): { el: HTMLElement; calls: string[] } {
  const calls: string[] = [];
  const note = (what: string) => () => { calls.push(what); };
  const el = savesCard(document, {
    saves: [], shareUrl: '',
    onOpen: note('open'), onRename: note('rename'), onDelete: note('delete'), onSaveAs: note('saveAs'),
    onDownload: note('download'), onShare: note('share'), onClose: note('close'),
    onKeptDownload: (k) => calls.push(`kept-download ${k.id}`), onKeptDelete: (k) => calls.push(`kept-delete ${k.id}`),
    ...over,
  });
  return { el, calls };
}

describe('LATER 214: the Saves card\'s Kept aside section', () => {
  it('nothing kept: no section', () => {
    expect(card().el.querySelector('[data-kept-aside]')).toBeNull();
    expect(card({ kept: [] }).el.querySelector('[data-kept-aside]')).toBeNull();
  });

  it('each kept copy a row: its name, whether this build reads it and its size, Download and Delete', () => {
    const { el, calls } = card({ kept });
    const section = el.querySelector<HTMLElement>('[data-kept-aside]')!;
    expect(section.querySelector('h3')?.textContent).toBe('Kept aside');
    expect(section.querySelector('p')?.textContent).toBe('Copies kept as they were. Download one to keep it outside this browser.');
    const rows = [...section.querySelectorAll<HTMLElement>('li')];
    expect(rows.map((r) => r.querySelector('.fx-save-name')?.textContent)).toEqual(['Earlier autosave 1', 'Earlier saved list']);
    expect(rows.map((r) => r.querySelector('.fx-dim')?.textContent)).toEqual(['not readable here \u00b7 3 KB', 'kept as it was \u00b7 1 KB']);
    for (const r of rows) for (const b of r.querySelectorAll('button')) b.click();
    expect(calls).toEqual(['kept-download autosave:0', 'kept-delete autosave:0', 'kept-download saves', 'kept-delete saves']);
    expect(rows.map((r) => [...r.querySelectorAll('button')].map((b) => b.textContent))).toEqual([['Download', 'Delete'], ['Download', 'Delete']]);
  });
});
