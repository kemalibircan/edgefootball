import React, { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useChat } from "../../contexts/ChatContext";
import { useLanguage } from "../../contexts/LanguageContext";
import TeamLogo from "../common/TeamLogo";
import ChatTypingIndicator from "./ChatTypingIndicator";
import "./ChatMessageList.css";

export default function ChatMessageList() {
  const { t } = useLanguage();
  const { activeThread, activeMessages, messagesLoading, messagesError, sending, draftFixture } = useChat();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages, sending]);

  const displayFixture = activeThread || draftFixture;

  return (
    <div className="chat-message-list">
      {displayFixture ? (
        <div className="chat-message-list-header">
          <div className="chat-message-list-teams">
            <TeamLogo
              src={displayFixture.home_team_logo}
              teamName={displayFixture.home_team_name}
              alt={displayFixture.home_team_name}
              size="md"
            />
            <div className="chat-message-list-match-label">
              {displayFixture.home_team_name} - {displayFixture.away_team_name}
            </div>
            <TeamLogo
              src={displayFixture.away_team_logo}
              teamName={displayFixture.away_team_name}
              alt={displayFixture.away_team_name}
              size="md"
            />
          </div>
          {displayFixture.league_name ? (
            <div className="chat-message-list-league">{displayFixture.league_name}</div>
          ) : null}
        </div>
      ) : null}

      <div className="chat-messages-scroll">
        {messagesLoading ? (
          <div className="chat-messages-loading">{t.chatPage?.loadingMessages ?? "Loading messages..."}</div>
        ) : messagesError ? (
          <div className="chat-messages-error">{messagesError}</div>
        ) : activeMessages.length === 0 ? (
          <div className="chat-messages-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="12" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
            <p>{t.chatPage?.startConversation ?? "Start the conversation by asking about this match"}</p>
          </div>
        ) : (
          [...activeMessages].reverse().map((message) => (
            <div
              key={message.id}
              className={`chat-message ${message.role === "user" ? "user" : "assistant"}`}
            >
              <div className="chat-message-bubble">
                <ReactMarkdown>{message.content_markdown || ""}</ReactMarkdown>
              </div>
              <div className="chat-message-time">
                {message.created_at ? new Date(message.created_at).toLocaleTimeString() : ""}
              </div>
            </div>
          ))
        )}

        {sending ? <ChatTypingIndicator /> : null}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
