import {toSavedCouponItems} from '../src/lib/adapters/couponAdapters';
import {teamInitials} from '../src/components/common/TeamLogoBadge';

describe('coupon logo flow', () => {
  test('toSavedCouponItems keeps team logos from generated picks', () => {
    const items = toSavedCouponItems([
      {
        fixture_id: 7,
        home_team_name: 'Fenerbahce',
        away_team_name: 'Galatasaray',
        home_team_logo: 'https://cdn.example.com/fb.png',
        away_team_logo: 'https://cdn.example.com/gs.png',
        selection: '1',
        selection_display: 'MS 1',
        odd: 1.92,
      },
    ]);

    expect(items[0].home_team_logo).toBe('https://cdn.example.com/fb.png');
    expect(items[0].away_team_logo).toBe('https://cdn.example.com/gs.png');
  });

  test('toSavedCouponItems returns null logos when source has no logo', () => {
    const items = toSavedCouponItems([
      {
        fixture_id: 11,
        home_team_name: 'Team A',
        away_team_name: 'Team B',
        selection: '2',
        odd: 2.05,
      },
    ]);

    expect(items[0].home_team_logo).toBeNull();
    expect(items[0].away_team_logo).toBeNull();
  });

  test('teamInitials builds fallback label when logo is missing', () => {
    expect(teamInitials('Real Madrid')).toBe('RM');
    expect(teamInitials('Besiktas')).toBe('B');
  });
});
