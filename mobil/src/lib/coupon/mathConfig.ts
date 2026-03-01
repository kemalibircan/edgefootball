import {DEFAULT_COUPON_LEAGUES, LEAGUE_OPTIONS} from '../../constants/leagues';

const MIN_BANKROLL_TL = 100;
const DEFAULT_BANKROLL_TL = 1000;

export type MathAutoConfig = {
  days_window: number;
  matches_per_coupon: number;
  league_ids: number[];
  model_id: null;
  bankroll_tl: number;
  view: {
    daysWindow: number;
    matchesPerCoupon: number;
    leaguesLabel: string;
    modelLabel: string;
    bankroll: number;
  };
};

export function normalizeBankrollTl(value: unknown, fallback = DEFAULT_BANKROLL_TL) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MIN_BANKROLL_TL) {
    return fallback;
  }
  return Math.round(parsed);
}

function leagueLabelById(leagueId: number) {
  const found = LEAGUE_OPTIONS.find(item => Number(item.value) === Number(leagueId));
  return found?.label || `Lig ${leagueId}`;
}

export function resolveAutoMathConfig(bankrollInput: unknown): MathAutoConfig {
  const bankroll = normalizeBankrollTl(bankrollInput, DEFAULT_BANKROLL_TL);
  const daysWindow = 3;
  const matchesPerCoupon = bankroll >= 2500 ? 4 : 3;
  const leagueIds = [...DEFAULT_COUPON_LEAGUES];
  const leaguesLabel = leagueIds.map(leagueId => leagueLabelById(leagueId)).join(', ');

  return {
    days_window: daysWindow,
    matches_per_coupon: matchesPerCoupon,
    league_ids: leagueIds,
    model_id: null,
    bankroll_tl: bankroll,
    view: {
      daysWindow,
      matchesPerCoupon,
      leaguesLabel,
      modelLabel: 'Lig Bazli Otomatik',
      bankroll,
    },
  };
}
