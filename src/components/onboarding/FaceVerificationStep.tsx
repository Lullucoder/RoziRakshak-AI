"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import FaceLivenessCheck from "./FaceLivenessCheck";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaceVerificationResult {
  /** The R2 object key, e.g. "faces/{uid}.jpg" */
  r2Key: string;
}

interface FaceVerificationStepProps {
  workerUid: string;
  onVerified: (result: FaceVerificationResult) => void;
  onBack: () => void;
}

type Phase =
  | "liveness"   // FaceLivenessCheck is active
  | "uploading"  // uploading blob to R2
  | "confirmed"  // green success screen
  | "error";     // something went wrong

// ─── Component ────────────────────────────────────────────────────────────────

export function FaceVerificationStep({
  workerUid,
  onVerified,
  onBack,
}: FaceVerificationStepProps) {
  const [phase, setPhase] = useState<Phase>("liveness");
  const [r2Key, setR2Key]       = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [retryKey, setRetryKey] = useState(0); // remount FaceLivenessCheck on retry

  const handleLivenessSuccess = useCallback(async (blob: Blob) => {
    setPhase("uploading");
    try {
      // 1. Get presigned PUT URL from our API route
      const res = await fetch("/api/upload/face", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-worker-uid": workerUid,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const { presignedUrl, key } = (await res.json()) as {
        presignedUrl: string;
        key: string;
      };

      // 2. Upload the blob directly to R2 from the browser
      const putRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });

      if (!putRes.ok) {
        throw new Error(`R2 upload failed: HTTP ${putRes.status}`);
      }

      setR2Key(key);
      setPhase("confirmed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setErrorMsg(msg);
      setPhase("error");
    }
  }, [workerUid]);

  const handleLivenessFailure = useCallback((reason: string) => {
    setErrorMsg(reason);
    setPhase("error");
  }, []);

  const handleRetry = useCallback(() => {
    setErrorMsg("");
    setRetryKey((k) => k + 1);
    setPhase("liveness");
  }, []);

  // ── Uploading spinner ──────────────────────────────────────────────────────

  if (phase === "uploading") {
    return (
      <motion.div
        key="face-uploading"
        className="w-full max-w-md"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
      >
        <div className="glass rounded-2xl p-8 flex flex-col items-center text-center gap-5">
          <div className="relative w-16 h-16">
            <div
              className="absolute inset-0 rounded-full border-4 border-primary/20"
              style={{ borderTopColor: "var(--primary)", animation: "spin 1.2s linear infinite" }}
            />
            <Loader2 className="absolute inset-0 m-auto w-7 h-7 text-primary animate-spin" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground mb-1">Securing your photo…</h2>
            <p className="text-sm text-muted-foreground">
              Uploading your face image to secure storage.
            </p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </motion.div>
    );
  }

  // ── Error / retry ──────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <motion.div
        key="face-error"
        className="w-full max-w-md"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.3 }}
      >
        <div className="glass rounded-2xl p-6 text-center space-y-5">
          <div className="flex justify-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.08)", border: "2px solid rgba(239,68,68,0.3)" }}
            >
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground mb-1">Verification Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMsg || "Something went wrong."}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/80 transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleRetry}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Confirmed (green success card) ─────────────────────────────────────────

  if (phase === "confirmed") {
    return (
      <motion.div
        key="face-confirmed"
        className="w-full max-w-md"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.35 }}
      >
        <div
          className="rounded-2xl p-8 flex flex-col items-center text-center gap-5"
          style={{
            background: "rgba(33,115,70,0.06)",
            border: "1px solid rgba(33,115,70,0.3)",
          }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(33,115,70,0.12)",
                border: "2.5px solid #217346",
                boxShadow: "0 0 30px rgba(33,115,70,0.25)",
              }}
            >
              <CheckCircle2 className="w-10 h-10" style={{ color: "#217346" }} strokeWidth={1.8} />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <h2 className="text-xl font-bold" style={{ color: "#217346" }}>
              Face Verified ✓
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Liveness check passed. Your face photo has been securely stored.
            </p>
          </motion.div>

          <motion.div
            className="w-full rounded-xl p-4 text-left space-y-2"
            style={{
              background: "rgba(33,115,70,0.04)",
              border: "1px solid rgba(33,115,70,0.2)",
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Liveness check</span>
              <span className="text-xs font-semibold" style={{ color: "#217346" }}>✓ Passed</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Photo stored</span>
              <span className="text-xs font-mono text-foreground truncate max-w-[180px]">{r2Key}</span>
            </div>
          </motion.div>

          <motion.button
            id="face-continue-btn"
            onClick={() => onVerified({ r2Key })}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #217346 0%, #2a9356 100%)",
              boxShadow: "0 4px 20px rgba(33,115,70,0.35)",
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
          >
            Continue to Submit <ArrowRight className="inline w-4 h-4 ml-1" />
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // ── Liveness check (default) ───────────────────────────────────────────────

  return (
    <motion.div
      key="face-liveness"
      className="w-full max-w-md"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <div className="glass rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Face Verification</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete the 3-step liveness check to confirm your identity.
          </p>
        </div>

        {/* FaceLivenessCheck — remounted on retry via key */}
        <FaceLivenessCheck
          key={retryKey}
          onSuccess={handleLivenessSuccess}
          onFailure={handleLivenessFailure}
          onRetry={handleRetry}
        />

        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Work Details
        </button>

        <p className="text-center text-[10px] text-muted-foreground">
          Camera is used only for liveness. Photo is stored securely and used only for identity verification.
        </p>
      </div>
    </motion.div>
  );
}
