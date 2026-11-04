import { describe, expect, it } from 'vitest';
import { DataTexture, SRGBColorSpace } from 'three';
import type { MovieEndMessage, MovieFrame } from '@s2u/fmv';
import { MOVIE_HEIGHT, MOVIE_WIDTH, MovieTexture, type MovieTickSource } from '../src/movieTexture';

/**
 * The movie's texture (PLAT-19b; research 120 §7): a picture from the worker (RGBA, moved, not copied) becomes the
 * texture's data; the buffer it replaces goes back to the worker; a 'new picture' callback tells the compositor's movie
 * layer (PLAT-14's, not merged) and PLAT-21's player. One picture per caller's tick, never waiting.
 */

const frame = (index: number, w = MOVIE_WIDTH, h = MOVIE_HEIGHT): MovieFrame => ({
  kind: 'picture', index, codingIndex: index, type: 'I', temporalReference: 0, pts: null, width: w, height: h,
  rgba: new Uint8Array(w * h * 4).fill(index & 255).buffer,
});

describe('MovieTexture', () => {
  it('starts as a black 640x448 picture (the disc\'s size, research 98 §7.3), sRGB, rows top first', () => {
    const t = new MovieTexture();
    expect(t.texture).toBeInstanceOf(DataTexture);
    expect([t.texture.image.width, t.texture.image.height]).toEqual([640, 448]);
    expect((t.texture.image.data as Uint8Array).every((v, i) => (i % 4 === 3 ? v === 255 : v === 0))).toBe(true);
    expect(t.texture.colorSpace).toBe(SRGBColorSpace);
    expect(t.texture.flipY).toBe(true);
  });

  it('present: the picture\'s buffer becomes the texture\'s data without a copy, the old one is handed back, the callback fires', () => {
    const t = new MovieTexture();
    const seen: number[] = [];
    t.onPicture((f) => seen.push(f.index));
    const a = frame(1);
    const b = frame(2);
    const v0 = t.texture.version;
    expect(t.present(a)).toBeNull();                          // the initial black is the texture's own, not the worker's
    expect((t.texture.image.data as Uint8Array).buffer).toBe(a.rgba);
    expect(t.texture.version).toBeGreaterThan(v0);
    expect(t.present(b)).toBe(a.rgba);
    expect(seen).toEqual([1, 2]);
    expect(t.shown).toBe(2);
  });

  it('a picture of another size replaces the texture and says so', () => {
    const t = new MovieTexture();
    const first = t.texture;
    let replaced = 0;
    t.onTexture(() => replaced++);
    t.present(frame(0, 32, 16));
    expect(t.texture).not.toBe(first);
    expect([t.texture.image.width, t.texture.image.height]).toEqual([32, 16]);
    expect(replaced).toBe(1);
  });

  it('tick: presents what has arrived, releases the old buffer to the source, holds the last picture when late, and reports the end', () => {
    const t = new MovieTexture();
    const released: ArrayBuffer[] = [];
    const queue: (MovieFrame | MovieEndMessage | null)[] = [frame(0), null, frame(1), { kind: 'end', pictures: 2, coded: 2, invalid: 0, error: null }];
    const source: MovieTickSource = { tick: () => (queue.length > 1 ? queue.shift()! : queue[0]!), release: (b) => released.push(b) };
    expect(t.tick(source)).toBe('picture');
    expect(t.tick(source)).toBe('late');
    expect(t.shown).toBe(0);
    expect(t.tick(source)).toBe('picture');
    expect(released.length).toBe(1);
    expect(t.tick(source)).toBe('end');
    expect(t.tick(source)).toBe('end');
    expect(t.shown).toBe(1);
  });

  it('dispose frees the texture', () => {
    const t = new MovieTexture();
    let disposed = false;
    t.texture.addEventListener('dispose', () => { disposed = true; });
    t.dispose();
    expect(disposed).toBe(true);
  });
});
