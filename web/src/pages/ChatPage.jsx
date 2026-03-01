import React from "react";
import { useChat } from "../contexts/ChatContext";
import { useLanguage } from "../contexts/LanguageContext";
import ChatHistoryPanel from "../components/chat/ChatHistoryPanel";
import ChatMessageList from "../components/chat/ChatMessageList";
import ChatComposer from "../components/chat/ChatComposer";
import "./ChatPage.css";

export default function ChatPage() {
  const { t } = useLanguage();
  const { activeThreadId, draftFixture } = useChat();
  const hasConversation = activeThreadId || draftFixture;

  return (
    <div className="chat-page">
      <div className="chat-page-header">
        <h1 className="chat-page-title">{t.header?.aiChat ?? "AI Chat"}</h1>
      </div>

      <div className="chat-page-main">
        <aside className="chat-page-history">
          <ChatHistoryPanel />
        </aside>

        <section className="chat-page-conversation">
          {hasConversation ? (
            <>
              <ChatMessageList />
              <ChatComposer />
            </>
          ) : (
            <div className="chat-page-empty">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <circle cx="9" cy="10" r="1" fill="currentColor" />
                <circle cx="12" cy="10" r="1" fill="currentColor" />
                <circle cx="15" cy="10" r="1" fill="currentColor" />
              </svg>
              <p className="chat-page-empty-text">
                {t.chatPage?.selectOrSearch ?? "Bir sohbet seçin veya sol taraftan maç arayın."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
