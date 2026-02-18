import {buildCouponAutoAskPayload, findThreadIdForFixture} from '../src/lib/chat/couponOverlay';
import type {ChatThread} from '../src/types/api';

describe('chat coupon auto ask payload', () => {
  test('builds manual fixture-level payload without selection', () => {
    const payload = buildCouponAutoAskPayload({
      fixture_id: 901,
      home_team_name: 'A',
      away_team_name: 'B',
      home_team_logo: 'https://cdn.example.com/a.png',
      away_team_logo: 'https://cdn.example.com/b.png',
      starting_at: '2026-02-16T21:00:00+00:00',
      league_name: 'Super Lig',
      selections: [{selection: '1', selection_display: 'MS 1', odd: 1.9}],
      selection_count: 1,
      best_odd: 1.9,
    });

    expect(payload.source).toBe('manual');
    expect(payload.fixture_id).toBe(901);
    expect((payload as {thread_id?: number | null}).thread_id).toBeUndefined();
    expect((payload as {selection?: string}).selection).toBeUndefined();
    expect(payload.question.length).toBeGreaterThan(5);
  });

  test('uses existing thread id when fixture already has thread', () => {
    const threads: ChatThread[] = [
      {id: 77, fixture_id: 901, match_label: 'A - B'},
      {id: 88, fixture_id: 902, match_label: 'C - D'},
    ];

    expect(findThreadIdForFixture(threads, 901)).toBe(77);
    expect(findThreadIdForFixture(threads, 903)).toBeNull();
  });
});
