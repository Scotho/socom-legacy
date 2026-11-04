import { padActuator, type RumbleActuator } from '../rumble';
import type { Adapters } from './state';

/**
 * LP-PAD: browser launcher feedback, separate from the original game's rumble. One light 35 ms tap per physical
 * controller menu dispatch (including repeats and refusals), strong 0.08 / weak 0.16; product design values, not PS2
 * readings. A missing or locked vibration row defaults this adaptation on until the preference can be read; an
 * available VIBRATION_CONTROLLER row (the sample adapter's `vib`) is read live. Nothing writes the game's preference.
 */
const MENU_PULSE_ADAPTATION = { duration: 35, strongMagnitude: 0.08, weakMagnitude: 0.16 } as const;

export function menuVibrationEnabled(options: Adapters['options']): boolean {
  const rows = options.categories().flatMap((c) => c.rows);
  const row = rows.find((r) => r.id === 'VIBRATION_CONTROLLER') ?? rows.find((r) => r.id === 'vib');
  return !row || !!row.locked || options.value(row.id) !== 0;
}

interface PhysicalPad { index: number; connected?: boolean }
interface PadNavigator { getGamepads?: () => ArrayLike<unknown> }

/** A finite menu pulse owns only the actuator of its dispatch's physical pad, and only until that pulse has ended. */
export function createMenuRumble(nav: PadNavigator | undefined, enabled: () => boolean) {
  const active = new Map<number, { actuator: RumbleActuator; until: number }>();
  const pads = (): PhysicalPad[] => {
    try { return Array.from(nav?.getGamepads?.() ?? []).filter((p): p is PhysicalPad => !!p && (p as PhysicalPad).connected === true); }
    catch { return []; }
  };
  // Both a throwing API and a rejected permission promise are optional hardware, never an input failure.
  const safely = (run: () => Promise<unknown> | undefined): void => {
    try { void Promise.resolve(run()).catch(() => {}); } catch { /* unsupported hardware */ }
  };
  const stop = (): void => {
    for (const { actuator } of active.values()) safely(() => actuator.reset?.());
    active.clear();
  };
  const sync = (now: number): void => {
    for (const [index, pulse] of active) if (now >= pulse.until) active.delete(index);
    if (!active.size) return;
    if (!enabled()) { stop(); return; }
    const present = pads();
    for (const [index, pulse] of active) if (!present.some((p) => p.index === index)) {
      safely(() => pulse.actuator.reset?.()); active.delete(index);
    }
  };
  return {
    sync, stop,
    pulse(index: number | undefined, now: number): void {
      sync(now);
      if (index === undefined || !enabled()) return;
      const pad = pads().find((p) => p.index === index);
      // Resolve the exact raw device: logical/remapped pads may omit native actuator properties.
      const actuator = padActuator({ getGamepads: () => pad ? [pad] : [] }, () => {});
      if (!actuator) return;
      active.set(index, { actuator, until: now + MENU_PULSE_ADAPTATION.duration });
      safely(() => actuator.playEffect('dual-rumble', MENU_PULSE_ADAPTATION));
    },
  };
}
