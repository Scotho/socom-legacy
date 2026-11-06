import { noInput, type Input } from './gamepad';

/** Browser input ownership for Weapon Exchange: consumed controls stay consumed until release.
 * This is a port safeguard, not an extra original-game action or repeat rule (research 300).
 */
export class ExchangeInput {
  private held = new Set<keyof Input>();
  private keys = new Set<string>();

  frame(input: Input, menu: boolean): Input {
    const out = menu ? noInput() : { ...input };
    for (const name of Object.keys(input) as (keyof Input)[]) {
      if (typeof input[name] !== 'boolean' || name === 'stanceOff') continue;   // OT.R107: `stanceOff` says how `stance` is held, no lane of its own
      if (menu && input[name]) this.held.add(name);
      if (this.held.has(name)) {
        Object.assign(out, { [name]: false });
        if (!input[name]) this.held.delete(name);
      }
    }
    if (input.stancePressure !== undefined && !out.stance) out.stancePressure = 0;
    return out;
  }

  key(code: string, down: boolean, menu: boolean, repeat = false): boolean {
    const taken = menu || this.keys.has(code);
    // A repeat of a gameplay-owned key must still release that old hold in its original listener.
    if (down && taken && !repeat) this.keys.add(code);
    if (!down) this.keys.delete(code);
    return taken;
  }

  blur(): void { this.keys.clear(); }
}
