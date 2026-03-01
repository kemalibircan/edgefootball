import React, { useEffect, useRef } from "react";
import { useChat } from "../../contexts/ChatContext";
import ChatHistoryPanel from "./ChatHistoryPanel";
import ChatMessageList from "./ChatMessageList";
import ChatComposer from "./ChatComposer";
import "./ChatSidebar.css";

export default function ChatSidebar() {
  const { isOpen, closeSidebar, activeThreadId, draftFixture } = useChat();
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closeSidebar();
      }
    };

    const handleClickOutside = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        closeSidebar();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, closeSidebar]);

  if (!isOpen) return null;

  return (
    <>
      <div className="chat-sidebar-backdrop" onClick={closeSidebar} />
      <div ref={sidebarRef} className={`chat-sidebar ${isOpen ? "open" : ""}`}>
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h2>AI Chat</h2>
          </div>
          <button className="chat-sidebar-close" onClick={closeSidebar} aria-label="Close chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="chat-sidebar-content">
          {activeThreadId || draftFixture ? (
            <>
              <ChatMessageList />
              <ChatComposer />
            </>
          ) : (
            <ChatHistoryPanel />
          )}
        </div>
      </div>
    </>
  );
}
