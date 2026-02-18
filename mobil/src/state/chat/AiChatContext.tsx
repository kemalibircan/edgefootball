import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useAuthStore} from '../../store/authStore';
import {useChatApi} from '../../hooks/useChatApi';
import type {
  ChatFixtureSearchItem,
  ChatMessage,
  ChatMessageCreateRequest,
  ChatThread,
  ChatThreadsResponse,
} from '../../types/api';
import {navigationRef} from '../../navigation/navigationRef';

const DEFAULT_ACTION_QUESTION = 'Bu maçı detaylı analiz et ve en güçlü seçimi açıkla.';
const REPLY_NOTICE_TEXT = 'Cevabınız hazır, chat sayfasından kontrol edebilirsiniz.';

type ChatDraftFixture = {
  fixture_id: number;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_logo: string | null;
  away_team_logo: string | null;
  league_id: number | null;
  league_name: string | null;
  starting_at: string | null;
  match_label: string;
};

type ReplyNotice = {
  message: string;
  threadId: number;
};

type SendMessageArgs = {
  question: string;
  thread_id?: number | null;
  fixture?: Partial<ChatDraftFixture> | null;
  source?: 'generated' | 'manual';
  task_id?: string | null;
  selection?: string | null;
  model_id?: string | null;
  language?: string;
};

type AskFromActionArgs = {
  question?: string;
  thread_id?: number | null;
  fixture_id?: number | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_logo?: string | null;
  away_team_logo?: string | null;
  league_id?: number | null;
  league_name?: string | null;
  starting_at?: string | null;
  match_label?: string | null;
  source?: 'generated' | 'manual';
  task_id?: string | null;
  selection?: string | null;
  model_id?: string | null;
  language?: string;
};

type ChatContextValue = {
  threads: ChatThread[];
  threadsLoading: boolean;
  threadsError: string;
  activeThreadId: number | null;
  activeThread: ChatThread | null;
  activeMessages: ChatMessage[];
  messagesLoading: boolean;
  messagesError: string;
  searchQuery: string;
  searchResults: ChatFixtureSearchItem[];
  searchLoading: boolean;
  searchError: string;
  selectedFixture: ChatDraftFixture | null;
  draftFixture: ChatDraftFixture | null;
  sending: boolean;
  sendError: string;
  replyNotice: ReplyNotice | null;
  loadThreads: (options?: {selectLatest?: boolean}) => Promise<ChatThread[]>;
  selectThread: (threadId: number, options?: {forceReload?: boolean}) => Promise<{ok: boolean; error?: string}>;
  searchFixtures: (query: string, options?: {limit?: number}) => Promise<{ok: boolean; error?: string}>;
  selectFixtureForNewChat: (fixture: Partial<ChatFixtureSearchItem> | Partial<ChatThread>) => Promise<{ok: boolean; error?: string}>;
  sendMessage: (payload: SendMessageArgs) => Promise<{ok: boolean; error?: string; data?: unknown}>;
  askFromAction: (payload: AskFromActionArgs) => Promise<{ok: boolean; error?: string; data?: unknown}>;
  dismissReplyNotice: () => void;
};

const AiChatContext = createContext<ChatContextValue | null>(null);

function clearChatError(value: unknown, fallback: string) {
  const text = String((value as Error)?.message || '').trim();
  if (!text) {
    return fallback;
  }
  const lowered = text.toLowerCase();
  if (
    lowered === 'not found' ||
    lowered.includes('404') ||
    lowered.includes('networkerror') ||
    lowered.includes('failed to fetch')
  ) {
    return 'Sohbet servisine simdi ulasilamiyor. Lutfen kisa sure sonra tekrar deneyin.';
  }
  return text;
}

