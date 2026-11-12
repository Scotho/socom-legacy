import '../forge/assetPreview.css';

/** Browser adaptation: user-selected files are staged locally, never installed or applied by dropping them. */
export interface FileDropzoneOptions {
  stage(files: File[]): Promise<void>;
  allowed?(): boolean;
  /** The blocked sentence for the case its owner is in (LATER 799); the Build sentence when absent. */
  blockedReason?(): string;
}
export const DROPZONE_BLOCKED_BUILD = 'Return to Build to add local files.';
export function mountFileDropzone(host: HTMLElement, options: FileDropzoneOptions) {
  const doc = host.ownerDocument;
  const events = new ((doc.defaultView as (Window & typeof globalThis) | null)?.AbortController ?? AbortController)();
  const root = doc.createElement('div'); root.className = 'agent-file-dropzone'; root.dataset.fileDropzone = '';
  const title = doc.createElement('p'); title.textContent = 'Drop local files here or browse';
  const label = doc.createElement('label'); label.className = 'agent-panel__file-button'; label.textContent = 'Browse files';
  const input = doc.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = '.json,.zip,.glb,.png';
  input.setAttribute('aria-label', 'Add local files'); label.append(input);
  const status = doc.createElement('p'); status.className = 'agent-panel__hint'; status.setAttribute('role', 'status');
  const hint = doc.createElement('p'); hint.className = 'agent-panel__hint';
  hint.textContent = 'Files stay on this device. Staging is not validation or installation. Models and textures are not palette placements until explicitly imported and supported.';
  root.append(title, label, status, hint); host.append(root);
  let disposed = false, reading = false, depth = 0;
  const allowed = (): boolean => !disposed && (options.allowed?.() ?? true);
  const refresh = (): void => {
    input.disabled = !allowed() || reading; root.setAttribute('aria-disabled', String(input.disabled));
    if (!allowed()) { root.dataset.state = 'blocked'; status.textContent = options.blockedReason?.() ?? DROPZONE_BLOCKED_BUILD; }
    else if (!reading && root.dataset.state === 'blocked') { root.dataset.state = 'idle'; status.textContent = 'Choose files to make them available to your agent.'; }
  };
  const stage = async (files: File[]): Promise<void> => {
    if (!allowed() || reading || !files.length) { refresh(); return; }
    reading = true; root.dataset.state = 'reading'; status.textContent = `Reading ${files.length} local file${files.length === 1 ? '' : 's'}…`; refresh();
    try {
      await options.stage(files);
      if (!disposed && allowed()) { root.dataset.state = 'success'; status.textContent = `${files.length} file${files.length === 1 ? '' : 's'} ready for your agent — not installed. Import and validation come next.`; }
    } catch (error) {
      if (!disposed) { root.dataset.state = 'error'; status.textContent = error instanceof Error ? error.message : 'Could not read these files.'; }
    } finally { reading = false; if (!disposed) refresh(); }
  };
  const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void): void => {
    root.addEventListener(type, handler, { signal: events.signal });
  };
  input.addEventListener('change', () => { const files = Array.from(input.files ?? []); input.value = ''; void stage(files); }, { signal: events.signal });
  const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  const hasUrl = (event: DragEvent): boolean => !hasFiles(event) && Array.from(event.dataTransfer?.types ?? []).includes('text/uri-list');
  listen('dragenter', event => { if (!hasFiles(event)) return; event.preventDefault(); depth++; if (allowed() && !reading) root.dataset.state = 'hover'; });
  listen('dragover', event => {
    if (hasUrl(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'; return; }
    if (!hasFiles(event)) return;
    event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = allowed() && !reading ? 'copy' : 'none';
  });
  listen('dragleave', event => {
    if (!hasFiles(event)) return;
    if (--depth <= 0) { depth = 0; if (root.dataset.state === 'hover') root.dataset.state = 'idle'; }
  });
  listen('drop', event => {
    if (hasUrl(event)) {
      event.preventDefault(); event.stopPropagation(); depth = 0; root.dataset.state = 'error';
      status.textContent = 'URL drops are not supported. Choose local files from this device.'; return;
    }
    if (!hasFiles(event)) return;
    event.preventDefault(); event.stopPropagation(); depth = 0;
    if (Array.from(event.dataTransfer?.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
      root.dataset.state = 'error'; status.textContent = 'Choose files, not folders, here.'; return;
    }
    void stage(Array.from(event.dataTransfer?.files ?? []));
  });
  root.dataset.state = 'idle'; status.textContent = 'Choose files to make them available to your agent.'; refresh();
  return { refresh, dispose(): void { if (disposed) return; disposed = true; events.abort(); root.remove(); } };
}
