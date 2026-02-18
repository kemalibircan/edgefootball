import {buildAutoCouponName, buildAutoSaveCouponPayload, canAutoSaveCoupon} from '../src/lib/coupon/autoSave';

describe('coupon dock auto save', () => {
  test('buildAutoCouponName formats fixed local datetime', () => {
    const name = buildAutoCouponName(new Date(2026, 1, 15, 9, 7, 0));
    expect(name).toBe('Sepet Kuponu 15.02.2026 09:07');
  });

  test('buildAutoSaveCouponPayload maps slip items and computes summary', () => {
    const payload = buildAutoSaveCouponPayload({
      items: [
        {
          fixture_id: 101,
          home_team_name: 'Udinese',
          away_team_name: 'Sassuolo',
          home_team_logo: 'https://cdn.example.com/u.png',
          away_team_logo: 'https://cdn.example.com/s.png',
          selection: '1',
          selection_display: 'MS 1',
          odd: 1.8,
        },
        {
          fixture_id: 202,
          home_team_name: 'Roma',
          away_team_name: 'Lazio',
          selection: '2',
          odd: 2.1,
        },
      ],
      couponCount: 2,
      stake: 50,
      now: new Date(2026, 1, 15, 10, 30, 0),
    });

    expect(payload.risk_level).toBe('manual');
    expect(payload.name).toBe('Sepet Kuponu 15.02.2026 10:30');
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].home_team_logo).toBe('https://cdn.example.com/u.png');
    expect(payload.items[1].home_team_logo).toBeNull();
    expect(payload.summary.total_odds).toBe(3.78);
    expect(payload.summary.coupon_amount).toBe(100);
    expect(payload.summary.max_win).toBe(378);
  });

  test('canAutoSaveCoupon disables save when slip is empty', () => {
    expect(canAutoSaveCoupon(0, false)).toBe(false);
    expect(canAutoSaveCoupon(2, true)).toBe(false);
    expect(canAutoSaveCoupon(2, false)).toBe(true);
  });
});
