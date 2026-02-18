import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import MarkdownContent from "../dashboard/MarkdownContent";
import { AUTH_TOKEN_KEY, readAuthToken } from "../../lib/auth";
import { useAiChat } from "../../state/chat/AiChatContext";

const HIDDEN_PATHNAMES = new Set(["/login", "/register", "/forgot-password"]);

function formatStamp(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function compactText(value, max = 100) {
  const safeText = String(value || "").replace(/\s+/g, " ").trim();
  if (!safeText) return "";
  if (safeText.length <= max) return safeText;
  return `${safeText.slice(0, max - 1)}…`;
}

export default function StickyAiChatDock() {
  const location = useLocation();
  const [hasToken, setHasToken] = useState(() => !!readAuthToken());
  const [composer, setComposer] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const {
    isOpen,
    isHistoryOpen,
    threads,
    threadsLoading,
    threadsError,
    activeThreadId,
    activeMessages,
    selectedFixture,
    searchResults,
    searchLoading,
    searchError,
    messagesLoading,
    messagesError,
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
  } = useAiChat();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncAuth = () => {
      setHasToken(!!readAuthToken());
    };
    const onStorage = (event) => {
      if (!event.key || event.key === AUTH_TOKEN_KEY) {
        syncAuth();
      }
    };
    syncAuth();
    window.addEventListener("auth-token-changed", syncAuth);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("auth-token-changed", syncAuth);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!hasToken || !isOpen) return;
    loadThreads({ selectLatest: false });
  }, [hasToken, isOpen, loadThreads]);

  useEffect(() => {
    if (!isHistoryOpen || !hasToken) return;
    const timerId = window.setTimeout(() => {
      searchFixtures(historyQuery, { limit: 20 });
    }, 220);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [historyQuery, isHistoryOpen, hasToken, searchFixtures]);

  const isHiddenRoute = HIDDEN_PATHNAMES.has(location.pathname);
  const shouldShowDock = hasToken && !isHiddenRoute;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const shouldLockScroll = shouldShowDock && isOpen && isFullscreen;
    document.body.classList.toggle("ai-chat-lock-scroll", shouldLockScroll);
    return () => {
      document.body.classList.remove("ai-chat-lock-scroll");
    };
  }, [shouldShowDock, isOpen, isFullscreen]);

  useEffect(() => {
    if (!shouldShowDock || !isOpen || !isFullscreen || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shouldShowDock, isOpen, isFullscreen]);

  const selectedMatchLabel = useMemo(() => {
    if (!selectedFixture?.fixture_id) return "";
    const home = String(selectedFixture?.home_team_name || "").trim();
    const away = String(selectedFixture?.away_team_name || "").trim();
    if (home && away) return `${home} - ${away}`;
    return String(selectedFixture?.match_label || `Fixture ${selectedFixture.fixture_id}`);
  }, [selectedFixture]);

  const handleSend = async () => {
    const question = String(composer || "").trim();
    if (!question || sending) return;
    const response = await sendMessage({ question, source: "manual", language: "tr" });
    if (response?.ok) {
      setComposer("");
    }
  };

  const handleClose = () => {
    setIsFullscreen(false);
    close();
  };

  const handleToggle = () => {
    setIsFullscreen(false);
    toggle();
  };

  const handleFullscreenToggle = () => {
    setIsFullscreen((prev) => !prev);
  };

  if (!shouldShowDock) return null;

  return (
    <div className={`ai-chat-dock-shell ${isFullscreen ? "is-fullscreen" : ""}`}>
      {!isOpen ? (
        <button
          type="button"
          className="ai-chat-dock-toggle"
          onClick={open}
          aria-label="AI sohbet panelini ac"
          aria-expanded={false}
        >
          <i className="fas fa-comments" aria-hidden />
          <span>AI Chat</span>
        </button>
      ) : (
        <aside className={`ai-chat-dock-panel ${isFullscreen ? "is-fullscreen" : ""}`} aria-live="polite">
          <div className="ai-chat-header">
            <button
              type="button"
              className="ai-chat-icon-btn"
              onClick={toggleHistoryPanel}
              aria-label="Chat gecmisi panelini ac"
              title="Gecmis ve mac secimi"
            >
              <i className="fas fa-stream" aria-hidden />
            </button>
            <div className="ai-chat-header-title">
              <strong>AI Chat</strong>
              <span>{selectedMatchLabel || "Mac secimi bekleniyor"}</span>
            </div>
            <div className="ai-chat-header-actions">
              <button
                type="button"
                className="ai-chat-icon-btn"
                onClick={handleFullscreenToggle}
                aria-label={isFullscreen ? "Tam ekrandan cik" : "Tam ekrana gec"}
                title={isFullscreen ? "Tam ekrandan cik" : "Tam ekran"}
              >
                <i className={`fas ${isFullscreen ? "fa-compress-arrows-alt" : "fa-expand-arrows-alt"}`} aria-hidden />
              </button>
              <button
                type="button"
                className="ai-chat-icon-btn"
                onClick={handleToggle}
                aria-label="AI sohbet panelini daralt"
                title="Daralt"
              >
                <i className="fas fa-compress-alt" aria-hidden />
              </button>
              <button
                type="button"
                className="ai-chat-icon-btn"
                onClick={handleClose}
                aria-label="AI sohbet panelini kapat"
                title="Kapat"
              >
                <i className="fas fa-times" aria-hidden />
              </button>
            </div>
          </div>

          <div className="ai-chat-content">
            <aside className={`ai-chat-history-drawer ${isHistoryOpen ? "is-open" : ""}`}>
              <div className="ai-chat-history-head">
                <strong>
                  <i className="fas fa-history" aria-hidden /> Gecmis
                </strong>
                <button type="button" className="ai-chat-icon-btn" onClick={toggleHistoryPanel} aria-label="Gecmis panelini kapat">
                  <i className="fas fa-angle-left" aria-hidden />
                </button>
              </div>

              <label className="ai-chat-history-search">
                <i className="fas fa-search" aria-hidden />
                <input
                  type="search"
                  placeholder="Mac ara..."
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                />
              </label>

              <div className="ai-chat-history-results">
                {searchLoading ? <p className="small-text">Maclar aranıyor...</p> : null}
                {searchError ? <p className="small-text error-inline">{searchError}</p> : null}
                {!searchLoading && !searchError && searchResults.length ? (
                  searchResults.map((item) => (
                    <button
                      key={`chat-search-${item.fixture_id}`}
                      type="button"
                      className="ai-chat-history-item search-item"
                      onClick={() => selectFixtureForNewChat(item)}
                    >
                      <div className="row spread">
                        <strong>{item.match_label}</strong>
                        <span>{formatStamp(item.starting_at)}</span>
                      </div>
                      <span>{item.league_name || "Lig"}</span>
                    </button>
                  ))
                ) : null}
              </div>

              <div className="ai-chat-history-list">
                <h4>Chat Threadleri</h4>
                {threadsLoading ? <p className="small-text">Gecmis yukleniyor...</p> : null}
                {threadsError ? <p className="small-text error-inline">{threadsError}</p> : null}
                {!threadsLoading && !threads.length ? <p className="small-text">Henuz chat gecmisi yok.</p> : null}
                {threads.map((thread) => (
                  <button
                    key={`chat-thread-${thread.id}`}
                    type="button"
                    className={`ai-chat-history-item ${Number(activeThreadId) === Number(thread.id) ? "is-active" : ""}`}
                    onClick={() => selectThread(thread.id, { openPanel: true })}
                  >
                    <div className="row spread">
                      <strong>{thread.match_label || "Mac"}</strong>
                      <span>{formatStamp(thread.last_message_at)}</span>
                    </div>
                    <span>{compactText(thread.last_message_content || "", 90) || "Mesaj yok"}</span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="ai-chat-main">
              <div className="ai-chat-message-list">
                {messagesLoading ? <p className="small-text">Mesajlar yukleniyor...</p> : null}
                {messagesError ? <p className="small-text error-inline">{messagesError}</p> : null}
                {!messagesLoading && !messagesError && !activeMessages.length ? (
                  <div className="ai-chat-empty-state">
                    <p>Soldaki gecmis panelinden mac secebilir veya arama ile yeni mac bulabilirsin.</p>
                    <p>{selectedFixture?.fixture_id ? "Mac secildi. Sorunu yazip Gonder'e basabilirsin." : "Mac secmeden soru gonderilemez."}</p>
                  </div>
                ) : null}
                {activeMessages.map((message) => (
                  <article
                    key={`chat-message-${message.id}`}
                    className={`ai-chat-message-bubble ${message.role === "assistant" ? "assistant" : "user"}`}
                  >
                    <div className="ai-chat-message-meta">
                      <span>{message.role === "assistant" ? "AI" : "Sen"}</span>
                      <span>{formatStamp(message.created_at)}</span>
                    </div>
                    {message.role === "assistant" ? (
                      <MarkdownContent content={message.content_markdown} />
                    ) : (
                      <p>{message.content_markdown}</p>
                    )}
                  </article>
                ))}
                {sending ? (
                  <article className="ai-chat-message-bubble assistant ai-chat-message-bubble-typing">
                    <div className="ai-chat-message-meta">
                      <span>AI</span>
                    </div>
                    <p className="ai-chat-typing-text">
                      <i className="fas fa-circle-notch fa-spin" aria-hidden /> AI yaniti hazirlaniyor...
                    </p>
                  </article>
                ) : null}
              </div>

              <div className="ai-chat-compose">
                <div className="ai-chat-compose-head">
                  <span>
                    <i className="fas fa-futbol" aria-hidden /> {selectedMatchLabel || "Mac secilmedi"}
                  </span>
                  {!selectedFixture?.fixture_id ? (
                    <button type="button" className="site-link" onClick={toggleHistoryPanel}>
                      Mac Sec
                    </button>
                  ) : null}
                </div>
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder="Secili mac icin sorunu yaz..."
                  rows={3}
                  disabled={sending}
                />
                {sendError ? <p className="small-text error-inline">{sendError}</p> : null}
                <div className="row spread">
                  <span className="small-text">
                    {sending ? "Yanitin hazirlanmasi 5-20 saniye surebilir." : "Sohbet gecmisin otomatik kaydedilir."}
                  </span>
                  <button
                    type="button"
                    className="ai-chat-send-btn"
                    disabled={sending || !selectedFixture?.fixture_id || !String(composer || "").trim()}
                    onClick={handleSend}
                  >
                    <i className="fas fa-paper-plane" aria-hidden /> {sending ? "AI yaniti hazirlaniyor..." : "Gonder"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
