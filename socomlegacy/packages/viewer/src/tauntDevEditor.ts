import { holdDevKeys } from './devKeyHolds';
import { assetSourceFor } from './discSource';
import type { PadButton } from './gamepad';
import { TauntEditor } from './tauntEditor';
import type { SourceRequest } from './worker';
import type { DevEditorState } from './tauntDevState';

/**
 * `/testroom`'s SETUP TAUNTS button (web research 301 §6): a development build's only, and only with the dev-tools
 * switch (`?devtools`, or `?devmode` which includes it) -- `./main` loads this module with `import()` under
 * `import.meta.env.DEV` and that switch, a condition every `vite build` folds to false, so a release bundle holds
 * neither the button nor the editor (`./tauntEditor`, the front end's session
 * through it); `test/matchTaunts.test.ts` holds `./main` to that import and to no static one. The player's
 * way in is the original's: ONLINE > OPTIONS > SETUP TAUNTS. The button opens the disc's own dialog over the page's
 * card (`./tauntEditor`); its physical typing reaches the soft keyboard only while that keyboard's text entry is open.
 * A playtest instrument, a browser adaptation.
 */
export interface TauntDevEditorDeps {
  /** Where the button goes (the panel's body); null: no button. */
  panel: HTMLElement | null;
  /** The disc the page reads (the editor's dialog, textures, sounds and keyboard). */
  source(): SourceRequest | null;
  /** The map's taunt defaults (the sound data's), null before them: the button stays disabled. */
  defaults(): readonly string[] | null;
  /** A screen that holds the pad (the loading hold, WEAPON EXCHANGE): the editor does not open over it. */
  blocked(): boolean;
  /** The editor opening: the page's menus closed and its trigger let go. */
  opening(): void;
  /** After the editor wrote the card: the page re-reads its five. */
  saved(): void;
  /** Where a failure is said. */
  status(text: string): void;
}

export interface TauntDevEditor {
  readonly editor: TauntEditor;
  readonly button: HTMLButtonElement;
  isOpen(): boolean;
  /** The pad's frame: true while the editor holds the pad. */
  frame(now: number, held: ReadonlySet<PadButton>): boolean;
  /** The map's data came or went: the button follows it, the editor closes on a new map. */
  refresh(): void;
  close(): void;
}

export function mountTauntDevEditor(d: TauntDevEditorDeps): TauntDevEditor {
  const editor = new TauntEditor();
  editor.saved = () => { d.saved(); };
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'setup-taunts'; button.textContent = 'SETUP TAUNTS';
  button.title = 'Development build: the original SETUP TAUNTS dialog, saved on the page\'s card'; button.disabled = true;
  const open = (): void => {
    const from = d.source(), defaults = d.defaults();
    if (!from || !defaults || d.blocked() || editor.isOpen()) return;
    const source = assetSourceFor(from);
    d.opening();
    void editor.open(source, defaults).then(() => { if (editor.status) d.status(editor.status); });
  };
  button.addEventListener('click', open);
  d.panel?.append(button);
  // The physical typing, into the soft keyboard's text entry only (`TauntEditor.key`); a development build's listener.
  // LATER 190: registered at this module's import, after the round text line's and the dev talk key's (the window's
  // capture phase too), so while open the editor holds the keys for them to leave alone (`./devKeyHolds`).
  if (import.meta.env.DEV) {
    holdDevKeys(() => editor.isOpen());
    globalThis.addEventListener('keydown', (e: KeyboardEvent) => {   // OT.R29: a development build's only
      if (!editor.isOpen()) return;
      editor.key(e);
      e.preventDefault(); e.stopImmediatePropagation();
    }, { capture: true });
  }
  return {
    editor, button,
    isOpen: () => editor.isOpen(),
    frame: (now, held) => editor.frame(now, held),
    refresh: () => { button.disabled = !d.defaults(); if (!d.defaults()) editor.close(); },
    close: () => { editor.close(); },
  };
}

/** The editor as the browser spec's hook reports it (`window.__viewer.taunts()`); closed and empty without one. */
export function devEditorState(dev: TauntDevEditor | null): DevEditorState {
  const e = dev?.editor, s = e?.session;
  return {
    editor: e?.isOpen() ?? false, editorReady: !!s, editorTaking: e?.taking() ?? false, editorAudio: e?.audioStats() ?? null,
    keyboardOpen: s?.keyboard.keyboard.isOpen ?? false, editorFocus: s?.input.ring()?.focused?.name ?? null, editorStatus: e?.status ?? '',
  };
}
