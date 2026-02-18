import {groupCouponItemsByFixture} from '../src/lib/chat/couponOverlay';

describe('chat coupon overlay grouping', () => {
  test('merges picks from same fixture into one entry', () => {
    const grouped = groupCouponItemsByFixture([
      {
        fixture_id: 101,
        home_team_name: 'Team A',
        away_team_name: 'Team B',
        selection: '1',
        selection_display: 'MS 1',
        odd: 1.8,
      },
      {
        fixture_id: 101,
        home_team_name: 'Team A',
        away_team_name: 'Team B',
        selection: '0',
        selection_display: 'MS X',
        odd: 3.1,
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].fixture_id).toBe(101);
    expect(grouped[0].selection_count).toBe(2);
    expect(grouped[0].best_odd).toBe(3.1);
  });

  test('keeps different fixtures as separate entries', () => {
    const grouped = groupCouponItemsByFixture([
      {
        fixture_id: 201,
        home_team_name: 'One',
        away_team_name: 'Two',
        starting_at: '2026-02-16T18:00:00+00:00',
        selection: '1',
        odd: 1.7,
      },
      {
        fixture_id: 202,
        home_team_name: 'Three',
        away_team_name: 'Four',
        starting_at: '2026-02-16T21:00:00+00:00',
        selection: '2',
        odd: 2.4,
      },
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].fixture_id).toBe(201);
    expect(grouped[1].fixture_id).toBe(202);
  });
});
