import React, { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "../../contexts/ChatContext";
import { useLanguage } from "../../contexts/LanguageContext";
import TeamLogo from "../common/TeamLogo";
import "./ChatHistoryPanel.css";

export default function ChatHistoryPanel() {
  const { t } = useLanguage();
  const {
    threads,
    threadsLoading,
    threadsError,
    selectThread,
    searchQuery,
    searchResults,
    searchLoading,
    searchError,
    searchFixtures,
    selectFixtureForNewChat,
  } = useChat();

  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const debounceTimerRef = useRef(null);

  const handleSearchChange = useCallback(
    (e) => {
      const value = e.target.value;
      setLocalSearchQuery(value);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        searchFixtures(value);
      }, 300);
    },
    [searchFixtures]
  );

  const handleThreadClick = (threadId) => {
    selectThread(threadId);
  };

  const handleFixtureClick = (fixture) => {
    selectFixtureForNewChat(fixture);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return t.chatPage?.justNow ?? "Just now";
      if (diffMins < 60) return (t.chatPage?.minutesAgo ?? "{{count}}m ago").replace("{{count}}", String(diffMins));
      if (diffHours < 24) return (t.chatPage?.hoursAgo ?? "{{count}}h ago").replace("{{count}}", String(diffHours));
      if (diffDays < 7) return (t.chatPage?.daysAgo ?? "{{count}}d ago").replace("{{count}}", String(diffDays));
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  const displayList = searchQuery ? searchResults : threads;
  const isSearching = searchQuery.length > 0;

  return (
    <div className="chat-history-panel">
      <div className="chat-history-search">
        <input
          type="text"
          placeholder={t.chatPage?.searchPlaceholder ?? "Search matches..."}
          value={localSearchQuery}
          onChange={handleSearchChange}
          className="chat-history-search-input"
        />
      </div>

      {threadsError || searchError ? (
        <div className="chat-history-error">
          {threadsError || searchError}
        </div>
      ) : null}

      <div className="chat-history-list">
        {threadsLoading || searchLoading ? (
          <div className="chat-history-loading">{t.chatPage?.loading ?? "Loading..."}</div>
        ) : displayList.length === 0 ? (
          <div className="chat-history-empty">
            {isSearching ? (t.chatPage?.noMatches ?? "No matches found") : (t.chatPage?.noConversations ?? "No conversations yet. Search for a match to start chatting.")}
          </div>
        ) : (
          displayList.map((item) => {
            const isThread = "last_message_at" in item;
            
            return (
              <button
                key={isThread ? `thread-${item.id}` : `fixture-${item.fixture_id}`}
                className="chat-history-item"
                onClick={() => (isThread ? handleThreadClick(item.id) : handleFixtureClick(item))}
              >
                <div className="chat-history-item-logos">
                  <TeamLogo
                    src={item.home_team_logo}
                    teamName={item.home_team_name}
                    alt={item.home_team_name}
                    size="md"
                  />
                  <TeamLogo
                    src={item.away_team_logo}
                    teamName={item.away_team_name}
                    alt={item.away_team_name}
                    size="md"
                  />
                </div>

                <div className="chat-history-item-content">
                  <div className="chat-history-item-title">
                    {item.home_team_name} - {item.away_team_name}
                  </div>
                  {isThread ? (
                    <div className="chat-history-item-preview">
                      {item.last_message_content
                        ? item.last_message_content.substring(0, 60) + (item.last_message_content.length > 60 ? "..." : "")
                        : (t.chatPage?.noMessages ?? "No messages")}
                    </div>
                  ) : (
                    <div className="chat-history-item-meta">
                      {item.league_name} • {item.starting_at ? new Date(item.starting_at).toLocaleDateString() : ""}
                    </div>
                  )}
                </div>

                {isThread && item.last_message_at ? (
                  <div className="chat-history-item-time">
                    {formatTimestamp(item.last_message_at)}
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
