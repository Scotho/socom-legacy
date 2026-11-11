import { describe, expect, it } from 'vitest';
import { replayQueryPairs } from '../src/replay/query';

/** LCM-RP: the replay page's and the door's query read by hand (PTT-9 keeps `URLSearchParams` keys to the launch table). */
describe('replayQueryPairs (REPLAY_QUERY_BY_HAND_ADAPTATION)', () => {
  it('reads every pair as URLSearchParams does', () => {
    for (const q of ['', '?', '?match=41-7-1', 'match=a%20b&grant=x', '?grant=a+b', '?&&match=1&', '?a', '?a=&b=2', '?gr%61nt=z', '?m=1=2']) {
      expect(replayQueryPairs(q), q).toEqual([...new URLSearchParams(q).entries()]);
    }
  });

  it('is null when a side does not decode (URLSearchParams would read it some other way; the page reads nothing)', () => {
    expect(replayQueryPairs('?match=%zz')).toBeNull();
    expect(replayQueryPairs('?%E0%A4%A=1')).toBeNull();
  });
});
