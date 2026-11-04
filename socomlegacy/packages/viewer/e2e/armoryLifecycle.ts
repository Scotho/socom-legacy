/** Test evidence for the existing Armory lifecycle: main's pull-out and
 * armoryRoundHooks.newRound can close a joining screen during map warm-up.
 * A closed screen alone is never evidence of a successful join.
 */
export interface ArmoryWireEvent {
  socket: number; direction: string; type: string; map?: string; id?: number; kit?: readonly number[];
}
export interface ArmoryObservation {
  socket: number; map: string | null; id: number | null; kit: readonly number[];
  armory: { open: boolean; taking: boolean; kits: readonly (readonly number[])[] };
}
export function armoryLifecycle(state: ArmoryObservation, events: readonly ArmoryWireEvent[]): 'waiting' | 'navigate' | 'round-started' {
  const welcome = events.filter(e => e.direction === 'in' && e.type === 'welcome').at(-1);
  if (!welcome || !Number.isInteger(state.id) || state.id === null || state.id <= 0 ||
      welcome.socket !== state.socket || welcome.map !== state.map || welcome.id !== state.id) return 'waiting';
  if (state.armory.open && state.armory.taking) return 'navigate';
  if (state.armory.open || state.armory.taking || state.kit.length !== 5 || !state.kit.every(Number.isInteger)) return 'waiting';
  const sameKit = (kit: readonly number[] | undefined) => kit?.length === state.kit.length && kit.every((id, i) => id === state.kit[i]);
  if (!state.armory.kits.some(sameKit)) return 'waiting';
  const current = events.slice(events.lastIndexOf(welcome) + 1).filter(e => e.direction === 'in' && e.socket === state.socket);
  const spawn = current.filter(e => e.type === 'spawn' && e.id === state.id).at(-1);
  return current.some(e => e.type === 'roundStart') && sameKit(spawn?.kit) ? 'round-started' : 'waiting';
}

export type JoiningArmoryScreen = 'select' | 'row' | 'done';
/** Finite test driver, not gameplay logic. A suppressed pulse is never retried:
 * the caller must prove the existing round-start closure before returning.
 */
export async function finishJoiningArmory(driver: {
  wait(screen: JoiningArmoryScreen | 'closed' | 'round-started'): Promise<'ready' | 'round-started'>;
  press(button: number, screen: JoiningArmoryScreen): Promise<boolean>;
}): Promise<void> {
  const steps = [['select', 0], ['row', 12], ['done', 0]] as const;
  for (const [screen, button] of steps) {
    if (await driver.wait(screen) === 'round-started') return;
    if (!await driver.press(button, screen)) {
      if (await driver.wait('round-started') !== 'round-started') throw Error('joining Armory closure lacks round proof');
      return;
    }
  }
  await driver.wait('closed');
}
