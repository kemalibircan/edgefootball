jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {AiChatProvider, useAiChat} from '../src/state/chat/AiChatContext';
import {useAuthStore} from '../src/store/authStore';

const mockChatApi = {
  getChatThreads: jest.fn(async () => ({
    items: [
      {
        id: 45,
        fixture_id: 901,
        home_team_name: 'A',
        away_team_name: 'B',
        match_label: 'A - B',
      },
    ],
    total: 1,
  })),
  getChatThreadMessages: jest.fn(async () => ({
    thread: {
      id: 45,
      fixture_id: 901,
      home_team_name: 'A',
      away_team_name: 'B',
      match_label: 'A - B',
    },
    items: [],
    total: 0,
  })),
  searchChatFixtures: jest.fn(async () => ({q: '', items: [], total: 0})),
  createChatMessage: jest.fn(async () => ({
    thread: {
      id: 88,
      fixture_id: 901,
      home_team_name: 'A',
      away_team_name: 'B',
      match_label: 'A - B',
    },
    user_message: {
      id: 11,
      thread_id: 88,
      user_id: 8,
      role: 'user',
      content_markdown: 'yeni soru',
    },
    assistant_message: {
      id: 12,
      thread_id: 88,
      user_id: 8,
      role: 'assistant',
      content_markdown: 'yeni cevap',
    },
  })),
};

const mockGetCurrentRoute = jest.fn(() => ({name: 'Chat'}));

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

describe('AiChatContext new session policy', () => {
  let snapshot: ReturnType<typeof useAiChat> | null = null;
  let renderer: ReactTestRenderer | null = null;

  function Harness() {
    snapshot = useAiChat();
    return null;
  }

  beforeEach(() => {
    snapshot = null;
    mockGetCurrentRoute.mockReturnValue({name: 'Chat'});
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

  test('opens a new chat session even when returning from history thread', async () => {
    await act(async () => {
      renderer = create(
        <AiChatProvider>
          <Harness />
        </AiChatProvider>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot!.activeThreadId).toBe(45);

    await act(async () => {
      const result = await snapshot!.sendMessage({
        question: 'Yeni session olarak gonder',
        source: 'manual',
        language: 'tr',
      });
      expect(result.ok).toBe(true);
    });

    const firstCall = (mockChatApi.createChatMessage.mock.calls[0] || []) as unknown[];
    const firstPayload = (firstCall[0] || {}) as {
      fixture_id?: number;
      thread_id?: number;
      new_session?: boolean;
    };

    expect(firstPayload.new_session).toBe(true);
    expect(firstPayload.fixture_id).toBe(901);
    expect(firstPayload.thread_id).toBeUndefined();
    expect(snapshot!.activeThreadId).toBe(88);
  });
});
