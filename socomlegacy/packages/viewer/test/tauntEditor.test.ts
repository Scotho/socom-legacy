import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { readSoftKeyboards, serializeUiVars, uiVarModule, type PadButtonName } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../src/frontEnd';
import { readUiParams } from '../src/softKeyboardKeys';
import { cardTauntTexts, TAUNT_VARS } from '../src/tauntSettings';
describe.skipIf(!process.env.SOCOM_DISC)('ISO Setup Taunts dialog and original keyboard', () => {
  it('opens the original first slot, accepts physical text, and saves through the script', async () => {
    const source = new FsAssetSource(process.env.SOCOM_DISC!);
    const disc = await readFrontEndDisc(source);
    // The five at 3 with stand-in defaults, as dlgNetLogin's ONSTART adds them before SETUP TAUNTS is reached.
    const session = new FrontEndSession({ disc, startDialog: 'dlgSetTaunts.rdr', loader: false,
      initializeVars: v => { TAUNT_VARS.forEach((name, i) => v.add(name, { type: 'string', value: `DEFAULT ${i + 1}` }, 3)); },
    });
    // What the card's CUIVarManager module would carry now (`./personaHost`'s SaveConfig: serializeUiVars as R7's JSON).
    const card = (): (string | null)[] => cardTauntTexts(uiVarModule(serializeUiVars(session.uiVars, session.machine.valves)));
    const saved = (slot: number): string | null => card()[slot] ?? null;
    session.keyboard.load(readSoftKeyboards(await readUiParams(source)));
    let tick = 0;
    const step = (frames: number) => { for (let i = 0; i < frames; i++) session.advance(++tick * (1000 / 60)); };
    step(180);
    expect(session.machine.shell()?.currentName).toBe('dlgSetTaunts.rdr');
    session.input.source = { read: () => ({ down: new Set(['CROSS']), stickX: 0, stickY: 0 }) }; step(2);
    session.input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) }; step(60);
    expect(session.keyboard.keyboard.isOpen).toBe(true);
    // The physical keyboard queue is the same original USB path; clear the old value, type ABC, Enter.
    const keys = [...Array.from({ length: 45 }, () => ({ hid: 0x2a, shift: false, capsLamp: false })),
      ...[4, 5, 6, 0x28].map(hid => ({ hid, shift: true, capsLamp: false }))];
    session.keyboard.usbKey = () => keys.shift() ?? null;
    step(180);
    expect(session.keyboard.keyboard.isOpen).toBe(false);
    expect(session.uiVars.find('MPTAUNTMSG1')?.value).toEqual({ type: 'string', value: 'ABC' });
    expect(saved(0)).toBe('ABC');
    const press = (name: PadButtonName): void => {
      session.input.source = { read: () => ({ down: new Set([name]), stickX: 0, stickY: 0 }) }; step(4);
      session.input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) }; step(60);
    };
    const seed = (): void => { const chars = [4, 5, 6].map(hid => ({ hid, shift: true, capsLamp: false })); session.keyboard.usbKey = () => chars.shift() ?? null; step(30); };
    press('CROSS'); expect(session.keyboard.keyboard.isOpen).toBe(true);
    seed();
    press('SQUARE'); press('TRIANGLE');
    expect(session.keyboard.keyboard.isOpen).toBe(false);
    expect(saved(0)).toBe('ABC'); // The original keyboard cancels its draft.
    press('CROSS'); expect(session.keyboard.keyboard.isOpen).toBe(true);
    seed();
    press('SQUARE'); expect(session.keyboard.keyboard.text).toBe('AB'); press('CIRCLE');
    expect(saved(0)).toBe('AB'); // Controller backspace and accept operate the original keyboard.
    for (let slot = 2; slot <= 5; slot++) {
      press('DOWN'); expect(session.input.ring()?.focused?.name).toBe(`SetTAUNT${slot}`);
      press('CROSS'); expect(session.keyboard.keyboard.isOpen).toBe(true);
      const replacement = [...Array.from({ length: 45 }, () => ({ hid: 0x2a, shift: false, capsLamp: false })),
        { hid: 4 + slot, shift: true, capsLamp: false }, { hid: 0x28, shift: false, capsLamp: false }];
      session.keyboard.usbKey = () => replacement.shift() ?? null; step(180);
      expect(saved(slot - 1)).toBe(String.fromCharCode(65 + slot));
    }
    session.close();
  }, 30000);
});
