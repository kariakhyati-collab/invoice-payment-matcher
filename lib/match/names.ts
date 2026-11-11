/**
 * Party-name normalisation and similarity.
 *
 * Bank statements rarely spell a customer the way the ledger does:
 * "BRIGHTWATER LOGISTICS" vs "Brightwater Logistics Co.", "Juniper and Vale"
 * vs "Juniper & Vale Interiors". We compare *sets of meaningful tokens* after
 * dropping legal suffixes and punctuation.
 */

const NOISE = new Set([
  "inc", "incorporated", "llc", "ltd", "limited", "co", "company", "corp",
  "corporation", "plc", "pc", "llp", "lp", "gmbh", "pty", "bv", "sa",
  "the", "and", "of",
]);

/** "Halcyon Dental Group, P.C." → ["halcyon", "dental", "group"] */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !NOISE.has(t));
}

/** Stable grouping key for a customer name. */
export function nameKey(name: string): string {
  return nameTokens(name).join(" ");
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  // "botanical" ~ "botanicals", "logistic" ~ "logistics", one-letter typos.
  return a.startsWith(b) || b.startsWith(a) || editDistanceAtMostOne(a, b);
}

/**
 * Token-set similarity in [0, 1].
 *
 * Takes the better of the Dice coefficient and a (slightly discounted)
 * containment score, so "Tidewell Marine" still scores high against
 * "Tidewell Marine Supply". Containment needs at least two shared tokens so a
 * lone generic word ("Supply") cannot match a whole name.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = [...new Set(nameTokens(a))];
  const tb = [...new Set(nameTokens(b))];
  if (ta.length === 0 || tb.length === 0) return 0;
  if (ta.join("") === tb.join("")) return 1; // "Fern Hill" vs "Fernhill"

  const used = new Set<number>();
  let shared = 0;
  for (const x of ta) {
    const idx = tb.findIndex((y, k) => !used.has(k) && tokensMatch(x, y));
    if (idx >= 0) {
      used.add(idx);
      shared++;
    }
  }
  const dice = (2 * shared) / (ta.length + tb.length);
  const containment = shared >= 2 ? shared / Math.min(ta.length, tb.length) : 0;
  return Math.round(Math.max(dice, 0.9 * containment) * 1000) / 1000;
}
