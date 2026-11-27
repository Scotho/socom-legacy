import { describe, expect, it } from 'vitest';
import { NETEND_DIAGS_PER_LOAD_ADAPTATION, netEndMessage, netEndReporter, type NetEndPage } from '../src/net/netEndDiag';
import { ClientErrorBeacon, DIAG_KINDS } from '../src/clientErrorBeacon';

/** LATER 62's field instrument (product track, a browser adaptation): the netend diagnostic's fixed fields and its cap. */
const page = (o: Partial<NetEndPage> = {}): NetEndPage =>
  ({ why: 'net-error', path: 'tick-ended', state: 'closed', code: 1006, phase: 'match', late: true, sinceMatchMs: 72_400.4, ...o });

describe('LATER 62: the netend diagnostic', () => {
  it('fixed fields only: each from its set or form, anything else "other"; a number or null', () => {
    expect(JSON.parse(netEndMessage(page()))).toEqual({ v: 1, why: 'net-error', path: 'tick-ended', state: 'closed', code: 1006, phase: 'match', late: true, sinceMatchMs: 72_400 });
    const odd = JSON.parse(netEndMessage(page({ why: 'x', path: 'Has Spaces https://a.b/c?t=1', state: 'weird', phase: '?', code: 1.5, sinceMatchMs: -1 })));
    expect(odd).toEqual({ v: 1, why: 'other', path: 'other', state: 'other', code: null, phase: 'other', late: true, sinceMatchMs: null });
    expect(netEndMessage(page()).length).toBeLessThan(1024);
  });

  it(`at most ${NETEND_DIAGS_PER_LOAD_ADAPTATION} a page load; a throwing send never escapes`, () => {
    const sent: string[] = [];
    const tell = netEndReporter((m) => { sent.push(m); });
    for (let i = 0; i < 6; i++) tell(page());
    expect(sent).toHaveLength(NETEND_DIAGS_PER_LOAD_ADAPTATION);
    expect(() => netEndReporter(() => { throw new Error('no'); })(page())).not.toThrow();
  });

  it('the beacon sends it as a diagnostic kind: never in the record or the page\'s report block', () => {
    expect(DIAG_KINDS).toContain('netend');
    const sent: string[] = [];
    const b = new ClientErrorBeacon({ context: () => ({ release: '0.4.27', builtAt: null, backend: 'webgpu', adapter: null, map: 'MP2', matchElapsedMs: 72_000 }), send: (s) => { sent.push(s); }, now: () => 0 });
    const before = { rec: b.record(), text: b.text() };
    expect(b.reportDiag('netend', netEndMessage(page()))).toBe(true);
    expect(JSON.parse(sent[0]!)).toMatchObject({ kind: 'netend', count: 1 });
    expect(b.record()).toEqual(before.rec);
    expect(b.text()).toBe(before.text);
  });
});
