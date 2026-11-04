// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureGameCanvas } from '../src/agent/install';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

function canvasRig() {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 750;
  document.body.append(canvas);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
  return canvas;
}

describe('game canvas capture budget', () => {
  it('allows a slow native PNG encode within the bounded command window', async () => {
    vi.useFakeTimers(); const canvas = canvasRig(); const png = new Blob(['png'], { type: 'image/png' });
    vi.spyOn(canvas, 'toBlob').mockImplementation(callback => { setTimeout(() => callback(png), 8000); });
    const captured = captureGameCanvas(document, 'canvas');
    const assertion = expect(captured).resolves.toBe(png);
    await vi.advanceTimersByTimeAsync(8000); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still refuses a stalled encoder and ignores its late result', async () => {
    vi.useFakeTimers(); const canvas = canvasRig(); let finish!: BlobCallback;
    vi.spyOn(canvas, 'toBlob').mockImplementation(callback => { finish = callback; });
    const captured = captureGameCanvas(document, 'canvas');
    const assertion = expect(captured).rejects.toThrow('CAPTURE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(15_000); await assertion;
    finish(new Blob(['late'])); expect(vi.getTimerCount()).toBe(0);
  });
});
