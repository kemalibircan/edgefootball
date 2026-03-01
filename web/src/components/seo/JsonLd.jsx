import { useEffect } from "react";

export default function JsonLd({ id = "json-ld", data }) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const head = document.head;
    if (!head) return undefined;

    let script = head.querySelector(`script[data-json-ld-id='${id}']`);
    if (!script) {
      script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      script.setAttribute("data-json-ld-id", id);
      head.appendChild(script);
    }

    try {
      script.textContent = JSON.stringify(data || {});
    } catch {
      script.textContent = "{}";
    }

    return () => {
      script?.remove();
    };
  }, [id, data]);

  return null;
}
