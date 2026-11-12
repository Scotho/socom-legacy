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

describe('AX-16: a small capture', () => {
  it('draws the canvas scaled to the width asked, keeping its aspect, never larger', async () => {
    const canvas = canvasRig(); const png = new Blob(['png'], { type: 'image/png' });
    const drawn: unknown[][] = [];
    const scaled: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const made = create(tag);
      if (tag === 'canvas') {
        scaled.push(made as HTMLCanvasElement);
        vi.spyOn(made as HTMLCanvasElement, 'getContext').mockReturnValue({ drawImage: (...a: unknown[]) => drawn.push(a) } as unknown as CanvasRenderingContext2D);
        vi.spyOn(made as HTMLCanvasElement, 'toBlob').mockImplementation(callback => callback(png));
      }
      return made;
    }) as typeof document.createElement);
    const own = vi.spyOn(canvas, 'toBlob');
    await expect(captureGameCanvas(document, 'canvas', { maxWidth: 640 })).resolves.toBe(png);
    expect(scaled).toHaveLength(1);
    expect([scaled[0]!.width, scaled[0]!.height]).toEqual([640, 444]);
    expect(drawn).toEqual([[canvas, 0, 0, 640, 444]]);
    expect(own).not.toHaveBeenCalled();
  });

  it('takes the canvas as it is when it is already narrower, or when no 2D context is to be had', async () => {
    const canvas = canvasRig(); const png = new Blob(['png'], { type: 'image/png' });
    const own = vi.spyOn(canvas, 'toBlob').mockImplementation(callback => callback(png));
    await expect(captureGameCanvas(document, 'canvas', { maxWidth: 2000 })).resolves.toBe(png);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(captureGameCanvas(document, 'canvas', { maxWidth: 640 })).resolves.toBe(png);
    expect(own).toHaveBeenCalledTimes(2);
  });
});
