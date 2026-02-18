import {buildOneXTwoQuickPicks, resolveOddTone} from '../src/lib/chat/quickPicks';
import type {ChatMessage, ChatThread} from '../src/types/api';

describe('chat quick picks', () => {
  test('buildOneXTwoQuickPicks maps 1X2 odds and tones', () => {
    const thread: ChatThread = {
      id: 44,
      fixture_id: 901,
      home_team_name: 'A',
      away_team_name: 'B',
      home_team_logo: 'https://cdn.example.com/a.png',
      away_team_logo: 'https://cdn.example.com/b.png',
      league_name: 'Super Lig',
      match_label: 'A - B',
    };

    const message: ChatMessage = {
      id: 2,
      thread_id: 44,
      user_id: 8,
      role: 'assistant',
      content_markdown: 'AI',
      meta: {
        source: 'generated',
        odds_summary: {
          home: {avg_decimal_odds: 1.72},
          draw: {avg_decimal_odds: 3.21},
          away: {avg_decimal_odds: 4.65},
        },
      },
    };

    const picks = buildOneXTwoQuickPicks(thread, message);

    expect(picks).toHaveLength(3);
    expect(picks[0].selection).toBe('1');
    expect(picks[1].selection).toBe('0');
    expect(picks[2].selection).toBe('2');
    expect(picks[2].tone).toBe('high');
    expect(picks[0].tone).toBe('low');
    expect(picks[1].tone).toBe('neutral');
  });

  test('resolveOddTone handles equal odds as neutral', () => {
    expect(resolveOddTone(2.1, [2.1, 2.1, 2.1])).toBe('neutral');
  });
});