function normalizeDraftFixture(input: Partial<ChatDraftFixture> | Partial<ChatFixtureSearchItem> | Partial<ChatThread> | null | undefined) {
  const fixtureId = Math.trunc(Number(input?.fixture_id));
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }
  const homeTeam = String(input?.home_team_name || '').trim() || null;
  const awayTeam = String(input?.away_team_name || '').trim() || null;
  const matchLabel =
    String(input?.match_label || '').trim() ||
    [homeTeam, awayTeam].filter(Boolean).join(' - ') ||
    `Fixture ${fixtureId}`;
  const leagueIdRaw = input?.league_id;
  const leagueId = leagueIdRaw === null || leagueIdRaw === undefined ? null : Number(leagueIdRaw);
  return {
    fixture_id: fixtureId,
    home_team_name: homeTeam,
    away_team_name: awayTeam,
    home_team_logo: input?.home_team_logo ? String(input.home_team_logo) : null,
    away_team_logo: input?.away_team_logo ? String(input.away_team_logo) : null,
    league_id: Number.isFinite(leagueId) ? Math.trunc(Number(leagueId)) : null,
    league_name: input?.league_name ? String(input.league_name) : null,
    starting_at: input?.starting_at ? String(input.starting_at) : null,
    match_label: matchLabel,
  } satisfies ChatDraftFixture;
}

function upsertThread(items: ChatThread[], thread: ChatThread) {
  if (!thread?.id) {
    return items;
  }
  return [thread, ...items.filter(item => Number(item?.id) !== Number(thread.id))];
}

function threadMessageMap() {
  return {} as Record<number, ChatMessage[]>;
}

function currentRouteName() {
  return navigationRef.getCurrentRoute()?.name;
}

