// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `pageVideoReadout` (`../src/perfLine`): the test room's `window.__viewer.video()` -- a test instrument (a browser
 * adaptation, nothing of the game). The viewer spec compares the panel's shadows toggle to it and to the device class's
 * start (`../src/autoQuality` `CLASS_START_ADAPTATION`): Off on the software class (SwiftShader), on for a GPU's.
 */
const probe = vi.hoisted(() => ({ now: { renderer: null as string | null, software: false } }));
vi.mock('../src/softwareRenderer', async (orig) => ({
  ...(await orig<typeof import('../src/softwareRenderer')>()),
  probeSoftwareRenderer: () => ({ ...probe.now }),
  // Since gm-xbox1's N1b the page's one memo is `pageSoftwareProbe`, which calls `probeSoftwareRenderer` inside its own
  // module (a call vi.mock does not reach); `./deviceClass` `pageRendererProbe` reads the memo, so the stub stands there too.
  pageSoftwareProbe: () => ({ ...probe.now }),
}));

import { pageVideoReadout } from '../src/perfLine';
import { resetPageRendererProbeForTest } from '../src/deviceClass';
import { CLASS_START_ADAPTATION } from '../src/autoQuality';
import { VIDEO_SETTINGS_KEY_V2 } from '../src/videoSettings';

const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const GPU = 'ANGLE (NVIDIA, NVIDIA RTX A4500 Direct3D11 vs_5_0 ps_5_0, D3D11)';

afterEach(() => { resetPageRendererProbeForTest(); localStorage.clear(); });

describe('pageVideoReadout: the shadows Automatic resolved for the page\'s device class', () => {
  it('SwiftShader is the software class: Automatic resolves its start, shadows Off', () => {
    probe.now = { renderer: SWIFTSHADER, software: true };
    const r = pageVideoReadout();
    expect(r.deviceClass).toBe('software');
    expect(r.preset).toMatch(/^automatic /);
    expect(r.resolvedShadows).toBe(CLASS_START_ADAPTATION.software.shadows);
    expect(r.resolvedShadows).toBe('off');
    expect(r.shadows).toBe(false);
  });

  it('a hardware renderer with no memory reading is the standard class: Balanced, shadows on', () => {
    probe.now = { renderer: GPU, software: false };
    const r = pageVideoReadout();
    expect(r.deviceClass).toBe('standard');
    expect(r.preset).toBe('automatic balanced');
    expect(r.resolvedShadows).toBe(CLASS_START_ADAPTATION.standard.shadows);
    expect(r.resolvedShadows).not.toBe('off');
    expect(r.shadows).toBe(true);
  });

  it('a saved preset is read as saved, not as the class\'s start', () => {
    probe.now = { renderer: SWIFTSHADER, software: true };
    localStorage.setItem(VIDEO_SETTINGS_KEY_V2, JSON.stringify({ preset: 'quality', overlay: 'fps' }));
    const r = pageVideoReadout();
    expect(r.preset).toBe('quality');
    expect(r.resolvedShadows).not.toBe('off');
    expect(r.shadows).toBe(true);
  });
});
