import React from "react";
import "./ChatTypingIndicator.css";

export default function ChatTypingIndicator() {
  return (
    <div className="chat-typing-indicator">
      <div className="chat-typing-bubble">
        <div className="chat-typing-dot" />
        <div className="chat-typing-dot" />
        <div className="chat-typing-dot" />
      </div>
      <div className="chat-typing-text">AI is thinking...</div>
    </div>
  );
}
