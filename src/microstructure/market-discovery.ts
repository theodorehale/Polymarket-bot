export interface DiscoveredFiveMinuteMarket {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  endDate: string;
  tokenIds: string[];
  outcomes: string[];
}

type GammaMarket = {
  id?: string;
  conditionId?: string;
  slug?: string;
  question?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  clobTokenIds?: string | string[];
  outcomes?: string | string[];
};

function parseStringArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function looksLikeBtcFiveMinute(m: GammaMarket): boolean {
  const text = [m.question, m.slug].filter(Boolean).join(' ').toLowerCase();
  const btc = /\b(bitcoin|btc)\b/.test(text);
  const upDown = /\b(up|down)\b/.test(text);
  const fiveMinute = /(5[- ]?min|5 minute|five minute)/.test(text);
  return btc && upDown && fiveMinute;
}

/**
 * Discover the nearest-expiring active BTC 5-minute UP/DOWN market.
 * Gamma is used only for metadata/token discovery; live prices never come from Gamma.
 * Fails closed if the market shape is ambiguous.
 */
export async function discoverBtcFiveMinuteMarket(
  nowMs = Date.now(),
): Promise<DiscoveredFiveMinuteMarket> {
  // BTC 5m slugs are deterministic: btc-updown-5m-<window-start-unix-seconds>.
  // Querying the first 100 globally active markets is not exhaustive and can miss this series.
  // Probe the current and adjacent 5-minute windows directly, then apply the same fail-closed validation.
  const windowSec = 300;
  const currentStartSec = Math.floor(nowMs / 1000 / windowSec) * windowSec;
  const slugs = [-1, 0, 1, 2].map(offset => `btc-updown-5m-${currentStartSec + offset * windowSec}`);
  const responses = await Promise.all(slugs.map(async slug => {
    const url = new URL('https://gamma-api.polymarket.com/markets');
    url.searchParams.set('slug', slug);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gamma discovery failed for ${slug}: HTTP ${response.status}`);
    return await response.json() as GammaMarket[];
  }));
  const rows = responses.flat();
  const candidates = rows
    .filter(m => m.active === true && m.closed === false && m.acceptingOrders !== false)
    .filter(looksLikeBtcFiveMinute)
    .map(m => ({
      raw: m,
      tokenIds: parseStringArray(m.clobTokenIds),
      outcomes: parseStringArray(m.outcomes),
      endMs: Date.parse(m.endDate ?? ''),
    }))
    .filter(x => x.tokenIds.length === 2 && x.outcomes.length === 2)
    .filter(x => Number.isFinite(x.endMs) && x.endMs > nowMs)
    .sort((a, b) => a.endMs - b.endMs);

  const chosen = candidates[0];
  if (!chosen) throw new Error('No unambiguous active BTC 5-minute UP/DOWN market discovered');

  const m = chosen.raw;
  if (!m.id || !m.conditionId || !m.slug || !m.question || !m.endDate) {
    throw new Error('Discovered market missing required identity fields');
  }

  const normalizedOutcomes = chosen.outcomes.map(x => x.toLowerCase());
  if (!(normalizedOutcomes.includes('up') && normalizedOutcomes.includes('down'))) {
    throw new Error(`Unexpected 5-minute market outcomes: ${chosen.outcomes.join(',')}`);
  }

  return {
    id: m.id,
    conditionId: m.conditionId,
    slug: m.slug,
    question: m.question,
    endDate: m.endDate,
    tokenIds: chosen.tokenIds,
    outcomes: chosen.outcomes,
  };
}
