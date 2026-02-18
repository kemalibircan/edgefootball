import type {ChatMessage, ChatThread, CouponMatch} from '../../types/api';

export type OddTone = 'high' | 'low' | 'neutral';

export type ChatQuickPick = CouponMatch & {
  tone: OddTone;
};

function toPositiveOdd(value: unknown) {
  const odd = Number(value);
  if (!Number.isFinite(odd) || odd <= 1) {
    return null;
  }
  return Number(odd.toFixed(2));
}

export function resolveOddTone(value: number, odds: number[]): OddTone {
  if (!Number.isFinite(value) || !Array.isArray(odds) || odds.length < 2) {
    return 'neutral';
  }
  const safeOdds = odds.filter(item => Number.isFinite(item));
  if (safeOdds.length < 2) {
    return 'neutral';
  }
  const max = Math.max(...safeOdds);
  const min = Math.min(...safeOdds);
  if (Math.abs(max - min) < 0.0001) {
    return 'neutral';
  }
  if (Math.abs(value - max) < 0.0001) {
    return 'high';
  }
  if (Math.abs(value - min) < 0.0001) {
    return 'low';
  }
  return 'neutral';
}

export function buildOneXTwoQuickPicks(thread?: ChatThread | null, message?: ChatMessage | null): ChatQuickPick[] {
  const summary = message?.meta?.odds_summary;
  const fixtureId = Number(thread?.fixture_id ?? message?.meta?.fixture_id);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0 || !summary) {
    return [];
  }

  const candidates: Array<{selection: '1' | '0' | '2'; odd: number}> = [];
  const homeOdd = toPositiveOdd(summary.home?.avg_decimal_odds);
  if (homeOdd) {
    candidates.push({selection: '1', odd: homeOdd});
  }
  const drawOdd = toPositiveOdd(summary.draw?.avg_decimal_odds);
  if (drawOdd) {
    candidates.push({selection: '0', odd: drawOdd});
  }
  const awayOdd = toPositiveOdd(summary.away?.avg_decimal_odds);
  if (awayOdd) {
    candidates.push({selection: '2', odd: awayOdd});
  }
  if (!candidates.length) {
    return [];
  }

  const odds = candidates.map(item => item.odd);
  const homeTeamName = String(thread?.home_team_name || '-');
  const awayTeamName = String(thread?.away_team_name || '-');
  const source = String(message?.meta?.source || 'generated');

  return candidates.map(item => ({
    fixture_id: Math.trunc(fixtureId),
    home_team_name: homeTeamName,
    away_team_name: awayTeamName,
    home_team_logo: thread?.home_team_logo || null,
    away_team_logo: thread?.away_team_logo || null,
    starting_at: thread?.starting_at || null,
    selection: item.selection,
    selection_display: item.selection === '0' ? 'MS X' : `MS ${item.selection}`,
    market_key: 'match_result',
    market_label: 'Mac Sonucu',
    line: null,
    odd: item.odd,
    league_id: thread?.league_id ?? null,
    league_name: thread?.league_name ?? null,
    model_id: message?.meta?.model_id || null,
    source,
    tone: resolveOddTone(item.odd, odds),
  }));
}

export function compactChatText(value: string | null | undefined, max = 84) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}
