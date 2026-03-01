import {
  computeCouponDecision,
  computeOddsFitScore,
  groupCouponsByDecision,
  resolveCouponVariant,
} from '../src/lib/coupon/mathCouponDecision';

describe('math coupon decision', () => {
  test('resolves variant from coupon id prefixes', () => {
    expect(resolveCouponVariant('mix-shot-1', 'mix_portfolio')).toBe('mix_shot');
    expect(resolveCouponVariant('mix-double-1', 'mix_portfolio')).toBe('mix_double');
    expect(resolveCouponVariant('double-4', '')).toBe('double_system');
  });

  test('computes odds fit score inside and outside target range', () => {
    expect(computeOddsFitScore(1.5, {min: 1.35, max: 1.65})).toBe(15);
    expect(computeOddsFitScore(1.2, {min: 1.35, max: 1.65})).toBe(7);
    expect(computeOddsFitScore(4.8, {min: 1.35, max: 1.65})).toBe(0);
  });

  test('marks strong item as play and weak item as skip', () => {
    const playDecision = computeCouponDecision(
      {
        coupon_id: 'single-1',
        matches: [],
        total_odds: 1.52,
        edge_sum: 0.14,
        expected_value_score: 6.4,
      },
      {
        strategyKey: 'single_low_mid',
        targetRange: {min: 1.35, max: 1.65},
      },
    );
    expect(playDecision.decision).toBe('play');
    expect(playDecision.score).toBeGreaterThanOrEqual(60);

    const skipDecision = computeCouponDecision(
      {
        coupon_id: 'single-2',
        matches: [],
        total_odds: 3.4,
        edge_sum: 0.01,
        expected_value_score: 0.2,
      },
      {
        strategyKey: 'single_low_mid',
        targetRange: {min: 1.35, max: 1.65},
      },
    );
    expect(skipDecision.decision).toBe('skip');
    expect(skipDecision.score).toBeLessThan(60);
  });

  test('groups play and skip lists with sorted scores', () => {
    const grouped = groupCouponsByDecision(
      [
        {coupon_id: 'single-1', matches: [], total_odds: 1.4, edge_sum: 0.13, expected_value_score: 6.2},
        {coupon_id: 'single-2', matches: [], total_odds: 3.8, edge_sum: 0.02, expected_value_score: 0.8},
        {coupon_id: 'single-3', matches: [], total_odds: 1.48, edge_sum: 0.15, expected_value_score: 7.0},
      ],
      {
        strategyKey: 'single_low_mid',
        targetRange: {min: 1.35, max: 1.65},
      },
    );

    expect(grouped.play.length).toBe(2);
    expect(grouped.skip.length).toBe(1);
    expect(grouped.play[0].score).toBeGreaterThanOrEqual(grouped.play[1].score);
  });
});
