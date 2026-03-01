import React from "react";
import { useChat } from "../../contexts/ChatContext";
import "./ChatNotification.css";

export default function ChatNotification() {
  const { replyNotice, dismissReplyNotice, openSidebar, selectThread } = useChat();

  if (!replyNotice) return null;

  const handleClick = () => {
    if (replyNotice.threadId) {
      selectThread(replyNotice.threadId);
    }
    openSidebar();
    dismissReplyNotice();
  };

  return (
    <div className="chat-notification" onClick={handleClick}>
      <div className="chat-notification-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="chat-notification-content">
        <div className="chat-notification-message">{replyNotice.message}</div>
        <div className="chat-notification-action">Click to open</div>
      </div>
      <button
        className="chat-notification-close"
        onClick={(e) => {
          e.stopPropagation();
          dismissReplyNotice();
        }}
        aria-label="Dismiss"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
