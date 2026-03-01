import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function upsertRobots(content) {
  if (typeof document === "undefined") return;
  const head = document.head;
  if (!head) return;

  let meta = head.querySelector('meta[name="robots"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "robots");
    head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function shouldNoIndex(pathname) {
  const path = String(pathname || "").toLowerCase();
  const blockedPrefixes = [
    "/admin",
    "/auth",
    "/chat",
    "/kuponlarim",
    "/ai-tahminlerim",
    "/sonuc-tahminlerim",
    "/login",
    "/register",
    "/forgot-password",
  ];
  return blockedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export default function GlobalSeoManager() {
  const location = useLocation();

  useEffect(() => {
    if (shouldNoIndex(location.pathname)) {
      upsertRobots("noindex,nofollow");
      return;
    }
    upsertRobots("index,follow");
  }, [location.pathname]);

  return null;
}
