import { describe, expect, it, vi } from 'vitest';
import { resolveVisuals, parseController, defaultController, controllerStanceMode, STANCE_MODE_ABOUT, STANCE_MODE_KEY, STANCE_MODE_WORDS, setControllerStanceMode } from '../src/startupSettings';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import { ControllerInput, calibrateStick } from '../src/controllerInput';
import { padInput, padRaw } from '../src/gamepad';
import { padButtonsDown } from '../src/weaponExchange';

const device = (index = 0, mapping = 'standard') => ({
  index, id: `Pad ${index}`, connected: true, mapping, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});

describe('startup preferences', () => {
  it('applies complete presets with URL, stored choice, then Modern precedence', () => {
    expect(resolveVisuals(null, null)).toEqual({ view: 'modern', detail: true });
    // The PS2 picture draws the detail pass: the original's own (research 232 §4, PF-30: `FUN_003b6e10` D:L308360-308392),
    // not the 2026-10-03 plan's "Detail textures off" (research 72's dead-on-disc belief, superseded; OT.R79's parity fix).
    expect(resolveVisuals(null, 'ps2')).toEqual({ view: 'ps2', detail: true });
    expect(resolveVisuals('modern', 'ps2').detail).toBe(true);
    expect(resolveVisuals(null, 'garbage').view).toBe('modern');
  });
  it('rejects malformed, out-of-range and ambiguous saved bindings', () => {
    for (const saved of ['{', '{}', JSON.stringify({ version: 5 }), JSON.stringify({ version: 1, bindings: Array(16).fill(1), deadZone: 99 })]) {
      expect(parseController(saved)).toEqual(defaultController());
    }
  });
});

/**
 * PP-5 (OT.R67; PP.R1, the owner: "the fallback option should be having the ability to bind prone and crouch as two
 * separate keybinds ... available as an option in controller settings and rebindings"): the pad profile gains a Prone
 * bind beside the Crouch one (the crouch shortcut's field, its saved values carried over), and the browser a Stance mode,
 * the prone-pop by default. A browser adaptation.
 */
