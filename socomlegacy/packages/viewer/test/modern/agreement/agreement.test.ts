import { describe, expect, it } from 'vitest';
import { agreementTextOf } from '../../../src/modern/agreement/agreement';

/**
 * MU-13a: the USER AGREEMENT after the sign-in (parity audit F12), as the original shows `dlgUsagePolicy` at every
 * connect (research 128 R128.1, research 156 R156.6-R156.7). The policy comes through the original page's own client
 * (`../../../src/usagePolicyHost`, `POST /texts/policy` `{ type: 0 }`).
 *
 * CX-25 (the console plan): the modern sign-in panel that hosted the agreement is retired; the console's sign-in shows
 * the agreement itself, over the same words and the same reply (`../../../src/console/adapters/session` reads
 * `agreementTextOf` and the AGREEMENT_* words; `test/console/adapters/session.test.ts`). CX-26: the agreement panel
 * (`agreementPanel`), mounted by its tests alone since, is retired too, its cases named in CX-26's commit and the console
 * plan's Log. What stays held here is the reply's joining.
 */
describe('agreementTextOf: the reply joined as FUN_002f7ac0 joins it', () => {
  it('joins the success chunks in order; the text exists only once a chunk ends it', () => {
    expect(agreementTextOf([{ status: 0, policy: 'ab', endOfText: false }, { status: 0, policy: 'cd', endOfText: true }])).toBe('abcd');
    expect(agreementTextOf([{ status: 0, policy: 'ab', endOfText: false }])).toBeNull();
    expect(agreementTextOf([])).toBeNull();
  });
  it('a chunk with a failure status changes nothing', () => {
    expect(agreementTextOf([{ status: -1, policy: 'x', endOfText: true }])).toBeNull();
    expect(agreementTextOf([{ status: 0, policy: 'a', endOfText: false }, { status: -1, policy: 'x', endOfText: false }, { status: 0, policy: 'b', endOfText: true }])).toBe('ab');
  });
});
