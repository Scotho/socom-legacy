import { BLIND_KEYS } from '@s2u/scene';
import { setTrueColourScale, type ColourScaleRow } from './trueColourScale';
import { blindGlow, blindWash, glowLength } from './flashRules';

/** The blind's rules (the wash's and the glow's keys and arithmetic) are `./flashRules`'; this file runs them on the production uniforms. */
export * from './flashRules';

export interface WhiteOutState {
  level: 1 | 2 | 3 | null;
  t: number;
  /** The glow's strength now, FIX / 255 (0..1): how far the frame is whited out. */
  opacity: number;
  passes: number;
  fix: number;
  /** The wash's row now, null when none. */
  wash: ColourScaleRow | null;
  /** When the running blind is over: the longer of the wash and the glow, seconds. */
  length: number;
}

/** The running blind: its wash on the lit colours (`./trueColourScale`) and its glow for the renderer (`glow`). */
export class WhiteOut {
  private level: 1 | 2 | 3 | null = null;
  private t = 0;

  /** A flash: the stronger of the running level and the new one takes over, from its start. */
  start(level: 1 | 2 | 3): void {
    if (this.level !== null && this.level > level) return;
    this.level = level;
    this.t = 0;
    this.apply();
  }

  stop(): void {
    this.level = null;
    this.apply();
  }

  update(dt: number): void {
    if (this.level === null) return;
    this.t += dt;
    if (this.t > this.length()) this.level = null;
    this.apply();
  }

  /** The glow's passes and FIX now, for the renderer (`ViewerRenderer.setGlow`). */
  glow(): { passes: number; fix: number } {
    return this.level === null ? { passes: 0, fix: 0 } : blindGlow(this.level, this.t);
  }

  opacity(): number {
    return this.glow().fix / 255;
  }

  state(): WhiteOutState {
    const g = this.glow();
    return {
      level: this.level, t: this.t, opacity: g.fix / 255, passes: g.passes, fix: g.fix,
      wash: this.level === null ? null : blindWash(this.level, this.t), length: this.length(),
    };
  }

  private length(): number {
    return this.level === null ? 0 : Math.max(BLIND_KEYS[this.level].at(-1)!.t, glowLength(this.level));
  }

  private apply(): void {
    setTrueColourScale(this.level === null ? null : blindWash(this.level, this.t));
  }
}
