import { describe, expect, it, vi } from 'vitest';
import { StartMenu, START_MENU_LOCKOUT_SECONDS, START_MENU_REPEAT_SECONDS, localStartMenuOptions, type StartMenuSettings } from '../src/startMenu';
import { ControllerConfigs } from '../src/controllerConfigs';
import type { PadButton } from '../src/gamepad';
import { NativeSettings } from '../src/nativeSettings';

describe('in-match Settings browser adaptation', () => {
  it('a pre-native Home Fire Rate commit updates the existing layout without changing the selected button preset', () => {
    const configs = new ControllerConfigs(); configs.select('Reverse');
    const local = localStartMenuOptions(() => 0);
    local.committed('INVERT_PITCH_CONTROLLER', 1, configs);
    expect(configs.active).toBe('Reverse');
    local.committed('FIREMODESWAP_CONTROLLER', 1, configs);
    expect(configs.active).toBe('Reverse');
    expect(configs.fireModeSwap).toBe(true);
    expect(configs.record().buttons.FireMode).toBe('Select');
  });
  function rig(settings?: StartMenuSettings) {
    let active = false;
    const open = vi.fn(() => { active = true; });
    const menu = new StartMenu({
      options: localStartMenuOptions(), seat: () => ({ multiplayer: true, spectator: false, comeFromLan: false }),
      caption: id => id === 60512 ? 'RESUME' : id === 60513 ? 'ABORT' : null,
      title: () => 'MATCH', sound: () => {}, allowed: () => true,
      settings: settings ?? { open, isOpen: () => active },
    });
    const step = (held: PadButton[] = [], dt = 1 / 60) => menu.frame(dt, new Set(held));
    const tap = (held: PadButton) => { step([held]); step(); };
    step([], START_MENU_LOCKOUT_SECONDS + 0.1); tap('Start');
    return { menu, step, tap, open, closeSettings: () => { active = false; } };
  }

  it('keeps the START shortcuts and inserts SETTINGS directly after RESUME', () => {
    const r = rig();
    expect(r.menu.labels().slice(0, 3)).toEqual(['RESUME', 'SETTINGS', 'ABORT']);
    expect(r.menu.state().placed.filter(n => n !== 12)).toEqual([0, 2, 3, 4, 5, 8, 9, 11]);
  });

  it('keeps the existing START presentation during a cold asset read without a loading label or menu input', () => {
    const settings = new NativeSettings({ load: () => new Promise(() => {}) });
    const r = rig(settings);
    r.step([], 1);
    const sizes = { white: { width: 1, height: 1 }, 'font_text_01.tif': { width: 512, height: 128 }, 'font_special_01.tif': { width: 256, height: 64 } };
    const frame = { width: 640, height: 448 };
    const before = r.menu.draw(frame, sizes);
    expect(before.quads.some(quad => quad.texture === 'font_text_01.tif')).toBe(true);
    const cursor = r.menu.state().cursor;
    settings.open();
    expect(settings.isOpen()).toBe(true);
    expect(settings.notice()).toBeNull();
    expect(r.menu.draw(frame, sizes)).toEqual(before);
    r.tap('Down'); r.tap('Cross');
    expect(r.menu.state().cursor).toBe(cursor);
    expect(r.menu.isOpen()).toBe(true);
    settings.close();
  });

  it('opens Settings once and returns to its row without taking held input or closing on a round reset', () => {
    const r = rig();
    r.step([], START_MENU_REPEAT_SECONDS + 0.01); r.tap('Down'); r.tap('Cross');
    expect(r.open).toHaveBeenCalledTimes(1);
    expect(r.menu.state().cursor).toBe(12);
    r.menu.roundStart(); r.menu.reset();
    r.tap('Start'); r.tap('Cross');
    expect(r.menu.isOpen()).toBe(true);
    expect(r.open).toHaveBeenCalledTimes(1);
    r.closeSettings(); r.step();
    expect(r.menu.state().cursor).toBe(12);
    expect(r.menu.isOpen()).toBe(true);
  });
});
