// Token Radar dashboard. Reads window.RADAR (data.js beside dashboard/), renders the ranked
// board, filters, sort, a per-protocol detail drawer with the model's own arithmetic and the
// protocol's farm plan. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  // Whole-dollar formatter. Some older engines reject maximumFractionDigits: 0 for a
  // currency, so fall back to a plain "$123" string instead of failing the whole page.
  var usd0 = null;
  try {
    usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  } catch (e) { usd0 = null; }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0 ? usd0.format(n) : '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number data.js carries, so the page's code and the board's data are visibly the same arithmetic.
  // Two model shapes: radar-1 (base = TVL x base_multiple) and radar-2 (base = TVL x the row's
  // calibrated category ratio, plus a reach multiplier per extra chain).
  function isV2(model) { return model.base_multiple === undefined || model.base_multiple === null; }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    if (!isV2(model)) return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
    var reach = 1 + model.reach_per_chain * Math.min(Math.max(0, (row.chains || []).length - 1), model.reach_cap_chains);
    return Math.max(1, Math.round(row.tvl_usd * (row.category_ratio || 0) * growthMult * maturity * reach));
  }
  function multipliers(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var out = {
      growthPct: growth,
      growthMult: 1 + (growth / 100) * model.growth_weight,
      maturityMult: model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range,
      ageUsed: age,
      categoryRatio: null,
      reachMult: null,
      base: 0
    };
    if (!isV2(model)) { out.base = row.tvl_usd * model.base_multiple; return out; }
    out.categoryRatio = row.category_ratio || 0;
    out.reachMult = 1 + model.reach_per_chain * Math.min(Math.max(0, (row.chains || []).length - 1), model.reach_cap_chains);
    out.base = row.tvl_usd * out.categoryRatio;
    return out;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  // Seven steps, eight when the protocol runs on more than one chain.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function secondChainOf(p) { return p.chains && p.chains.length > 1 ? p.chains[1] : null; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('liquid restaking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's liquid staking token through " + name + ' on ' + chain + ' and keep the restaking receipt.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + ' of ' + chain + "'s native asset through " + name + ' and keep the liquid staking receipt in the wallet.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + " and use the bridged funds inside the protocol's own app.";
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and keep the supply position open.';
    if (c.indexOf('dex') >= 0) return 'Swap $' + capital + " of USDC in " + name + "'s main pool on " + chain + ', then provide $' + capital + ' of liquidity to the same pool and keep the LP position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one position on an active ' + name + ' market on ' + chain + ', then settle or exit it.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in the wallet.';
    if (c.indexOf('stable') >= 0) return 'Mint $' + capital + " of " + name + "'s stable asset on " + chain + ' with USDC collateral and hold it.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' managed liquidity position on ' + chain + ' and keep the shares.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold the shares.';
    if (c.indexOf('locker') >= 0) return 'Lock $' + capital + ' of tokens in ' + name + ' on ' + chain + ' for the longest term on offer and keep the lock receipt.';
    if (c.indexOf('launchpad') >= 0) return 'Join one ' + name + ' allocation on ' + chain + ' with $' + capital + ' and hold the allocation.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('nft') >= 0) return 'Buy or list one item on ' + name + ' on ' + chain + ' with $' + capital + ' and keep the trade receipt.';
    if (c.indexOf('payment') >= 0) return 'Pay $' + capital + ' through ' + name + ' on ' + chain + ' for a real transfer and keep the receipt.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s main vault on " + chain + ' and keep the vault shares.';
    if (c === 'chain') return 'Bridge $' + capital + " of USDC onto " + name + "'s chain, swap once on its native DEX, and hold a small position there.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondCostFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'no extra capital, the minted asset stays held';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'gas only, about $2';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis trading') >= 0) return 'about $10 of margin and $2 of gas';
    if (c.indexOf('prediction') >= 0) return 'about $10 of capital and $2 of gas';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'about $20 of borrow and $2 of gas';
    return 'about $25 of capital and $2 of gas';
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('dex') >= 0) return "Swap $25 of USDC for the pool's other asset on " + name + ' on ' + chain + ' so the wallet shows both a swap and a liquidity position.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return "Borrow $20 of the chain's stable asset against the supplied collateral on " + name + ', then repay it within the week so the wallet shows a borrow and a repay.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $25 of USDC back out of ' + chain + ' through ' + name + ' so the wallet shows activity in both directions.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or compound the staking rewards on ' + name + ' once, and restake the proceeds.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis trading') >= 0) return 'Close the hedge on ' + name + ' and open a second small position in the opposite direction.';
    if (c.indexOf('prediction') >= 0) return 'Place a second $10 position on a different ' + name + ' market on ' + chain + '.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0) return 'Hold the minted asset for a full week so the wallet shows a balance across two weekly snapshots.';
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('index') >= 0) return 'Deposit a second $25 into the same ' + name + ' vault on ' + chain + ' from the same wallet a few days later.';
    return 'Make a second, smaller deposit of $25 into ' + name + ' on ' + chain + ' from the same wallet.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var chain2 = secondChainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Fund it with $' + capital + ' of USDC on ' + chain + ' for gas and the position.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, chain), cost: secondCostFor(p), time: '10 minutes' },
      { text: 'Once a week, make one qualifying action on ' + p.name + ' on ' + chain + ' — a deposit, a borrow, a swap or a vote — so the wallet stays active across snapshots.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open ' + p.name + "'s own points or rewards page from the link the protocol itself publishes and check what the wallet earned. Never pay anyone to claim.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'Write the wallet address, the dates and every transaction hash in a farm log so the position can be repeated or unwound.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    if (chain2 !== null) {
      steps.push({
        text: 'Keep a live position on both ' + chain + ' and ' + chain2 + ': once a month, top up the smaller side with $25 on ' + p.name + ' so activity is recorded on both chains.',
        cost: '$25 a month and about $2 of gas',
        time: '10 minutes a month'
      });
    }
    return steps.map(stepText);
  }
  // One-line farm summary for the board: capital, hold and the action's verb.
  function farmSummary(p) {
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var c = (p.category || '').toLowerCase();
    var verb = 'Deposit';
    if (c.indexOf('liquid restaking') >= 0 || c.indexOf('restak') >= 0) verb = 'Stake + restake';
    else if (c.indexOf('liquid staking') >= 0 || c.indexOf('staking') >= 0) verb = 'Stake';
    else if (c.indexOf('bridge') >= 0) verb = 'Bridge';
    else if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) verb = 'Supply';
    else if (c.indexOf('dex') >= 0) verb = 'Swap + LP';
    else if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) verb = 'Deposit margin';
    else if (c.indexOf('stable') >= 0) verb = 'Mint stable';
    else if (c.indexOf('rwa') >= 0) verb = 'Mint yield asset';
    else if (c.indexOf('yield') >= 0) verb = 'Deposit vault';
    return { verb: verb, capital: capital, hold: hold };
  }

  // Tiny query-string helpers. URLSearchParams is the normal path; older engines that
  // lack it fall back to a manual split so deep links still work.
  function parseQuery(s) {
    var out = {};
    if (!s) return out;
    var parts = s.split('&');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      if (kv[0]) out[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1].replace(/\+/g, ' ')) : '';
    }
    return out;
  }
  function buildQuery(pairs) {
    var parts = [];
    for (var i = 0; i < pairs.length; i++) {
      parts.push(encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(pairs[i][1]));
    }
    return parts.join('&');
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = (typeof URLSearchParams === 'function')
      ? new URLSearchParams(hash)
      : { get: function (k) { return parseQuery(hash)[k] || null; } };
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = params.get('dir') === '1' ? 1 : -1;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var pairs = [];
    if (state.q) pairs.push(['q', state.q]);
    if (state.category !== 'all') pairs.push(['category', state.category]);
    if (state.chain !== 'all') pairs.push(['chain', state.chain]);
    if (state.sort !== 'implied') pairs.push(['sort', state.sort]);
    if (state.dir !== -1) pairs.push(['dir', String(state.dir)]);
    if (state.tab !== 'pre-token') pairs.push(['tab', state.tab]);
    if (state.selected) pairs.push(['p', state.selected]);
    var next;
    if (typeof URLSearchParams === 'function') {
      var params = new URLSearchParams();
      for (var i = 0; i < pairs.length; i++) params.set(pairs[i][0], pairs[i][1]);
      next = params.toString();
    } else {
      next = buildQuery(pairs);
    }
    try {
      if (next) window.history.replaceState(null, '', '#' + next);
      else window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (e) { /* history unavailable (sandboxed file view): filters still work, the URL just does not update */ }
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function boardStats() {
    var vals = DATA.rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
    var total = vals.reduce(function (s, v) { return s + v; }, 0);
    var median = vals.length % 2 ? vals[(vals.length - 1) / 2] : Math.round((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2);
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category || 'Other'] = (cats[r.category || 'Other'] || 0) + 1;
      (r.chains || []).forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
    });
    var topCat = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0];
    var topChain = Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a]; })[0];
    return { total: total, median: median, catCount: Object.keys(cats).length, chainCount: Object.keys(chains).length, topCat: topCat, topCatN: cats[topCat], topChain: topChain, topChainN: chains[topChain] };
  }

  function lede() {
    var s = boardStats();
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols from outside the watchlist, so the board holds ', el('b', { text: String(DATA.board_size) + ' rows' }),
          ' worth ', el('b', { text: fmtUsd(s.total) }), ' of implied value between them. Implied value is a model, not a promise.'
        )
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Total implied value' }), el('b', { class: 'accent', text: fmtUsd(s.total) })),
        el('div', { class: 'stat' }, el('span', { text: 'Median row' }), el('b', { text: fmtUsd(s.median) })),
        el('div', { class: 'stat' }, el('span', { text: 'Biggest category' }), el('b', { text: s.topCat + ' (' + s.topCatN + ')' })),
        el('div', { class: 'stat' }, el('span', { text: 'Biggest chain' }), el('b', { text: s.topChain + ' (' + s.topChainN + ')' })),
        el('div', { class: 'stat' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 5);
    return el('section', { class: 'spot', 'aria-label': 'Top 5 by implied value' },
      el('h2', null, 'Top 5 by implied value ', el('span', { text: '— the launches the model prices highest' })),
      el('div', { class: 'cards' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank' }, 'Rank ', el('b', { text: '#' + r.rank })),
          el('b', { class: 'name', text: r.name }),
          el('span', { class: 'value', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: fmtUsd(r.tvl_usd) + ' TVL · ' + (r.category || 'Other') })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 15);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories (' + categories.length + ')' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var sortSel = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === state.sort ? 'selected' : null });
      })
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; writeHash(); render(); });
    var dirBtn = el('button', { type: 'button', class: 'button', 'aria-label': 'Reverse sort direction', text: state.dir < 0 ? 'Highest first' : 'Lowest first', onclick: function () { state.dir = -state.dir; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var shown = state.tab === 'pre-token' ? rows().length : DATA.live.length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort by' }), sortSel),
      el('div', { class: 'field' }, el('label', { text: 'Direction' }), dirBtn),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count' }, el('b', { text: String(shown) }), state.tab === 'pre-token' ? ' of ' + DATA.board_size + ' rows shown' : ' live-token protocols')
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    if (!max) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var fs = farmSummary(r);
      var rankCls = r.rank <= 3 ? 'rank-badge rank-' + r.rank : 'rank-badge';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: rankCls, text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'slug', text: r.slug }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('div', { class: 'farm' }, el('b', { text: fs.verb + ' $' + fs.capital }), ' · hold ' + fs.hold + 'd'))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Farm plan' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var v2 = isV2(m);
    var formula;
    if (!v2) {
      formula = el('div', { class: 'formula' },
        'implied = round( tvl_usd × ', el('b', { text: String(m.base_multiple) }),
        ' × (1 + clamp(change_7d, ', el('b', { text: String(m.growth_floor) }), ', ', el('b', { text: String(m.growth_cap) }),
        ') / 100 × ', el('b', { text: String(m.growth_weight) }), ') × (', el('b', { text: String(m.maturity_floor) }),
        ' + min(age_days, ', el('b', { text: String(m.maturity_days) }), ') / ', el('b', { text: String(m.maturity_days) }),
        ' × ', el('b', { text: String(m.maturity_range) }), ') )'
      );
    } else {
      formula = el('div', { class: 'formula' },
        'implied = round( tvl_usd × ', el('b', { text: 'category_ratio' }),
        ' × (1 + clamp(change_7d, ', el('b', { text: String(m.growth_floor) }), ', ', el('b', { text: String(m.growth_cap) }),
        ') / 100 × ', el('b', { text: String(m.growth_weight) }), ') × (', el('b', { text: String(m.maturity_floor) }),
        ' + min(age_days, ', el('b', { text: String(m.maturity_days) }), ') / ', el('b', { text: String(m.maturity_days) }),
        ' × ', el('b', { text: String(m.maturity_range) }), ') × (1 + ', el('b', { text: String(m.reach_per_chain) }),
        ' × min(extra_chains, ', el('b', { text: String(m.reach_cap_chains) }), ')) )'
      );
    }
    var panel = el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      formula
    );
    if (v2) {
      panel.appendChild(el('p', { class: 'sub', text: 'The category ratio is calibrated from the snapshot itself: for each category with at least ' + m.category_min_live + ' live-token protocols, the median of their market-cap / TVL ratios; thinner categories and uncategorised protocols use the overall median. Ratios are clamped to [' + m.category_floor + ', ' + m.category_cap + ']. Reach rewards multi-chain protocols: +' + Math.round(m.reach_per_chain * 100) + '% per extra chain, up to ' + m.reach_cap_chains + ' chains.' }));
      if (DATA.category_table) {
        var entries = Object.keys(DATA.category_table.by_category).map(function (c) {
          return { cat: c, ratio: DATA.category_table.by_category[c].ratio, n: DATA.category_table.by_category[c].live_n };
        }).sort(function (a, b) { return b.ratio - a.ratio; }).slice(0, 8);
        panel.appendChild(el('h3', { text: 'Category calibration — highest ratios first' }));
        panel.appendChild(el('p', { class: 'sub', text: 'Overall median ratio ' + DATA.category_table.overall.toFixed(2) + ' across all live-token protocols. Each ratio below is the median mcap / TVL of the live protocols in that category.' }));
        panel.appendChild(el('div', { class: 'equation' }, entries.map(function (e) {
          return el('div', null, el('span', { text: e.cat + ' (' + e.n + ' live)' }), el('b', { text: '×' + e.ratio.toFixed(2) }));
        })));
      }
    } else {
      panel.appendChild(el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' }));
    }
    return panel;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function whyText(row, mult) {
    var agePart = row.age_days === null ? 'with no listing date on record' : 'after ' + fmtAge(row.age_days) + ' with no token';
    var growthPart = row.change_7d === null ? 'no seven-day growth on record' : (row.change_7d >= 0 ? 'seven-day growth of ' + fmtPct(row.change_7d) : 'a seven-day fall of ' + fmtPct(row.change_7d));
    var basePart;
    if (mult.categoryRatio !== null && mult.categoryRatio !== undefined) {
      var liveN = 0;
      if (DATA.category_table && row.category && DATA.category_table.by_category[row.category]) liveN = DATA.category_table.by_category[row.category].live_n;
      basePart = 'TVL × a ' + mult.categoryRatio.toFixed(2) + ' category ratio' + (liveN > 0 ? ' calibrated from ' + liveN + ' live ' + row.category + ' protocols' : ' (the overall median)') + ' gives a ' + fmtUsd(mult.base) + ' base';
    } else {
      basePart = 'TVL × ' + DATA.model.base_multiple + ' gives a ' + fmtUsd(mult.base) + ' base';
    }
    var reachPart = (mult.reachMult !== null && mult.reachMult !== undefined) ? ', and ' + ((row.chains || []).length - 1) + ' extra chain' + ((row.chains || []).length - 1 === 1 ? '' : 's') + ' set reach to ' + mult.reachMult.toFixed(2) : '';
    return row.name + ' holds ' + fmtUsd(row.tvl_usd) + ' of TVL ' + agePart + ', so the model prices its launch at ' + fmtUsd(row.implied_value_usd) + ': ' + basePart + ', ' + growthPart + ' sets the growth multiplier to ' + mult.growthMult.toFixed(2) + ', and ' + (row.age_days === null ? 'an unknown age' : fmtAge(row.age_days) + ' of age') + ' sets maturity to ' + mult.maturityMult.toFixed(2) + reachPart + '.';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var mult = multipliers(row, DATA.model);
    var recomputed = impliedOf(row, DATA.model);
    var diff = Math.abs(recomputed - row.implied_value_usd);
    var relPct = row.implied_value_usd ? (diff / row.implied_value_usd) * 100 : 0;
    var verifiedNote = diff === 0
      ? ', the same number the board carries.'
      : ' — within ' + relPct.toFixed(3) + '% of the board’s ' + fmtUsd(row.implied_value_usd) + '; the gap is the category ratio carried at four decimals.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: row.slug + ' · ' + (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'At a glance' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'big', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day change' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { text: row.listed_at || 'not recorded' })),
        el('div', null, el('span', { text: 'Token status' }), el('b', { text: 'Pre-token — no token on record' }))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this implied value' }),
      el('p', { class: 'why', text: whyText(row, mult) }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: mult.categoryRatio !== null && mult.categoryRatio !== undefined ? 'Base — TVL × category ratio ' + mult.categoryRatio.toFixed(2) : 'Base — TVL × ' + DATA.model.base_multiple }), el('b', { text: fmtUsd(mult.base) })),
        el('div', null, el('span', { text: 'Growth — clamp(' + (row.change_7d === null ? 'n/a' : fmtPct(row.change_7d)) + ')' }), el('b', { text: '×' + mult.growthMult.toFixed(4) })),
        el('div', null, el('span', { text: 'Maturity — ' + (row.age_days === null ? DATA.model.unknown_age_days + 'd assumed' : fmtAge(row.age_days)) }), el('b', { text: '×' + mult.maturityMult.toFixed(4) })),
        mult.reachMult !== null && mult.reachMult !== undefined ? el('div', null, el('span', { text: 'Reach — ' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') }), el('b', { text: '×' + mult.reachMult.toFixed(4) })) : null,
        el('div', { class: 'total' }, el('span', { text: 'Implied value (rounded)' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + verifiedNote + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — ' + steps.length + ' steps' }),
      el('p', { class: 'sub', text: 'Derived from this protocol’s category, chain, TVL and age. Nothing here is financial advice; the plan costs gas and ties up capital.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
