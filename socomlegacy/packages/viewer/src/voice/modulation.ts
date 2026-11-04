/**
 * VOICE MODULATION's stage (SVC-22b, web sprint 20; research 226 §5, research 170 C10): the talker's own voice changed
 * before his encoder, as the original set the character's `VoiceFont` on his own SASE encoder -- so a listener hears
 * what the talker's page sent. What the original does, read: the option (`DAT_003df1a8`, the `VoiceMask` valve; .data
 * = 1, on by default in r0001; r0004 starts it OFF and reads `VoiceMask` back, OT.R97 / R4B-02, research 375) is applied
 * at the round's start for a player who is not a spectator (`FUN_002c2fa0` is 0:
 * `FUN_0030e5a0(voice, DAT_003df1a8 == 0)`, D:L55851-55854) and by the START menu's VOICE MODULATION toggle
 * (`FUN_002041e0` D:L61746, with no spectator test), and the game lobby masks it off (`FUN_0030e5a0(voice, 1)`,
 * D:L125570; `VOICE_MOD_LOBBY_OFF_READING`). The mask sets three encoder parameters from the character's `VoiceFont`
 * (`FUN_0030e5a0` D:L210728-210767 through `FUN_00310630`): the pitch offset and the spectral factor (and a spectral
 * ledge, 0 on the disc); robot and whisper are never used (research 205 §1.14).
 *
 * What those numbers do to the sound is inside SASE's setters and is **not read**, so this stage is the page's own
 * approximation, labelled `VOICE_MODULATION_PLACEHOLDER` (H87, the owner's call: "a labelled pitch shift, off if you say
 * so"): a pitch shift whose direction is the sign of the font's pitch offset and whose size is the placeholder's, the
 * spectral factor unused. It is the two-tap delay-line shifter: the input is written into a short history, two read
 * taps half a window apart slide through it at the shifted rate, each faded in and out (sin²) so that the one whose
 * delay wraps round the window is silent as it wraps. The history and the taps' phase carry from one 80 ms block to the
 * next (the review's F2: a shift of each block on its own jumped at every join, 12.5 clicks a second), so a block's
 * edge is no different from its middle. It delays the voice by up to one window (40 ms).
 */

/** A character's `VoiceFont` as the voice uses it: `SetPitchOffset` (+0x388) and `SetSpectralFactor` (+0x38c). */
export interface VoiceFont { pitchOffset: number; spectralFactor: number }

/**
 * The page's approximation of VOICE MODULATION (no original sound is read; H87): the shift's size in semitones, its
 * direction the font's offset sign; the shifter's window in 8 kHz samples (two 20 ms packets); and the font every talker
 * gets until the characters' own are read -- the first block research 205 §1.14 lists off the disc (-25, 80, 0),
 * standing in for the talker's character's (176 `character.rdr` records carry one of 8 distinct blocks; the table by
 * character is owed to a read of the disc through this tree's readers, which have none for it yet).
 */
export const VOICE_MODULATION_PLACEHOLDER: { readonly semitones: number; readonly windowSamples: number; readonly font: Readonly<VoiceFont> } = {
  semitones: 2,
  windowSamples: 320,
  font: { pitchOffset: -25, spectralFactor: 80 },
};

/** The pitch ratio for `font`: 2^(sign x semitones / 12); 1 (no shift) for an offset of 0. */
export function modulationRatio(font: Readonly<VoiceFont>): number {
  return 2 ** ((Math.sign(font.pitchOffset) * VOICE_MODULATION_PLACEHOLDER.semitones) / 12);
}

/** One talker's shifter: blocks in order, each out the same length; `reset` forgets the history (a talk's start). */
export interface Modulator {
  process(block: Float32Array): Float32Array;
  reset(): void;
}

/** A shifter for `font`. The output is a function of the font and the blocks since the last reset, in order. */
export function createModulator(font: Readonly<VoiceFont>): Modulator {
  const ratio = modulationRatio(font);
  const w = VOICE_MODULATION_PLACEHOLDER.windowSamples;
  const size = w + 2;                       // a delay up to the window, and one more sample to interpolate
  const step = (1 - ratio) / w;             // the taps' phase a sample: each tap's delay grows by 1 - ratio
  const history = new Float32Array(size);
  let at = 0, phase = 0;
  /** The input `d` samples before the newest, linearly interpolated. */
  const back = (d: number): number => {
    const i = Math.floor(d), f = d - i;
    return history[(at - 1 - i + 2 * size) % size]! * (1 - f) + history[(at - 2 - i + 2 * size) % size]! * f;
  };
  return {
    process: (block) => {
      const out = new Float32Array(block.length);
      if (ratio === 1) { out.set(block); return out; }
      for (let k = 0; k < block.length; k++) {
        history[at] = block[k]!;
        at = (at + 1) % size;
        const p2 = (phase + 0.5) % 1;
        const g1 = Math.sin(Math.PI * phase) ** 2, g2 = Math.sin(Math.PI * p2) ** 2;   // g1 + g2 = 1
        out[k] = back(phase * w) * g1 + back(p2 * w) * g2;
        phase = (((phase + step) % 1) + 1) % 1;
      }
      return out;
    },
    reset: () => { history.fill(0); at = 0; phase = 0; },
  };
}
