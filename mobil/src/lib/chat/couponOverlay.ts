import type {ChatThread} from '../../types/api';

export const AUTO_COUPON_QUESTION = 'Bu kupondaki maçı analiz et, olası sonucu ve riskleri kısa açıkla.';

export type CouponOverlayItem = {
  fixture_id: number;
  home_team_name: string;
  away_team_name: string;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  starting_at?: string | null;
  league_name?: string | null;
  selection: string;
  selection_display?: string | null;
  odd: number;
};

export type CouponFixtureEntry = {
  fixture_id: number;
  home_team_name: string;
  away_team_name: string;
  home_team_logo: string | null;
  away_team_logo: string | null;
  starting_at: string | null;
  league_name: string | null;
  selections: Array<{
    selection: string;
    selection_display: string | null;
    odd: number;
  }>;
  selection_count: number;
  best_odd: number;
};

type EntryMap = Record<number, CouponFixtureEntry>;

function safeNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function byKickoffThenFixtureAsc(a: CouponFixtureEntry, b: CouponFixtureEntry) {
  const aTime = a.starting_at ? new Date(a.starting_at).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.starting_at ? new Date(b.starting_at).getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return Number(a.fixture_id) - Number(b.fixture_id);
}

export function groupCouponItemsByFixture(items: CouponOverlayItem[]): CouponFixtureEntry[] {
  const source = Array.isArray(items) ? items : [];
  const map: EntryMap = {};

  for (const item of source) {
    const fixtureId = Math.trunc(Number(item?.fixture_id));
    if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
      continue;
    }
    if (!map[fixtureId]) {
      map[fixtureId] = {
        fixture_id: fixtureId,
        home_team_name: String(item.home_team_name || '-'),
        away_team_name: String(item.away_team_name || '-'),
        home_team_logo: item.home_team_logo || null,
        away_team_logo: item.away_team_logo || null,
        starting_at: item.starting_at || null,
        league_name: item.league_name || null,
        selections: [],
        selection_count: 0,
        best_odd: 0,
      };
    }
    const entry = map[fixtureId];
    const odd = safeNumber(item.odd, 0);
    entry.selections.push({
      selection: String(item.selection || ''),
      selection_display: item.selection_display || null,
      odd,
    });
    entry.selection_count = entry.selections.length;
    entry.best_odd = Math.max(entry.best_odd, odd);
  }

  return Object.values(map).sort(byKickoffThenFixtureAsc);
}

export function findThreadIdForFixture(threads: ChatThread[], fixtureId: number): number | null {
  const safeFixtureId = Math.trunc(Number(fixtureId));
  if (!Number.isFinite(safeFixtureId) || safeFixtureId <= 0) {
    return null;
  }
  const thread = (Array.isArray(threads) ? threads : []).find(item => Number(item?.fixture_id) === safeFixtureId);
  if (!thread?.id) {
    return null;
  }
  return Math.trunc(Number(thread.id));
}

export function buildCouponAutoAskPayload(entry: CouponFixtureEntry) {
  return {
    fixture_id: Math.trunc(Number(entry.fixture_id)),
    home_team_name: entry.home_team_name,
    away_team_name: entry.away_team_name,
    home_team_logo: entry.home_team_logo,
    away_team_logo: entry.away_team_logo,
    league_name: entry.league_name,
    starting_at: entry.starting_at,
    match_label: `${entry.home_team_name} - ${entry.away_team_name}`,
    source: 'manual' as const,
    question: AUTO_COUPON_QUESTION,
    language: 'tr',
  };
}
