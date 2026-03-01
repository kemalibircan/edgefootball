import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "../lib/api";
import { readAuthToken } from "../lib/auth";

const ChatContext = createContext(null);

const DEFAULT_ACTION_QUESTION = "Bu maçı detaylı analiz et ve en güçlü seçimi açıkla.";
const REPLY_NOTICE_TEXT = "Cevabınız hazır, chat sayfasından kontrol edebilirsiniz.";
const REPLY_NOTICE_DISMISS_MS = 5000;

function normalizeDraftFixture(input) {
  if (!input) return null;
  
  const fixtureId = Math.trunc(Number(input.fixture_id));
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }
  
  const homeTeam = String(input.home_team_name || "").trim() || null;
  const awayTeam = String(input.away_team_name || "").trim() || null;
  const matchLabel =
    String(input.match_label || "").trim() ||
    [homeTeam, awayTeam].filter(Boolean).join(" - ") ||
    `Fixture ${fixtureId}`;
  const leagueId = input.league_id == null ? null : Number(input.league_id);
  
  return {
    fixture_id: fixtureId,
    home_team_name: homeTeam,
    away_team_name: awayTeam,
    home_team_logo: input.home_team_logo ? String(input.home_team_logo) : null,
    away_team_logo: input.away_team_logo ? String(input.away_team_logo) : null,
    league_id: Number.isFinite(leagueId) ? Math.trunc(Number(leagueId)) : null,
    league_name: input.league_name ? String(input.league_name) : null,
    starting_at: input.starting_at ? String(input.starting_at) : null,
    match_label: matchLabel,
  };
}

function upsertThread(items, thread) {
  if (!thread?.id) return items;
  return [thread, ...items.filter((item) => Number(item?.id) !== Number(thread.id))];
}

