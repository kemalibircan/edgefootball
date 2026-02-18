jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {AiChatProvider, useAiChat} from '../src/state/chat/AiChatContext';
import {useAuthStore} from '../src/store/authStore';

const mockChatApi = {
  getChatThreads: jest.fn(async () => ({items: [], total: 0})),
  getChatThreadMessages: jest.fn(async () => ({thread: null, items: [], total: 0})),
  searchChatFixtures: jest.fn(async () => ({q: '', items: [], total: 0})),
  createChatMessage: jest.fn(async () => ({
    thread: {
      id: 77,
      fixture_id: 901,
      home_team_name: 'A',
      away_team_name: 'B',
      match_label: 'A - B',
    },
    user_message: {
      id: 1,
      thread_id: 77,
      user_id: 8,
      role: 'user',
      content_markdown: 'soru',
    },
    assistant_message: {
      id: 2,
      thread_id: 77,
      user_id: 8,
      role: 'assistant',
      content_markdown: 'cevap',
      meta: {
        odds_summary: {
          home: {avg_decimal_odds: 1.8},
          draw: {avg_decimal_odds: 3.2},
          away: {avg_decimal_odds: 4.1},
        },
      },
    },
  })),
};

const mockGetCurrentRoute = jest.fn(() => ({name: 'Home'}));

jest.mock('../src/hooks/useChatApi', () => ({
  useChatApi: () => mockChatApi,
}));

jest.mock('../src/navigation/navigationRef', () => ({
  navigationRef: {
    getCurrentRoute: () => mockGetCurrentRoute(),
    isReady: () => true,
    navigate: jest.fn(),
  },
}));

describe('AiChatContext askFromAction', () => {
  let snapshot: ReturnType<typeof useAiChat> | null = null;
  let renderer: ReactTestRenderer | null = null;

  function Harness() {
    snapshot = useAiChat();
    return null;
  }

  beforeEach(() => {
    snapshot = null;
    mockGetCurrentRoute.mockReturnValue({name: 'Home'});
    mockChatApi.getChatThreads.mockClear();
    mockChatApi.getChatThreadMessages.mockClear();
    mockChatApi.searchChatFixtures.mockClear();
    mockChatApi.createChatMessage.mockClear();
    useAuthStore.setState({
      token: 'token-1',
      user: {
        id: 8,
        username: 'ali',
        role: 'user',
        credits: 100,
        is_active: true,
      },
      isAuthenticated: true,
      hasHydrated: true,
      isBootstrapping: false,
    });
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
      renderer = null;
    }
  });

  test('sets reply notice when askFromAction succeeds outside chat route', async () => {
    await act(async () => {
      renderer = create(
        <AiChatProvider>
          <Harness />
        </AiChatProvider>,
      );
    });

    expect(snapshot).not.toBeNull();

    await act(async () => {
      const result = await snapshot!.askFromAction({
        fixture_id: 901,
        home_team_name: 'A',
        away_team_name: 'B',
        match_label: 'A - B',
        source: 'manual',
        question: 'Bu mac nasil biter?',
        language: 'tr',
      });
      expect(result.ok).toBe(true);
    });

    expect(mockChatApi.createChatMessage).toHaveBeenCalled();
    const firstCall = (mockChatApi.createChatMessage.mock.calls[0] || []) as unknown[];
    const firstPayload = (firstCall[0] || {}) as {new_session?: boolean; thread_id?: number};
    expect(firstPayload.new_session).toBe(true);
    expect(firstPayload.thread_id).toBeUndefined();
    expect(snapshot!.replyNotice).toBeTruthy();
    expect(snapshot!.replyNotice?.threadId).toBe(77);
  });
});
