// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountFileDropzone } from '../src/agent/fileDropzone';
import { LOCAL_FILE_LIMITS, readPickedFiles } from '../src/agent/localFiles';

afterEach(() => document.body.replaceChildren());
function rig() {
  const host = document.createElement('div'); document.body.append(host);
  let allowed = true;
  const stage = vi.fn(async (_files: File[]) => {});
  const zone = mountFileDropzone(host, { stage, allowed: () => allowed });
  const file = new File(['{}'], 'map.json');
  const root = () => { const element = host.querySelector<HTMLElement>('[data-file-dropzone]'); expect(element).not.toBeNull(); return element!; };
  const drop = (files: File[], types = ['Files'], items: unknown[] = []) => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files, types, items } }); root().dispatchEvent(event);
  };
  return { host, stage, zone, file, root, drop, block() { allowed = false; zone.refresh(); } };
}

describe('stage-only local-file dropzone adaptation', () => {
  it('offers a labelled chooser and states that successful staging is not installation', async () => {
    const r = rig(); r.drop([r.file]);
    await vi.waitFor(() => expect(r.stage).toHaveBeenCalledExactlyOnceWith([r.file]));
    expect(r.host.querySelector('input')?.getAttribute('aria-label')).toBe('Add local files');
    await vi.waitFor(() => expect(r.host.textContent).toContain('not installed')); r.zone.dispose();
  });
  it('uses one reading/error path for chooser and drop', async () => {
    const r = rig(); r.root(); r.stage.mockRejectedValue(new Error('LIMIT_EXCEEDED'));
    const input = r.host.querySelector<HTMLInputElement>('input[type=file]'); expect(input).not.toBeNull();
    Object.defineProperty(input!, 'files', { value: [r.file] }); input!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(r.host.textContent).toContain('LIMIT_EXCEEDED'));
    r.drop([r.file]); await vi.waitFor(() => expect(r.stage).toHaveBeenCalledTimes(2)); r.zone.dispose();
  });
  it.each(['text/uri-list', 'text/plain', 'text/html'])('does not stage external %s data', type => {
    const r = rig(); r.drop([], [type]); expect(r.stage).not.toHaveBeenCalled(); r.zone.dispose();
  });
  it('visibly refuses a dragged URL without staging or navigating', () => {
    const r = rig();
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['text/uri-list'], files: [], items: [] } });
    r.root().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(r.stage).not.toHaveBeenCalled();
    expect(r.root().dataset.state).toBe('error'); expect(r.root().querySelector('[role=status]')?.textContent).toMatch(/URL|link/i);
    r.zone.dispose();
  });
  it('refuses a directory rather than interpreting its name as a file path', () => {
    const r = rig(); r.drop([r.file], ['Files'], [{ webkitGetAsEntry: () => ({ isDirectory: true }) }]);
    expect(r.stage).not.toHaveBeenCalled(); expect(r.host.textContent).toContain('not folders'); r.zone.dispose();
  });
  it('disables chooser and refuses drops while admission is false', () => {
    const r = rig(); r.root(); r.block(); r.drop([r.file]);
    expect(r.stage).not.toHaveBeenCalled(); expect(r.host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    expect(r.host.textContent).toContain('Build'); r.zone.dispose();
  });
  it('prevents duplicate reads and ignores completion after disposal', async () => {
    const r = rig(); let finish!: () => void;
    r.stage.mockImplementation(() => new Promise<void>(done => { finish = done; }));
    r.drop([r.file]); r.drop([r.file]); expect(r.stage).toHaveBeenCalledOnce();
    r.zone.dispose(); finish(); await Promise.resolve(); expect(r.host.children).toHaveLength(0);
  });
  it.each(['bytes', 'path'])('preserves the real %s admission error through chooser and drop', async kind => {
    const r = rig(); r.root(); r.stage.mockImplementation(async files => { await readPickedFiles(files); });
    const file = new File(['{}'], kind === 'path' ? '../escape.json' : 'large.json');
    if (kind === 'bytes') Object.defineProperty(file, 'size', { value: LOCAL_FILE_LIMITS.bytes + 1 });
    const input = r.host.querySelector<HTMLInputElement>('input')!;
    Object.defineProperty(input, 'files', { value: [file] }); input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(r.root().dataset.state).toBe('error'));
    const chooserError = r.root().querySelector('[role=status]')!.textContent;
    r.drop([file]); await vi.waitFor(() => expect(r.stage).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(r.root().querySelector('[role=status]')!.textContent).toBe(chooserError)); r.zone.dispose();
  });
});
