import React, { useEffect, useRef, useState } from "react";
import { renderGoogleSignInButton, toGoogleSignInErrorMessage } from "../../lib/googleIdentity";
import { uiText } from "../../i18n/terms.tr";

export default function GoogleSignInButton({
  onCredential,
  onError,
  loading = false,
  disabled = false,
  text = "signin_with",
  errorFallback = uiText.auth.google.errors.loginFailed,
  setupErrorFallback = uiText.auth.google.errors.setupRequired,
}) {
  const containerRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let disposed = false;
    let cleanup = null;
    setIsReady(false);

    const mountGoogleButton = async () => {
      try {
        cleanup = await renderGoogleSignInButton(containerRef.current, {
          text,
          onCredential: async (credential) => {
            if (typeof onCredentialRef.current === "function") {
              await onCredentialRef.current(credential);
            }
          },
          onError: (error) => {
            if (typeof onErrorRef.current === "function") {
              onErrorRef.current(toGoogleSignInErrorMessage(error, errorFallback));
            }
          },
        });
        if (!disposed) {
          setIsReady(true);
        }
      } catch (error) {
        if (!disposed && typeof onErrorRef.current === "function") {
          onErrorRef.current(toGoogleSignInErrorMessage(error, setupErrorFallback));
        }
      }
    };

    mountGoogleButton();

    return () => {
      disposed = true;
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [errorFallback, setupErrorFallback, text]);

  return (
    <div
      className={`google-signin-shell ${loading || disabled ? "is-disabled" : ""}`}
      aria-busy={loading ? "true" : "false"}
      aria-disabled={loading || disabled ? "true" : "false"}
    >
      <div ref={containerRef} className="google-signin-button" />
      {!isReady ? <p className="small-text google-signin-hint">{uiText.auth.google.loadingButton}</p> : null}
    </div>
  );
}
