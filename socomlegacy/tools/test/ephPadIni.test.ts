import { describe, expect, it } from 'vitest';
import {
  PAD1_SETTINGS, PCSX2_PAUSE_HOTKEY, PREPARED, checkPrepared, keyActions, lightStickPressure, lightTrianglePressure, pad1Lines,
  pressureKey, replacePad1,
} from '../eph/padIni';
import { PCSX2_VK } from '../eph/keys';
import { INPUTS } from '../eph/script';
import { parseScript } from '../eph/script';

/**
 * The harness's PCSX2 [Pad1] (EPH-2; the design note's "How one input reaches both clients"): every input on a
 * keyboard key (desktop@be5578311:tools_py/parity/keys.py MAPS["pcsx2"]) and Macro<N> entries for the prepared
 * non-full pressures (desktop@be5578311:tools_py/parity/seal_speed_probe.py LIGHT_MACROS, light_plan).
 */
const DESKTOP_LIKE_INI = [
  '[UI]',
  'SettingsVersion = 1',
  '',
  '[Pad1]',
  'Type = DualShock2',
  'AxisScale = 1.33',
  'Triangle = XInput-0/Y',
  'Cross = XInput-0/A',
  '',
  '',
  '[Pad2]',
  'Type = None',
  '',
  '[Hotkeys]',
  'ToggleFullscreen = Keyboard/Alt & Keyboard/Return',
  'TogglePause = Keyboard/Space',
  '',
].join('\r\n');

describe('the prepared pressures', () => {
  it('match the probe light_plan arithmetic (Triangle 0.2, the light left stick up 0.5, AxisScale 1.33)', () => {
    // light_plan: tri_p = (int(0.2 x 255) + 0.5) / 255; stick: d = round(0.5 x 128), raw = 2d - 1,
    // p = (raw + 0.5) / (AxisScale x 255).
    expect(lightTrianglePressure(0.2)).toBeCloseTo(51.5 / 255, 12);
    expect(lightStickPressure(0.5, 1.33)).toBeCloseTo(127.5 / (1.33 * 255), 12);
    expect(PREPARED).toEqual([
      { input: 'triangle', pressure: 0.2, key: '7', vk: 0x37, macro: 15, iniPressure: lightTrianglePressure(0.2) },
      { input: 'lup', pressure: 0.5, key: '8', vk: 0x38, macro: 16, iniPressure: lightStickPressure(0.5, 1.33) },
      { input: 'lleft', pressure: 0.2, key: '9', vk: 0x39, macro: 13, iniPressure: lightStickPressure(0.2, 1.33) },
      { input: 'lleft', pressure: 0.5, key: '0', vk: 0x30, macro: 14, iniPressure: lightStickPressure(0.5, 1.33) },
      { input: 'lup', pressure: 0.35, key: '5', vk: 0x35, macro: 8, iniPressure: lightStickPressure(0.35, 1.33) },
      { input: 'lup', pressure: 0.65, key: '6', vk: 0x36, macro: 9, iniPressure: lightStickPressure(0.65, 1.33) },
      { input: 'lup', pressure: 0.8, key: 'U', vk: 0x55, macro: 10, iniPressure: lightStickPressure(0.8, 1.33) },
      { input: 'ldown', pressure: 0.5, key: 'O', vk: 0x4f, macro: 11, iniPressure: lightStickPressure(0.5, 1.33) },
      { input: 'lright', pressure: 0.5, key: 'P', vk: 0x50, macro: 12, iniPressure: lightStickPressure(0.5, 1.33) },
    ]);
  });

  it('prepare the movement campaign left stick: 0.2 inside the 0.3 dead zone, 0.5 past it and under the 0.838 crouch walk', () => {
    // d = round(0.2 x 128) = 26, raw = 51; d = round(0.5 x 128) = 64, raw = 127.
    expect(lightStickPressure(0.2, 1.33)).toBeCloseTo(51.5 / (1.33 * 255), 12);
    expect(pressureKey('lleft', 0.2)).toEqual({ key: '9', vk: 0x39 });
    expect(pressureKey('lleft', 0.5)).toEqual({ key: '0', vk: 0x30 });
    expect(() => pressureKey('lright', 0.2)).toThrow(/lright at 0.2 is not prepared/);
  });

  it('refuse a light Triangle not under 0.3 and a light stick outside the probe range', () => {
    expect(() => lightTrianglePressure(0.3)).toThrow(/light Triangle is a pressure in \(0, 0.3\)/);
    expect(() => lightTrianglePressure(0)).toThrow(/light Triangle/);
    expect(() => lightStickPressure(0.01, 1.33)).toThrow(/light stick/);
  });
});

