/**
 * The four pricing rules, over an array of competitor prices.
 *
 * Every one of these returns 0 for an empty array rather than `NaN`,
 * `Infinity` or a throw — `Math.min()` with no arguments is `Infinity`, and an
 * Infinity that reaches the Shopify client becomes a price. Callers are still
 * expected to check for an empty array before repricing; this is the second
 * line, not the first.
 */

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Round to two decimal places for money.
 *
 * `Math.round(x * 100) / 100` is wrong at the boundary: `1.005 * 100` is
 * `100.49999999999999` in binary floating point, so it rounds down. Going
 * through the decimal string representation via `Number.EPSILON` correction
 * keeps the half-up behaviour a price is expected to have.
 */
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
