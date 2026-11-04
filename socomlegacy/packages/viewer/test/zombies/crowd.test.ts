import { expect, it } from 'vitest';
import { validPopulation, waveLiveLimit, waveSize } from '../../src/zombies/crowd';

it('scales into hundreds with bounded upper limits', () => {
  expect(waveSize(100)).toBe(301);
  expect(waveLiveLimit(100)).toBe(283);
  expect(waveSize(10000)).toBe(2000);
  expect(waveLiveLimit(10000)).toBe(300);
  expect(validPopulation(2000, 300)).toBe(true);
});
