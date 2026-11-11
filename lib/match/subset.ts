/**
 * Bounded subset-sum search over a customer's open invoices.
 *
 * Values are positive integer cents and are expected in priority order
 * (oldest invoice first). The search is depth-first with a remaining-sum
 * prune and a hard node budget, so a customer with many open invoices can
 * never freeze the browser — it simply returns the best answer found so far.
 */

export interface SubsetSearchOptions {
  /** Smallest subset size to accept. */
  minSize?: number;
  /** Stop after this many search nodes. */
  maxNodes?: number;
  /** Stop after collecting this many exact solutions. */
  maxResults?: number;
}

function compareSubsets(a: number[], b: number[]): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * All index subsets whose values sum exactly to `target`, best first
 * (fewest items, then oldest items).
 */
export function findExactSubsets(
  values: readonly number[],
  target: number,
  { minSize = 1, maxNodes = 50_000, maxResults = 5 }: SubsetSearchOptions = {},
): number[][] {
  const n = values.length;
  const suffix = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + values[i];

  const results: number[][] = [];
  const picked: number[] = [];
  let nodes = 0;

  const dfs = (start: number, remaining: number): void => {
    if (++nodes > maxNodes || results.length >= maxResults) return;
    if (remaining === 0) {
      if (picked.length >= minSize) results.push([...picked]);
      return;
    }
    if (remaining < 0 || suffix[start] < remaining) return;
    for (let i = start; i < n; i++) {
      if (values[i] > remaining) continue;
      picked.push(i);
      dfs(i + 1, remaining - values[i]);
      picked.pop();
      if (nodes > maxNodes || results.length >= maxResults) return;
    }
  };

  dfs(0, target);
  return results.sort(compareSubsets);
}

/**
 * The subset with the largest sum not exceeding `cap` (ties → fewer items,
 * then oldest). Returns `[]` when nothing fits.
 */
export function bestFitSubset(
  values: readonly number[],
  cap: number,
  { maxNodes = 50_000 }: Pick<SubsetSearchOptions, "maxNodes"> = {},
): number[] {
  const n = values.length;
  let best: number[] = [];
  let bestSum = 0;
  const picked: number[] = [];
  let nodes = 0;

  const dfs = (start: number, sum: number): void => {
    if (++nodes > maxNodes) return;
    if (sum > bestSum || (sum === bestSum && sum > 0 && compareSubsets(picked, best) < 0)) {
      best = [...picked];
      bestSum = sum;
    }
    if (bestSum === cap) return;
    for (let i = start; i < n; i++) {
      if (sum + values[i] > cap) continue;
      picked.push(i);
      dfs(i + 1, sum + values[i]);
      picked.pop();
      if (nodes > maxNodes || bestSum === cap) return;
    }
  };

  dfs(0, 0);
  return best;
}
