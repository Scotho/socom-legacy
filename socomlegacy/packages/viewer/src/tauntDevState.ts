import type { AudioStats } from './audio';

/**
 * `/testroom`'s development-only SETUP TAUNTS (`./tauntDevEditor`) as the browser spec's hook reports it
 * (`window.__viewer.taunts()`). Its own module, with no import of the editor, so `./main` and `./hook` name the shape
 * while a release build drops the editor whole (`./main` loads it with `import()` under `import.meta.env.DEV`).
 */
export interface DevEditorState {
  editor: boolean; editorReady: boolean; editorTaking: boolean; editorAudio: AudioStats | null;
  keyboardOpen: boolean; editorFocus: string | null; editorStatus: string;
}

/** No editor mounted (a release build, no `?devmode`, or before its module has loaded). */
export const DEV_EDITOR_CLOSED: DevEditorState = Object.freeze({
  editor: false, editorReady: false, editorTaking: false, editorAudio: null, keyboardOpen: false, editorFocus: null, editorStatus: '',
});
