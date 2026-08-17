import {
  isComparableListing,
  isMultipackTitle,
  isSalvageTitle,
  mentionsUnrelatedAccessory,
  titleCoverage,
  tokenise,
} from '../src/infrastructure/external-apis/titleMatch';

describe('tokenise', () => {
  it('lower-cases, splits on punctuation and drops words that carry no identity', () => {
    expect(tokenise('Baratza Encore  Grinder — Brand New, Sealed!')).toEqual(['baratza', 'encore', 'grinder']);
  });

  it('keeps digits, because a model number is most of what identifies a product', () => {
    expect(tokenise('Hario V60 Ceramic Dripper 02')).toEqual(['hario', 'v60', 'ceramic', 'dripper', '02']);
  });

  it('returns nothing for a title with no words in it', () => {
    expect(tokenise('   ---  ')).toEqual([]);
  });
});

describe('titleCoverage', () => {
  it('is 1 when the listing carries every word of the product title', () => {
    expect(titleCoverage('Baratza Encore Grinder', 'Baratza Encore Coffee Grinder Black 2024 Fast Post')).toBe(1);
  });

  it('does not punish a listing for the extra words marketplace titles are full of', () => {
    const stuffed = 'BARATZA ENCORE CONICAL BURR COFFEE GRINDER - BRAND NEW IN BOX - FREE SHIPPING';
    expect(titleCoverage('Baratza Encore Grinder', stuffed)).toBe(1);
  });

  it('falls as the listing shares less of the product', () => {
    expect(titleCoverage('Baratza Encore Grinder', 'Baratza Virtuoso Burr Mill')).toBeCloseTo(1 / 3, 5);
  });

  it('is 0 for a product title with nothing to match on', () => {
    expect(titleCoverage('   ', 'Baratza Encore Grinder')).toBe(0);
  });
});

describe('isMultipackTitle', () => {
  it.each([
    'Baratza Encore Grinder Set of 6',
    'Lot of 3 Coffee Grinders',
    'Job Lot Coffee Filters',
    'Coffee Filters 100 Pack',
    'Coffee Filters 4-pack',
    '12x Paper Filters',
    'Wholesale Coffee Grinders',
    'Chemex Filters 100 pcs',
  ])('%s is a multipack', (title) => {
    expect(isMultipackTitle(title)).toBe(true);
  });

  it.each(['Baratza Encore Grinder', 'Chemex 6-Cup Coffee Maker', 'Hario V60 Ceramic Dripper 02'])(
    '%s is a single unit',
    (title) => {
      expect(isMultipackTitle(title)).toBe(false);
    }
  );
});

describe('isSalvageTitle', () => {
  it.each([
    'Baratza Encore Grinder for parts not working',
    'Baratza Encore Grinder - spares or repair',
    'Chemex Coffee Maker BROKEN cracked glass',
    'Fellow Stagg EKG Kettle box only',
  ])('%s is not a working unit', (title) => {
    expect(isSalvageTitle(title)).toBe(true);
  });

  it('leaves an ordinary listing alone', () => {
    expect(isSalvageTitle('Fellow Stagg EKG Electric Kettle Matte Black')).toBe(false);
  });
});

describe('mentionsUnrelatedAccessory', () => {
  it('catches a cover sold for the product', () => {
    expect(mentionsUnrelatedAccessory('Baratza Encore Grinder', 'Dust Cover for Baratza Encore Grinder')).toBe(true);
  });

  it('does not fire when the product is itself that accessory', () => {
    expect(mentionsUnrelatedAccessory('Chemex Coffee Filters', 'Chemex Bonded Coffee Filters Natural')).toBe(false);
    expect(mentionsUnrelatedAccessory('Baratza Dust Cover', 'Baratza Dust Cover Grey')).toBe(false);
  });
});

describe('isComparableListing', () => {
  const PRODUCT = 'Baratza Encore Grinder';

  it('accepts the same item under a longer title', () => {
    expect(isComparableListing(PRODUCT, 'Baratza Encore Conical Burr Coffee Grinder - Black')).toBe(true);
  });

  it.each([
    ['a different model from the same brand', 'Baratza Virtuoso Burr Mill'],
    ['a multipack', 'Baratza Encore Grinder Set of 6'],
    ['salvage', 'Baratza Encore Grinder for parts'],
    ['an accessory', 'Replacement Hopper Lid for Baratza Encore Grinder'],
    ['an empty title', '   '],
  ])('rejects %s', (_case, listingTitle) => {
    expect(isComparableListing(PRODUCT, listingTitle)).toBe(false);
  });

  it('rejects a listing with no title at all', () => {
    expect(isComparableListing(PRODUCT, undefined)).toBe(false);
  });

  it('takes the threshold as an argument', () => {
    expect(isComparableListing(PRODUCT, 'Baratza Virtuoso Burr Mill', 0.3)).toBe(true);
  });
});