describe('the harness [Pad1]', () => {
  it('binds every input to its keys.py key and adds the macros', () => {
    const lines = pad1Lines();
    expect(lines.slice(0, PAD1_SETTINGS.length)).toEqual(PAD1_SETTINGS.map(([k, v]) => `${k} = ${v}`));
    expect(lines).toContain('Triangle = Keyboard/I');
    expect(lines).toContain('Cross = Keyboard/K');
    expect(lines).toContain('Circle = Keyboard/L');
    expect(lines).toContain('Square = Keyboard/J');
    expect(lines).toContain('Start = Keyboard/Return');
    expect(lines).toContain('Select = Keyboard/Backspace');
    expect(lines).toContain('L1 = Keyboard/Q');
    expect(lines).toContain('R1 = Keyboard/E');
    expect(lines).toContain('L2 = Keyboard/1');
    expect(lines).toContain('R2 = Keyboard/3');
    expect(lines).toContain('L3 = Keyboard/2');
    expect(lines).toContain('R3 = Keyboard/4');
    expect(lines).toContain('Up = Keyboard/Up');
    expect(lines).toContain('Left = Keyboard/Left');
    expect(lines).toContain('LUp = Keyboard/W');
    expect(lines).toContain('LDown = Keyboard/S');
    expect(lines).toContain('LLeft = Keyboard/A');
    expect(lines).toContain('LRight = Keyboard/D');
    expect(lines).toContain('RUp = Keyboard/T');
    expect(lines).toContain('RDown = Keyboard/G');
    expect(lines).toContain('RLeft = Keyboard/F');
    expect(lines).toContain('RRight = Keyboard/H');
    expect(lines.slice(-27, -15)).toEqual([
      'Macro15 = Keyboard/7', 'Macro15Binds = Triangle', `Macro15Pressure = ${(51.5 / 255).toFixed(6)}`,
      'Macro16 = Keyboard/8', 'Macro16Binds = LUp', `Macro16Pressure = ${(127.5 / (1.33 * 255)).toFixed(6)}`,
      'Macro13 = Keyboard/9', 'Macro13Binds = LLeft', `Macro13Pressure = ${(51.5 / (1.33 * 255)).toFixed(6)}`,
      'Macro14 = Keyboard/0', 'Macro14Binds = LLeft', `Macro14Pressure = ${(127.5 / (1.33 * 255)).toFixed(6)}`,
    ]);
    expect(lines.slice(-15)).toEqual([
      'Macro8 = Keyboard/5', 'Macro8Binds = LUp', `Macro8Pressure = ${(89.5 / (1.33 * 255)).toFixed(6)}`,
      'Macro9 = Keyboard/6', 'Macro9Binds = LUp', `Macro9Pressure = ${(165.5 / (1.33 * 255)).toFixed(6)}`,
      'Macro10 = Keyboard/U', 'Macro10Binds = LUp', `Macro10Pressure = ${(203.5 / (1.33 * 255)).toFixed(6)}`,
      'Macro11 = Keyboard/O', 'Macro11Binds = LDown', `Macro11Pressure = ${(127.5 / (1.33 * 255)).toFixed(6)}`,
      'Macro12 = Keyboard/P', 'Macro12Binds = LRight', `Macro12Pressure = ${(127.5 / (1.33 * 255)).toFixed(6)}`,
    ]);
    expect(lines.filter((l) => / = Keyboard\//.test(l) && !l.startsWith('Macro'))).toHaveLength(24);
  });

  it('replaces the [Pad1] body, keeps every other line and the CRLF line ends', () => {
    const out = replacePad1(DESKTOP_LIKE_INI);
    expect(out).not.toContain('XInput-0/Y');
    expect(out.startsWith('[UI]\r\nSettingsVersion = 1\r\n\r\n[Pad1]\r\nType = DualShock2\r\n')).toBe(true);
    expect(out).toContain(`Macro12Pressure = ${(127.5 / (1.33 * 255)).toFixed(6)}\r\n\r\n\r\n[Pad2]\r\nType = None\r\n`);
    expect(out).toContain('[Hotkeys]\r\nToggleFullscreen = Keyboard/Alt & Keyboard/Return\r\nTogglePause = Keyboard/Space\r\n');
    expect(out.split('\r\n').filter((l) => l === '[Pad1]')).toHaveLength(1);
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it('refuses an ini without [Pad1], like the probe _ini_pad1', () => {
    expect(() => replacePad1('[UI]\nX = 1\n')).toThrow(/no \[Pad1\] section in the PCSX2 ini/);
  });

  it('refuses an ini where a harness key is bound alone outside [Pad1]', () => {
    const ini = DESKTOP_LIKE_INI.replace('TogglePause = Keyboard/Space', 'TogglePause = Keyboard/7');
    expect(() => replacePad1(ini)).toThrow(/Keyboard\/7 is already bound \(TogglePause = Keyboard\/7\)/);
  });
});

describe('pressureKey and the script check', () => {
  it('maps 1.0 to the plain bind, a prepared pressure to its macro key, 0 to a release', () => {
    expect(pressureKey('triangle', 1)).toEqual({ key: 'I', vk: 0x49 });
    expect(pressureKey('triangle', 0.2)).toEqual({ key: '7', vk: 0x37 });
    expect(pressureKey('lup', 0.5)).toEqual({ key: '8', vk: 0x38 });
    expect(pressureKey('up', 1)).toEqual({ key: 'Up', vk: 0x26 });
    expect(pressureKey('triangle', 0)).toBeNull();
  });

  it('refuses an unprepared pressure and never rounds it', () => {
    expect(() => pressureKey('triangle', 0.25)).toThrow(/triangle at 0.25 is not prepared/);
    expect(() => pressureKey('cross', 0.2)).toThrow(/cross at 0.2 is not prepared/);
  });

  it('checks a whole script at load, naming the line', () => {
    expect(() => checkPrepared(parseScript('0 triangle 1\n100 triangle 0\n200 triangle 0.2\n300 triangle 0'))).not.toThrow();
    expect(() => checkPrepared(parseScript('0 triangle 1\n100 triangle 0\n200 triangle 0.21'))).toThrow(
      /script line 3: triangle at 0.21 is not prepared/);
  });

  it('turns the script into key downs and ups, swapping keys when the pressure changes', () => {
    const acts = keyActions(parseScript('0 triangle 0.2\n50 triangle 1\n100 triangle 0\n120 lup 1\n130 lup 1\n200 lup 0'));
    expect(acts).toEqual([
      { t: 0, line: 1, action: 'down', vk: 0x37 },
      { t: 50, line: 2, action: 'up', vk: 0x37 },
      { t: 50, line: 2, action: 'down', vk: 0x49 },
      { t: 100, line: 3, action: 'up', vk: 0x49 },
      { t: 120, line: 4, action: 'down', vk: 0x57 },
      { t: 200, line: 6, action: 'up', vk: 0x57 },
    ]);
  });
});

describe("the pause key (PK-2: the parity pack's Pause taps PCSX2's TogglePause hotkey through the injector)", () => {
  it('is Space, vk 0x20, the TogglePause hotkey of the harness ini', () => {
    expect(PCSX2_PAUSE_HOTKEY).toEqual({ hotkey: 'TogglePause', key: 'Space', vk: 0x20 });
  });

  it('is bound by no [Pad1] line and no prepared macro, so a pause never presses a pad button', () => {
    for (const i of INPUTS) expect(PCSX2_VK[i], i).not.toBe(PCSX2_PAUSE_HOTKEY.vk);
    for (const p of PREPARED) expect(p.vk, `Macro${p.macro}`).not.toBe(PCSX2_PAUSE_HOTKEY.vk);
    for (const line of pad1Lines()) expect(line).not.toMatch(/Keyboard\/Space\b/);
  });

  it("the [Pad1] rewrite keeps the ini's TogglePause = Keyboard/Space where it was", () => {
    const out = replacePad1(DESKTOP_LIKE_INI);
    expect(out).toContain('\r\n[Hotkeys]\r\nToggleFullscreen = Keyboard/Alt & Keyboard/Return\r\nTogglePause = Keyboard/Space\r\n');
    const pad1 = out.slice(out.indexOf('[Pad1]'), out.indexOf('[Pad2]'));
    expect(pad1).not.toContain('Space');
  });
});
