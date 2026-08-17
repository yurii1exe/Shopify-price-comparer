/**
 * Deciding whether a marketplace listing is the same thing as the product.
 *
 * A keyword search returns what the search engine thinks is relevant, which is
 * not the same question as "is this the item whose price I am about to copy".
 * These are the checks a returned listing has to pass before its price is
 * allowed into the array a pricing rule runs over. They work on titles alone,
 * because a title is the only field every marketplace has.
 */

/** Words that carry no identity, so their absence should not sink a match. */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'with',
  'for',
  'of',
  'in',
  'on',
  'by',
  'new',
  'brand',
  'genuine',
  'official',
  'authentic',
  'sealed',
  'free',
  'ship',
  'shipping',
]);

/**
 * Lower-case, split on anything that is not a letter or a digit, drop the
 * stop words. Punctuation is a separator rather than a character, so
 * `6-Cup`, `6 Cup` and `6cup`… well, the first two agree; the third does not,
 * and that is the accepted cost of not carrying a synonym table.
 */
export function tokenise(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/** Normalised form used by the pattern checks below. */
function flatten(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * A listing selling more than one of the item. Its price is a multiple of a
 * unit price and entering it as a unit price moves every rule upward — and
 * "set of 6" is a phrase eBay sellers use constantly.
 */
export function isMultipackTitle(title: string): boolean {
  const flat = flatten(title);
  return [
    /\b(lot|lots|joblot|bundle|bundles|wholesale|dozen|multipack)\b/,
    /\b(set|sets|pack|packs|box|boxes|case|lot|bundle)\s+of\s+\d+/,
    /\b\d+\s*(pack|packs|pk|pcs|pieces|piece|count|ct|units|unit|pairs|pair|sets)\b/,
    /\b\d+\s*x\b/,
    /\bx\s*\d{2,}\b/,
  ].some((pattern) => pattern.test(flat));
}

/**
 * A listing for something that is not a working item — parts, spares, an empty
 * box. The condition filter on the request removes most of these; a seller who
 * lists a broken unit as NEW does not.
 */
export function isSalvageTitle(title: string): boolean {
  const flat = flatten(title);
  return [
    /\bfor parts\b/,
    /\bparts only\b/,
    /\bspares?\b/,
    /\bnot working\b/,
    /\b(broken|faulty|damaged|cracked)\b/,
    /\b(empty )?box only\b/,
    /\bmanual only\b/,
  ].some((pattern) => pattern.test(flat));
}

/** Words that usually name an accessory for a thing rather than the thing. */
const ACCESSORY_WORDS = [
  'case',
  'cover',
  'sleeve',
  'skin',
  'decal',
  'sticker',
  'charger',
  'cable',
  'adapter',
  'adaptor',
  'stand',
  'holder',
  'mount',
  'strap',
  'protector',
  'bag',
  'pouch',
  'manual',
  'filter',
  'filters',
  'lid',
  'battery',
  'batteries',
];

/**
 * A listing that names an accessory the product itself does not name. A cover
 * for a grinder carries every word of "Baratza Encore Grinder" and costs a
 * twentieth of one, so token overlap alone lets it through. If the product is
 * itself a case or a filter its own title says so, and the word stops being a
 * signal.
 */
export function mentionsUnrelatedAccessory(productTitle: string, listingTitle: string): boolean {
  const product = new Set(tokenise(productTitle));
  const listing = new Set(tokenise(listingTitle));
  return ACCESSORY_WORDS.some((word) => listing.has(word) && !product.has(word));
}

/**
 * The share of the product's own tokens the listing carries, 0 to 1.
 *
 * Deliberately one-directional. Marketplace titles are keyword-stuffed —
 * "Baratza Encore Conical Burr Coffee Grinder Black 2 Year Warranty Fast Post"
 * — so requiring the product to carry the listing's tokens would reject the
 * listings that match best.
 */
export function titleCoverage(productTitle: string, listingTitle: string): number {
  const wanted = tokenise(productTitle);
  if (wanted.length === 0) return 0;
  const present = new Set(tokenise(listingTitle));
  const hits = new Set(wanted.filter((token) => present.has(token)));
  return hits.size / new Set(wanted).size;
}

/**
 * How much of the product title a listing has to carry. 0.6 keeps listings
 * that add words and drops listings that only share a brand or a category.
 */
export const DEFAULT_TITLE_MATCH_THRESHOLD = 0.6;

/**
 * Whether this listing's price may be compared with this product's price.
 *
 * An untitled listing fails: there is nothing to check it against, and a price
 * that cannot be attributed to an item is not evidence of anything.
 */
export function isComparableListing(
  productTitle: string,
  listingTitle: string | undefined,
  threshold: number = DEFAULT_TITLE_MATCH_THRESHOLD
): boolean {
  if (!listingTitle || !listingTitle.trim()) return false;
  if (isMultipackTitle(listingTitle)) return false;
  if (isSalvageTitle(listingTitle)) return false;
  if (mentionsUnrelatedAccessory(productTitle, listingTitle)) return false;
  return titleCoverage(productTitle, listingTitle) >= threshold;
}
