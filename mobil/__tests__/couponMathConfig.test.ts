import {normalizeBankrollTl, resolveAutoMathConfig} from '../src/lib/coupon/mathConfig';

describe('coupon math auto config', () => {
  test('normalizeBankrollTl keeps valid values and falls back for invalid ones', () => {
    expect(normalizeBankrollTl(1500)).toBe(1500);
    expect(normalizeBankrollTl('2600')).toBe(2600);
    expect(normalizeBankrollTl('95')).toBe(1000);
    expect(normalizeBankrollTl('bad')).toBe(1000);
  });

  test('resolveAutoMathConfig selects 3 matches below 2500 bankroll', () => {
    const config = resolveAutoMathConfig(1200);
    expect(config.days_window).toBe(3);
    expect(config.matches_per_coupon).toBe(3);
    expect(config.league_ids.length).toBeGreaterThan(0);
    expect(config.model_id).toBeNull();
  });

  test('resolveAutoMathConfig selects 4 matches at or above 2500 bankroll', () => {
    const config = resolveAutoMathConfig(2500);
    expect(config.matches_per_coupon).toBe(4);
    expect(config.bankroll_tl).toBe(2500);
    expect(config.view.matchesPerCoupon).toBe(4);
    expect(config.view.modelLabel).toBe('Lig Bazli Otomatik');
  });
});
