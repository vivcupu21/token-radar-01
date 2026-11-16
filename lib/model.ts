// The token radar's model, version radar-2: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other rankable pre-token protocol the snapshot carries: the early rows the radar exists to find.
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol);
// the snapshot's live-token protocols are kept apart and shown as the market's own values, never
// mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures. The formula, in full:
//
//   categoryRatio(c) = median over the snapshot's live-token protocols in category c of
//                      (mcap_usd / tvl_usd), when that category has at least
//                      CATEGORY_MIN_LIVE live protocols; otherwise the overall median over all
//                      live-token protocols. Clamped to [CATEGORY_FLOOR, CATEGORY_CAP].
//                      (On this snapshot the overall median is ~0.21, close to the house
//                      model's flat 0.25, so the scale is comparable; the category spread is
//                      the market's own verdict: bridge and DEX tokens trade rich against TVL,
//                      lending and liquid-staking tokens trade thin. Market cap, not FDV, is the
//                      observable figure, so the estimate is a conservative lower bound.)
//   base             = tvl_usd x categoryRatio(c)
//   growth           = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) per cent; null growth is 0.
//                      (The clamp binds hard: one protocol in the snapshot reports +4,448% in
//                      seven days, and a single week must never crown the board.)
//   growthMult       = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity         = MATURITY_FLOOR + min(age_days, MATURITY_DAYS) / MATURITY_DAYS
//                        x MATURITY_RANGE   (age_days unknown: UNKNOWN_AGE_DAYS)
//                      A protocol that has run for years with no token has survived more chances
//                      to launch one; a brand-new protocol has not.
//   reach            = 1 + REACH_PER_CHAIN x min(chains - 1, REACH_CAP_CHAINS)
//                      Each extra chain is another user base and another surface a launch can
//                      reach; the tenth extra chain adds as much as the first does not.
//   implied          = max(1, round(base x growthMult x maturity x reach))
//
// No protocol name is ever special-cased: the same function scores every row, and the category
// table is computed from the snapshot itself at run time, never hard-coded.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants. The category table is not one of them: it is computed from the snapshot. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  category_min_live: number;
  category_floor: number;
  category_cap: number;
  reach_per_chain: number;
  reach_cap_chains: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  category_min_live: 3,
  category_floor: 0.05,
  category_cap: 1.25,
  reach_per_chain: 0.05,
  reach_cap_chains: 10,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries. A large cap so
 * the board holds every rankable protocol the snapshot carries, not just the largest few. */
export const EARLY_ROWS = 1000;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's calibrated ratio: the median mcap/TVL of its live-token protocols. */
export interface CategoryRatio {
  ratio: number;
  live_n: number;
}

/** The category table, computed from the snapshot's own live-token protocols. */
export interface CategoryTable {
  overall: number;
  by_category: Record<string, CategoryRatio>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_ratio: number;
    category_live_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    reach_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_ratio: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  category_table: CategoryTable;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The middle value of a sorted array, or the mean of the two middle values. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The category table, calibrated from the snapshot's own live-token protocols: for each category
 * with at least `model.category_min_live` live protocols, the median of their mcap/TVL ratios;
 * the overall median across every live-token protocol is the fallback for thin categories and
 * for protocols with no category. Both are clamped to [category_floor, category_cap].
 */
export function categoryRatios(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryTable {
  const live = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of live) {
    const r = (p.mcap_usd as number) / p.tvl_usd;
    all.push(r);
    const key = p.category ?? '';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [r]);
    else list.push(r);
  }
  all.sort((a, b) => a - b);
  const clamp = (v: number): number => Math.min(model.category_cap, Math.max(model.category_floor, v));
  const overall = all.length > 0 ? clamp(median(all)) : 0.25;
  const by_category: Record<string, CategoryRatio> = {};
  for (const [key, ratios] of [...byCategory.entries()].sort()) {
    if (key === '' || ratios.length < model.category_min_live) continue;
    ratios.sort((a, b) => a - b);
    by_category[key] = { ratio: clamp(median(ratios)), live_n: ratios.length };
  }
  return { overall, by_category };
}

/** The TVL multiple one category's protocols get: its calibrated ratio, else the overall median. */
export function ratioFor(category: string | null, table: CategoryTable): { ratio: number; live_n: number } {
  if (category === null) return { ratio: table.overall, live_n: 0 };
  const entry = table.by_category[category];
  if (entry === undefined) return { ratio: table.overall, live_n: 0 };
  return { ratio: entry.ratio, live_n: entry.live_n };
}

/** The four multipliers and the implied value one protocol gets under `model` and `table`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  table: CategoryTable,
  model: ModelConstants = MODEL,
): {
  implied: number;
  categoryRatio: number;
  categoryLiveN: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  reachMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { ratio: categoryRatio, live_n: categoryLiveN } = ratioFor(protocol.category, table);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.max(0, protocol.chains.length - 1);
  const reachMult = 1 + model.reach_per_chain * Math.min(extraChains, model.reach_cap_chains);
  const base = protocol.tvl_usd * categoryRatio;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * reachMult));
  return { implied, categoryRatio, categoryLiveN, growthPct, growthMult, maturityMult, reachMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * The categories whose product is a bridge, not a protocol waiting on a launch of its own: a
 * bridge moves a token that already trades, it does not issue one.
 */
const BRIDGE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge']);

