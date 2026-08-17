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

/**
 * The value below which `p` of the sorted sample sits, interpolating between
 * the two neighbouring points when the position falls between them.
 */
function quantile(sorted: number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Drop competitor prices further than 1.5 interquartile ranges outside the
 * quartiles — the standard box-plot fence.
 *
 * A marketplace search returns the occasional listing that is not the product:
 * a spare part at a tenth of the price, a two-year service plan at three
 * times. One of those is enough to drag an average, and it *defines* the
 * minimum. Trimming happens before the rule runs so every rule sees the same
 * sample.
 *
 * Fewer than four prices has no meaningful quartiles, so the sample is
 * returned untouched: with three listings there is nothing to distinguish an
 * outlier from a spread. A sample whose quartiles coincide is returned
 * untouched too, because the fence would then be a single point and would
 * discard every price that is not exactly it.
 */
export function trimOutliers(values: number[]): number[] {
  if (values.length < 4) return [...values];

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) return [...values];

  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  const kept = values.filter((value) => value >= low && value <= high);
  return kept.length > 0 ? kept : [...values];
}
