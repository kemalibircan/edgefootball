import type {CouponMatch, SavedCouponItem} from '../../types/api';

export function toSavedCouponItems(matches: CouponMatch[]): SavedCouponItem[] {
  return matches.map(match => ({
    fixture_id: Number(match.fixture_id),
    home_team_name: String(match.home_team_name || '-'),
    away_team_name: String(match.away_team_name || '-'),
    home_team_logo: match.home_team_logo || null,
    away_team_logo: match.away_team_logo || null,
    starting_at: match.starting_at || null,
    selection: String(match.selection || ''),
    odd: Number(match.odd),
    league_id: match.league_id ?? null,
    league_name: match.league_name ?? null,
    market_key: match.market_key || null,
    market_label: match.market_label || null,
    line: match.line || null,
    selection_display: match.selection_display || match.selection,
  }));
}
