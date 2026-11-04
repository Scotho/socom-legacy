import { gameMicrophoneOn, getGameMicrophone, MIC_DEVICE_KEY, MIC_ENABLED_KEY } from '../../gameMicrophone';
import { readPreference, savePreference } from '../../startupSettings';
import type { Adapters } from '../state';

/**
 * The console launcher's microphone (slice 2, part c). "Use in game" is this browser's switch, read and written under
 * its own key (`../../gameMicrophone` `MIC_ENABLED_KEY`, `s2u.startup.v1.mic.enabled`: 'off' is off, anything else --
 * unset included -- on; written 'on' / 'off' as the old setup page's `microphoneSetup` wrote it, gone in CX-9b), and the
 * device is this browser's choice (`MIC_DEVICE_KEY`, the console's Options > Communication > Microphone,
 * `./options`). Nothing asks the browser for the microphone until the player turns it on (Home's Microphone item); then
 * the game's own capture (`getGameMicrophone`: the saved device, the default when it is gone) is opened once, to ask,
 * and closed at once. A refusal is said in the item; the setting stays on, as the old setup page kept it (the game then
 * has no microphone, `getGameMicrophone` null). A browser adaptation with no original (OT.R28).
 */
export type LiveMic = Adapters['mic'] & { detail(): string; refused(): boolean };

export interface MicDeps {
  /** The browser's capture; absent, `navigator.mediaDevices`. */
  media?: MediaDevices;
}

export function liveMic(notify: () => void, deps: MicDeps = {}): LiveMic {
  let refused = false;
  return {
    on: () => gameMicrophoneOn(),
    refused: () => refused,
    detail(): string {
      if (!gameMicrophoneOn()) return 'Optional · needed only for voice chat';
      if (refused) return 'The browser refused the microphone: allow it for this site';
      const device = readPreference(MIC_DEVICE_KEY) ?? '';
      return device === '' || device === 'default' ? 'System default microphone · for voice chat' : 'The microphone chosen in setup · for voice chat';
    },
    async toggle(): Promise<boolean> {
      if (gameMicrophoneOn()) {
        savePreference(MIC_ENABLED_KEY, 'off');
        refused = false;
        notify();
        return false;
      }
      savePreference(MIC_ENABLED_KEY, 'on');
      const stream = await getGameMicrophone(deps.media ?? globalThis.navigator?.mediaDevices);
      refused = stream === null;
      for (const t of stream?.getTracks() ?? []) t.stop();
      notify();
      return true;
    },
  };
}
