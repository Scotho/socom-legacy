import { choice, objectOf, validateSchema, type JsonSchema } from './schema.js';

/**
 * AX-16 (plan item 16; a browser adaptation, product track, no original): `target.capture`'s presets. Without them an
 * agent checking its work has to move the camera, capture and move it back by hand. With them the page frames the
 * picture itself and puts the camera back exactly as it was:
 * - `current` (the default): the canvas as it is, as before AX-16;
 * - `top`: straight down over the layout's placed pieces and markers (the base map's box when nothing is placed);
 * - `refs`: a three-quarter view framing the given revision-scoped refs;
 * - `named`: from a placed spectator view (`view:N` or its name) in the Forge, or a named objective in the test room.
 * `size: "small"` scales the picture down to at most `CAPTURE_SMALL_WIDTH_ADAPTATION` pixels wide; `medium` (the
 * default) is the canvas's own size. Additive on the wire (AX.R8): `{}` is the capture it always was.
 */
export const CAPTURE_VIEWS = ['current', 'top', 'refs', 'named'] as const;
export type CaptureView = (typeof CAPTURE_VIEWS)[number];
export const CAPTURE_SIZES = ['small', 'medium'] as const;
export type CaptureSize = (typeof CAPTURE_SIZES)[number];
/** A browser adaptation's own bound: the refs one `refs` capture frames. */
export const CAPTURE_REFS_MAX_ADAPTATION = 64;
/** A browser adaptation's own bound: a `small` picture's widest (pixels); never scaled up. */
export const CAPTURE_SMALL_WIDTH_ADAPTATION = 640;

const refText: JsonSchema = { type: 'string', minLength: 1, maxLength: 160 };
/** The wire arguments, published in the manual (`./manual.ts` `target.capture`) and held by `parseCaptureArgs`: one source. */
export const CAPTURE_ARGS_SCHEMA: JsonSchema = objectOf({
  view: choice(...CAPTURE_VIEWS),
  refs: { type: 'array', items: refText, minItems: 1, maxItems: CAPTURE_REFS_MAX_ADAPTATION, uniqueItems: true },
  name: refText,
  size: choice(...CAPTURE_SIZES),
}, []);

export interface CaptureArgs { view: CaptureView; refs?: string[]; name?: string; size?: CaptureSize }

/**
 * A capture refused before any picture was taken: the protocol's code (a `REFUSAL_HINTS` key) and, when the page knows
 * better than the table, its own sentence for the agent (the result's `hint`). A page target throws it from `capture`;
 * the page's connection answers it as a refused result, the session kept.
 */
export class CaptureRefusal extends Error {
  readonly code: string;
  readonly hint: string | undefined;
  constructor(code: string, hint?: string) { super(code); this.name = 'CaptureRefusal'; this.code = code; this.hint = hint; }
}

/**
 * The capture's arguments checked against `CAPTURE_ARGS_SCHEMA` and its pairings -- `refs` with view `refs` only (and
 * required there), `name` with view `named` only (and required there) -- and copied. Anything else throws a
 * `CaptureRefusal` (INVALID_ARGUMENT) whose hint says what to send.
 */
export function parseCaptureArgs(value: unknown): CaptureArgs {
  try { validateSchema(value, CAPTURE_ARGS_SCHEMA); }
  catch (error) {
    throw new CaptureRefusal('INVALID_ARGUMENT', `target.capture takes {view?: ${CAPTURE_VIEWS.join(' | ')}, refs?: [ref, ...] (view refs), name?: string (view named), size?: small | medium}: ${error instanceof Error ? error.message : 'malformed'}.`);
  }
  const r = value as { view?: CaptureView; refs?: string[]; name?: string; size?: CaptureSize };
  const view = r.view ?? 'current';
  if ((view === 'refs') !== (r.refs !== undefined))
    throw new CaptureRefusal('INVALID_ARGUMENT', view === 'refs' ? 'view "refs" needs refs: [ref, ...] from forge.read {section: "refs"}.' : 'refs go with view "refs" only.');
  if ((view === 'named') !== (r.name !== undefined))
    throw new CaptureRefusal('INVALID_ARGUMENT', view === 'named' ? 'view "named" needs name: a placed spectator view (view:N or its name) in the Forge, an objective in the test room.' : 'name goes with view "named" only.');
  return { view, ...(r.refs ? { refs: [...r.refs] } : {}), ...(r.name !== undefined ? { name: r.name } : {}), ...(r.size ? { size: r.size } : {}) };
}
