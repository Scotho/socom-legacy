// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '@s2u/card';
import { PAGE_SETTING_KEYS } from '../src/pageStore';
import {
  CHAT_IN_CHOICES, DETAILS_CHOICES, MY_VOICE_CHOICES, STREAMER_DEFAULTS_ADAPTATION, STREAMER_HOTKEY_ADAPTATION, STREAMER_KEYS,
  STREAMER_PRESET_ADAPTATION, VOICE_IN_CHOICES, chatFromOthers, detailsHidden, isStreamerHotkey, myVoice, onStreamerChange,
  readStreamer, resetStreamerCache, saveStreamerRow, setStreamerMode, streamerAllows, streamerModeOn, voiceFromOthers,
  installStreamerHotkey, STREAMER_TOAST_MS_ADAPTATION, domToast, STREAMER_TOAST_ID, mask, HIDDEN_DETAIL_WORDS, ownNameShown, OWN_NAME_HIDDEN_WORDS,
} from '../src/streamerMode';

/**
 * STREAMER-P1 slice 1 (product track, **a browser adaptation**; OT.R152, next-sprint/STREAMER-MODE-P1-SCOPE-2026-11-24.md
 * s2 and s4.1): the master switch and its four sub-rows, kept in this browser's `s2u.viewer.streamer.*` keys. Off by
 * default; turning it On writes the preset (a saved copy of the sub-rows kept), Off restores them. With the mode Off every
 * getter reads the default, so nothing differs from today.
 */
function memory(): { settings: Settings; data: Map<string, string> } {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
  return { settings: new Settings(() => storage as unknown as Storage, (() => {}) as never), data };
}

afterEach(() => { resetStreamerCache(); });

describe('STREAMER-P1: the settings (s2u.viewer.streamer.*)', () => {
  it('every key is one of the page\'s keys and under s2u.viewer.streamer.', () => {
    for (const k of Object.values(STREAMER_KEYS)) {
      expect(k.startsWith('s2u.viewer.streamer.')).toBe(true);
      expect(PAGE_SETTING_KEYS).toContain(k);
    }
  });

  it('the choices and the preset are the scope\'s table', () => {
    expect(VOICE_IN_CHOICES).toEqual(['everyone', 'matches-friends', 'friends', 'off']);
    expect(MY_VOICE_CHOICES).toEqual(['everywhere', 'matches', 'off']);
    expect(CHAT_IN_CHOICES).toEqual(['everyone', 'matches-friends', 'friends', 'off']);
    expect(DETAILS_CHOICES).toEqual(['shown', 'hidden']);
    expect(STREAMER_DEFAULTS_ADAPTATION).toEqual({ voiceIn: 'everyone', myVoice: 'everywhere', chatIn: 'everyone', details: 'shown' });
    expect(STREAMER_PRESET_ADAPTATION).toEqual({ voiceIn: 'matches-friends', myVoice: 'matches', chatIn: 'matches-friends', details: 'hidden' });
  });

  it('unset reads as off, every row at its default', () => {
    const { settings } = memory();
    const s = readStreamer(settings);
    expect(s.on).toBe(false);
    expect(s.rows).toEqual(STREAMER_DEFAULTS_ADAPTATION);
  });

  it('turning On writes the preset; Off restores the saved sub-rows; a reload keeps everything', () => {
    const { settings, data } = memory();
    saveStreamerRow('chatIn', 'friends', settings);        // a choice made before (stored, not in force while Off)
    setStreamerMode(true, settings);
    expect(readStreamer(settings)).toEqual({ on: true, rows: STREAMER_PRESET_ADAPTATION });
    saveStreamerRow('myVoice', 'off', settings);           // changed after the preset
    expect(readStreamer(settings).rows.myVoice).toBe('off');
    // a reload: a fresh read of the same storage
    resetStreamerCache();
    expect(readStreamer(settings)).toEqual({ on: true, rows: { ...STREAMER_PRESET_ADAPTATION, myVoice: 'off' } });
    setStreamerMode(false, settings);
    expect(readStreamer(settings)).toEqual({ on: false, rows: { ...STREAMER_DEFAULTS_ADAPTATION, chatIn: 'friends' } });
    expect(data.has(STREAMER_KEYS.saved)).toBe(false);
  });

  it('an unknown stored value reads as the default', () => {
    const { settings, data } = memory();
    data.set(STREAMER_KEYS.on, 'yes');
    data.set(STREAMER_KEYS.voiceIn, 'bogus');
    expect(readStreamer(settings)).toEqual({ on: false, rows: STREAMER_DEFAULTS_ADAPTATION });
  });
});

