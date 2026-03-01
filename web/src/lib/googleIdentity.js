const GOOGLE_IDENTITY_SCRIPT_ID = "google-identity-services-script";
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_SCRIPT_LOAD_TIMEOUT_MS = 12000;
const GOOGLE_CREDENTIAL_TIMEOUT_MS = 25000;

const CLIENT_ID_PLACEHOLDER_MARKERS = ["<", ">", "replace", "your_", "example"];

let googleScriptPromise = null;
let activeRenderToken = 0;

class GoogleIdentityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GoogleIdentityError";
    this.code = code || "google_identity_error";
  }
}

function normalizeValue(value) {
  return String(value || "").trim();
}

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isGoogleIdentityReady() {
  if (!isBrowser()) return false;
  return Boolean(window.google && window.google.accounts && window.google.accounts.id);
}

function isConfiguredClientId(value) {
  const normalized = normalizeValue(value);
  if (!normalized) return false;
  const lowered = normalized.toLowerCase();
  return CLIENT_ID_PLACEHOLDER_MARKERS.every((marker) => !lowered.includes(marker));
}

function scriptLoadTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return GOOGLE_SCRIPT_LOAD_TIMEOUT_MS;
  return Math.max(3000, Math.floor(parsed));
}

function credentialTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return GOOGLE_CREDENTIAL_TIMEOUT_MS;
  return Math.max(5000, Math.floor(parsed));
}

function buttonWidthPx(container, width) {
  const parsed = Number(width);
  if (Number.isFinite(parsed) && parsed >= 180) {
    return Math.floor(parsed);
  }
  const clientWidth = Math.floor(Number(container?.clientWidth || 0));
  if (clientWidth >= 220) {
    return clientWidth;
  }
  return 320;
}

export function getGoogleWebClientId() {
  return normalizeValue(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID);
}

export function assertGoogleWebClientId() {
  const clientId = getGoogleWebClientId();
  if (!isConfiguredClientId(clientId)) {
    throw new GoogleIdentityError(
      "Google giris servisi henuz ayarlanmamis. GOOGLE_WEB_CLIENT_ID degerini kontrol edin.",
      "config_missing",
    );
  }
  return clientId;
}