export function ChatProvider({ children }) {
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState("");
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messagesByThread, setMessagesByThread] = useState({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [draftFixture, setDraftFixture] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [replyNotice, setReplyNotice] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const dismissTimerRef = useRef(null);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;
  const activeMessages = activeThreadId ? messagesByThread[activeThreadId] || [] : [];

  const loadThreads = useCallback(async ({ selectLatest = false } = {}) => {
    if (!readAuthToken()) {
      setThreads([]);
      return [];
    }

    setThreadsLoading(true);
    setThreadsError("");

    try {
      const response = await apiRequest("/coupons/chat/threads?limit=50");
      const items = Array.isArray(response?.items) ? response.items : [];
      setThreads(items);

      if (selectLatest && items.length > 0) {
        setActiveThreadId(items[0].id);
      }

      return items;
    } catch (err) {
      const errorMsg = String(err.message || "Failed to load threads");
      setThreadsError(errorMsg);
      return [];
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const selectThread = useCallback(
    async (threadId, { forceReload = false } = {}) => {
      if (!threadId) {
        setActiveThreadId(null);
        setDraftFixture(null);
        return { ok: false, error: "Invalid thread ID" };
      }

      setActiveThreadId(threadId);
      setDraftFixture(null);
      setMessagesError("");

      const existingMessages = messagesByThread[threadId];
      if (existingMessages && existingMessages.length > 0 && !forceReload) {
        return { ok: true };
      }

      setMessagesLoading(true);

      try {
        const response = await apiRequest(`/coupons/chat/threads/${threadId}/messages?limit=100`);
        const items = Array.isArray(response?.items) ? response.items : [];
        setMessagesByThread((prev) => ({ ...prev, [threadId]: items }));
        return { ok: true };
      } catch (err) {
        const errorMsg = String(err.message || "Failed to load messages");
        setMessagesError(errorMsg);
        return { ok: false, error: errorMsg };
      } finally {
        setMessagesLoading(false);
      }
    },
    [messagesByThread]
  );

  const searchFixtures = useCallback(async (query, { limit = 30 } = {}) => {
    const trimmed = String(query || "").trim();
    setSearchQuery(trimmed);

    if (!trimmed) {
      setSearchResults([]);
      setSearchError("");
      return { ok: true };
    }

    setSearchLoading(true);
    setSearchError("");

    try {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      params.set("limit", String(limit));
      const response = await apiRequest(`/coupons/chat/fixtures/search?${params.toString()}`);
      const items = Array.isArray(response?.items) ? response.items : [];
      setSearchResults(items);
      return { ok: true };
    } catch (err) {
      const errorMsg = String(err.message || "Search failed");
      setSearchError(errorMsg);
      return { ok: false, error: errorMsg };
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const selectFixtureForNewChat = useCallback(async (fixture) => {
    const normalized = normalizeDraftFixture(fixture);
    if (!normalized) {
      return { ok: false, error: "Invalid fixture data" };
    }

    setDraftFixture(normalized);
    setActiveThreadId(null);
    setSearchQuery("");
    setSearchResults([]);
    return { ok: true };
  }, []);

  const sendMessage = useCallback(
    async ({ question, thread_id, fixture, source, task_id, selection, model_id, language }) => {
      const trimmedQuestion = String(question || "").trim();
      if (!trimmedQuestion) {
        return { ok: false, error: "Question is required" };
      }

      const isNewThread = !thread_id;
      const threadToUse = thread_id || null;
      const fixtureToUse = isNewThread ? normalizeDraftFixture(fixture || draftFixture) : null;

      if (isNewThread && !fixtureToUse) {
        return { ok: false, error: "Fixture is required for new thread" };
      }

      setSending(true);
      setSendError("");

      try {
        const payload = {
          question: trimmedQuestion,
          thread_id: threadToUse,
          fixture_id: fixtureToUse?.fixture_id,
          home_team_name: fixtureToUse?.home_team_name,
          away_team_name: fixtureToUse?.away_team_name,
          home_team_logo: fixtureToUse?.home_team_logo,
          away_team_logo: fixtureToUse?.away_team_logo,
          league_id: fixtureToUse?.league_id,
          league_name: fixtureToUse?.league_name,
          starting_at: fixtureToUse?.starting_at,
          match_label: fixtureToUse?.match_label,
          source: source || "manual",
          task_id: task_id,
          selection: selection,
          model_id: model_id,
          language: language || "tr",
        };

        const response = await apiRequest("/coupons/chat/messages", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const returnedThread = response?.thread;
        const userMessage = response?.user_message;
        const assistantMessage = response?.assistant_message;

        if (returnedThread) {
          setThreads((prev) => upsertThread(prev, returnedThread));
          setActiveThreadId(returnedThread.id);

          if (userMessage && assistantMessage) {
            setMessagesByThread((prev) => ({
              ...prev,
              [returnedThread.id]: [assistantMessage, userMessage, ...(prev[returnedThread.id] || [])],
            }));
          }

          if (!isOpen && isNewThread) {
            setReplyNotice({
              message: REPLY_NOTICE_TEXT,
              threadId: returnedThread.id,
            });
            
            if (dismissTimerRef.current) {
              clearTimeout(dismissTimerRef.current);
            }
            dismissTimerRef.current = setTimeout(() => {
              setReplyNotice(null);
            }, REPLY_NOTICE_DISMISS_MS);
          }
        }

        setDraftFixture(null);
        return { ok: true, data: response };
      } catch (err) {
        const errorMsg = String(err.message || "Failed to send message");
        setSendError(errorMsg);
        return { ok: false, error: errorMsg };
      } finally {
        setSending(false);
      }
    },
    [draftFixture, isOpen]
  );

  const askFromAction = useCallback(
    async (payload) => {
      const question = String(payload.question || DEFAULT_ACTION_QUESTION).trim();
      const fixture = normalizeDraftFixture(payload);

      if (!fixture) {
        return { ok: false, error: "Invalid fixture data" };
      }

      return sendMessage({
        question,
        thread_id: payload.thread_id,
        fixture,
        source: payload.source,
        task_id: payload.task_id,
        selection: payload.selection,
        model_id: payload.model_id,
        language: payload.language,
      });
    },
    [sendMessage]
  );

  const dismissReplyNotice = useCallback(() => {
    setReplyNotice(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const openSidebar = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (readAuthToken()) {
      loadThreads();
    }
  }, [loadThreads]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const value = {
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
    draftFixture,
    sending,
    sendError,
    replyNotice,
    isOpen,
    openSidebar,
    closeSidebar,
    loadThreads,
    selectThread,
    searchFixtures,
    selectFixtureForNewChat,
    sendMessage,
    askFromAction,
    dismissReplyNotice,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}
