// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type NetWalk, type WebSocketLike } from '../src/net/client';
import { mountMatch, type MatchRenderer, type MatchWindow } from '../src/matchMount';
import { pinnedMatchSocket } from '../src/connectHost';
import { blankLibraryMap } from '../src/forge/matchMap';
import { createForgePlayDriver } from '../src/forge/agent/play';
import { Fire } from '../src/fire';
import { StanceButton } from '../src/stanceButton';
import { PAD_BUTTON } from '../src/gamepad';
import { WalkMode } from '../src/walk';
import { GamePad } from '../src/setupPad';
import { setControllerStanceMode } from '../src/startupSettings';
import { FlyCamera } from '../src/camera';
import type { GameLobbyHandOff } from '../src/gameLobbyHost';
import type { ServerEvent } from '../src/net/protocol';

/** LATER 436 / 447 (product track): the Forge Play port's release resets only what the agent held, never a human's own hold. */
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); setControllerStanceMode('pop'); });

async function mounted(humanHolds: readonly number[] = []) {
  const source = { binaryType: '', readyState: 1, send: () => undefined, close: () => undefined } as unknown as WebSocketLike;
  const idle: NetWalk = { setNetTap: () => undefined, respawn: () => false, nudge: () => undefined, setLocked: () => undefined };
  const client = new NetClient({ url: 'loopback:', map: 'MP2', name: 'fixture', socket: () => source }, idle);
  const welcome = { type: 'welcome', id: 2, version: 9, map: 'MP2', tick: 0, role: 'player', team: 'seal', queue: 0, name: 'fixture',
    players: [], rules: 'classic', round: 1, rounds: 11, ghost: false } as unknown as ServerEvent;
  source.onopen?.({}); source.onmessage?.({ data: JSON.stringify(welcome) });
  const handOff: GameLobbyHandOff = { mediusWorldId: 0, gameName: 'FORGE', mission: 'MP2', lateJoiner: false, client,
    pinned: pinnedMatchSocket('', { protocol: 'https:', host: 'site.test', origin: 'https://site.test' }, false),
    ticket: '', held: true, welcome: welcome as GameLobbyHandOff['welcome'], roundStart: null };
  // The human's own pad: the standard mapping, the named buttons held.
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: humanHolds.includes(i), value: humanHolds.includes(i) ? 1 : 0 }));
  const pad = { index: 0, id: 'fixture pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
  const frames = new Map<number, FrameRequestCallback>(); let next = 0, time = 0;
  const win: MatchWindow = { requestAnimationFrame: (cb) => { frames.set(++next, cb); return next; },
    cancelAnimationFrame: (id) => { frames.delete(id); }, addEventListener: () => undefined, removeEventListener: () => undefined,
    navigator: { getGamepads: () => [pad] } as unknown as MatchWindow['navigator'] };
  const renderer = { backend: 'webgpu', render: () => undefined, resize: () => undefined, setClearColor: () => undefined,
    renderer: { autoClear: true, getDrawingBufferSize: (v: { x: number; y: number }) => { v.x = 640; v.y = 448; return v; }, render: () => undefined } } as unknown as MatchRenderer;
  const driver = createForgePlayDriver({ now: () => time });
  const match = mountMatch(document.body, { client, events: [welcome], handOff, holds: () => undefined, normalInput: driver.port,
    assets: Promise.resolve({ map: blankLibraryMap('MP2', 1200), clips: null }), renderer: async () => renderer, win });
  await new Promise((r) => setTimeout(r, 0));
  const frame = (): void => { const pending = [...frames.values()]; frames.clear(); time += 16; pending.forEach((cb) => cb(time)); };
  frame();
  expect(driver.read()).toMatchObject({ local: true, ready: true });
  return { driver, match, frame };
}

