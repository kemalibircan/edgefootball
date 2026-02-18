import React from "react";

export default function ActionButton({
  loading,
  loadingText,
  className = "",
  children,
  disabled,
  ...props
}) {
  const isSecondary = String(className).split(" ").includes("secondary");

  return (
    <button
      className={`btn ${isSecondary ? "btn-secondary" : ""} ${loading ? "is-loading" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      <span className="btn-inner">
        <span className="btn-spinner" aria-hidden={!loading} />
        <span className="btn-text">{loading ? loadingText || "Yükleniyor..." : children}</span>
      </span>
    </button>
  );
}
