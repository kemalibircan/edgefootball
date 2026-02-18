import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AUTH_TOKEN_KEY, readAuthToken } from "../../lib/auth";
import {
  createChatMessage,
  fetchChatMessages,
  fetchChatThreads,
  resetCouponApiPrefix,
  searchChatFixtures,
} from "../../lib/chatApi";

const AiChatContext = createContext(null);

function normalizeFixtureForDraft(input) {
  const fixtureId = Number(input?.fixture_id);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) return null;
  const homeTeam = String(input?.home_team_name || "").trim();
  const awayTeam = String(input?.away_team_name || "").trim();
  const matchLabel = String(input?.match_label || "").trim() || [homeTeam, awayTeam].filter(Boolean).join(" - ");
  return {
    fixture_id: fixtureId,
    home_team_name: homeTeam || null,
    away_team_name: awayTeam || null,
    match_label: matchLabel || `Fixture ${fixtureId}`,
    starting_at: input?.starting_at || null,
    league_name: input?.league_name || null,
  };
}

function upsertThread(threads, thread) {
  if (!thread?.id) return threads;
  const next = [thread, ...threads.filter((item) => Number(item?.id) !== Number(thread.id))];
  return next;
}

function clearMessageMap() {
  return {};
}

function normalizeSendError(err) {
  const raw = String(err?.message || "").trim();
  const normalized = raw.toLowerCase();
  if (
    normalized === "not found" ||
    normalized.includes("404") ||
    normalized.includes("request failed: 5") ||
    normalized.includes("networkerror") ||
    normalized.includes("failed to fetch")
  ) {
    return "Sohbet servisine simdi ulasilamiyor. Lutfen kisa sure sonra tekrar deneyin.";
  }
  return raw || "Mesaj gonderilemedi.";
}

