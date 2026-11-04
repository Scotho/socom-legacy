// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGameMicrophone, MIC_DEVICE_KEY, MIC_ENABLED_KEY } from '../src/gameMicrophone';

/**
 * The owner, 2026-10-04: "also please make sure the game retains controller and mic settings as the setup implies". No
 * voice capture exists yet (push-to-talk is SVC-20b); `getGameMicrophone` is the one place it will take its microphone
 * from: the setup page's device (`MIC_DEVICE_KEY`), the default device when that one is gone, nothing when the player
 * turned the microphone off (`MIC_ENABLED_KEY`). It opens nothing until called.
 */
type Constraints = { video: boolean; audio: { deviceId?: { exact: string } } };
function fakeMedia(devices: string[], deny = false) {
  const asked: (string | undefined)[] = [];
  const stream = { id: 'stream', getTracks: () => [] } as unknown as MediaStream;
  const media = {
    getUserMedia: vi.fn(async (c: Constraints) => {
      asked.push(c.audio.deviceId?.exact);
      if (deny) throw new DOMException('Denied', 'NotAllowedError');
      const id = c.audio.deviceId?.exact;
      if (id && !devices.includes(id)) throw new DOMException('gone', 'OverconstrainedError');
      return stream;
    }),
  } as unknown as MediaDevices;
  return { media, asked, stream };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('getGameMicrophone: the setup page\'s microphone, the game\'s one source of voice', () => {
  it('the saved device is the one opened', async () => {
    localStorage.setItem(MIC_DEVICE_KEY, 'headset');
    const f = fakeMedia(['headset', 'phone']);
    expect(await getGameMicrophone(f.media)).toBe(f.stream);
    expect(f.asked).toEqual(['headset']);
  });
  it('a saved device that is gone falls back to the default device', async () => {
    localStorage.setItem(MIC_DEVICE_KEY, 'unplugged');
    const f = fakeMedia(['phone']);
    expect(await getGameMicrophone(f.media)).toBe(f.stream);
    expect(f.asked).toEqual(['unplugged', undefined]);
  });
  it('System default (no saved device) asks for the default', async () => {
    const f = fakeMedia([]);
    expect(await getGameMicrophone(f.media)).toBe(f.stream);
    expect(f.asked).toEqual([undefined]);
  });
  it('the microphone turned off: null, and nothing is opened', async () => {
    localStorage.setItem(MIC_ENABLED_KEY, 'off');
    const f = fakeMedia(['phone']);
    expect(await getGameMicrophone(f.media)).toBeNull();
    expect(f.media.getUserMedia).not.toHaveBeenCalled();
  });
  it('permission refused, or no capture at all: null', async () => {
    expect(await getGameMicrophone(fakeMedia([], true).media)).toBeNull();
    expect(await getGameMicrophone(undefined)).toBeNull();
  });
});