export async function loadGoogleIdentityScript(options = {}) {
  if (!isBrowser()) {
    throw new GoogleIdentityError("Google giris sadece tarayicida kullanilabilir.", "not_browser");
  }
  if (isGoogleIdentityReady()) {
    return window.google;
  }
  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  const timeout = scriptLoadTimeoutMs(options.timeoutMs);
  const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID);
  const script =
    existing ||
    Object.assign(document.createElement("script"), {
      id: GOOGLE_IDENTITY_SCRIPT_ID,
      src: GOOGLE_IDENTITY_SCRIPT_SRC,
      async: true,
      defer: true,
    });

  googleScriptPromise = new Promise((resolve, reject) => {
    if (isGoogleIdentityReady()) {
      resolve(window.google);
      return;
    }

    let timerId = 0;

    const cleanup = () => {
      if (timerId) {
        window.clearTimeout(timerId);
      }
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    const onLoad = () => {
      cleanup();
      if (!isGoogleIdentityReady()) {
        reject(new GoogleIdentityError("Google kimlik betigi yuklendi ancak hazir degil.", "script_not_ready"));
        return;
      }
      resolve(window.google);
    };

    const onError = () => {
      cleanup();
      reject(new GoogleIdentityError("Google kimlik betigi yuklenemedi.", "script_load_failed"));
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    timerId = window.setTimeout(() => {
      cleanup();
      reject(new GoogleIdentityError("Google kimlik betigi zaman asimina ugradi.", "script_timeout"));
    }, timeout);

    if (!existing) {
      document.head.appendChild(script);
    }
  })
    .then((google) => google)
    .catch((error) => {
      googleScriptPromise = null;
      throw error;
    });

  return googleScriptPromise;
}

export function toGoogleSignInErrorMessage(error, fallbackMessage = "Gmail ile giris basarisiz.") {
  const message = normalizeValue(error?.message);
  const code = normalizeValue(error?.code).toLowerCase();

  if (code === "config_missing") {
    return "Google giris servisi henuz ayarlanmamis. GOOGLE_WEB_CLIENT_ID degerini kontrol edin.";
  }
  if (code === "popup_timeout") {
    return "Google popup acilamadi veya kapatildi. Tarayicida popup engelini kontrol edip tekrar deneyin.";
  }
  if (code === "token_missing") {
    return "Google kimlik dogrulamasi tamamlanamadi. Lutfen tekrar deneyin.";
  }
  if (code === "script_load_failed" || code === "script_timeout" || code === "script_not_ready") {
    return "Google giris servisi su anda kullanilamiyor. Biraz sonra tekrar deneyin.";
  }

  const lowered = message.toLowerCase();
  if (!message) {
    return fallbackMessage;
  }
  if (lowered.includes("popup")) {
    return "Google popup acilamadi veya kapatildi. Tarayicida popup engelini kontrol edip tekrar deneyin.";
  }
  if (lowered.includes("id_token") || lowered.includes("credential")) {
    return "Google kimlik dogrulamasi tamamlanamadi. Lutfen tekrar deneyin.";
  }
  return message;
}

export async function renderGoogleSignInButton(container, options = {}) {
  if (!isBrowser()) {
    throw new GoogleIdentityError("Google giris sadece tarayicida kullanilabilir.", "not_browser");
  }
  if (!(container instanceof HTMLElement)) {
    throw new GoogleIdentityError("Google giris butonu kapsayicisi gecersiz.", "invalid_container");
  }
  if (typeof options.onCredential !== "function") {
    throw new GoogleIdentityError("Google giris callback fonksiyonu eksik.", "missing_callback");
  }

  const clientId = assertGoogleWebClientId();
  await loadGoogleIdentityScript();

  if (!isGoogleIdentityReady()) {
    throw new GoogleIdentityError("Google giris servisi hazir degil.", "script_not_ready");
  }

  const onError = typeof options.onError === "function" ? options.onError : null;
  const timeout = credentialTimeoutMs(options.credentialTimeoutMs);
  const text = normalizeValue(options.text || "signin_with") || "signin_with";
  const locale = normalizeValue(options.locale || "tr") || "tr";
  const width = buttonWidthPx(container, options.width);

  const token = ++activeRenderToken;
  let disposed = false;
  let popupTimer = 0;

  const clearPopupTimer = () => {
    if (popupTimer) {
      window.clearTimeout(popupTimer);
      popupTimer = 0;
    }
  };

  const notifyError = (error) => {
    if (disposed || token !== activeRenderToken) return;
    clearPopupTimer();
    if (onError) {
      onError(error);
    }
  };

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (disposed || token !== activeRenderToken) return;
      clearPopupTimer();
      const credential = normalizeValue(response?.credential);
      if (!credential) {
        notifyError(new GoogleIdentityError("Google id_token alinamadi.", "token_missing"));
        return;
      }
      Promise.resolve()
        .then(() => options.onCredential(credential))
        .catch((error) => notifyError(error));
    },
    ux_mode: "popup",
    auto_select: false,
    cancel_on_tap_outside: true,
    context: "signin",
  });

  container.innerHTML = "";
  window.google.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    text,
    shape: "pill",
    logo_alignment: "left",
    locale,
    width,
    click_listener: () => {
      clearPopupTimer();
      popupTimer = window.setTimeout(() => {
        notifyError(
          new GoogleIdentityError(
            "Google popup acilamadi veya kapatildi. Tarayicida popup engelini kontrol edip tekrar deneyin.",
            "popup_timeout",
          ),
        );
      }, timeout);
    },
  });

  return () => {
    disposed = true;
    clearPopupTimer();
    if (token === activeRenderToken) {
      activeRenderToken += 1;
    }
    container.innerHTML = "";
  };
}
