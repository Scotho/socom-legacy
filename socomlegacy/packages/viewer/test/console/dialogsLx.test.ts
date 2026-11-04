// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractHtml, extractStart, type ExtractView } from '../../src/console/render/extract';
import { overlayHtml } from '../../src/console/render/overlay';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { createState } from '../../src/console/state';
import { PAGE } from './cascade';

/**
 * LR-9 (the launcher redesign plan, LR.R8): the Sign in and Server news dialogs in the new drawing -- LR-1's panel head
 * (the title a level-2 heading in the panel head's `.cx-title`, the close button beside it as before) on the
 * `--s2u-lx-*` tokens. The artifact (`S2-Launcher-v2.dc.html`) draws no dialog of its own, so the dialog takes the panel's
 * look (`console.css`, "LR-9"). Their behaviour -- the fields, the keys, the acts, the error line, Circle closes -- is
 * unchanged (`modalClose.test.ts`, `profile.test.ts`, `serverInfo.test.ts` hold it). A browser adaptation.
 */
const draw = (overlay: 'signin' | 'news'): HTMLElement => {
  const A = sampleAdapters();
  const S = createState(A);
  S.overlay = overlay;
  const box = document.createElement('div');
  box.innerHTML = overlayHtml(S, A);
  return box;
};

describe.each(['signin', 'news'] as const)('the %s dialog in the new drawing (LR-9)', (kind) => {
  it('is the panel\'s dialog: .cx-dialog--lx, its title the panel head\'s level-2 .cx-title, the close button kept', () => {
    const box = draw(kind);
    const d = box.querySelector<HTMLElement>('.cx-dialog')!;
    expect(d.classList.contains('cx-dialog--lx')).toBe(true);
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    const h = d.querySelector<HTMLElement>('.cx-dialog__head h2.cx-title')!;
    expect(h.id).toBe(d.getAttribute('aria-labelledby'));
    expect(d.querySelector('.cx-dialog__head [data-close][data-act="press"][data-b="circle"]')).not.toBeNull();
  });
});

// LR-9's row, its last clause (review-lr-9-10 F2): the extraction popover drew the old way (part G's italic gold title).
describe.each(['plan', 'copy', 'verify', 'done', 'error'] as const)('the extraction popover in the new drawing, phase %s (LR-9)', (phase) => {
  it('is the panel\'s dialog: .cx-dialog--lx, its title the panel head\'s level-2 .cx-title; the close button kept where it was', () => {
    const v: ExtractView = { ...extractStart(), phase, ...(phase === 'error' ? { error: { reason: 'failed' as const, words: 'it stopped' } } : {}) };
    const box = document.createElement('div');
    box.innerHTML = extractHtml(v);
    const d = box.querySelector<HTMLElement>('.cx-dialog.cx-extract')!;
    expect(d.classList.contains('cx-dialog--lx')).toBe(true);
    const h = d.querySelector<HTMLElement>('h2.cx-dialog__title.cx-title')!;
    expect(h.id).toBe(d.getAttribute('aria-labelledby'));
    expect(d.querySelector('[data-close]') !== null).toBe(phase !== 'done');
  });
});

describe('the dialogs\' drawing', () => {
  it('console.css draws .cx-dialog--lx on the --s2u-lx-* tokens (the panel, its edge, its ink)', () => {
    const rules = PAGE.split('\n').filter((l) => l.includes('.cx-dialog--lx'));
    expect(rules.length).toBeGreaterThan(0);
    const all = rules.join('\n');
    for (const t of ['--s2u-lx-panel', '--s2u-lx-edge', '--s2u-lx-ink', '--s2u-lx-accent']) expect(all).toContain(t);
  });
});
