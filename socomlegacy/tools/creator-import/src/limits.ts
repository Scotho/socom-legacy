/** Product-tool adaptations decided by the owning UI controller, 2026-10-25T08:50Z/08:51Z, precedence 08:57Z.
 * These are separate from pack byte limits and never engine/game rules. No timings or JS heap sizes are claimed.
 */
export const GLB_PREPARED_BYTES_ADAPTATION = 32 * 1024 * 1024;
export const GLB_CHECK_BUDGET_ADAPTATION = 5_000_000;
export const GLB_JSON_BYTES_ADAPTATION = 1024 * 1024;
export const GLB_DETERMINANT_EPSILON_ADAPTATION = 1e-12;

/** Shared across every instance and hull in ONE preflight, never reset per primitive. */
export class PreparationBudget {
  private numericBytes = 0;
  private checks = 0;
  prepare(bytes: number): void {
    const next = this.numericBytes + bytes;
    if (!Number.isSafeInteger(next) || next > GLB_PREPARED_BYTES_ADAPTATION) {
      // Caller converts the internal typed refusal into the shared diagnostic model.
      throw new PreparedLimit(next);
    }
    this.numericBytes = next;
  }
  /** Structural work units, NOT milliseconds: each expanded vertex/triangle and each hull V*F + V + F +
   * face-index visit. Both source and baked hull validations charge, aggregated over every instance/hull.
   */
  check(count: number): void {
    const next = this.checks + count;
    if (!Number.isSafeInteger(next) || next > GLB_CHECK_BUDGET_ADAPTATION) throw new CheckLimit(next);
    this.checks = next;
  }
}
export class PreparedLimit extends Error {
  constructor(readonly measured: number) {
    super(`Prepared numeric output ${measured} bytes exceeds the tool cap ${GLB_PREPARED_BYTES_ADAPTATION} bytes.`);
  }
}
export class CheckLimit extends Error {
  constructor(readonly measured: number) {
    super(`Preparation checks ${measured} exceed the tool cap ${GLB_CHECK_BUDGET_ADAPTATION} checks.`);
  }
}
