import { readPreference, SETUP_KEY } from './startupSettings';

/**
 * The microphone's input device ('' is System default): the console's Options > Communication > Microphone writes it
 * (`./console/adapters/options`); the old setup page's picker (`microphoneSetup`, gone in CX-9b) wrote the same key.
 */
export const MIC_DEVICE_KEY = `${SETUP_KEY}.mic`;
/**
 * The "Use in game" switch: 'off' turns the game's microphone off; anything else (unset) is on. Written by the console
 * (`./console/adapters/options`, `./console/adapters/mic`); the in-game Settings' Microphone card (its view retired with
 * CX-26) and the old setup page's switch (gone in CX-9b) wrote the same key.
 */
export const MIC_ENABLED_KEY = `${SETUP_KEY}.mic.enabled`;

/** Whether the player left the game's microphone on (the "Use in game" switch; on until turned off). */
export function gameMicrophoneOn(): boolean {
  return readPreference(MIC_ENABLED_KEY) !== 'off';
}

/** The capture constraints the old setup page's test used (`Microphone.start`, gone in CX-9b), on one device or the default. */
const audio = (deviceId: string): MediaTrackConstraints => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}), channelCount: { ideal: 1 },
  echoCancellation: true, noiseSuppression: true, autoGainControl: true,
});

/**
 * The game's microphone, the one place voice capture takes it from (the owner, 2026-10-04: "also please make sure the
 * game retains controller and mic settings as the setup implies"; push-to-talk, SVC-20b, MUST use it): the device
 * saved under `MIC_DEVICE_KEY`, the default device when that one is gone (`OverconstrainedError` / `NotFoundError`), and null when
 * the player turned the microphone off, refused the permission, or the browser has no capture. Nothing is opened until
 * it is called -- never at load. A browser adaptation.
 */
export async function getGameMicrophone(media: MediaDevices | undefined = globalThis.navigator?.mediaDevices): Promise<MediaStream | null> {
  if (!gameMicrophoneOn() || typeof media?.getUserMedia !== 'function') return null;
  const saved = readPreference(MIC_DEVICE_KEY) ?? '';
  const device = saved === 'default' ? '' : saved;
  if (device) {
    try {
      return await media.getUserMedia({ video: false, audio: audio(device) });
    } catch (e) {
      const gone = e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError');
      if (!gone) return null;
    }
  }
  try {
    return await media.getUserMedia({ video: false, audio: audio('') });
  } catch {
    return null;
  }
}
