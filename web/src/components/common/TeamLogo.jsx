import React from "react";
import "./TeamLogo.css";

export default function TeamLogo({ 
  src, 
  alt, 
  teamName, 
  size = "md",
  showFallback = true 
}) {
  const [imageError, setImageError] = React.useState(false);

  const getInitials = (name) => {
    if (!name) return "?";
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const sizeClass = `team-logo-${size}`;

  if (!src || imageError) {
    if (!showFallback) return null;
    
    return (
      <div className={`team-logo-fallback ${sizeClass}`}>
        <span>{getInitials(teamName || alt)}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || teamName || "Team logo"}
      className={`team-logo ${sizeClass}`}
      onError={() => setImageError(true)}
      loading="lazy"
    />
  );
}