export function AiChatProvider({children}: {children: React.ReactNode}) {
  const token = useAuthStore(state => state.token);
  const chatApi = useChatApi();
  const activeThreadRef = useRef<number | null>(null);

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messagesByThread, setMessagesByThread] = useState<Record<number, ChatMessage[]>>(threadMessageMap());
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatFixtureSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [draftFixture, setDraftFixture] = useState<ChatDraftFixture | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [replyNotice, setReplyNotice] = useState<ReplyNotice | null>(null);

  useEffect(() => {
    activeThreadRef.current = activeThreadId;
  }, [activeThreadId]);

  const clearState = useCallback(() => {
    setThreads([]);
    setThreadsError('');
    setThreadsLoading(false);
    setActiveThreadId(null);
    setMessagesByThread(threadMessageMap());
    setMessagesError('');
    setMessagesLoading(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setSearchError('');
    setDraftFixture(null);
    setSending(false);
    setSendError('');
    setReplyNotice(null);
  }, []);

  useEffect(() => {
    if (!token) {
      clearState();
      return;
    }
    let cancelled = false;
    const loadInitial = async () => {
      setThreadsLoading(true);
      setThreadsError('');
      try {
        const payload: ChatThreadsResponse = await chatApi.getChatThreads(50);
        if (cancelled) {
          return;
        }
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setThreads(items);
        if (!activeThreadRef.current && items.length) {
          setActiveThreadId(Number(items[0].id));
        }
      } catch (error) {
        if (!cancelled) {
          setThreadsError(clearChatError(error, 'Chat gecmisi yuklenemedi.'));
        }
      } finally {
        if (!cancelled) {
          setThreadsLoading(false);
        }
      }
    };
    loadInitial().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatApi, clearState, token]);

  const loadThreads = useCallback(
    async ({selectLatest = false}: {selectLatest?: boolean} = {}) => {
      if (!token) {
        clearState();
        return [];
      }
      setThreadsLoading(true);
      setThreadsError('');
      try {
        const payload = await chatApi.getChatThreads(50);
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setThreads(items);
        if (selectLatest && items.length) {
          setActiveThreadId(Number(items[0].id));
        }
        return items;
      } catch (error) {
        setThreadsError(clearChatError(error, 'Chat gecmisi yuklenemedi.'));
        return [];
      } finally {
        setThreadsLoading(false);
      }
    },
    [chatApi, clearState, token],
  );

  const selectThread = useCallback(
    async (threadId: number, {forceReload = false}: {forceReload?: boolean} = {}) => {
      const safeThreadId = Math.trunc(Number(threadId));
      if (!Number.isFinite(safeThreadId) || safeThreadId <= 0) {
        return {ok: false, error: 'thread_id gecersiz'};
      }
      if (!token) {
        return {ok: false, error: 'Oturum bulunamadi.'};
      }
      setActiveThreadId(safeThreadId);
      setDraftFixture(null);
      setMessagesError('');
      setSendError('');
      if (!forceReload && Array.isArray(messagesByThread[safeThreadId])) {
        return {ok: true};
      }

      setMessagesLoading(true);
      try {
        const payload = await chatApi.getChatThreadMessages(safeThreadId, {limit: 100});
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setMessagesByThread(prev => ({...prev, [safeThreadId]: items}));
        if (payload?.thread?.id) {
          setThreads(prev => upsertThread(prev, payload.thread));
        }
        return {ok: true};
      } catch (error) {
        const message = clearChatError(error, 'Mesajlar yuklenemedi.');
        setMessagesError(message);
        return {ok: false, error: message};
      } finally {
        setMessagesLoading(false);
      }
    },
    [chatApi, messagesByThread, token],
  );

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    if (Array.isArray(messagesByThread[activeThreadId])) {
      return;
    }
    selectThread(activeThreadId, {forceReload: true}).catch(() => undefined);
  }, [activeThreadId, messagesByThread, selectThread]);

  const searchFixtures = useCallback(
    async (query: string, {limit = 20}: {limit?: number} = {}) => {
      if (!token) {
        return {ok: false, error: 'Oturum bulunamadi.'};
      }
      const safeQuery = String(query || '');
      setSearchQuery(safeQuery);
      setSearchLoading(true);
      setSearchError('');
      try {
        const payload = await chatApi.searchChatFixtures(safeQuery, limit);
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setSearchResults(items);
        return {ok: true};
      } catch (error) {
        const message = clearChatError(error, 'Mac aramasi basarisiz.');
        setSearchError(message);
        setSearchResults([]);
        return {ok: false, error: message};
      } finally {
        setSearchLoading(false);
      }
    },
    [chatApi, token],
  );

  const selectFixtureForNewChat = useCallback(
    async (fixture: Partial<ChatFixtureSearchItem> | Partial<ChatThread>) => {
      const normalized = normalizeDraftFixture(fixture);
      if (!normalized) {
        return {ok: false, error: 'Fixture secimi gecersiz.'};
      }
      setDraftFixture(normalized);
      setActiveThreadId(null);
      setMessagesError('');
      setSendError('');
      return {ok: true};
    },
    [],
  );

  const sendMessage = useCallback(
    async (payload: SendMessageArgs) => {
      const safeQuestion = String(payload.question || '').trim();
      if (!safeQuestion) {
        return {ok: false, error: 'Soru bos olamaz.'};
      }
      if (!token) {
        return {ok: false, error: 'Oturum bulunamadi.'};
      }

      const preferredThreadId = Math.trunc(Number(payload.thread_id || activeThreadRef.current || 0));
      const resolvedThreadId = Number.isFinite(preferredThreadId) && preferredThreadId > 0 ? preferredThreadId : null;
      const activeThreadSnapshot = threads.find(item => Number(item?.id) === Number(activeThreadRef.current || 0));
      const fixture = normalizeDraftFixture(payload.fixture) || draftFixture || normalizeDraftFixture(activeThreadSnapshot);

      if (!resolvedThreadId && !fixture?.fixture_id) {
        return {ok: false, error: 'Lutfen once bir mac secin.'};
      }

      const requestPayload: ChatMessageCreateRequest = {
        thread_id: !fixture?.fixture_id ? resolvedThreadId || undefined : undefined,
        fixture_id: fixture?.fixture_id,
        home_team_name: fixture?.home_team_name || undefined,
        away_team_name: fixture?.away_team_name || undefined,
        match_label: fixture?.match_label || undefined,
        source: payload.source === 'generated' ? 'generated' : 'manual',
        task_id: payload.task_id || undefined,
        selection: payload.selection || undefined,
        model_id: payload.model_id || undefined,
        question: safeQuestion,
        language: payload.language || 'tr',
        new_session: true,
      };

      setSending(true);
      setSendError('');
      setMessagesError('');
      try {
        const response = await chatApi.createChatMessage(requestPayload);
        const thread = response?.thread;
        if (!thread?.id) {
          throw new Error('Chat thread bilgisi alinamadi.');
        }
        const safeThreadId = Math.trunc(Number(thread.id));
        const nextMessages: ChatMessage[] = [];
        if (response.user_message?.id) {
          nextMessages.push(response.user_message);
        }
        if (response.assistant_message?.id) {
          nextMessages.push(response.assistant_message);
        }

        setThreads(prev => upsertThread(prev, thread));
        setActiveThreadId(safeThreadId);
        setDraftFixture(null);
        setMessagesByThread(prev => ({...prev, [safeThreadId]: nextMessages}));

        if (currentRouteName() !== 'Chat') {
          setReplyNotice({
            message: REPLY_NOTICE_TEXT,
            threadId: safeThreadId,
          });
        }

        return {ok: true, data: response};
      } catch (error) {
        const message = clearChatError(error, 'Mesaj gonderilemedi.');
        setSendError(message);
        return {ok: false, error: message};
      } finally {
        setSending(false);
      }
    },
    [chatApi, draftFixture, threads, token],
  );

  const askFromAction = useCallback(
    async (payload: AskFromActionArgs) => {
      const question = String(payload.question || '').trim() || DEFAULT_ACTION_QUESTION;
      const fixture = normalizeDraftFixture({
        fixture_id: payload.fixture_id ?? undefined,
        home_team_name: payload.home_team_name,
        away_team_name: payload.away_team_name,
        home_team_logo: payload.home_team_logo,
        away_team_logo: payload.away_team_logo,
        league_id: payload.league_id,
        league_name: payload.league_name,
        starting_at: payload.starting_at,
        match_label: payload.match_label ?? undefined,
      });

      return sendMessage({
        question,
        thread_id: payload.thread_id || null,
        fixture,
        source: payload.source || 'manual',
        task_id: payload.task_id || null,
        selection: payload.selection || null,
        model_id: payload.model_id || null,
        language: payload.language || 'tr',
      });
    },
    [sendMessage],
  );

  const dismissReplyNotice = useCallback(() => {
    setReplyNotice(null);
  }, []);

  useEffect(() => {
    if (!replyNotice) {
      return;
    }
    const timer = setTimeout(() => {
      setReplyNotice(current => {
        if (!current || current.threadId !== replyNotice.threadId) {
          return current;
        }
        return null;
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, [replyNotice]);

  const activeThread = useMemo(() => {
    if (!activeThreadId) {
      return null;
    }
    return threads.find(item => Number(item.id) === Number(activeThreadId)) || null;
  }, [activeThreadId, threads]);

  const activeMessages = useMemo(() => {
    if (!activeThreadId) {
      return [];
    }
    return messagesByThread[activeThreadId] || [];
  }, [activeThreadId, messagesByThread]);

  const selectedFixture = useMemo(() => {
    const fromThread = normalizeDraftFixture(activeThread);
    return fromThread || draftFixture;
  }, [activeThread, draftFixture]);

  const contextValue = useMemo<ChatContextValue>(
    () => ({
      threads,
      threadsLoading,
      threadsError,
      activeThreadId,
      activeThread,
      activeMessages,
      messagesLoading,
      messagesError,
      searchQuery,
      searchResults,
      searchLoading,
      searchError,
      selectedFixture,
      draftFixture,
      sending,
      sendError,
      replyNotice,
      loadThreads,
      selectThread,
      searchFixtures,
      selectFixtureForNewChat,
      sendMessage,
      askFromAction,
      dismissReplyNotice,
    }),
    [
      activeMessages,
      activeThread,
      activeThreadId,
      askFromAction,
      dismissReplyNotice,
      draftFixture,
      loadThreads,
      messagesError,
      messagesLoading,
      replyNotice,
      searchError,
      searchFixtures,
      searchLoading,
      searchQuery,
      searchResults,
      selectFixtureForNewChat,
      selectThread,
      selectedFixture,
      sendError,
      sendMessage,
      sending,
      threads,
      threadsError,
      threadsLoading,
    ],
  );

  return <AiChatContext.Provider value={contextValue}>{children}</AiChatContext.Provider>;
}

export function useAiChat() {
  const contextValue = useContext(AiChatContext);
  if (!contextValue) {
    throw new Error('useAiChat must be used inside AiChatProvider');
  }
  return contextValue;
}
