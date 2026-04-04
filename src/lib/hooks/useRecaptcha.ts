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
  const recaptchaRef = useRef<HTMLDivElement | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Initialise on mount ───────────────────────────────────────────────
  useEffect(() => {
    const el = recaptchaRef.current;
    if (!el) return;

    // Prevent double-init during React Strict Mode double-mount
    if (verifierRef.current) return;

    try {
      const rv = new RecaptchaVerifier(auth, el, {
        size: "normal",
        callback: () => {
          // Solved — nothing to do; signInWithPhoneNumber drives the flow.
          setIsReady(true);
          setError(null);
        },
        "expired-callback": () => {
          // Token expired before being used — reset so a fresh one is generated.
          setIsReady(false);
          rv.render().then(() => {
            setIsReady(true);
          }).catch((err) => {
            console.error("reCAPTCHA render error:", err);
            setError("Failed to load reCAPTCHA. Please refresh the page.");
          });
        },
        "error-callback": () => {
          setError("reCAPTCHA error. Please refresh the page.");
          setIsReady(false);
        },
      });

      verifierRef.current = rv;
      
      // Render the reCAPTCHA widget
      rv.render().then(() => {
        setIsReady(true);
        setError(null);
      }).catch((err) => {
        console.error("reCAPTCHA initialization error:", err);
        setError("Failed to load reCAPTCHA. Please check your internet connection and refresh.");
        setIsReady(false);
      });

    } catch (err) {
      console.error("reCAPTCHA setup error:", err);
      setError("Failed to initialize reCAPTCHA. Please refresh the page.");
      setIsReady(false);
    }

    // ── Cleanup on unmount ────────────────────────────────────────────
    return () => {
      try {
        verifierRef.current?.clear();
      } catch (err) {
        console.error("reCAPTCHA cleanup error:", err);
      }
      verifierRef.current = null;
      setIsReady(false);
      setError(null);
    };
  }, []);

  /**
   * Force-reset the verifier (useful after a failed attempt so the
   * next call to signInWithPhoneNumber gets a fresh token).
   */
  const resetVerifier = useCallback(() => {
    if (verifierRef.current) {
      verifierRef.current.render().catch((err) => {
        console.error("reCAPTCHA reset error:", err);
      });
    }
  }, []);

  return {
    /** Attach this ref to an empty `<div>` that acts as the reCAPTCHA container. */
    recaptchaRef,
    /** The RecaptchaVerifier instance, or `null` before initialisation. */
    verifier: verifierRef.current,
    /** `true` once the verifier has been created and is usable. */
    isReady,
    /** Error message if reCAPTCHA failed to load */
    error,
    /** Force-reset the reCAPTCHA (call after a failed OTP send). */
    resetVerifier,
  } as const;
}
