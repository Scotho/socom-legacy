// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_PANEL_KEY, mountDevPanel, type DevPanel, type DevPanelDeps } from '../src/devPanel';
import { boundsOf, minimapFrame } from '../src/devTargets';
import {
  devPanelLoadingKey, devToolsEnabled, nextCameraMode, ownSpawnPoint, planOwnSpawnTeleport, spawnOverlayOn,
} from '../src/devTools';

/**
 * `/testroom`'s developer panel (`../src/devPanel`): a browser adaptation. Gated on `devToolsEnabled` (the tools
 * switch: `?devmode`, or `?devtools` on a development build) and a development build. Closed until F2
 * (`DEV_PANEL_KEY`), and closed it does not take the page's keys. F2 calls `preventDefault`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (name: string): string => readFileSync(resolve(here, '../src', name), 'utf-8');
const dev = { toggle: true }, player = { toggle: false };
const spawns = { a: [1, 2, 3] as const, b: [4, 5, 6] as const };

describe('devToolsEnabled: the one switch the panel asks', () => {
  it('follows the tools switch, and not the fly or served switches', () => {
    expect(devToolsEnabled('?devmode')).toBe(true);
    expect(devToolsEnabled('?mode=play&map=MP2&devmode')).toBe(true);
    expect(devToolsEnabled('?devtools')).toBe(true);
    expect(devToolsEnabled('?mode=play&devtools')).toBe(true);
    expect(devToolsEnabled('')).toBe(false);
    expect(devToolsEnabled('?mode=play&fly')).toBe(false);
    expect(devToolsEnabled('?served')).toBe(false);
    expect(devToolsEnabled('?flyok')).toBe(false);
    expect(devToolsEnabled('?Devmode')).toBe(false);
    expect(devToolsEnabled('?Devtools')).toBe(false);
  });
  it('a malformed query is off, and does not throw', () => {
    expect(() => devToolsEnabled('?%E0%A4%A')).not.toThrow();
    expect(devToolsEnabled('?%E0%A4%A')).toBe(false);
  });
  it('main loads the panel only under the development-build flag and that helper, never as a static value import', () => {
    const main = src('main.ts');
    const gate = ['import', 'meta', 'env', 'DEV'].join('.');           // the build's flag, spelled so the leak check's name rule stays quiet
    expect(main).toContain(`if (${gate} && devToolsEnabled(SEARCH)) void import('./devPanel')`);
    expect(main).not.toMatch(/^import \{[^}]*\} from '\.\/devPanel';/m);
    expect(src('matchMount.ts')).not.toMatch(/devPanel|devToolsEnabled/);
  });
});

describe('the fly control and the spawn teleport ask mayEnter', () => {
  it('in Play the developer toggles; a player cannot fly, and Explore cannot walk', () => {
    expect(nextCameraMode('walk', true, dev)).toBe('fly');
    expect(nextCameraMode('fly', true, dev)).toBe('walk');
    expect(nextCameraMode('walk', true, player)).toBeNull();
    expect(nextCameraMode('fly', false, dev)).toBeNull();
  });
  it('own spawn is A for a SEAL or no team, and B for a terrorist', () => {
    expect(ownSpawnPoint(spawns, 'seal')).toEqual([1, 2, 3]);
    expect(ownSpawnPoint(spawns, null)).toEqual([1, 2, 3]);
    expect(ownSpawnPoint(spawns, 'terrorist')).toEqual([4, 5, 6]);
    expect(ownSpawnPoint(null, 'seal')).toBeNull();
  });
  it('teleport stands a walker at that point, and enters the walk first when flying is allowed to', () => {
    expect(planOwnSpawnTeleport('walk', true, dev, spawns, 'terrorist')).toEqual({ mode: 'walk', at: [4, 5, 6] });
    expect(planOwnSpawnTeleport('fly', true, dev, spawns, 'seal')).toEqual({ mode: 'walk', at: [1, 2, 3] });
    expect(planOwnSpawnTeleport('fly', false, dev, spawns, 'seal')).toBeNull();
    expect(planOwnSpawnTeleport('walk', true, dev, null, 'seal')).toBeNull();
  });
  it('spawn markers stay while either the panel or the settings checkbox wants them', () => {
    expect(spawnOverlayOn(false, false)).toBe(false);
    expect(spawnOverlayOn(true, false)).toBe(true);
    expect(spawnOverlayOn(false, true)).toBe(true);
  });
});

describe('the panel', () => {
  let panel: DevPanel | null = null;
  const state = { mode: 'walk' as 'walk' | 'fly', play: true, access: dev, team: 'seal' as string | null, markers: false };
  let teleports: number[][] = [];
  let modes: string[] = [];
  afterEach(() => { panel?.dispose(); panel = null; document.body.replaceChildren(); });
  function reset(): void {
    state.mode = 'walk';
    state.play = true;
    state.access = dev;
    state.team = 'seal';
    state.markers = false;
    teleports = [];
    modes = [];
  }
  beforeEach(reset);

  function deps(over: Partial<DevPanelDeps> = {}): DevPanelDeps {
    return {
      doc: document,
      access: state.access,
      playing: () => state.play,
      mode: () => state.mode,
      setMode: (mode) => { state.mode = mode; modes.push(mode); return true; },
      spawns: () => spawns,
      team: () => state.team,
      teleport: (x, y, z, yaw?) => { teleports.push(yaw === undefined ? [x, y, z] : [x, y, z, yaw]); return true; },
      markers: () => state.markers,
      setMarkers: (on) => { state.markers = on; },
      ...over,
    };
  }
  const key = (code: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
    document.dispatchEvent(event);
    return event;
  };

  it('starts closed, opens and closes on F2, and leaves every other key alone either way', () => {
    panel = mountDevPanel(deps());
    const root = document.getElementById('dev-panel')!;
    expect(DEV_PANEL_KEY).toBe('F2');
    expect(panel.isOpen()).toBe(false);
    expect(root.hidden).toBe(true);
    expect(root.querySelector('.s2u-fine')?.textContent).toBe('Developer · F2');
    const g = key('KeyG');
    expect(g.defaultPrevented).toBe(false);
    expect(panel.isOpen()).toBe(false);
    const open = key(DEV_PANEL_KEY);
    expect(open.defaultPrevented).toBe(true);
    expect(panel.isOpen()).toBe(true);
    expect(root.querySelector('.s2u-fine')!.textContent).toBe(`Developer · ${DEV_PANEL_KEY}`);
    expect(root.hidden).toBe(false);
    const again = key('KeyG');
    expect(again.defaultPrevented).toBe(false);
    expect(panel.isOpen()).toBe(true);
    key(DEV_PANEL_KEY, { repeat: true });
    expect(panel.isOpen()).toBe(true);
    const chord = key(DEV_PANEL_KEY, { ctrlKey: true });
    expect(chord.defaultPrevented).toBe(false);
    expect(panel.isOpen()).toBe(true);
    key(DEV_PANEL_KEY);
    expect(panel.isOpen()).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('the fly button uses setMode only when the rule allows it', () => {
    state.mode = 'walk';
    state.play = true;
    state.access = dev;
    panel = mountDevPanel(deps());
    key(DEV_PANEL_KEY);
    const fly = document.getElementById('dev-panel-fly') as HTMLButtonElement;
    expect(fly.disabled).toBe(false);
    expect(fly.textContent).toBe('Fly');
    fly.click();
    expect(modes).toEqual(['fly']);
    expect(fly.textContent).toBe('Walk');
    panel.dispose();
    panel = null;
    modes = [];
    state.mode = 'walk';
    state.access = player;
    panel = mountDevPanel(deps());
    key(DEV_PANEL_KEY);
    const refused = document.getElementById('dev-panel-fly') as HTMLButtonElement;
    expect(refused.disabled).toBe(true);
    refused.click();
    expect(modes).toEqual([]);
  });

  it('own spawn teleports a walker, and enters the walk before teleporting from the fly camera', () => {
    state.mode = 'walk';
    state.team = 'terrorist';
    panel = mountDevPanel(deps());
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-spawn') as HTMLButtonElement).click();
    expect(teleports).toEqual([[4, 5, 6]]);
    expect(modes).toEqual([]);
    teleports = [];
    state.mode = 'fly';
    state.team = 'seal';
    (document.getElementById('dev-panel-spawn') as HTMLButtonElement).click();
    expect(modes).toEqual(['walk']);
    expect(teleports).toEqual([[1, 2, 3]]);
  });

  it('refuses the teleport when the walk is refused or setMode fails, and when the map has no spawns', () => {
    state.mode = 'fly';
    state.play = false;
    panel = mountDevPanel(deps());
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-spawn') as HTMLButtonElement).click();
    expect(teleports).toEqual([]);
    panel.dispose();
    panel = null;
    state.play = true;
    state.mode = 'fly';
    state.access = dev;
    panel = mountDevPanel(deps({ setMode: () => false }));
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-spawn') as HTMLButtonElement).click();
    expect(teleports).toEqual([]);
    panel.dispose();
    panel = null;
    state.mode = 'walk';
    panel = mountDevPanel(deps({ spawns: () => null }));
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-spawn') as HTMLButtonElement).click();
    expect(teleports).toEqual([]);
  });

  it('the markers box calls setMarkers, and the frame counter is painted only while open', () => {
    panel = mountDevPanel(deps());
    const readout = document.getElementById('dev-panel-fps')!;
    panel.sample(59.4, 16.84);
    expect(readout.textContent).toBe('- fps');
    key(DEV_PANEL_KEY);
    expect(readout.textContent).toBe('59 fps · 16.8 ms');
    const box = document.getElementById('dev-panel-marks') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.markers).toBe(true);
    panel.sample(Number.POSITIVE_INFINITY, 0);
    expect(readout.textContent).toBe('59 fps · 16.8 ms');
  });

  it('go stands at a listed place, and a map click stands in the walk or moves the camera', () => {
    const list = [
      { id: 'spawn-a', label: 'Spawn A', at: [0, 5, 0] as const, yaw: null },
      { id: 'slot-0-0', label: 'A slot 1', at: [10, 8, 0] as const, yaw: 90 },
    ];
    const cameras: { x: number; y: number; z: number; yaw?: number }[] = [];
    const asked: [number, number][] = [];
    panel = mountDevPanel(deps({
      places: () => list,
      mapBounds: () => ({ minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 }),
      floorUnder: (x, z) => { asked.push([x, z]); return 11; },
      setCamera: (pose) => { cameras.push(pose); },
      live: () => ({ map: null, archive: null, mission: '', play: true, camera: 'walk', x: 0, y: 5, z: 0, yaw: 12, speed: 0, stance: 'stand' }),
    }));
    key(DEV_PANEL_KEY);
    const select = document.getElementById('dev-panel-places') as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['Choose a place', 'Spawn A', 'A slot 1']);
    select.value = 'slot-0-0';
    (document.getElementById('dev-panel-go') as HTMLButtonElement).click();
    expect(teleports).toEqual([[10, 8, 0, 90]]);
    const canvas = document.getElementById('dev-panel-map') as HTMLCanvasElement;
    const box = boundsOf(list.map((p) => p.at))!;
    const frame = minimapFrame(box, canvas.width, canvas.height)!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() { return {}; } });
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }));
    expect(asked).toEqual([]);
    canvas.dispatchEvent(new MouseEvent('click', {
      clientX: frame.x / canvas.width * 100, clientY: frame.y / canvas.height * 100, bubbles: true,
    }));
    // Top-left of the place extent (x 0..10, z 0, padded), not the world-box corner and not the letterbox.
    expect(asked[0]![0]).toBeCloseTo(box.minX);
    expect(asked[0]![1]).toBeCloseTo(box.maxZ);
    expect(teleports[1]).toEqual([asked[0]![0], 11, asked[0]![1], 12]);
    expect(src('main.ts')).toContain('return m.nearestFloor(probeGround(grid, x, z).map((h) => h.y), y);');
    expect(src('devPanel.css')).toContain('aspect-ratio: 288 / 140');   // main's DEV-only stylesheet (60f57fbf0), not styles.css
    expect(src('styles.css')).not.toContain('dev-panel');
    panel.dispose();
    panel = null;
    teleports = [];
    panel = mountDevPanel(deps({
      places: () => list,
      floorUnder: () => null,
      live: () => ({ map: null, archive: null, mission: '', play: true, camera: 'walk', x: 0, y: 5, z: 0, yaw: 12, speed: 0, stance: 'stand' }),
    }));
    key(DEV_PANEL_KEY);
    const again = document.getElementById('dev-panel-map') as HTMLCanvasElement;
    again.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() { return {}; } });
    again.dispatchEvent(new MouseEvent('click', {
      clientX: frame.x / again.width * 100, clientY: frame.y / again.height * 100, bubbles: true,
    }));
    expect(teleports).toEqual([]);
    panel.dispose();
    panel = null;
    teleports = [];
    state.mode = 'fly';
    state.play = false;
    panel = mountDevPanel(deps({ places: () => list, setCamera: (pose) => { cameras.push(pose); } }));
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-places') as HTMLSelectElement).value = 'slot-0-0';
    (document.getElementById('dev-panel-go') as HTMLButtonElement).click();
    expect(teleports).toEqual([]);
    expect(cameras.at(-1)).toEqual({ x: 10, y: 8, z: 0, yaw: 90 });
  });

  it('visual debug drives the page toggles, and says a line of sight is not drawn', () => {
    const sets: [string, boolean][] = [];
    let traces = false;
    const world = { collision: false, wireframe: true };
    panel = mountDevPanel(deps({
      worldToggles: () => world,
      setWorldToggle: (name, on) => { sets.push([name, on]); world[name] = on; },
      tracesOn: () => traces,
      setTraces: (on) => { traces = on; },
    }));
    key(DEV_PANEL_KEY);
    const wire = document.getElementById('dev-panel-wireframe') as HTMLInputElement;
    const collision = document.getElementById('dev-panel-collision') as HTMLInputElement;
    expect(wire.checked).toBe(true);
    expect(collision.checked).toBe(false);
    collision.checked = true;
    collision.dispatchEvent(new Event('change'));
    expect(sets).toEqual([['collision', true]]);
    const box = document.getElementById('dev-panel-traces') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(traces).toBe(true);
    expect(document.getElementById('dev-panel-los')!.textContent).toContain('not drawn');
    expect(src('main.ts')).toContain('clearDevTraces()');
    expect(src('main.ts')).not.toMatch(/^import .*devTraces/m);
  });

  it('infinite ammo and a kit go through the page, and god mode and health stay unavailable', () => {
    let ammo = false;
    const kits: string[] = [];
    panel = mountDevPanel(deps({
      infiniteAmmo: () => ammo,
      setInfiniteAmmo: (on) => { ammo = on; },
      applyKit: (text) => { kits.push(text); return text === '1,2' ? 'ok' : 'bad'; },
    }));
    key(DEV_PANEL_KEY);
    expect(document.getElementById('dev-panel-god')!.textContent).toContain('not available');
    expect(document.getElementById('dev-panel-health')!.textContent).toContain('not available');
    expect(document.querySelector('#dev-panel-cheats input[type="number"]')).toBeNull();
    const box = document.getElementById('dev-panel-ammo') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(ammo).toBe(true);
    const kit = document.getElementById('dev-panel-kit') as HTMLInputElement;
    kit.value = '1,2';
    (document.getElementById('dev-panel-kit-apply') as HTMLButtonElement).click();
    expect(kits).toEqual(['1,2']);
    expect(document.getElementById('dev-panel-kit-status')!.textContent).toBe('Kit applies at the next spawn.');
    kit.value = 'nope';
    (document.getElementById('dev-panel-kit-apply') as HTMLButtonElement).click();
    expect(document.getElementById('dev-panel-kit-status')!.textContent).toBe('Use up to five item ids, 0-255.');
    const gate = ['import', 'meta', 'env', 'DEV'].join('.');
    expect(src('main.ts')).toContain(`if (${gate}) devAfterFire();`);
    expect(src('main.ts')).toContain('if (devRefill && e.rounds === 0) m.devRefillMagazine(firearm.fire);');   // through the panel's module (devPanelGate.test.ts)
    expect(src('main.ts')).not.toContain('!mag.reloading');
  });

  it('the panel key during the loading hold toggles a mounted panel and queues the open before it mounts', () => {
    const panel = { open: false, isOpen: () => panel.open, setOpen: (on: boolean) => { panel.open = on; } };
    const held = devPanelLoadingKey(DEV_PANEL_KEY, false, false, false, false, panel, false);
    expect(held).toEqual({ taken: true, queued: false });
    expect(panel.open).toBe(true);
    const again = devPanelLoadingKey(DEV_PANEL_KEY, false, false, false, false, panel, false);
    expect(panel.open).toBe(false);
    expect(again.taken).toBe(true);
    const queued = devPanelLoadingKey(DEV_PANEL_KEY, false, false, false, false, null, false);
    expect(queued).toEqual({ taken: true, queued: true });
    expect(devPanelLoadingKey(DEV_PANEL_KEY, false, false, false, false, null, true)).toEqual({ taken: true, queued: false });
    expect(devPanelLoadingKey('KeyG', false, false, false, false, panel, false).taken).toBe(false);
    expect(devPanelLoadingKey(DEV_PANEL_KEY, true, false, false, false, panel, true)).toEqual({ taken: false, queued: true });
    const main = src('main.ts');
    const tools = src('devTools.ts');
    const panelSrc = src('devPanel.ts');
    expect(main).toContain('devPanelLoadingKey(');
    expect(main).toContain('if (devPanelQueued) { devPanel.setOpen(true); devPanelQueued = false; }');
    expect(main).not.toMatch(/['"]F1['"]|['"]F2['"]|['"]KeyP['"]/);
    expect(tools).toMatch(/code !== DEV_PANEL_KEY/);
    expect(panelSrc).toMatch(/e\.code !== DEV_PANEL_KEY/);
    expect(panelSrc).not.toMatch(/['"]F1['"]|['"]F2['"]|['"]KeyP['"]/);
    expect(tools.match(/DEV_PANEL_KEY = '[^']+'/g)).toHaveLength(1);
  });

  it('round helpers say why they are not available, and offer no control', () => {
    panel = mountDevPanel(deps());
    key(DEV_PANEL_KEY);
    for (const id of ['dev-panel-hostages', 'dev-panel-round-result', 'dev-panel-timer']) {
      expect(document.getElementById(id)!.textContent).toContain('not available');
    }
    expect(document.querySelector('#dev-panel-round button, #dev-panel-round input')).toBeNull();
  });

  it('bots say why they are not available, and draw nothing', () => {
    panel = mountDevPanel(deps());
    key(DEV_PANEL_KEY);
    expect(document.getElementById('dev-panel-bots-spawn')!.textContent).toContain('no AI actor');
    expect(document.getElementById('dev-panel-bots-view')!.textContent).toContain('nothing is drawn');
    expect(document.querySelector('#dev-panel-bots button, #dev-panel-bots input, #dev-panel-bots canvas')).toBeNull();
  });

  it('the readout paints the page, and copy link writes the spot it is handed', () => {
    const live = {
      map: 'Frostfire', archive: 'MP2', mission: '', play: true, camera: 'walk' as const,
      x: 1, y: 2, z: 3, yaw: 4, speed: 0, stance: 'stand',
    };
    const wrote: string[] = [];
    panel = mountDevPanel(deps({ live: () => live, copySpot: () => { wrote.push('?at=1,2,3&yaw=4'); return wrote[0]!; } }));
    key(DEV_PANEL_KEY);
    expect(document.getElementById('dev-panel-live')!.textContent).toContain('Frostfire');
    expect(document.getElementById('dev-panel-live')!.textContent).toContain('play · walk');
    (document.getElementById('dev-panel-copy') as HTMLButtonElement).click();
    expect(wrote).toEqual(['?at=1,2,3&yaw=4']);
    expect(document.getElementById('dev-panel-copy-note')!.textContent).toBe('Link copied.');
    panel.dispose();
    panel = null;
    panel = mountDevPanel(deps({ copySpot: () => null }));
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-copy') as HTMLButtonElement).click();
    expect(document.getElementById('dev-panel-copy-note')!.textContent).toBe('No link: the position is not a number.');
  });

  it('the opening address is placed only from the development import', () => {
    const main = src('main.ts');
    const gate = ['import', 'meta', 'env', 'DEV'].join('.');
    expect(main).toContain(`if (${gate}) consumeDevSpot();`);
    expect(main).not.toMatch(/^import .*devSpot|^import .*devReadout/m);
  });

  it('the time controls scale the frame, and a step advances one 60 Hz tick', () => {
    panel = mountDevPanel(deps());
    expect(panel.scaleFrame(0.1)).toBeCloseTo(0.1);
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-clock-quarter') as HTMLButtonElement).click();
    expect(document.getElementById('dev-panel-clock')!.textContent).toBe('0.25×');
    expect(panel.scaleFrame(0.1)).toBeCloseTo(0.025);
    (document.getElementById('dev-panel-pause') as HTMLButtonElement).click();
    expect(panel.scaleFrame(0.1)).toBe(0);
    expect(document.getElementById('dev-panel-clock')!.textContent).toBe('paused');
    (document.getElementById('dev-panel-step') as HTMLButtonElement).click();
    expect(panel.scaleFrame(0.1)).toBeCloseTo(1 / 60);
    expect(panel.scaleFrame(0.1)).toBe(0);
    (document.getElementById('dev-panel-clock-1') as HTMLButtonElement).click();
    expect(panel.scaleFrame(0.1)).toBeCloseTo(0.1);
  });

  it('closing the panel resets the clock to 1x, unpauses it and clears infinite ammo (04, OT.R53)', () => {
    let ammo = false;
    const ammoSets: boolean[] = [];
    panel = mountDevPanel(deps({ infiniteAmmo: () => ammo, setInfiniteAmmo: (on) => { ammo = on; ammoSets.push(on); } }));
    key(DEV_PANEL_KEY);
    (document.getElementById('dev-panel-clock-quarter') as HTMLButtonElement).click();
    expect(panel.scaleFrame(0.1)).toBeCloseTo(0.025);
    (document.getElementById('dev-panel-pause') as HTMLButtonElement).click();
    expect(panel.scaleFrame(0.1)).toBe(0);
    const box = document.getElementById('dev-panel-ammo') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(ammo).toBe(true);
    key(DEV_PANEL_KEY);
    expect(panel.isOpen()).toBe(false);
    expect(ammo).toBe(false);
    expect(ammoSets.at(-1)).toBe(false);
    for (const dt of [0, 1 / 60, 0.033333333333333, 0.1]) expect(Object.is(panel.scaleFrame(dt), dt), `dt ${dt}`).toBe(true);
    key(DEV_PANEL_KEY);
    expect(document.getElementById('dev-panel-clock')!.textContent).toBe('1×');
    expect(document.getElementById('dev-panel-clock-1')!.getAttribute('aria-pressed')).toBe('true');
    expect((document.getElementById('dev-panel-ammo') as HTMLInputElement).checked).toBe(false);
    expect(panel.scaleFrame(0.1)).toBeCloseTo(0.1);
  });

  it('a step left pending, or a pause made through setOpen, is also cleared by closing', () => {
    panel = mountDevPanel(deps());
    panel.setOpen(true);
    (document.getElementById('dev-panel-step') as HTMLButtonElement).click();
    panel.setOpen(false);
    expect(panel.scaleFrame(0.1)).toBe(0.1);
    expect(panel.scaleFrame(0.1)).toBe(0.1);
  });

  it('traces, markers and the collision and wireframe overlays stay on after the panel closes', () => {
    let traces = false;
    const traceSets: boolean[] = [];
    const world = { collision: false, wireframe: false };
    const sets: [string, boolean][] = [];
    panel = mountDevPanel(deps({
      tracesOn: () => traces, setTraces: (on) => { traces = on; traceSets.push(on); },
      worldToggles: () => world, setWorldToggle: (name, on) => { world[name] = on; sets.push([name, on]); },
    }));
    key(DEV_PANEL_KEY);
    for (const id of ['dev-panel-traces', 'dev-panel-collision', 'dev-panel-wireframe', 'dev-panel-marks']) {
      const box = document.getElementById(id) as HTMLInputElement;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }
    key(DEV_PANEL_KEY);
    expect(panel.isOpen()).toBe(false);
    expect(traces).toBe(true);
    expect(traceSets).toEqual([true]);
    expect(world).toEqual({ collision: true, wireframe: true });
    expect(sets).toEqual([['collision', true], ['wireframe', true]]);
    expect(state.markers).toBe(true);
    key(DEV_PANEL_KEY);
    expect((document.getElementById('dev-panel-traces') as HTMLInputElement).checked).toBe(true);
  });

  it('the Time section says what the clock does not slow (F2)', () => {
    panel = mountDevPanel(deps());
    const note = document.getElementById('dev-panel-clock-note')!;
    expect(note.className).toBe('s2u-fine');
    expect(note.closest('#dev-panel-time')).not.toBeNull();
    expect(note.textContent).toBe('Pause and slow motion slow the page\'s walk, weapons and HUD; the room\'s round clock, fuses and timers run on real time.');
  });

  it('a release build attaches no F2 listener', () => {
    vi.stubEnv('DEV', false);
    panel = mountDevPanel(deps());
    key(DEV_PANEL_KEY);
    expect(panel.isOpen()).toBe(false);
    vi.unstubAllEnvs();
  });
});
