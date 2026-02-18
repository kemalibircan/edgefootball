import {toSavedCouponItems} from '../adapters/couponAdapters';

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function buildAutoCouponName(now = new Date()) {
  const day = pad2(now.getDate());
  const month = pad2(now.getMonth() + 1);
  const year = now.getFullYear();
  const hour = pad2(now.getHours());
  const minute = pad2(now.getMinutes());
  return `Sepet Kuponu ${day}.${month}.${year} ${hour}:${minute}`;
}

function totalOddsFromItems(items: Array<{odd: number}>) {
  return items.reduce((acc, item) => {
    const odd = Number(item.odd);
    if (!Number.isFinite(odd) || odd <= 1) {
      return acc;
    }
    return acc * odd;
  }, 1);
}

type AutoSavePayloadInput = {
  items: Array<{
    fixture_id: number;
    home_team_name: string;
    away_team_name: string;
    home_team_logo?: string | null;
    away_team_logo?: string | null;
    starting_at?: string | null;
    selection: string;
    odd: number;
    league_id?: number | null;
    league_name?: string | null;
    market_key?: string | null;
    market_label?: string | null;
    line?: string | null;
    selection_display?: string | null;
  }>;
  couponCount: number;
  stake: number;
  now?: Date;
};

export function buildAutoSaveCouponPayload({items, couponCount, stake, now = new Date()}: AutoSavePayloadInput) {
  const mappedItems = toSavedCouponItems(items);
  const totalOdds = totalOddsFromItems(mappedItems);
  const couponAmount = couponCount * stake;
  const maxWin = totalOdds * couponAmount;

  return {
    name: buildAutoCouponName(now),
    risk_level: 'manual' as const,
    items: mappedItems,
    summary: {
      coupon_count: couponCount,
      stake,
      total_odds: Number(totalOdds.toFixed(2)),
      coupon_amount: Number(couponAmount.toFixed(2)),
      max_win: Number(maxWin.toFixed(2)),
    },
  };
}

export function canAutoSaveCoupon(itemCount: number, isPending: boolean) {
  return itemCount > 0 && !isPending;
}
