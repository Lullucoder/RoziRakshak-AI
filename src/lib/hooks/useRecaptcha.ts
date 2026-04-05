"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RecaptchaVerifier } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Hook that manages an invisible reCAPTCHA verifier tied to a DOM element.
 *
 * Usage:
 * ```tsx
 * const { recaptchaRef, verifier, isReady } = useRecaptcha();
 * return <div ref={recaptchaRef} />;
 * ```
 *
 * - `recaptchaRef` — attach to an empty `<div>` in your JSX
 * - `verifier`     — the `RecaptchaVerifier` instance (null until ready)
 * - `isReady`      — true once the verifier has been initialised
 */
export function useRecaptcha() {
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const hostElRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const recaptchaRef = useCallback((node: HTMLDivElement | null) => {
    setContainerEl(node);
  }, []);
  const [verifier, setVerifier] = useState<RecaptchaVerifier | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearVerifierInstance = useCallback(() => {
    try {
      verifierRef.current?.clear();
    } catch (err) {
      console.error("reCAPTCHA cleanup error:", err);
    }

    verifierRef.current = null;
    widgetIdRef.current = null;

    if (hostElRef.current) {
      hostElRef.current.innerHTML = "";
      hostElRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    setVerifier(null);
    setIsReady(false);
    setError(null);
  }, []);

  const initializeVerifier = useCallback((el: HTMLDivElement) => {
    if (verifierRef.current) return;

    try {
      // Always render into a fresh child node to avoid
      // "reCAPTCHA has already been rendered in this element".
      el.innerHTML = "";
      const host = document.createElement("div");
      el.appendChild(host);
      hostElRef.current = host;

      const rv = new RecaptchaVerifier(auth, host, {
        size: "invisible",
        callback: () => {
          // Solved — nothing to do; signInWithPhoneNumber drives the flow.
          setIsReady(true);
          setError(null);
        },
        "expired-callback": () => {
          setIsReady(false);

          try {
            const grecaptcha = (globalThis as { grecaptcha?: { reset?: (widgetId?: number) => void } }).grecaptcha;

            if (grecaptcha?.reset) {
              grecaptcha.reset(widgetIdRef.current ?? undefined);
              setIsReady(true);
            }
          } catch (err) {
            console.error("reCAPTCHA reset after expiry failed:", err);
            setError("Failed to refresh reCAPTCHA. Please try again.");
          }
        },
        "error-callback": () => {
          setError("reCAPTCHA error. Please refresh the page.");
          setIsReady(false);
        },
      });

      verifierRef.current = rv;
      setVerifier(rv);

      rv
        .render()
        .then((widgetId) => {
          widgetIdRef.current = widgetId;
          setIsReady(true);
          setError(null);
        })
        .catch((err) => {
          console.error("reCAPTCHA initialization error:", err);
          setError(
            "Failed to load reCAPTCHA. Please check your internet connection and refresh."
          );
          setIsReady(false);
        });
    } catch (err) {
      console.error("reCAPTCHA setup error:", err);
      setError("Failed to initialize reCAPTCHA. Please refresh the page.");
      setIsReady(false);
    }
  }, []);

  // Initialise only when container actually mounts (dialog open).
  useEffect(() => {
    if (!containerEl) {
      clearVerifierInstance();
      resetState();
      return;
    }

    initializeVerifier(containerEl);

    return () => {
      clearVerifierInstance();
      resetState();
    };
  }, [containerEl, clearVerifierInstance, initializeVerifier, resetState]);

  /**
   * Force-reset the verifier (useful after a failed attempt so the
   * next call to signInWithPhoneNumber gets a fresh token).
   */
  const resetVerifier = useCallback(() => {
    if (!containerEl) {
      return;
    }

    try {
      const grecaptcha = (globalThis as { grecaptcha?: { reset?: (widgetId?: number) => void } }).grecaptcha;

      if (grecaptcha?.reset && widgetIdRef.current !== null) {
        grecaptcha.reset(widgetIdRef.current);
        setIsReady(true);
        setError(null);
        return;
      }

      // Fallback: recreate verifier to force a fresh app-verification token.
      clearVerifierInstance();
      resetState();
      initializeVerifier(containerEl);
    } catch (err) {
      console.error("reCAPTCHA reset error:", err);
    }
  }, [containerEl, clearVerifierInstance, initializeVerifier, resetState]);

  return {
    /** Attach this ref to an empty `<div>` that acts as the reCAPTCHA container. */
    recaptchaRef,
    /** The RecaptchaVerifier instance, or `null` before initialisation. */
    verifier,
    /** `true` once the verifier has been created and is usable. */
    isReady,
    /** Error message if reCAPTCHA failed to load */
    error,
    /** Force-reset the reCAPTCHA (call after a failed OTP send). */
    resetVerifier,
  } as const;
}
