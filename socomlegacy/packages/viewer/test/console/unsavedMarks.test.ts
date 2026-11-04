// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../src/console/app';
import { sampleAdapters } from '../../src/console/sampleAdapters';
import { UNSAVED_EDIT_MARK } from '../../src/pwa/matchSignals';
import { mountShell } from './shell';

/**
 * CX.R18 (the joint review of #353 and the hold, F2): the mobile layout editor holds an edit until its Save or Cancel,
 * so while it is open `<html>` carries the unsaved-edit mark and the installed app's update shows its notice instead of
 * reloading. The editor itself is a dialog over an iframe, which jsdom does not run: stubbed here, its close captured.
 */
const editor = vi.hoisted(() => ({ closed: null as (() => void) | null }));
vi.mock('../../src/mobileLayoutEditor', () => ({
  openMobileLayoutEditor: (_doc: Document, closed: () => void) => { editor.closed = closed; return { dispose() {} }; },
}));

let page: ConsolePage | null = null;
beforeEach(() => { mountShell(document); });
afterEach(() => { page?.dispose(); page = null; editor.closed = null; });

describe('CX.R18: the mobile layout editor marks an unsaved edit', () => {
  it('open: marked; closed (Save or Cancel): cleared', () => {
    page = bootConsole(document, window, sampleAdapters(), { keymap: true });
    const marked = (): boolean => document.documentElement.hasAttribute(UNSAVED_EDIT_MARK);
    expect(marked()).toBe(false);
    (page.ctl as unknown as { host: { editMobileLayout(): void } }).host.editMobileLayout();
    expect(marked()).toBe(true);
    editor.closed!();
    expect(marked()).toBe(false);
  });
});
