/** Wave sizes for the test-room zombies mode (`TEST_ROOM_ZOMBIES_ADAPTATION`). Phoenix's crowd numbers, not a reading. */
export const MAX_WAVE_ZOMBIES = 2000;
export const MAX_LIVE_ZOMBIES = 300;

export const waveSize = (wave: number): number => Math.min(MAX_WAVE_ZOMBIES, 4 + Math.max(0, wave - 1) * 3);

export const waveLiveLimit = (wave: number): number => Math.min(MAX_LIVE_ZOMBIES, 4 + Math.max(0, wave - 1) + Math.max(0, wave - 10) * 2);

export const validPopulation = (total: number, live: number): boolean =>
  Number.isSafeInteger(total) && total >= 1 && total <= MAX_WAVE_ZOMBIES
  && Number.isSafeInteger(live) && live >= 1 && live <= MAX_LIVE_ZOMBIES && live <= total;
