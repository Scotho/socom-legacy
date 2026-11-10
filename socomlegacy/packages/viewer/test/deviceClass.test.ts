// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { detectDeviceClass, readDeviceSignals, type DeviceSignals } from '../src/deviceClass';
import { GRAPHICS_BACKEND_KEY } from '../src/graphicsBackend';

/**
 * VS-7 (the video settings plan, product track; VS.R1, the owner's word 2026-11-07: Automatic may detect an Xbox "when
 * certain"): the device class Automatic starts from -- a browser adaptation, no original. The Xbox bar needs both
 * signals: the user agent's `Xbox` token and a Direct3D11 WebGL renderer string.
 */

const SERIES_X_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.70 Safari/537.36 Edg/130.0.2849.56';
const EDGE_WINDOWS_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36 Edg/142.0.3595.53';
const D3D11 = 'ANGLE (AMD, AMD Custom GPU 0405 Direct3D11 vs_5_0 ps_5_0, D3D11)';
const METAL = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)';
const RTX = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const IGPU = 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)';

const signals = (s: Partial<DeviceSignals>): DeviceSignals => ({ userAgent: EDGE_WINDOWS_AGENT, renderer: IGPU, software: false, touch: false, xboxPick: false, ...s });

afterEach(() => { localStorage.clear(); });

describe('VS-7: the device class (VS.R1: the Xbox only when certain)', () => {
  it('the Series X agent with an ANGLE Direct3D11 renderer is xbox', () => {
    expect(detectDeviceClass(signals({ userAgent: SERIES_X_AGENT, renderer: D3D11 }))).toBe('xbox');
  });

  it('the Xbox token alone is not xbox: the same agent with a Metal renderer, or no renderer string, is standard', () => {
    expect(detectDeviceClass(signals({ userAgent: SERIES_X_AGENT, renderer: METAL }))).toBe('standard');
    expect(detectDeviceClass(signals({ userAgent: SERIES_X_AGENT, renderer: null }))).toBe('standard');
  });

  it('Direct3D11 alone is not xbox: a Windows Edge agent with D3D11 is standard', () => {
    expect(detectDeviceClass(signals({ userAgent: EDGE_WINDOWS_AGENT, renderer: D3D11 }))).toBe('standard');
    expect(detectDeviceClass(signals({ userAgent: 'Mozilla/5.0 (XboxLike) Edg/130', renderer: D3D11 }))).toBe('standard');   // the token as a word only
  });

  it('the saved Xbox pick alone is xbox, whatever the agent and the renderer', () => {
    expect(detectDeviceClass(signals({ xboxPick: true }))).toBe('xbox');
    expect(detectDeviceClass(signals({ xboxPick: true, software: true, touch: true, deviceMemory: 2 }))).toBe('xbox');
  });

  it('software, touch and low memory, in that order', () => {
    expect(detectDeviceClass(signals({ software: true, touch: true, deviceMemory: 2 }))).toBe('software');
    expect(detectDeviceClass(signals({ touch: true, deviceMemory: 2 }))).toBe('touch');
    expect(detectDeviceClass(signals({ deviceMemory: 2 }))).toBe('lowMemory');
    expect(detectDeviceClass(signals({ deviceMemory: 3.5 }))).toBe('lowMemory');
    expect(detectDeviceClass(signals({ deviceMemory: 4 }))).toBe('standard');
  });

  it('high: a discrete desktop part named (RTX, GTX, Radeon RX, Arc) and deviceMemory 8; else standard', () => {
    expect(detectDeviceClass(signals({ renderer: RTX, deviceMemory: 8 }))).toBe('high');
    expect(detectDeviceClass(signals({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0, D3D11)', deviceMemory: 8 }))).toBe('high');
    expect(detectDeviceClass(signals({ renderer: 'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', deviceMemory: 8 }))).toBe('high');
    expect(detectDeviceClass(signals({ renderer: 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', deviceMemory: 8 }))).toBe('high');
    expect(detectDeviceClass(signals({ renderer: RTX, deviceMemory: 4 }))).toBe('standard');
    expect(detectDeviceClass(signals({ renderer: RTX }))).toBe('standard');                  // memory unknown
    expect(detectDeviceClass(signals({ renderer: IGPU, deviceMemory: 8 }))).toBe('standard');
    expect(detectDeviceClass(signals({}))).toBe('standard');
  });

  it('review F3: the Xbox class takes the Xbox measures beside the pick -- the worker let go after the load, the match released at the return', () => {
    const src = (f: string): string => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src', f), 'utf8');
    expect(src('matchMount.ts')).toMatch(/releaseWorkerAfterLoad = options\.releaseWorkerAfterLoad \?\? \(readGraphicsBackend\(\) === 'xbox' \|\| pageDeviceClass\(\) === 'xbox'\)/);
    expect(src('frontEnd.ts')).toMatch(/if \(releasesMatchOnReturn\(readGraphicsBackend\(\)\) \|\| pageDeviceClass\(\) === 'xbox'\) matchLoading\?\.release\(\)/);
  });

  it('readDeviceSignals: the agent, the probe\'s string and verdict, the memory and the saved Xbox pick', () => {
    const win = { navigator: { userAgent: SERIES_X_AGENT, deviceMemory: 8 } };
    expect(readDeviceSignals(win, () => ({ renderer: D3D11, software: false }))).toEqual({
      userAgent: SERIES_X_AGENT, renderer: D3D11, software: false, touch: false, deviceMemory: 8, xboxPick: false,
    });
    expect(readDeviceSignals(win, () => ({ renderer: 'SwiftShader', software: true })).software).toBe(true);
    // a browser that made no WebGL context at all: no string to class it by (the no-GPU notice still tells the player)
    expect(readDeviceSignals(win, () => ({ renderer: null, software: true })).software).toBe(false);
    expect(readDeviceSignals(win, () => { throw new Error('probe'); }).renderer).toBeNull();
    expect('deviceMemory' in readDeviceSignals({ navigator: { userAgent: '' } }, () => ({ renderer: null, software: false }))).toBe(false);
    localStorage.setItem(GRAPHICS_BACKEND_KEY, 'xbox');
    expect(readDeviceSignals(win, () => ({ renderer: METAL, software: false })).xboxPick).toBe(true);
  });
});
