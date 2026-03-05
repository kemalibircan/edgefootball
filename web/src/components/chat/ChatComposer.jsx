import React, { useState } from "react";
import { useChat } from "../../contexts/ChatContext";
import { useLanguage } from "../../contexts/LanguageContext";
import "./ChatComposer.css";

export default function ChatComposer() {
  const { t, locale } = useLanguage();
  const { activeThreadId, draftFixture, sendMessage, sending, sendError } = useChat();
  const [question, setQuestion] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    const result = await sendMessage({
      question: trimmed,
      thread_id: activeThreadId,
      fixture: draftFixture,
    });

    if (result.ok) {
      setQuestion("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const hasContext = activeThreadId || draftFixture;

  const isModelMissingError =
    typeof sendError === "string" &&
    (sendError.includes("No ready/default model found for league") ||
      sendError.includes("No trained models available"));

  const modelMissingTitle = t.chatPage?.modelMissingTitle;
  const modelMissingBody = t.chatPage?.modelMissingBody;
  const genericErrorTitle =
    t.chatPage?.errorTitle ?? (locale === "en" ? "Something went wrong" : "Bir hata oluştu");

  return (
    <div className="chat-composer">
      {!hasContext ? (
        <div className="chat-composer-warning">
          {t.chatPage?.selectMatchWarning ?? "Select a match from history or search to start chatting"}
        </div>
      ) : null}

      {sendError ? (
        <div className="chat-composer-error" role="alert">
          <div className="chat-composer-error-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
              <path
                d="M12 7v7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
            </svg>
          </div>
          <div className="chat-composer-error-content">
            <div className="chat-composer-error-title">
              {isModelMissingError && modelMissingTitle ? modelMissingTitle : genericErrorTitle}
            </div>
            <div className="chat-composer-error-text">
              {isModelMissingError && modelMissingBody ? modelMissingBody : sendError}
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="chat-composer-form">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasContext ? (t.chatPage?.askPlaceholder ?? "Ask about this match...") : (t.chatPage?.selectMatchPlaceholder ?? "Select a match first")}
          className="chat-composer-input"
          rows={3}
          disabled={!hasContext || sending}
        />
        <button
          type="submit"
          className="chat-composer-send"
          disabled={!hasContext || !question.trim() || sending}
        >
          {sending ? (
            <svg className="chat-composer-spinner" width="20" height="20" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
              <path
                d="M12 2 A10 10 0 0 1 22 12"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