describe('STREAMER-P1: the live getters (pageSettings), Off is exactly today', () => {
  it('with the mode Off every getter reads the default even when sub-rows are stored', () => {
    const { settings } = memory();
    saveStreamerRow('details', 'hidden', settings);
    expect(streamerModeOn(settings)).toBe(false);
    expect(detailsHidden(settings)).toBe(false);
    expect(voiceFromOthers(settings)).toBe('everyone');
    expect(myVoice(settings)).toBe('everywhere');
    expect(chatFromOthers(settings)).toBe('everyone');
  });

  it('with the mode On the getters read the rows', () => {
    const { settings } = memory();
    setStreamerMode(true, settings);
    expect(streamerModeOn(settings)).toBe(true);
    expect(detailsHidden(settings)).toBe(true);
    expect(voiceFromOthers(settings)).toBe('matches-friends');
    expect(myVoice(settings)).toBe('matches');
    expect(chatFromOthers(settings)).toBe('matches-friends');
  });

  it('a change is told to the listeners, and stops after the unsubscribe', () => {
    const { settings } = memory();
    const seen = vi.fn();
    const off = onStreamerChange(seen);
    setStreamerMode(true, settings);
    saveStreamerRow('details', 'shown', settings);
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    setStreamerMode(false, settings);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe('STREAMER-P1: the masks', () => {
  it('mask() and ownNameShown() leave everything as today with the mode Off', () => {
    const { settings } = memory();
    expect(mask('Lobby 3', settings)).toBe('Lobby 3');
    expect(ownNameShown('KiLL', settings)).toBe('KiLL');
  });
  it('with details Hidden, mask() says so and the own name is "YOU"', () => {
    const { settings } = memory();
    setStreamerMode(true, settings);
    expect(HIDDEN_DETAIL_WORDS).toBe('Hidden (streamer mode)');
    expect(OWN_NAME_HIDDEN_WORDS).toBe('YOU');
    expect(mask('Lobby 3', settings)).toBe(HIDDEN_DETAIL_WORDS);
    expect(ownNameShown('KiLL', settings)).toBe('YOU');
  });
});

describe('STREAMER-P1: streamerAllows (the one rule for voice and chat from others)', () => {
  it('everyone passes all; off passes none', () => {
    for (const place of ['lobby', 'match'] as const) for (const f of [true, false]) {
      expect(streamerAllows('everyone', place, f)).toBe(true);
      expect(streamerAllows('off', place, f)).toBe(false);
    }
  });
  it('matches + friends & clan: everyone in a match, only friends and clan in a lobby', () => {
    expect(streamerAllows('matches-friends', 'match', false)).toBe(true);
    expect(streamerAllows('matches-friends', 'lobby', true)).toBe(true);
    expect(streamerAllows('matches-friends', 'lobby', false)).toBe(false);
  });
  it('friends & clan only: everywhere, matches included', () => {
    expect(streamerAllows('friends', 'match', false)).toBe(false);
    expect(streamerAllows('friends', 'match', true)).toBe(true);
    expect(streamerAllows('friends', 'lobby', true)).toBe(true);
  });
});

describe('STREAMER-P1: the hotkey (Ctrl+Shift+S)', () => {
  const key = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

  it('the chord, and only the chord', () => {
    expect(STREAMER_HOTKEY_ADAPTATION).toMatch(/Ctrl\+Shift\+S/);
    expect(isStreamerHotkey(key({ code: 'KeyS', ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(isStreamerHotkey(key({ code: 'KeyS', ctrlKey: true }))).toBe(false);
    expect(isStreamerHotkey(key({ code: 'KeyS', shiftKey: true }))).toBe(false);
    expect(isStreamerHotkey(key({ code: 'KeyS', ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false);
    expect(isStreamerHotkey(key({ code: 'KeyS', metaKey: true, shiftKey: true }))).toBe(false);
    expect(isStreamerHotkey(key({ code: 'KeyD', ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  // The controller's condition for listing the listener as not game input (keyboardGate, OT.R29; 2026-11-24): it reads
  // Ctrl+Shift+S only and never prevents or stops any other key, so the game's own keys -- Ctrl's crouch among them -- fire.
  it('every key but Ctrl+Shift+S passes untouched: no preventDefault, no stopPropagation, no toggle, no toast', () => {
    const { settings } = memory();
    const toast = vi.fn();
    const off = installStreamerHotkey(window, toast, settings);
    try {
      const others = [
        { code: 'ControlLeft', key: 'Control', ctrlKey: true }, { code: 'ShiftLeft', key: 'Shift', shiftKey: true },
        { code: 'KeyS', key: 's' }, { code: 'KeyS', ctrlKey: true }, { code: 'KeyS', shiftKey: true },
        { code: 'KeyA', ctrlKey: true, shiftKey: true }, { code: 'KeyS', ctrlKey: true, shiftKey: true, altKey: true },
        { code: 'KeyS', ctrlKey: true, shiftKey: true, metaKey: true }, { code: 'KeyW', key: 'w' }, { code: 'Space', key: ' ', ctrlKey: true },
      ];
      for (const o of others) {
        const ev = key(o);
        const stop = vi.spyOn(ev, 'stopPropagation'), stopNow = vi.spyOn(ev, 'stopImmediatePropagation');
        let reached = false;
        const after = (): void => { reached = true; };
        document.body.addEventListener('keydown', after);
        document.body.dispatchEvent(ev);
        document.body.removeEventListener('keydown', after);
        expect([o, ev.defaultPrevented, stop.mock.calls.length, stopNow.mock.calls.length, reached]).toEqual([o, false, 0, 0, true]);
      }
      expect(streamerModeOn(settings)).toBe(false);
      expect(toast).not.toHaveBeenCalled();
      const hot = key({ code: 'KeyS', ctrlKey: true, shiftKey: true });
      const stop = vi.spyOn(hot, 'stopPropagation'), stopNow = vi.spyOn(hot, 'stopImmediatePropagation');
      let reached = false;
      const after = (): void => { reached = true; };
      document.body.addEventListener('keydown', after);
      document.body.dispatchEvent(hot);
      document.body.removeEventListener('keydown', after);
      expect([hot.defaultPrevented, stop.mock.calls.length, stopNow.mock.calls.length, reached]).toEqual([true, 0, 0, true]);   // the chord too reaches the page
    } finally { off(); }
  });

  it('toggles the master row and fires a 2-second toast, also while typing in a text field', () => {
    const { settings } = memory();
    const toast = vi.fn();
    const off = installStreamerHotkey(window, toast, settings);
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const ev = key({ code: 'KeyS', ctrlKey: true, shiftKey: true });
    input.dispatchEvent(ev);
    expect(streamerModeOn(settings)).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(toast).toHaveBeenLastCalledWith('Streamer mode on', STREAMER_TOAST_MS_ADAPTATION);
    expect(STREAMER_TOAST_MS_ADAPTATION).toBe(2000);
    window.dispatchEvent(key({ code: 'KeyS', ctrlKey: true, shiftKey: true }));
    expect(streamerModeOn(settings)).toBe(false);
    expect(toast).toHaveBeenLastCalledWith('Streamer mode off', 2000);
    // plain typing is not taken
    const s = key({ code: 'KeyS', key: 's' });
    input.dispatchEvent(s);
    expect(s.defaultPrevented).toBe(false);
    off();
    window.dispatchEvent(key({ code: 'KeyS', ctrlKey: true, shiftKey: true }));
    expect(streamerModeOn(settings)).toBe(false);
    input.remove();
  });

  it('a second install on the same window adds no second toggle: the newest toast says it, the earlier one after its removal', () => {
    const { settings } = memory();
    const base = vi.fn(), top = vi.fn();
    const offBase = installStreamerHotkey(window, base, settings);
    const offTop = installStreamerHotkey(window, top, settings);
    window.dispatchEvent(key({ code: 'KeyS', ctrlKey: true, shiftKey: true }));
    expect(streamerModeOn(settings)).toBe(true);           // one press, one toggle
    expect([base.mock.calls.length, top.mock.calls.length]).toEqual([0, 1]);
    offTop();
    window.dispatchEvent(key({ code: 'KeyS', ctrlKey: true, shiftKey: true }));
    expect(streamerModeOn(settings)).toBe(false);
    expect(base).toHaveBeenCalledWith('Streamer mode off', 2000);
    offBase();
  });

  it('domToast: one system notice on the page, replaced in place, gone after its time', () => {
    vi.useFakeTimers();
    try {
      const t = domToast(document);
      t('Streamer mode on', 2000);
      t('Streamer mode off', 2000);
      const els = document.querySelectorAll(`#${STREAMER_TOAST_ID}`);
      expect(els).toHaveLength(1);
      expect(els[0]!.textContent).toBe('Streamer mode off');
      expect(els[0]!.className).toBe('s2u-notice');
      vi.advanceTimersByTime(2000);
      expect(document.getElementById(STREAMER_TOAST_ID)).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});

describe('STREAMER-P1: another tab\'s change (the review\'s F2)', () => {
  afterEach(() => { localStorage.clear(); resetStreamerCache(); });

  it('a storage event on the page\'s keys drops the kept state and tells the listeners', () => {
    localStorage.clear();
    expect(streamerModeOn()).toBe(false);                   // kept: Off
    const seen = vi.fn();
    const off = onStreamerChange(seen);
    localStorage.setItem(STREAMER_KEYS.on, 'on');           // another tab writes
    window.dispatchEvent(new StorageEvent('storage', { key: STREAMER_KEYS.on }));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(streamerModeOn()).toBe(true);
    window.dispatchEvent(new StorageEvent('storage', { key: 's2u.viewer.look' }));   // another key: nothing
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });

  it('with a stale kept state and no event, the hotkey reads the stored switch: turns it Off, not "on" again', () => {
    localStorage.clear();
    expect(streamerModeOn()).toBe(false);                   // kept: Off
    localStorage.setItem(STREAMER_KEYS.on, 'on');           // written behind the kept state
    const toast = vi.fn();
    const offKey = installStreamerHotkey(window, toast);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', ctrlKey: true, shiftKey: true }));
    expect(toast).toHaveBeenLastCalledWith('Streamer mode off', 2000);
    expect(streamerModeOn()).toBe(false);
    offKey();
  });

  it('setStreamerMode to what is stored, with a stale kept state, still tells the listeners', () => {
    localStorage.clear();
    expect(streamerModeOn()).toBe(false);
    localStorage.setItem(STREAMER_KEYS.on, 'on');
    const seen = vi.fn();
    const off = onStreamerChange(seen);
    setStreamerMode(true);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(streamerModeOn()).toBe(true);
    off();
  });
});