/** An exchange's name, used as the start of a product's name: Binance staked ETH is ETH. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a name carries a whole word `wrapped`, `staked` or `staking`. */
function hasWrappedWord(name: string): boolean {
  return /\bwrapped\b|\bstaked\b|\bstaking\b/i.test(name);
}

/**
 * Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool,
 * and not a wrapped, staked or bridged product of a token that already trades. WBTC is Bitcoin on
 * Ethereum, Binance staked ETH is ETH in Binance's staking product, and neither is a protocol still
 * waiting on a launch of its own — the watchlist's own rule, applied here to the early rows too,
 * because the snapshot's ten fields cannot tell a wrapped product from a protocol by themselves.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX' || BRIDGE_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (hasWrappedWord(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((prefix) => p.name.startsWith(prefix))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const table = categoryRatios(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every rankable pre-token protocol outside the watchlist, by TVL — the
  // protocols below the floor, and the ones above it the watchlist leaves out (the list's
  // parent-protocol rule is not one of the snapshot's ten fields, so a protocol the list leaves
  // out is still a subject: the list is a floor, never a ceiling). Never a replacement for a
  // watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, table, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_ratio: round4(s.v.categoryRatio),
      category_live_n: s.v.categoryLiveN,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      reach_multiplier: round4(s.v.reachMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, or null. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('liquid restaking') || c.includes('restak')) return `Stake $${capital} of the chain's liquid staking token through ${name} on ${chain} and keep the restaking receipt.`;
  if (c.includes('liquid staking') || c.includes('staking')) return `Stake $${capital} of ${chain}'s native asset through ${name} and keep the liquid staking receipt in the wallet.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name} and use the bridged funds inside the protocol's own app.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and keep the supply position open.`;
  if (c.includes('dex')) return `Swap $${capital} of USDC in ${name}'s main pool on ${chain}, then provide $${capital} of liquidity to the same pool and keep the LP position open.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis trading')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one position on an active ${name} market on ${chain}, then settle or exit it.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the wallet.`;
  if (c.includes('stable')) return `Mint $${capital} of ${name}'s stable asset on ${chain} with USDC collateral and hold it.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into a ${name} managed liquidity position on ${chain} and keep the shares.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold the shares.`;
  if (c.includes('locker')) return `Lock $${capital} of tokens in ${name} on ${chain} for the longest term on offer and keep the lock receipt.`;
  if (c.includes('launchpad')) return `Join one ${name} allocation on ${chain} with $${capital} and hold the allocation.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('nft')) return `Buy or list one item on ${name} on ${chain} with $${capital} and keep the trade receipt.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} for a real transfer and keep the receipt.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the vault shares.`;
  if (c === 'chain') return `Bridge $${capital} of USDC onto ${name}'s chain, swap once on its native DEX, and hold a small position there.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** What the second action costs: a hold costs nothing extra, a swap or a borrow costs its own amount. */
function secondCostFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('rwa') || c.includes('stable')) return 'no extra capital, the minted asset stays held';
  if (c.includes('staking') || c.includes('restak')) return 'gas only, about $2';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis trading')) return 'about $10 of margin and $2 of gas';
  if (c.includes('prediction')) return 'about $10 of capital and $2 of gas';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'about $20 of borrow and $2 of gas';
  return 'about $25 of capital and $2 of gas';
}

/** The category's second, complementary action: a different touch on the same protocol. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex')) return `Swap $25 of USDC for the pool's other asset on ${name} on ${chain} so the wallet shows both a swap and a liquidity position.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $20 of the chain's stable asset against the supplied collateral on ${name}, then repay it within the week so the wallet shows a borrow and a repay.`;
  if (c.includes('bridge')) return `Bridge $25 of USDC back out of ${chain} through ${name} so the wallet shows activity in both directions.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim or compound the staking rewards on ${name} once, and restake the proceeds.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('basis trading')) return `Close the hedge on ${name} and open a second small position in the opposite direction.`;
  if (c.includes('prediction')) return `Place a second $10 position on a different ${name} market on ${chain}.`;
  if (c.includes('rwa') || c.includes('stable')) return `Hold the minted asset for a full week so the wallet shows a balance across two weekly snapshots.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager') || c.includes('index')) return `Deposit a second $25 into the same ${name} vault on ${chain} from the same wallet a few days later.`;
  return `Make a second, smaller deposit of $25 into ${name} on ${chain} from the same wallet.`;
}

/**
 * A protocol's farm plan: seven steps, eight when it runs on more than one chain. Every step is
 * derived from the protocol's own record (name, category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const chain2 = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with $${capital} of USDC on ${chain} for gas and the position.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: secondCostFor(p),
      time: '10 minutes',
    },
    {
      text: `Once a week, make one qualifying action on ${p.name} on ${chain} — a deposit, a borrow, a swap or a vote — so the wallet stays active across snapshots.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page from the link the protocol itself publishes and check what the wallet earned. Never pay anyone to claim.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the dates and every transaction hash in a farm log so the position can be repeated or unwound.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  if (chain2 !== null) {
    steps.push({
      text: `Keep a live position on both ${chain} and ${chain2}: once a month, top up the smaller side with $25 on ${p.name} so activity is recorded on both chains.`,
      cost: '$25 a month and about $2 of gas',
      time: '10 minutes a month',
    });
  }
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_ratio: row.model.category_ratio,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    reach_multiplier: row.model.reach_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const table = categoryRatios(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    category_table: table,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