export function AiChatProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState("");
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messagesByThread, setMessagesByThread] = useState(clearMessageMap);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [draftFixture, setDraftFixture] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const clearChatState = useCallback(() => {
    setThreads([]);
    setThreadsError("");
    setThreadsLoading(false);
    setActiveThreadId(null);
    setMessagesByThread(clearMessageMap());
    setMessagesError("");
    setMessagesLoading(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setSearchLoading(false);
    setDraftFixture(null);
    setSending(false);
    setSendError("");
    setIsOpen(false);
    setIsHistoryOpen(false);
    resetCouponApiPrefix();
  }, []);

  const loadThreads = useCallback(
    async ({ selectLatest = true } = {}) => {
      if (!readAuthToken()) {
        clearChatState();
        return [];
      }
      setThreadsLoading(true);
      setThreadsError("");
      try {
        const payload = await fetchChatThreads(50);
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setThreads(items);
        if (selectLatest && items.length && !activeThreadId) {
          setActiveThreadId(Number(items[0].id));
        }
        return items;
      } catch (err) {
        setThreadsError(err.message || "Chat gecmisi yuklenemedi.");
        return [];
      } finally {
        setThreadsLoading(false);
      }
    },
    [activeThreadId, clearChatState]
  );

  const selectThread = useCallback(
    async (threadId, { forceReload = false, openPanel = false } = {}) => {
      const safeThreadId = Number(threadId);
      if (!Number.isFinite(safeThreadId) || safeThreadId <= 0) return { ok: false, error: "thread_id gecersiz" };
      if (!readAuthToken()) return { ok: false, error: "Oturum bulunamadi." };

      if (openPanel) setIsOpen(true);
      setActiveThreadId(safeThreadId);
      setDraftFixture(null);
      setMessagesError("");
      setSendError("");

      const hasCached = Array.isArray(messagesByThread[safeThreadId]) && messagesByThread[safeThreadId].length > 0;
      if (hasCached && !forceReload) {
        return { ok: true, fromCache: true };
      }

      setMessagesLoading(true);
      try {
        const payload = await fetchChatMessages(safeThreadId, { limit: 100 });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setMessagesByThread((prev) => ({ ...prev, [safeThreadId]: items }));
        if (payload?.thread?.id) {
          setThreads((prev) => upsertThread(prev, payload.thread));
        }
        return { ok: true };
      } catch (err) {
        setMessagesError(err.message || "Mesajlar yuklenemedi.");
        return { ok: false, error: err.message || "Mesajlar yuklenemedi." };
      } finally {
        setMessagesLoading(false);
      }
    },
    [messagesByThread]
  );

  const searchFixtures = useCallback(async (query, { limit = 20 } = {}) => {
    if (!readAuthToken()) {
      setSearchResults([]);
      setSearchError("");
      return { ok: false, error: "Oturum bulunamadi." };
    }
    setSearchLoading(true);
    setSearchError("");
    const safeQuery = String(query || "");
    setSearchQuery(safeQuery);
    try {
      const payload = await searchChatFixtures(safeQuery, limit);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setSearchResults(items);
      return { ok: true, items };
    } catch (err) {
      setSearchError(err.message || "Mac aramasi basarisiz.");
      setSearchResults([]);
      return { ok: false, error: err.message || "Mac aramasi basarisiz." };
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const selectFixtureForNewChat = useCallback(
    async (fixture) => {
      const normalized = normalizeFixtureForDraft(fixture);
      if (!normalized) {
        return { ok: false, error: "Fixture secimi gecersiz." };
      }
      const existingThread = threads.find((item) => Number(item?.fixture_id) === Number(normalized.fixture_id));
      if (existingThread?.id) {
        return selectThread(existingThread.id, { openPanel: true });
      }
      setActiveThreadId(null);
      setMessagesError("");
      setSendError("");
      setDraftFixture(normalized);
      setIsOpen(true);
      setIsHistoryOpen(false);
      return { ok: true, fixture: normalized };
    },
    [selectThread, threads]
  );

  const sendMessage = useCallback(
    async ({
      question,
      thread_id = null,
      fixture = null,
      source = "manual",
      task_id = null,
      selection = null,
      model_id = null,
      language = "tr",
      openPanel = true,
    } = {}) => {
      const safeQuestion = String(question || "").trim();
      if (!safeQuestion) {
        return { ok: false, error: "Soru bos olamaz." };
      }
      if (!readAuthToken()) {
        return { ok: false, error: "Oturum bulunamadi." };
      }
      if (openPanel) setIsOpen(true);
      setSendError("");
      setMessagesError("");
      setSending(true);

      const preferredThreadId = Number(thread_id || activeThreadId || 0);
      const resolvedThreadId = Number.isFinite(preferredThreadId) && preferredThreadId > 0 ? preferredThreadId : null;
      const resolvedFixture = normalizeFixtureForDraft(fixture) || draftFixture;
      if (!resolvedThreadId && !resolvedFixture?.fixture_id) {
        setSending(false);
        return { ok: false, error: "Lutfen once bir mac secin." };
      }
      if (!resolvedThreadId && resolvedFixture?.fixture_id) {
        setDraftFixture(resolvedFixture);
      }

      const payload = {
        thread_id: resolvedThreadId || undefined,
        fixture_id: !resolvedThreadId ? Number(resolvedFixture.fixture_id) : undefined,
        home_team_name: !resolvedThreadId ? resolvedFixture.home_team_name || undefined : undefined,
        away_team_name: !resolvedThreadId ? resolvedFixture.away_team_name || undefined : undefined,
        match_label: !resolvedThreadId ? resolvedFixture.match_label || undefined : undefined,
        source: String(source || "manual").trim().toLowerCase() === "generated" ? "generated" : "manual",
        task_id: task_id || undefined,
        selection: selection || undefined,
        model_id: model_id || undefined,
        question: safeQuestion,
        language: language || "tr",
      };

      try {
        const response = await createChatMessage(payload);
        const thread = response?.thread;
        const userMessage = response?.user_message;
        const assistantMessage = response?.assistant_message;
        if (!thread?.id) {
          throw new Error("Chat thread bilgisi alinamadi.");
        }

        const safeThreadId = Number(thread.id);
        setThreads((prev) => upsertThread(prev, thread));
        setActiveThreadId(safeThreadId);
        setDraftFixture(null);
        setIsHistoryOpen(false);

        setMessagesByThread((prev) => {
          const current = Array.isArray(prev[safeThreadId]) ? prev[safeThreadId] : [];
          const nextMessages = [...current];
          if (userMessage?.id) {
            nextMessages.push(userMessage);
          }
          if (assistantMessage?.id) {
            nextMessages.push(assistantMessage);
          }
          return { ...prev, [safeThreadId]: nextMessages };
        });

        return { ok: true, data: response };
      } catch (err) {
        const message = normalizeSendError(err);
        setSendError(message);
        return { ok: false, error: message };
      } finally {
        setSending(false);
      }
    },
    [activeThreadId, draftFixture]
  );

  const askFromAction = useCallback(
    async (payload = {}) => {
      const question = String(payload?.question || "").trim() || "Bu maci analiz et ve olasiliklari acikla.";
      const fixture = {
        fixture_id: payload?.fixture_id,
        home_team_name: payload?.home_team_name,
        away_team_name: payload?.away_team_name,
        match_label:
          payload?.match_label ||
          [String(payload?.home_team_name || "").trim(), String(payload?.away_team_name || "").trim()]
            .filter(Boolean)
            .join(" - "),
      };
      return sendMessage({
        question,
        thread_id: payload?.thread_id || null,
        fixture,
        source: payload?.source || "manual",
        task_id: payload?.task_id || null,
        selection: payload?.selection || null,
        model_id: payload?.model_id || null,
        language: payload?.language || "tr",
        openPanel: true,
      });
    },
    [sendMessage]
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setIsHistoryOpen(false);
  }, []);
  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setIsHistoryOpen(false);
  }, []);
  const toggleHistoryPanel = useCallback(() => {
    setIsOpen(true);
    setIsHistoryOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!readAuthToken()) {
      clearChatState();
      return;
    }
    loadThreads({ selectLatest: true });
  }, [clearChatState, loadThreads]);

  useEffect(() => {
    if (activeThreadId && !messagesByThread[activeThreadId]) {
      selectThread(activeThreadId, { forceReload: true });
    }
  }, [activeThreadId, messagesByThread, selectThread]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncByAuth = () => {
      if (!readAuthToken()) {
        clearChatState();
        return;
      }
      loadThreads({ selectLatest: false });
    };

    const onStorage = (event) => {
      if (!event.key || event.key === AUTH_TOKEN_KEY) {
        syncByAuth();
      }
    };

    window.addEventListener("auth-token-changed", syncByAuth);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("auth-token-changed", syncByAuth);
      window.removeEventListener("storage", onStorage);
    };
  }, [clearChatState, loadThreads]);

  const activeThread = useMemo(
    () => threads.find((item) => Number(item?.id) === Number(activeThreadId)) || null,
    [threads, activeThreadId]
  );
  const selectedFixture = useMemo(() => {
    if (activeThread) {
      return {
        fixture_id: Number(activeThread.fixture_id),
        home_team_name: activeThread.home_team_name || null,
        away_team_name: activeThread.away_team_name || null,
        match_label: activeThread.match_label || "",
      };
    }
    return draftFixture;
  }, [activeThread, draftFixture]);
  const activeMessages = useMemo(() => {
    if (!activeThreadId) return [];
    const items = messagesByThread[activeThreadId];
    return Array.isArray(items) ? items : [];
  }, [activeThreadId, messagesByThread]);

  const contextValue = useMemo(
    () => ({
      isOpen,
      isHistoryOpen,
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
      open,
      close,
      toggle,
      toggleHistoryPanel,
      loadThreads,
      selectThread,
      searchFixtures,
      selectFixtureForNewChat,
      sendMessage,
      askFromAction,
    }),
    [
      isOpen,
      isHistoryOpen,
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
      open,
      close,
      toggle,
      toggleHistoryPanel,
      loadThreads,
      selectThread,
      searchFixtures,
      selectFixtureForNewChat,
      sendMessage,
      askFromAction,
    ]
  );

  return <AiChatContext.Provider value={contextValue}>{children}</AiChatContext.Provider>;
}

export function useAiChat() {
  const contextValue = useContext(AiChatContext);
  if (!contextValue) {
    throw new Error("useAiChat must be used inside AiChatProvider");
  }
  return contextValue;
}
