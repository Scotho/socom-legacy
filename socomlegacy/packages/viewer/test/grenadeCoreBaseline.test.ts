import { expect, it } from 'vitest';
import { GrenadeThrower } from '../src/grenade';
import { GRENADE_TRACE_MODES, grenadeCoreTrace, grenadeTraceSummary } from './helpers/grenadeCoreTrace';

// Captured against d78be426a6, before grenade.ts changes; `hold` re-captured at the merge of main 009b7cb2ab from
// main's own unsplit GrenadeThrower through this harness (the other five were unchanged by main). Synthetic
// code-behavior evidence only; these traces do not establish console parity.
const GRENADE_BASELINE = {
  // LANE-KILL B-06 re-pin (the latch, THROW_AIM_ORIGIN_LATCH_READING; the pin was 4f58535c...): the branch's base trace
  // hashes 87fcc769..., so the old pin was likely red since c5629fb494 (the review of 4e26b9ad0e, finding 1). The re-pin
  // absorbs two moves: the bare sine's replacement by the body's aim vector, and the origin 8.808 up + 0.453 ahead ->
  // the standing select's 13.11. All three throws' sines moved (the first 0.1058 -> -0.0370), with their launches, arcs
  // and landings; the event and state counts unchanged, one bounce lands before the third throwStart instead of after.
  // Unmoved by the fold of that review (the latch at each change of the held item); the other five pins unmoved too.
  // LATER 1407 re-pin (was 19fc9733...): the script's `giveBack('M67', 3)` (`refund-exact-slot`) comes 90 frames after its
  // throw, the copy still flying -- it is now retired (`takeBackThrown`: the oldest untagged own copy of a refused hand
  // throw). With that retire switched off the trace gives 19fc9733... again, so the move is that alone.
  hold: 'cc24d612c00cc5c0750ec5da54138aebce59e520c2e73d66254a2364d79d3788',
  fallback: '1f8d6d41473c9aab17c6012d17eae914e5f3b6a9a04085ce92d072e703347e09',
  effects: 'f558e80f4c37e1c954a82be6d75e0ca8fff9b1cbf11762c69a34411177405cec',
  'effect-fallback': '4275db9a341f602f328ee58b53375ad861a3f6f677dd4d1847a0c0163b44586d',
  // XBOX-INTEGRATE re-pin: was 961459b5..., #835's base. agent/next's own C4 and blast rules moved since (LATER 1139's hip
  // gate, C4-GLASS, LATER 1087 (b) and 1252's one-sided scene blast line): with the base's sceneHealth.ts and equipment.ts
  // the trace gives 961459b5... again, so the change is theirs, not the extraction's.
  charges: '23ef50f8fa6c1cc78a0d76cad226f27fc73504692b732e7f6c67f50c1ff8e810',
  hydrate: '54fffa5c4bbeb223cf8dcbe6a351a7ef280d5b82d5841f956b6e8c3c96f587f0',
};
it.each(GRENADE_TRACE_MODES)('preserves the pre-extraction grenade state/event/callback trace: %s', mode => {
  const trace = grenadeCoreTrace((source, random) => new GrenadeThrower(source, undefined, random), mode);
  const summary = grenadeTraceSummary(trace);
  expect(summary.digest).toBe(GRENADE_BASELINE[mode]);
  expect(trace.states.length).toBeGreaterThan(20);
  if (mode === 'hold') expect(summary.events.throw).toBeGreaterThan(0);
  // XBOX-INTEGRATE: 2 under agent/next's C4 rules (the script's C4 plant is refused; 3 with the base's equipment.ts).
  else if (mode === 'charges') expect(summary.events.place).toBe(2);
  else if (mode === 'hydrate') expect(summary.events.remoteRelease).toBeGreaterThan(0);
  else expect(summary.events.explode).toBe(4);
});
