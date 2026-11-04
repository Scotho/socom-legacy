// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Settings, type SettingsStorage } from '@s2u/card';
import {
  keepCameraChoice, readCameraChoice, REPLAY_CAMERA_DEFAULT, REPLAY_CAMERA_KEY, type CameraChoiceStore,
} from '../../../src/modern/replays/cameraChoice';
import { SPECTATOR_START_READING } from '../../../src/spectatorView';

/**
 * RV2-06 (RV2.R1, the owner's word "make the default camera type be player"; the replay viewer redesign plan,
 * docs/plans/2026-11-02-replay-viewer-redesign.md): the replay viewer's camera choice, kept in this browser under one
 * key. Nothing kept, a storage that throws, or a value that names no mode reads as `follow` (PLAYER); a camera button's
 * press is kept and read back. A browser adaptation (REPLAY_ADAPTATION; product track, OT.R53): the live spectator's
 * start (SPECTATOR_START_READING, `FUN_00295260`) is the original's and is not touched -- the pin below holds it.
 */

const SRC = resolve(import.meta.dirname, '../../../src');

function memory(initial: Record<string, string> = {}): SettingsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}
const settingsOn = (s: SettingsStorage | null): Settings => new Settings(() => s, () => undefined);

describe('RV2-06: the replay viewer\'s camera choice (cameraChoice)', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it('the key and the default: s2u.replay.camera.v1, follow (PLAYER, RV2.R1)', () => {
    expect(REPLAY_CAMERA_KEY).toBe('s2u.replay.camera.v1');
    expect(REPLAY_CAMERA_DEFAULT).toBe('follow');
  });

  it('reads follow with nothing stored', () => {
    expect(readCameraChoice(settingsOn(memory()))).toBe('follow');
    expect(readCameraChoice()).toBe('follow');                       // the page's own settings, nothing kept
  });

  it('reads follow from a storage that throws, or none at all', () => {
    const throwing: SettingsStorage = {
      getItem: () => { throw new DOMException('denied', 'SecurityError'); },
      setItem: () => { throw new DOMException('denied', 'SecurityError'); },
      removeItem: () => { throw new DOMException('denied', 'SecurityError'); },
    };
    expect(readCameraChoice(settingsOn(throwing))).toBe('follow');
    expect(readCameraChoice(settingsOn(null))).toBe('follow');
    const raw: CameraChoiceStore = { get: () => { throw new Error('gone'); }, set: () => { throw new Error('gone'); } };
    expect(readCameraChoice(raw)).toBe('follow');
    expect(() => keepCameraChoice('free', raw)).not.toThrow();
    expect(() => keepCameraChoice('free', settingsOn(throwing))).not.toThrow();
  });

  it('reads follow from a value that names no mode', () => {
    for (const garbage of ['', 'orbit', 'FOLLOW', ' free', '{"mode":"free"}', 'null']) {
      expect(readCameraChoice(settingsOn(memory({ [REPLAY_CAMERA_KEY]: garbage }))), garbage).toBe('follow');
    }
  });

  it('keeps a choice and reads it back; a mode it does not know is not kept', () => {
    const s = memory();
    const store = settingsOn(s);
    for (const mode of ['scenic', 'free', 'follow'] as const) {
      keepCameraChoice(mode, store);
      expect(readCameraChoice(store)).toBe(mode);
    }
    keepCameraChoice('orbit', store);
    expect(readCameraChoice(store)).toBe('follow');
    expect([...s.data.keys()]).toEqual([REPLAY_CAMERA_KEY]);
  });

  it('writes no key but s2u.replay.camera.v1 on the page\'s localStorage', () => {
    keepCameraChoice('scenic');
    expect(readCameraChoice()).toBe('scenic');
    expect(Object.keys(localStorage)).toEqual([REPLAY_CAMERA_KEY]);
    expect(localStorage.getItem(REPLAY_CAMERA_KEY)).toBe('scenic');
  });
});

describe('RV2-06: the live spectator\'s start is the original\'s, untouched (the pin)', () => {
  it('SPECTATOR_START_READING is still free / free / -1 (spectatorView.ts, FUN_00295260), and the viewer never imports it', () => {
    expect(SPECTATOR_START_READING).toEqual({ mode: 'free', remembered: 'free', scenic: -1 });
    const view = readFileSync(resolve(SRC, 'spectatorView.ts'), 'utf8');
    expect(view).toContain("export const SPECTATOR_START_READING = { mode: 'free', remembered: 'free', scenic: -1 } as const;");
    for (const f of ['modern/replays/cameraChoice.ts', 'modern/replays/worldStage.ts', 'modern/replays/view.ts']) {
      expect(readFileSync(resolve(SRC, f), 'utf8'), f).not.toMatch(/import[^;]*\bSPECTATOR_START_READING\b/);
    }
  });
});
