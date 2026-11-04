// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootConsole, type ConsolePage } from '../../../src/console/app';
import { liveMic } from '../../../src/console/adapters/mic';
import { sampleAdapters } from '../../../src/console/sampleAdapters';
import { deployChecks } from '../../../src/console/state';
import { mountShell } from '../shell';

/**
 * The console launcher's microphone adapter (slice 2, part c): "use in game" is the setup page's key
 * (`s2u.startup.v1.mic.enabled`: 'off' turns it off, anything else -- unset -- is on; `../../src/gameMicrophone.ts`), and
 * the Microphone item's Turn on / Turn off writes that same key the setup page's switch writes. Nothing asks the browser
 * for the microphone until the player turns it on; then the game's own capture (`getGameMicrophone`, the saved device)
 * is opened once to ask and closed at once. A browser adaptation with no original (OT.R28).
 */
let page: ConsolePage | null = null;
beforeEach(() => { localStorage.clear(); mountShell(document); });
afterEach(() => { page?.dispose(); page = null; localStorage.clear(); });

const KEY = 's2u.startup.v1.mic.enabled';
function media(ok: boolean) {
  const stop = vi.fn();
  const getUserMedia = vi.fn(async (_c: MediaStreamConstraints) => {
    if (!ok) throw new DOMException('refused', 'NotAllowedError');
    return { getTracks: () => [{ stop }] } as unknown as MediaStream;
  });
  return { media: { getUserMedia } as unknown as MediaDevices, getUserMedia, stop };
}

describe('the microphone adapter', () => {
  it('unset is on, as the setup page reads it; drawing the page asks nothing of the browser', () => {
    const m = media(true);
    const mic = liveMic(() => {}, { media: m.media });
    expect(mic.on()).toBe(true);
    page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, mic }, { keymap: true });
    // LP.R8 / LP.R11: the microphone's status left the header for the legend's device cue. LR-23 (LR.R22): Home draws no
    // readiness panel any more (was: its microphone row, "Microphone on"); the step says ON.
    expect(document.querySelector('#stage [data-readiness-mic]')).toBeNull();
    expect(deployChecks(page.ctl.S, page.ctl.A)[2]!.state?.[0]).toBe('ON');
    expect(document.querySelector('#legend .cx-mark[data-mark="mic"]')!.getAttribute('aria-label')).toBe('Microphone on');   // LR-24 (was: [data-device=mic])
    expect(m.getUserMedia).not.toHaveBeenCalled();
  });

  it('Turn off writes the setup page\'s key and asks nothing', async () => {
    const m = media(true);
    const mic = liveMic(() => {}, { media: m.media });
    expect(await mic.toggle()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('off');
    expect(mic.on()).toBe(false);
    expect(m.getUserMedia).not.toHaveBeenCalled();
  });

  it('Turn on writes the key, asks the browser once through the game\'s capture and closes it at once', async () => {
    localStorage.setItem(KEY, 'off');
    localStorage.setItem('s2u.startup.v1.mic', 'dev-7');
    const m = media(true);
    const mic = liveMic(() => {}, { media: m.media });
    expect(mic.on()).toBe(false);
    expect(await mic.toggle()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('on');
    expect(m.getUserMedia).toHaveBeenCalledTimes(1);
    expect(m.getUserMedia.mock.calls[0]![0]).toMatchObject({ audio: { deviceId: { exact: 'dev-7' } } });
    expect(m.stop).toHaveBeenCalled();
    expect(mic.detail()).toBe('The microphone chosen in setup · for voice chat');
  });

  it('a refusal is said in the Microphone item; the setting stays on, as the setup page keeps it', async () => {
    localStorage.setItem(KEY, 'off');
    const m = media(false);
    const mic = liveMic(() => {}, { media: m.media });
    await mic.toggle();
    expect(mic.on()).toBe(true);
    expect(mic.detail()).toBe('The browser refused the microphone: allow it for this site');
    page = bootConsole(document, window, { ...sampleAdapters(), data: 'live', states: undefined, mic }, { keymap: true });
    // LR-23 (LR.R22): the Microphone step's line and its alert (was LR-13's row of Play's panel, its hint and warn tone);
    // drawn, the legend's microphone cue in the warning tone (optional, never a blocker).
    const step = deployChecks(page.ctl.S, page.ctl.A)[2]!;
    expect(step.sub).toBe('The browser refused the microphone: allow it for this site');
    expect(step.state).toEqual(['ON', 'alert']);
    expect(document.querySelector<HTMLElement>('#legend .cx-mark[data-mark="mic"]')!.dataset.tone).toBe('warn');   // LR-25 F5: the dot's tone is what is drawn (was: the class cx-status--warning, which colours nothing)
  });

  it('on with the default device says so', () => {
    const mic = liveMic(() => {}, { media: media(true).media });
    expect(mic.detail()).toBe('System default microphone · for voice chat');
  });
});
