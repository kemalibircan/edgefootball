import React from "react";
import { useChat } from "../../contexts/ChatContext";
import "./ChatToggleButton.css";

export default function ChatToggleButton() {
  const { isOpen, openSidebar, threads } = useChat();

  const unreadCount = threads.filter((t) => {
    return false;
  }).length;

  if (isOpen) return null;

  return (
    <button
      onClick={openSidebar}
      className="chat-toggle-button"
      aria-label="Open AI chat"
      title="AI Chat"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unreadCount > 0 ? <span className="chat-toggle-badge">{unreadCount}</span> : null}
    </button>
  );
}
