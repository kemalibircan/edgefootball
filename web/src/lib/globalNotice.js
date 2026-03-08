export const GLOBAL_NOTICE_EVENT = "app-global-notice";

export function emitGlobalNotice(detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GLOBAL_NOTICE_EVENT, { detail: detail || {} }));
}