describe('the Forge Play port release on the mounted match', () => {
  it('LATER 436: an agent stance hold cancelled inside the tap window is no tap (the stance button forgets its press)', async () => {
    vi.spyOn(WalkMode.prototype, 'mode').mockReturnValue('walk');   // the stance lane runs only walking
    const reset = vi.spyOn(StanceButton.prototype, 'forgetPress');   // the review's F1: the press alone, not `reset`
    const update = vi.spyOn(StanceButton.prototype, 'update');
    const { driver, match, frame } = await mounted();
    expect(driver.execute('input.set', { stance: true }).ok).toBe(true);
    frame();                                            // one 16 ms frame held: well inside the tap window
    expect(update.mock.calls.some(([down]) => down === true)).toBe(true);
    reset.mockClear(); update.mockClear();
    expect(driver.execute('input.release', {}).ok).toBe(true);
    expect(reset).toHaveBeenCalled();
    frame(); frame();
    expect(update.mock.results.every((r) => r.value === null)).toBe(true);   // no stance from the cancelled hold
    match.close();
  });

  it('LATER 436: an agent hold of another lane leaves the stance button as it is', async () => {
    const reset = vi.spyOn(StanceButton.prototype, 'reset');
    const forget = vi.spyOn(StanceButton.prototype, 'forgetPress');
    const { driver, match, frame } = await mounted();
    expect(driver.execute('input.set', { moveY: 1 }).ok).toBe(true);
    frame();
    reset.mockClear(); forget.mockClear();
    driver.execute('input.release', {});
    expect(reset).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
    match.close();
  });

  it('LATER 447: the agent fire release lets go of the trigger when no human holds R1', async () => {
    const release = vi.spyOn(Fire.prototype, 'release');
    const { driver, match, frame } = await mounted();
    expect(driver.execute('input.set', { fire: true }).ok).toBe(true);
    frame();
    release.mockClear();
    driver.execute('input.release', {});
    expect(release).toHaveBeenCalled();
    match.close();
  });

  it('LATER 447: the agent fire release keeps the trigger a human holds on R1', async () => {
    vi.spyOn(WalkMode.prototype, 'mode').mockReturnValue('walk');   // off the walk the trigger is let go every frame
    const release = vi.spyOn(Fire.prototype, 'release');
    const { driver, match, frame } = await mounted([PAD_BUTTON.R1]);
    expect(driver.execute('input.set', { fire: true }).ok).toBe(true);
    frame(); frame();
    release.mockClear();
    driver.execute('input.release', {});
    expect(release).not.toHaveBeenCalled();
    frame();
    expect(release).not.toHaveBeenCalled();             // the human's R1 is still down: the merged lane never changed
    match.close();
  });

  it('LATER 436: the agent stance release keeps a stance press a human holds on Triangle', async () => {
    const reset = vi.spyOn(StanceButton.prototype, 'reset');
    const forget = vi.spyOn(StanceButton.prototype, 'forgetPress');
    const { driver, match, frame } = await mounted([PAD_BUTTON.Triangle]);
    expect(driver.execute('input.set', { stance: true }).ok).toBe(true);
    frame();
    reset.mockClear(); forget.mockClear();
    driver.execute('input.release', {});
    expect(reset).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
    match.close();
  });
  it('LATER 438: the agent release never zeroes the stick or the look a human pushes (4d8e4d41e)', async () => {
    const stick = vi.spyOn(FlyCamera.prototype, 'setStick'), look = vi.spyOn(FlyCamera.prototype, 'setLook');
    const { driver, match, frame } = await mounted();
    expect(driver.execute('input.set', { moveY: 1, lookX: 0.5 }).ok).toBe(true);
    frame();
    stick.mockClear(); look.mockClear();
    driver.execute('input.release', {});
    expect(stick).not.toHaveBeenCalled();
    expect(look).not.toHaveBeenCalled();
    match.close();
  });
  // The review's F1 (FAILED acc7ee3a6): the agent's stance release forgot the human's own Prone and Crouch binds' edges
  // (`StanceButton.reset` zeroes `proneWas` and `crouchWas`), so a Prone a person holds read as a fresh full press on
  // the next frame and stood a prone SEAL up -- in both stance modes (PP-5: the Prone bind's edge is read in both).
  // STM-1 (STM.R1): SEPARATE is offered again (OBF-11 retired), so the loop holds both modes once more. A control, not a
  // pin of STM-1: it passes before and after it (91's run of a57a5a9f9, 2026-10-30: 8/8 at RED). The Prone held is
  // `GamePad.prone` mocked on the prototype, past `ControllerInput.poll`'s mode gate, so it is fed in both modes either
  // way; and the agent's Triangle is let go by `input.release`, which forgets the press (LATER 436), so no tap follows in
  // either mode with or without a Triangle gate. STM-1's gates are pinned in `stanceModes.test.ts`.
  for (const mode of ['pop', 'separate'] as const) {
    it(`the review's F1 (${mode}): the agent stance release keeps a Prone bind (and a Crouch bind) a human holds`, async () => {
      setControllerStanceMode(mode);
      vi.spyOn(WalkMode.prototype, 'mode').mockReturnValue('walk');   // the stance lane runs only walking
      vi.spyOn(WalkMode.prototype, 'stanceIntent').mockReturnValue('prone');   // the person's bound Prone has them prone
      vi.spyOn(GamePad.prototype, 'prone', 'get').mockReturnValue(true);       // the pad profile's Prone bind, held throughout
      vi.spyOn(GamePad.prototype, 'crouch', 'get').mockReturnValue((mode as string) === 'separate');   // and in 'separate' a held Crouch bind
      const setStance = vi.spyOn(WalkMode.prototype, 'setStance');
      const pronePress = vi.spyOn(WalkMode.prototype, 'pronePress');
      const { driver, match, frame } = await mounted();
      frame();                                            // the Prone bind's own edge is spent
      expect(driver.execute('input.set', { stance: true }).ok).toBe(true);
      frame();                                            // the agent's Triangle, inside the tap window
      setStance.mockClear(); pronePress.mockClear();
      expect(driver.execute('input.release', {}).ok).toBe(true);
      frame(); frame(); frame();
      expect(setStance.mock.calls).toEqual([]);           // no stance change: the held Prone is no new press
      expect(pronePress).not.toHaveBeenCalled();
      match.close();
    });
  }
});
