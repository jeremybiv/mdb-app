import { rcGet, rcSet } from './redisCache.js';

// Tarifs claude-sonnet-4-5 en $ par token
const RATES = {
  'claude-sonnet-4-5': {
    input:        3.00  / 1_000_000,
    output:       15.00 / 1_000_000,
    cache_read:   0.30  / 1_000_000,
    cache_write:  3.75  / 1_000_000,
  },
  'claude-haiku-4-5-20251001': {
    input:        0.80  / 1_000_000,
    output:       4.00  / 1_000_000,
    cache_read:   0.08  / 1_000_000,
    cache_write:  1.00  / 1_000_000,
  },
};

const TTL_1Y  = 365 * 24 * 60 * 60;

export function computeCost(model, usage) {
  const r = RATES[model] || RATES['claude-sonnet-4-5'];
  return (
    (usage.input_tokens               || 0) * r.input  +
    (usage.output_tokens              || 0) * r.output +
    (usage.cache_read_input_tokens    || 0) * r.cache_read  +
    (usage.cache_creation_input_tokens|| 0) * r.cache_write
  );
}

function userKey(email) {
  return `usage:cost:${email}`;
}

export async function getUserBudget(email) {
  const maxUsd = parseFloat(process.env.MAX_BUDGET_USD_PER_USER || '0') || Infinity;
  const data   = (await rcGet(userKey(email))) || { totalUsd: 0, calls: [] };
  return {
    totalUsd:  data.totalUsd,
    calls:     data.calls,
    maxUsd:    maxUsd === Infinity ? null : maxUsd,
    remaining: maxUsd === Infinity ? null : Math.max(0, maxUsd - data.totalUsd),
    exceeded:  maxUsd !== Infinity && data.totalUsd >= maxUsd,
  };
}

/**
 * Enregistre le coût d'un appel Claude (fire-and-forget).
 * Retourne le coût en $ calculé.
 */
export function trackCost(email, model, usage, endpoint) {
  const cost = computeCost(model, usage);

  rcGet(userKey(email)).then(data => {
    const d = data || { totalUsd: 0, calls: [] };
    d.totalUsd = parseFloat((d.totalUsd + cost).toFixed(6));
    d.calls.push({
      endpoint,
      model,
      costUsd:  parseFloat(cost.toFixed(6)),
      inputTok: (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0),
      outputTok: usage.output_tokens || 0,
      cacheHit: (usage.cache_read_input_tokens || 0) > 0,
      ts: new Date().toISOString(),
    });
    // Garde seulement les 200 derniers appels par user
    if (d.calls.length > 200) d.calls = d.calls.slice(-200);
    rcSet(userKey(email), d, TTL_1Y);
  }).catch(() => {});

  return cost;
}

export async function getAllUserBudgets() {
  const { rcKeys } = await import('./redisCache.js');
  const keys = await rcKeys('usage:cost:*');
  const maxUsd = parseFloat(process.env.MAX_BUDGET_USD_PER_USER || '0') || Infinity;
  const rows = await Promise.all(
    keys.map(async key => {
      const email = key.replace('usage:cost:', '');
      const data  = (await rcGet(key)) || { totalUsd: 0, calls: [] };
      return {
        email,
        totalUsd:  data.totalUsd,
        calls:     data.calls.length,
        lastCall:  data.calls.at(-1)?.ts || null,
        exceeded:  maxUsd !== Infinity && data.totalUsd >= maxUsd,
      };
    })
  );
  return rows.sort((a, b) => b.totalUsd - a.totalUsd);
}
