/**
 * AX-1 (contract C1, ruling AX.R6; a browser adaptation): the argument schemas the page validates against and the
 * gateway publishes before pairing, one source. Moved unchanged from the page (`viewer/src/forge/agent/api.ts`), which
 * imports them: a JSON Schema subset, read by `validateSchema` below and by any JSON Schema reader an agent brings.
 */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  /** The test room's own strings carry one (`viewer/src/testroom/agent/target.ts` `stringSchema`). */
  minLength?: number;
  maxLength?: number;
  /** A string's JSON Schema `pattern` (an unanchored ECMAScript regex, as JSON Schema reads it): published and held by `validateSchema`. */
  pattern?: string;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  /** Documentation only (the test room's `map.load` `wait`); `validateSchema` never fills it in. */
  default?: unknown;
}

/** The page's schema constructors (formerly `api.ts`'s locals of the same names). */
export const text: JsonSchema = { type: "string", maxLength: 160 };
export const number: JsonSchema = { type: "number", minimum: -100_000, maximum: 100_000 };
export const flag: JsonSchema = { type: "boolean" };
/** A world point [x, y, z] in game units. */
export const point: JsonSchema = { type: "array", items: number, minItems: 3, maxItems: 3 };
/** Revision-scoped placement refs (`piece:0`, `spawn:1`...), each valid for ONE layout revision. */
export const refs: JsonSchema = { type: "array", items: text, maxItems: 2096, uniqueItems: true };
export const choice = (...values: string[]): JsonSchema => ({ type: "string", enum: values });
export const objectOf = (properties: Record<string, JsonSchema> = {}, required = Object.keys(properties)): JsonSchema =>
  ({ type: "object", properties, required, additionalProperties: false });
export const arbitraryObject: JsonSchema = { type: "object" };
/** FCW-32: an authored id (`layout.ts` `AUTHORED_ID`'s length; its grammar is the record's check). */
export const authoredId: JsonSchema = { type: "string", maxLength: 64 };
export const size: JsonSchema = { type: "number", minimum: 0, maximum: 100_000 };
export const integer = (minimum: number, maximum: number): JsonSchema => ({ type: "integer", minimum, maximum });

/** Throws an Error naming the first path that breaks `schema` (moved unchanged from `api.ts` `validate`, plus minLength). */
export function validateSchema(value: unknown, schema: JsonSchema, path = "args"): void {
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} is not an allowed value`);
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) throw new Error(`${path}.${key} is required`);
    for (const [key, val] of Object.entries(obj)) {
      const child = schema.properties?.[key];
      if (child) validateSchema(val, child, `${path}.${key}`);
      else if (schema.additionalProperties === false) throw new Error(`${path}.${key} is unknown`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 4096)) throw new Error(`${path} must be a bounded array`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) throw new Error(`${path} must contain unique references`);
    value.forEach((v, i) => validateSchema(v, schema.items ?? {}, `${path}[${i}]`));
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))
      || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new Error(`${path} must be a finite bounded ${schema.type}`);
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length > (schema.maxLength ?? 1024) || value.length < (schema.minLength ?? 0)) throw new Error(`${path} must be a bounded string`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) throw new Error(`${path} does not match its pattern`);
  } else if (schema.type === "boolean" && typeof value !== "boolean") throw new Error(`${path} must be boolean`);
}

/** Strict JSON admission catches nested NaN/undefined/prototypes before serialization can silently coerce them (moved from `api.ts` `json`). */
export function assertJsonData(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error("Arguments are too deeply nested");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach((v) => assertJsonData(v, depth + 1)); return; }
  if (typeof value === "object" && value && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [k, v] of Object.entries(value)) { if (["__proto__", "prototype", "constructor"].includes(k)) throw new Error("Unsafe key"); assertJsonData(v, depth + 1); } return;
  }
  throw new Error("Arguments must be finite JSON data");
}
