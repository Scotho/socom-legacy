// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { controllerConfigs } from '../src/controllerConfigs';
import { setCodModernChosen } from '../src/controllerModern';
import { GamePad, takeCrossPress } from '../src/setupPad';
import { PAD_BUTTON, mergeInput, noInput, padInput, stanceLane, type Input } from '../src/gamepad';
import { SETUP_KEY, defaultController, setControllerStanceMode } from '../src/startupSettings';
import { InventoryMenu } from '../src/inventoryMenu';
import { TalkInput, type TalkOptions } from '../src/voice/talkInput';
beforeEach(() => { localStorage.clear(); setControllerStanceMode('pop'); setCodModernChosen(true); controllerConfigs.store(n => n === 'SelectedControllerConfig' ? 1 : 0); });   // V20.R4: the page's choice
afterEach(() => { controllerConfigs.reset(); setControllerStanceMode('pop'); localStorage.clear(); });
function pad(prone = -1) {
  const raw = { index: 0, id: 'COD integration', mapping: 'standard', connected: true, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const key = `${SETUP_KEY}.pad.${JSON.stringify([raw.id, raw.mapping, raw.buttons.length, raw.axes.length])}`;
  localStorage.setItem(key, JSON.stringify({ ...defaultController(), prone }));
  const reader = new GamePad({ waitForRest: false });
  const read = (...indices: number[]) => {
    raw.buttons.forEach((b,i) => { b.pressed = indices.includes(i); b.value = b.pressed ? 1 : 0; });
    const logical = reader.poll({ getGamepads: () => [raw] });
    const input = mergeInput(padInput(logical), { ...noInput(), crouch: reader.crouch, prone: reader.prone });
    return { logical, input };
  };
  read();
  return { read };
}
function inventory() {
  let before = noInput(), now = 0;
  const taken: number[] = [];
  const menu = new InventoryMenu({ kit: () => ({ count: 2, current: 0, takeable: () => true }), alive: () => true, canChange: () => true,
    take: slot => { taken.push(slot); return true; }, icon: () => 'test.tif', info: () => ({ id: 54, name: 'Rifle', rounds: 10, capacity: 30, mags: 2 }), clock: () => now });
  const frame = (input: Input) => { const out = menu.frame(before, input, 1/60); before = input; now += 1/60; return out; };
  const open = () => { frame({ ...noInput(), inventory: true }); for (let i=0;i<20;i++) frame(noInput()); expect(menu.isOpen()).toBe(true); };
  return { menu, frame, open, taken };
}
describe('COD Modern through the real controller and menu readers', () => {
  for (const prone of [PAD_BUTTON.R3, PAD_BUTTON.Triangle]) it('Separate Prone on '+prone+' keeps menu back without a weapon swap', () => {
    setControllerStanceMode('separate');
    const p = pad(prone), h = inventory(); h.open();
    const { logical, input } = p.read(prone);
    expect(logical!.buttons[PAD_BUTTON.Triangle]!.pressed).toBe(true);
    expect(input.prone).toBe(true); expect(input.swap1).toBe(false); expect(stanceLane(input)).toBe(false);
    const game = h.frame(input);
    expect(h.menu.isOpen()).toBe(false); expect(game.prone).toBe(false); expect(game.swap1).toBe(false); expect(h.taken).toEqual([]);
  });
  it('Separate mode reserves the stance lane but still allows a real Y weapon press beside Prone', () => {
    setControllerStanceMode('separate'); const p = pad(PAD_BUTTON.R3);
    expect(stanceLane(p.read(PAD_BUTTON.Circle).input)).toBe(false);
    p.read(); const input = p.read(PAD_BUTTON.R3, PAD_BUTTON.Triangle).input;
    expect(input.prone).toBe(true); expect(input.swap1).toBe(true);
  });
  it('reload/use confirms inventory without also reloading, including a held press after closing', () => {
    const p = pad(), h = inventory(); h.open();
    const pressed = p.read(PAD_BUTTON.Square).input;
    expect(pressed.action && pressed.reload).toBe(true);
    expect(h.frame(pressed).reload).toBe(false); expect(h.menu.isOpen()).toBe(false); expect(h.taken).toEqual([0]);
    for (let i=0;i<5;i++) expect(h.frame(p.read(PAD_BUTTON.Square).input).reload).toBe(false);
    h.frame(p.read().input);
    expect(h.frame(p.read(PAD_BUTTON.Square).input).reload).toBe(true);
  });
  it('an operator toast taking Cross preserves Separate Prone without a weapon swap', () => {
    setControllerStanceMode('separate');
    const p = pad(PAD_BUTTON.R3);
    let taken = 0;
    const off = takeCrossPress(() => { taken++; });
    p.read();
    try {
      for (let i = 0; i < 2; i++) {
        const { logical, input } = p.read(PAD_BUTTON.Cross, PAD_BUTTON.R3);
        expect(taken).toBe(1);
        expect(input.jump).toBe(false);
        expect(logical!.triangleFromProneOnly).toBe(true);
        expect(input.prone).toBe(true);
        expect(input.swap1).toBe(false);
        expect(stanceLane(input)).toBe(false);
      }
    } finally { p.read(); off(); }
  });
  it('the original separate reload action stays available under inventory', () => {
    setCodModernChosen(false);                                   // V20.R4: an original layout chosen ends the page's COD choice
    controllerConfigs.store(n => n === 'SelectedControllerConfig' ? 1 : 0);
    const p=pad(), h=inventory(); h.open();
    expect(h.frame(p.read(PAD_BUTTON.R3).input).reload).toBe(true);
  });
  it('R3 talks, Circle does not, and L1 follows the existing RUN AND TALK rule', () => {
    const talk = new TalkInput({ send: () => {}, custom: () => [], sound: () => {}, unsupported: () => {} });
    const opts: TalkOptions = { phase: 'round', preset: 'CODModern', runAndTalk: false, menuAllowed: true, talkAllowed: true, lateJoiner: false, padPresent: true, focused: true };
    let time=0;
    const hold = (buttons: Parameters<TalkInput['frame']>[1], count: number) => Array.from({length: count}, () => talk.frame(time+=1/60, buttons, opts));
    hold(new Set(),2);
    expect(hold(new Set(['Circle']),30).some(x => x.talk)).toBe(false);
    hold(new Set(),90);
    expect(hold(new Set(['R3']),30).some(x => x.talk)).toBe(true);
    expect(hold(new Set(),90).every(x => !x.talk)).toBe(true);
    opts.runAndTalk=true; hold(new Set(),2);
    expect(hold(new Set(['L1']),30).some(x => x.talk)).toBe(true);
  });
});
