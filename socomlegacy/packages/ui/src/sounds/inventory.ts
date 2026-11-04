import type { RdrNode } from '@s2u/archive';
import type { UiProgram } from '@s2u/scene';

/**
 * The sound names the front end's files name (PLAT-23; web research 122 §7), as data: the zAnim `SOUND` commands of
 * every set (decoded by `@s2u/scene`'s `decodeUiProgram`, passed in) and the sound names of the dialog files. The
 * dev-disc test runs it over `RUN/UIZANIM.ZAR`, `EXTZANIM.ZAR`, `MPZANIM.ZAR` and `RUN/UI/READERC.ZAR`, `READERX.ZAR`
 * and resolves every name through the front end's table; research 122 §7's counts rest on it.
 *
 * Type-only imports: the index stays free of `@s2u/scene` values (`test/headless.test.ts`).
 */

/** One distinct name of the sets' `SOUND` commands. */
export interface SoundCommandUse {
  name: string;
  /** How many commands name it. */
  commands: number;
  /** The flags they carry, each with its count. */
  flags: Map<number, number>;
  /** The sets (`dlgMenu.rdr`) that hold one. */
  sets: Set<string>;
}

/** Every `SOUND` command of the programs, by name; `set` names the set each program is from. */
export function soundCommandUses(programs: Iterable<{ set: string; program: UiProgram }>): Map<string, SoundCommandUse> {
  const out = new Map<string, SoundCommandUse>();
  for (const { set, program } of programs) {
    for (const seq of program.sequences) {
      for (const op of seq.ops) {
        if (op.op !== 'sound') continue;
        let u = out.get(op.sound);
        if (!u) out.set(op.sound, (u = { name: op.sound, commands: 0, flags: new Map(), sets: new Set() }));
        u.commands++;
        u.flags.set(op.flags, (u.flags.get(op.flags) ?? 0) + 1);
        u.sets.add(set);
      }
    }
  }
  return out;
}

/**
 * The sound names of a dialog file (research 122 §7's method): every string that is a sigilled name (`.`, `^`, `~`,
 * `!` then a non-blank), starts `SND_`, is the value of a key whose name ends in `Sound` (`UiParams.rdr`'s
 * `ScaleDownSound`, whose `".SLIDE\t"` the sigil rule also takes), or is a `SOUND` node's `NAME` (`dlgExitState.rdr`'s
 * `MUS_SUCCESS` / `MUS_FAILURE`, which no other rule takes). Spelt as the file holds them, whitespace kept.
 */
export function dialogSoundNames(root: RdrNode): string[] {
  const out = new Set<string>();
  // `inSoundNode`: `n` is a `SOUND` key's value (READERX `dlgExitState.rdr`'s `SOUND (NAME (MUS_SUCCESS) START ())`),
  // whose `NAME` is a sound name however it is spelt; no other `NAME` is (a control's, a variable's).
  const walk = (n: RdrNode, underSoundKey: boolean, inSoundNode: boolean): void => {
    if (typeof n === 'string') {
      if (underSoundKey || /^[.^~!]\S/.test(n) || n.startsWith('SND_')) out.add(n);
      return;
    }
    for (let i = 0; i < n.length; i++) {
      const prev = i > 0 ? n[i - 1] : undefined;
      const key = typeof prev === 'string' ? prev : undefined;
      // The key's value, a string or a list of them; a list's own keys decide again inside it.
      const take = (key !== undefined && /Sound$/.test(key)) || (inSoundNode && key === 'NAME') || (underSoundKey && i === 0 && n.length === 1);
      walk(n[i]!, take, key === 'SOUND');
    }
  };
  walk(root, false, false);
  return [...out];
}
