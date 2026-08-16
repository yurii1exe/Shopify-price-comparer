import { average, max, median, min, roundToCents } from '../src/shared/utils/mathUtils';

describe('pricing rules', () => {
  const prices = [12.5, 9.99, 20, 15.25];

  it('average', () => {
    expect(average(prices)).toBeCloseTo(14.435, 5);
    expect(average([10])).toBe(10);
  });

  it('min and max', () => {
    expect(min(prices)).toBe(9.99);
    expect(max(prices)).toBe(20);
  });

  it('median of an odd-length set is the middle value', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('median of an even-length set is the mean of the middle pair', () => {
    expect(median([1, 3, 5, 9])).toBe(4);
  });

  it('median does not mutate its input', () => {
    const input = [9, 1, 5];
    median(input);
    expect(input).toEqual([9, 1, 5]);
  });

  it('median sorts numerically, not lexicographically', () => {
    // The default Array#sort would order these as 100, 2, 9 and return 2.
    expect(median([100, 2, 9])).toBe(9);
  });

  describe('empty input', () => {
    it('returns 0 rather than NaN or Infinity for every rule', () => {
      expect(average([])).toBe(0);
      expect(median([])).toBe(0);
      // Math.min() with no arguments is Infinity, which would reach Shopify as a price.
      expect(min([])).toBe(0);
      expect(max([])).toBe(0);
    });
  });
});

describe('roundToCents', () => {
  it('rounds to two decimal places', () => {
    expect(roundToCents(14.435)).toBe(14.44);
    expect(roundToCents(9.991)).toBe(9.99);
    expect(roundToCents(10)).toBe(10);
  });

  it('rounds a half cent up despite binary floating point', () => {
    // 1.005 * 100 is 100.49999999999999, so the naive form rounds this down.
    expect(roundToCents(1.005)).toBe(1.01);
    expect(roundToCents(8.615)).toBe(8.62);
  });

  it('handles negatives and non-finite input without producing NaN', () => {
    expect(roundToCents(-3.456)).toBe(-3.46);
    expect(roundToCents(Number.POSITIVE_INFINITY)).toBe(0);
    expect(roundToCents(Number.NaN)).toBe(0);
  });
});