describe('PP-5: the Prone bind and the Stance mode', () => {
  const saved = (o: Record<string, unknown>): string => JSON.stringify({ version: 1, bindings: Array.from({ length: 16 }, (_, i) => i), deadZone: 0.15, crouch: -1, ...o });
  it('Prone is unbound by default; a profile saved before it reads as unbound, its Crouch kept, every old value alike', () => {
    expect(defaultController().prone).toBe(-1);
    for (const crouch of [-1, 10, 6, 17]) expect(parseController(saved({ crouch }))).toMatchObject({ crouch, prone: -1 });
  });
  it('a saved Prone is read; one out of range, or not a whole number, is the default profile', () => {
    expect(parseController(saved({ crouch: 10, prone: 11 }))).toMatchObject({ crouch: 10, prone: 11 });
    for (const prone of [32, -2, 1.5, 'x']) expect(parseController(saved({ prone }))).toEqual(defaultController());
  });
  it('the Stance mode is the prone-pop when none is kept; it is a page setting of this browser', () => {
    expect(controllerStanceMode()).toBe('pop');                // (its write and read back: remap.test, options.test, jsdom)
    expect(PAGE_SETTING_KEYS).toContain(STANCE_MODE_KEY);
  });
  // STM.R1 (the owner, 2026-10-30, reversing OBF-11): SEPARATE is offered again, one of two named modes; the saved
  // value reads back as saved (the key and its values unchanged, so a Separate saved before OBF-11 still reads).
  it('STM.R1: a saved SEPARATE reads as SEPARATE again (OBF-11 retired); anything else is COMBINED', () => {
    const kept = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
    try {
      setControllerStanceMode('separate');
      expect(kept.get(STANCE_MODE_KEY)).toBe('separate');
      expect(controllerStanceMode()).toBe('separate');
      setControllerStanceMode('pop');
      expect(kept.get(STANCE_MODE_KEY)).toBe('pop');
      expect(controllerStanceMode()).toBe('pop');
      kept.set(STANCE_MODE_KEY, 'garbage');
      expect(controllerStanceMode()).toBe('pop');
    } finally { vi.unstubAllGlobals(); }
  });
  it('STM.R1: the modes are named COMBINED and SEPARATE, and one line each says what it does', () => {
    expect(STANCE_MODE_WORDS).toEqual({ pop: 'COMBINED', separate: 'SEPARATE' });
    const lines = STANCE_MODE_ABOUT.split(/(?=SEPARATE:)/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^COMBINED: Triangle does it all/);
    expect(lines[0]).toMatch(/Square/);
    expect(lines[1]).toMatch(/^SEPARATE: Crouch and Prone get their own buttons/);
    expect(lines[1]).toMatch(/Prone takes Triangle's button, and Triangle stops changing stance while Prone is bound\.$/);   // the review's F1
    expect(STANCE_MODE_ABOUT).not.toMatch(/Prone-pop|Separate:/);
  });
});

describe('one controller adapter for gameplay and menus', () => {
  it('does not transfer an explicit selection to another connected pad', () => {
    const a = device(), b = device(1), input = new ControllerInput();
    input.select(`${a.index}:${a.id}`);
    expect(input.poll({ getGamepads: () => [a, b] })?.id).toBe(a.id);
    a.connected = false;
    expect(input.poll({ getGamepads: () => [a, b] })).toBeNull();
  });
  // An unknown layout is read as main read it before the setup page, raw, no bindings (the review's last round).
  it('requires neutral after connection, reads unknown layouts raw, and clears absent input', () => {
    const a = device(), input = new ControllerInput();
    a.buttons[5] = { pressed: true, value: 1 };
    expect(input.poll({ getGamepads: () => [a] })).toBeNull();
    a.buttons[5] = { pressed: false, value: 0 };
    expect(input.poll({ getGamepads: () => [a] })).not.toBeNull();
    const odd = device(1, '');
    expect(input.poll({ getGamepads: () => [odd] })).toBe(odd);
    expect(input.poll({ getGamepads: () => [] })).toBeNull();
  });
  it('a physical remap changes both gameplay fire and logical menu buttons', () => {
    const a = device(), input = new ControllerInput();
    input.poll({ getGamepads: () => [a] });
    input.config.bindings[5] = 0;
    input.config.bindings[0] = 5;
    a.buttons[0] = { pressed: true, value: 1 };
    const logical = input.poll({ getGamepads: () => [a] });
    expect(padInput(logical).fire).toBe(true);
    expect(padButtonsDown(logical)).toEqual(new Set(['R1']));
  });
  it('preserves the default stick pipeline and calibrates without changing the game curve', () => {
    for (const pair of [[0.5, 0.2], [1, 1], [-0.8, 0.4]]) expect(calibrateStick(pair[0]!, pair[1]!, 0.15)).toEqual(pair);
    expect(calibrateStick(0.3, 0, 0.4)).toEqual([0, 0]);
    expect(calibrateStick(1, 0, 0.4)).toEqual([1, 0]);
    const a = device(), input = new ControllerInput();
    input.poll({ getGamepads: () => [a] });
    a.axes = [0.5, 0, 0, 0];
    const before = padInput(input.poll({ getGamepads: () => [a] }));
    input.config.deadZone = 0.4;
    const after = padInput(input.poll({ getGamepads: () => [a] }));
    expect(after.moveX).toBeLessThan(before.moveX);
    expect(padRaw(after.moveX, 0)[0]).toBeLessThan(padRaw(before.moveX, 0)[0]);
  });
});

/**
 * Task W2ibPC6c's repair: a profile saved before the menus' d-pad guard (`./controllerInput` `MENU_REQUIRED`) may hold a
 * menu button unbound -- a Replace onto d-pad Left left the START menu's confirms unreachable. On load the slot gets its
 * default button back only when no action holds that button, so no working binding ever moves. A browser adaptation.
 */
describe('parseController: a menu button left unbound by a Replace before the guard', () => {
  const ident = (): number[] => Array.from({ length: 16 }, (_, i) => i);
  const saved = (bindings: number[], extra: Record<string, unknown> = {}): string => JSON.stringify({ ...defaultController(), bindings, ...extra });

  it('Left unbound with its button 14 free loads with Left on 14, said once on the console', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const b = ident(); b[14] = -1; b[5] = -1;           // R1 unbound too: not a menu button, left as it is
    expect(parseController(saved(b)).bindings).toEqual([...ident().slice(0, 5), -1, ...ident().slice(6)]);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]!.join(' ')).toContain('D-pad left');
    info.mockRestore();
  });

  it('each menu button (Cross, Circle, START, the four directions) is restored the same way when its button is free', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    for (const slot of [0, 1, 9, 12, 13, 15]) {
      const b = ident(); b[slot] = -1;
      expect(parseController(saved(b)).bindings, String(slot)).toEqual(ident());
    }
    info.mockRestore();
  });

  // The controller's rule (2): the action on the slot's button goes back to its own default when that is free.
  it('the lockout as it happened: fire mode (L3, 10) on 14, Left unbound, 10 free -- fire mode back on 10, Left on 14', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const b = ident(); b[10] = 14; b[14] = -1;
    expect(parseController(saved(b)).bindings).toEqual(ident());
    expect(info).toHaveBeenCalledTimes(1);
    const line = info.mock.calls[0]!.join(' ');
    expect(line).toContain('D-pad left');
    expect(line).toContain('L3');
    info.mockRestore();
  });

  // Rule (3): the action's own default held too -- the slot takes the lowest button no action holds; the action stays.
  it('Left unbound, 14 held by L3 and 10 (L3\'s own) held by R3: Left takes the lowest free button, said; nothing else moves', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const b = ident(); b[10] = 14; b[11] = 10; b[14] = -1;        // 11 (R3) is the one button no action holds
    const want = [...b]; want[14] = 11;
    expect(parseController(saved(b)).bindings).toEqual(want);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]!.join(' ')).toContain('D-pad left');
    expect(info.mock.calls[0]!.join(' ')).toContain('R3');
    info.mockRestore();
  });

  // Rule (4): no button free -- left as it is (Swap or Restore defaults). A Crouch or Prone bind holds its button too:
  // it masks it in the match (`ControllerInput.poll`), so a menu slot put there would still be dead in the START menu.
  /** The stance mode stored (`STANCE_MODE_KEY`) for `f`, over a stubbed storage. */
  const inMode = (mode: 'pop' | 'separate', f: () => void): void => {
    const kept = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) });
    try { setControllerStanceMode(mode); f(); } finally { vi.unstubAllGlobals(); }
  };
  it('Left unbound and every standard button held (the last by the Crouch bind, SEPARATE): left as it is, nothing said', () => {
    inMode('separate', () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const b = ident(); b[10] = 14; b[11] = 10; b[14] = -1;         // 11 held by no action ...
      const text = saved(b, { crouch: 11 });                         // ... but by Crouch, which masks it in SEPARATE
      expect(parseController(text).bindings).toEqual(b);
      expect(info).not.toHaveBeenCalled();
      info.mockRestore();
    });
  });
  // The batch review's N1: the binds mask their buttons in SEPARATE only (`../src/controllerInput` `poll`'s `taken`), so in
  // COMBINED a bind's button is free for the repair.
  // PR #644's review (Codex, 2026-11-03, P2): rule (2) gives the slot its own default button back, so in SEPARATE that
  // button must not be a Crouch or Prone bind -- else Left lands on a masked button and the START menu is locked again.
  it('SEPARATE, L3 on 14, Left unbound and Crouch (or Prone) on 14: rule (2) is skipped, Left takes the lowest free 10, L3 stays', () => {
    inMode('separate', () => {
      for (const bind of ['crouch', 'prone'] as const) {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const b = ident(); b[10] = 14; b[14] = -1;
        const want = [...b]; want[14] = 10;
        const got = parseController(saved(b, { [bind]: 14 }));
        expect(got.bindings, bind).toEqual(want);
        expect([got.crouch, got.prone], bind).not.toContain(got.bindings[14]);
        expect(info, bind).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0]!.join(' '), bind).toContain('D-pad left');
        info.mockRestore();
      }
    });
  });
  it('the same profile in COMBINED: the bind on 14 masks nothing, so rule (2) holds -- L3 back on 10, Left on 14', () => {
    inMode('pop', () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const b = ident(); b[10] = 14; b[14] = -1;
      expect(parseController(saved(b, { crouch: 14 })).bindings).toEqual(ident());
      info.mockRestore();
    });
  });
  it('the same profile in COMBINED: the Crouch bind masks nothing, so Left takes 11, said', () => {
    inMode('pop', () => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const b = ident(); b[10] = 14; b[11] = 10; b[14] = -1;
      const want = [...b]; want[14] = 11;
      expect(parseController(saved(b, { crouch: 11 })).bindings).toEqual(want);
      expect(info).toHaveBeenCalledTimes(1);
      info.mockRestore();
    });
  });

  it('a normal profile is untouched, and nothing is said', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const b = ident(); [b[2], b[3]] = [3, 2]; b[7] = -1;
    const text = saved(b, { crouch: 10, prone: 11 });
    expect(parseController(text)).toEqual({ ...defaultController(), bindings: b, crouch: 10, prone: 11 });
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
