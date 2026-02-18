import React from 'react';
import {Animated} from 'react-native';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {ChatScreen} from '../src/screens/chat/ChatScreen';

const mockAskFromAction = jest.fn(async () => ({ok: true}));
const mockSelectThread = jest.fn(async () => ({ok: true}));
const mockSearchFixtures = jest.fn(async () => ({ok: true}));
const mockSelectFixtureForNewChat = jest.fn(async () => ({ok: true}));
const mockSendMessage = jest.fn(async () => ({ok: true}));
const mockAddPick = jest.fn();

const mockChatState = {
  threads: [],
  threadsLoading: false,
  threadsError: '',
  activeThreadId: null,
  activeThread: null,
  activeMessages: [],
  messagesLoading: false,
  messagesError: '',
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: '',
  selectedFixture: null,
  draftFixture: null,
  sending: false,
  sendError: '',
  replyNotice: null,
  loadThreads: jest.fn(),
  selectThread: mockSelectThread,
  searchFixtures: mockSearchFixtures,
  selectFixtureForNewChat: mockSelectFixtureForNewChat,
  sendMessage: mockSendMessage,
  askFromAction: mockAskFromAction,
  dismissReplyNotice: jest.fn(),
};

jest.mock('../src/state/chat/AiChatContext', () => ({
  useAiChat: () => mockChatState,
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(effect, [effect]);
    },
  };
});

jest.mock('../src/store/couponStore', () => ({
  useCouponStore: (selector: (state: {items: unknown[]; addPick: (...args: unknown[]) => void}) => unknown) =>
    selector({
      items: [],
      addPick: mockAddPick,
    }),
}));

jest.mock('../src/components/common/ScreenContainer', () => ({
  ScreenContainer: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));

jest.mock('react-native-markdown-display', () => 'Markdown');
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

describe('chat overlay toggle', () => {
  let screen: ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.spyOn(Animated, 'timing').mockImplementation(
      () =>
        ({
          start: (callback?: (result: {finished: boolean}) => void) => {
            callback?.({finished: true});
          },
        }) as unknown as Animated.CompositeAnimation,
    );
  });

  afterEach(() => {
    if (screen) {
      act(() => {
        screen?.unmount();
      });
      screen = null;
    }
    jest.restoreAllMocks();
  });

  test('opens and closes history and coupon overlays exclusively', async () => {
    await act(async () => {
      screen = create(<ChatScreen />);
    });
    const root = screen!.root;

    expect(root.findAllByProps({testID: 'chat-history-panel'})).toHaveLength(0);
    expect(root.findAllByProps({testID: 'chat-coupon-panel'})).toHaveLength(0);

    await act(async () => {
      root.findByProps({testID: 'chat-history-toggle'}).props.onPress();
    });
    expect(root.findAllByProps({testID: 'chat-history-panel'}).length).toBeGreaterThan(0);

    await act(async () => {
      root.findByProps({testID: 'chat-coupon-toggle'}).props.onPress();
    });
    expect(root.findAllByProps({testID: 'chat-history-panel'})).toHaveLength(0);
    expect(root.findAllByProps({testID: 'chat-coupon-panel'}).length).toBeGreaterThan(0);

    await act(async () => {
      root.findByProps({testID: 'chat-coupon-close'}).props.onPress();
    });
    expect(root.findAllByProps({testID: 'chat-coupon-panel'})).toHaveLength(0);
  });
});
