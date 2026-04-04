"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ArrowRight, CheckCircle2, AlertTriangle, Lock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AadhaarVerificationResult {
  verified: boolean;
  maskedAadhaar: string;   // "XXXX-XXXX-3421"
  verifiedAt: string;      // ISO timestamp
  method: "digilocker_mock";
}

interface AadhaarVerificationProps {
  onSuccess: (aadhaarData: AadhaarVerificationResult) => void;
  onSkip?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DL_GREEN = "#217346";
const DL_GREEN_LIGHT = "#2a9356";
const DL_GREEN_BG = "rgba(33, 115, 70, 0.08)";
const DL_GREEN_BORDER = "rgba(33, 115, 70, 0.3)";

type Screen = "entry" | "redirect" | "success";

const REDIRECT_STAGES = [
  "Connecting to DigiLocker...",
  "Fetching your Aadhaar details...",
  "Verification successful",
];

// ─── Helper: format raw digits → XXXX-XXXX-XXXX (masked) ─────────────────────

function formatMasked(digits: string): string {
  // Show only last 4 digits; rest are masked
  const len = digits.length;
  let masked = "";
  for (let i = 0; i < len; i++) {
    const groupIdx = Math.floor(i / 4);
    if (i > 0 && i % 4 === 0) masked += "-";
    // Last 4 digits visible if total length = 12
    if (len === 12 && i >= 8) {
      masked += digits[i];
    } else {
      masked += "X";
    }
    void groupIdx;
  }
  return masked;
}

function buildMaskedAadhaar(last4: string): string {
  return `XXXX-XXXX-${last4}`;
}

function formatDateReadable(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Sub-component: DigiLocker brand header ───────────────────────────────────

function DigiLockerHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${DL_GREEN} 0%, ${DL_GREEN_LIGHT} 100%)`,
        borderRadius: compact ? "12px 12px 0 0" : "16px 16px 0 0",
      }}
      className="w-full flex items-center justify-between px-5 py-3"
    >
      {/* Logo area */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 36,
            height: 36,
            background: "rgba(255,255,255,0.18)",
            border: "1.5px solid rgba(255,255,255,0.35)",
          }}
        >
          {/* Stylised DL icon — Ashoka Chakra-ish */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.5" />
            <circle cx="10" cy="10" r="3" fill="white" fillOpacity="0.85" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="10"
                y1="10"
                x2={10 + 7 * Math.cos((deg * Math.PI) / 180)}
                y2={10 + 7 * Math.sin((deg * Math.PI) / 180)}
                stroke="white"
                strokeWidth="0.8"
                strokeOpacity="0.6"
              />
            ))}
          </svg>
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none tracking-wide">DigiLocker</p>
          <p className="text-white/70 text-[10px] mt-0.5 leading-none">Ministry of Electronics &amp; IT</p>
        </div>
      </div>

      {/* Lock badge */}
      <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-2.5 py-1">
        <Lock className="w-3 h-3 text-white/90" />
        <span className="text-white/90 text-[10px] font-medium">Secure</span>
      </div>
    </div>
  );
}

// ─── Screen 1 — Entry ─────────────────────────────────────────────────────────

function EntryScreen({
  onSubmit,
  onSkip,
}: {
  onSubmit: (digits: string) => void;
  onSkip?: () => void;
}) {
  const [rawDigits, setRawDigits] = useState("");
  const [consented, setConsented] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isValid = rawDigits.length === 12 && consented;

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const numeric = e.target.value.replace(/\D/g, "").slice(0, 12);
    setRawDigits(numeric);
  }

  // Display value: masked with dashes
  const displayValue =
    rawDigits.length === 0
      ? ""
      : formatMasked(rawDigits)
          .split("")
          .filter((c) => c !== "X" || rawDigits.length < 12)
          .join("") || formatMasked(rawDigits);

  // Simpler display: raw digits turned into masked format for the placeholder
  const formattedDisplay = (() => {
    if (rawDigits.length === 0) return "";
    let out = "";
    for (let i = 0; i < rawDigits.length; i++) {
      if (i > 0 && i % 4 === 0) out += "-";
      if (rawDigits.length === 12 && i >= 8) {
        out += rawDigits[i];
      } else {
        out += "X";
      }
    }
    return out;
  })();

  return (
    <motion.div
      key="entry"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* Card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${DL_GREEN_BORDER}`, background: "var(--card)" }}
      >
        <DigiLockerHeader />

        <div className="p-6">
          {/* Title */}
          <h2 className="text-lg font-bold text-foreground mb-1">
            Verify your identity using Aadhaar
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            We use DigiLocker to securely verify your identity. Your data is never stored — only
            verification status is saved.
          </p>

          {/* Aadhaar Input */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-foreground mb-2">
              Aadhaar Number
            </label>

            {/* Hidden real input for keyboard */}
            <input
              ref={inputRef}
              type="tel"
              inputMode="numeric"
              maxLength={12}
              value={rawDigits}
              onChange={handleInput}
              className="sr-only"
              aria-label="Enter your 12-digit Aadhaar number"
              id="aadhaar-input"
              autoComplete="off"
            />

            {/* Visual display — click to focus real input */}
            <div
              onClick={() => inputRef.current?.focus()}
              onFocus={() => inputRef.current?.focus()}
              tabIndex={0}
              role="textbox"
              aria-label="Aadhaar number display"
              className="cursor-text"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr auto 1fr",
                gap: 0,
                alignItems: "center",
                background: "var(--muted)",
                border: `1.5px solid ${rawDigits.length > 0 ? DL_GREEN : "var(--border)"}`,
                borderRadius: 12,
                padding: "12px 16px",
                transition: "border-color 0.2s",
              }}
            >
              {[0, 1, 2].map((groupIdx) => {
                const start = groupIdx * 4;
                const groupDigits = rawDigits.slice(start, start + 4);
                return (
                  <React.Fragment key={groupIdx}>
                    {groupIdx > 0 && (
                      <span
                        style={{
                          color: "var(--muted-foreground)",
                          fontWeight: 700,
                          fontSize: 18,
                          paddingInline: 6,
                          userSelect: "none",
                        }}
                      >
                        –
                      </span>
                    )}
                    <div className="flex gap-1 justify-center">
                      {[0, 1, 2, 3].map((pos) => {
                        const absPos = start + pos;
                        const filled = absPos < rawDigits.length;
                        const visible = rawDigits.length === 12 && groupIdx === 2;
                        return (
                          <span
                            key={pos}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 22,
                              height: 28,
                              borderRadius: 4,
                              fontSize: visible ? 17 : 20,
                              fontWeight: visible ? 700 : 400,
                              color: visible ? "var(--foreground)" : DL_GREEN,
                              background: filled
                                ? visible
                                  ? "rgba(33,115,70,0.12)"
                                  : "rgba(33,115,70,0.08)"
                                : "transparent",
                              transition: "all 0.15s",
                              letterSpacing: 0,
                            }}
                          >
                            {filled ? (visible ? groupDigits[pos] : "●") : ""}
                          </span>
                        );
                      })}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Formatted preview line */}
            {formattedDisplay && (
              <p className="text-xs mt-1.5 font-mono" style={{ color: DL_GREEN }}>
                {formattedDisplay}
              </p>
            )}

            <p className="text-xs text-muted-foreground mt-1.5">
              Enter 12-digit Aadhaar number. Last 4 digits will be visible.
            </p>

            {rawDigits.length > 0 && rawDigits.length < 12 && (
              <p className="text-xs mt-1" style={{ color: "var(--warning)" }}>
                {12 - rawDigits.length} more digit{12 - rawDigits.length !== 1 ? "s" : ""} required
              </p>
            )}
          </div>

          {/* Consent checkbox */}
          <label className="flex items-start gap-3 cursor-pointer mb-6 group" id="consent-label">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                id="aadhaar-consent"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
              />
              <div
                className="w-5 h-5 rounded flex items-center justify-center transition-all duration-200"
                style={{
                  background: consented ? DL_GREEN : "var(--muted)",
                  border: `2px solid ${consented ? DL_GREEN : "var(--border)"}`,
                }}
              >
                {consented && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
              I consent to share my Aadhaar details for KYC verification as per{" "}
              <span className="font-semibold" style={{ color: DL_GREEN }}>
                UIDAI guidelines
              </span>
            </span>
          </label>

          {/* CTA */}
          <button
            id="verify-digilocker-btn"
            disabled={!isValid}
            onClick={() => onSubmit(rawDigits)}
            className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200"
            style={{
              background: isValid
                ? `linear-gradient(135deg, ${DL_GREEN} 0%, ${DL_GREEN_LIGHT} 100%)`
                : "var(--muted)",
              color: isValid ? "white" : "var(--muted-foreground)",
              cursor: isValid ? "pointer" : "not-allowed",
              boxShadow: isValid ? `0 4px 20px rgba(33,115,70,0.35)` : "none",
            }}
          >
            <ShieldCheck className="w-4.5 h-4.5" />
            Verify with DigiLocker
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Skip option */}
          {onSkip && (
            <div className="mt-4">
              {showSkipWarning ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="rounded-xl p-3 mb-3"
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.3)",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--warning)" }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--warning)" }}>
                        Skip Verification?
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        Skipping Aadhaar verification may limit access to certain features. You can
                        complete this later from your profile.
                      </p>
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={onSkip}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                          style={{
                            background: "rgba(245,158,11,0.15)",
                            color: "var(--warning)",
                          }}
                        >
                          Skip anyway
                        </button>
                        <button
                          onClick={() => setShowSkipWarning(false)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium text-muted-foreground hover:text-foreground transition-colors"
                          style={{ background: "var(--muted)" }}
                        >
                          Go back
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <button
                  onClick={() => setShowSkipWarning(true)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  id="skip-verification-btn"
                >
                  Skip for now
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Government footer */}
      <p className="text-center text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Powered by DigiLocker — Ministry of Electronics &amp; IT, Government of India
      </p>
    </motion.div>
  );
}

// ─── Screen 2 — Simulated DigiLocker Redirect ─────────────────────────────────

function RedirectScreen({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Stage 0 → 1 at 900ms, stage 1 → 2 at 1800ms, complete at 2500ms
    const timings = [900, 900, 700];
    let elapsed = 0;

    timings.forEach((delay, i) => {
      elapsed += delay;
      const t = setTimeout(() => {
        if (i < 2) setStage(i + 1);
        else onComplete();
      }, elapsed);
      return t;
    });

    // Progress bar: animate 0 → 100 over 2500ms
    const startTime = Date.now();
    const totalDuration = timings.reduce((a, b) => a + b, 0);
    let raf: number;
    function tick() {
      const pct = Math.min(((Date.now() - startTime) / totalDuration) * 100, 100);
      setProgress(pct);
      if (pct < 100) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [onComplete]);

  return (
    <motion.div
      key="redirect"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${DL_GREEN_BORDER}`, background: "var(--card)" }}
      >
        <DigiLockerHeader />

        <div className="p-8 flex flex-col items-center">
          {/* Animated spinner / logo area */}
          <div className="relative mb-7">
            {/* Spinning ring */}
            <svg width="80" height="80" className="absolute inset-0" style={{ animation: "spin 2s linear infinite" }}>
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke={DL_GREEN}
                strokeWidth="2"
                strokeOpacity="0.15"
              />
              <circle
                cx="40" cy="40" r="36"
                fill="none"
                stroke={DL_GREEN}
                strokeWidth="2.5"
                strokeDasharray="60 166"
                strokeLinecap="round"
              />
            </svg>

            {/* Center icon */}
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: DL_GREEN_BG,
                border: `2px solid ${DL_GREEN_BORDER}`,
              }}
            >
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="14" stroke={DL_GREEN} strokeWidth="2" />
                <circle cx="18" cy="18" r="5" fill={DL_GREEN} fillOpacity="0.8" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <line
                    key={deg}
                    x1="18"
                    y1="18"
                    x2={18 + 12 * Math.cos((deg * Math.PI) / 180)}
                    y2={18 + 12 * Math.sin((deg * Math.PI) / 180)}
                    stroke={DL_GREEN}
                    strokeWidth="1"
                    strokeOpacity="0.5"
                  />
                ))}
              </svg>
            </div>
          </div>

          {/* DigiLocker label */}
          <p className="font-bold text-xl mb-1" style={{ color: DL_GREEN }}>
            DigiLocker
          </p>
          <p className="text-xs text-muted-foreground mb-6">Secure Government Verification Portal</p>

          {/* Stage text */}
          <div className="h-6 mb-5 w-full flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={stage}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="text-sm font-medium text-foreground text-center"
              >
                {REDIRECT_STAGES[stage]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress bar */}
          <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "var(--muted)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${DL_GREEN} 0%, ${DL_GREEN_LIGHT} 100%)`,
                transition: "width 0.1s linear",
                boxShadow: `0 0 8px rgba(33,115,70,0.5)`,
              }}
            />
          </div>

          {/* Stage dots */}
          <div className="flex gap-2 mt-4">
            {REDIRECT_STAGES.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === stage ? 20 : 8,
                  height: 8,
                  background: i <= stage ? DL_GREEN : "var(--muted)",
                  opacity: i <= stage ? 1 : 0.4,
                }}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-6 text-center leading-relaxed">
            Please do not close this window. <br />
            You will be redirected automatically.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </motion.div>
  );
}

// ─── Screen 3 — Success ───────────────────────────────────────────────────────

function SuccessScreen({
  maskedAadhaar,
  verifiedAt,
  onContinue,
}: {
  maskedAadhaar: string;
  verifiedAt: string;
  onContinue: () => void;
}) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${DL_GREEN_BORDER}`, background: "var(--card)" }}
      >
        <DigiLockerHeader />

        <div className="p-8 flex flex-col items-center text-center">
          {/* Checkmark animation */}
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            className="mb-5"
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${DL_GREEN}22 0%, ${DL_GREEN}44 100%)`,
                border: `2.5px solid ${DL_GREEN}`,
                boxShadow: `0 0 30px rgba(33,115,70,0.3)`,
              }}
            >
              <CheckCircle2 className="w-10 h-10" style={{ color: DL_GREEN }} strokeWidth={1.8} />
            </div>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.35 }}
          >
            <h2 className="text-xl font-bold text-foreground mb-1">
              Identity Verified Successfully
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your Aadhaar has been verified via DigiLocker
            </p>
          </motion.div>

          {/* Details card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.35 }}
            className="w-full rounded-xl p-4 mb-6 text-left"
            style={{
              background: DL_GREEN_BG,
              border: `1px solid ${DL_GREEN_BORDER}`,
            }}
          >
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: DL_GREEN_BORDER }}>
              <span className="text-xs text-muted-foreground font-medium">Aadhaar Number</span>
              <span className="text-sm font-bold font-mono" style={{ color: DL_GREEN }}>
                {maskedAadhaar}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: DL_GREEN_BORDER }}>
              <span className="text-xs text-muted-foreground font-medium">Verified On</span>
              <span className="text-sm font-semibold text-foreground">
                {formatDateReadable(verifiedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground font-medium">Method</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: DL_GREEN }} />
                <span className="text-xs font-semibold" style={{ color: DL_GREEN }}>
                  DigiLocker
                </span>
              </div>
            </div>
          </motion.div>

          {/* CTA */}
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            id="aadhaar-continue-btn"
            onClick={onContinue}
            className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${DL_GREEN} 0%, ${DL_GREEN_LIGHT} 100%)`,
              boxShadow: `0 4px 20px rgba(33,115,70,0.4)`,
            }}
          >
            Continue to next step
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AadhaarVerification({ onSuccess, onSkip }: AadhaarVerificationProps) {
  const [screen, setScreen] = useState<Screen>("entry");
  const [aadhaarDigits, setAadhaarDigits] = useState("");
  const [verifiedAt, setVerifiedAt] = useState("");

  function handleEntrySubmit(digits: string) {
    setAadhaarDigits(digits);
    setScreen("redirect");
  }

  const handleRedirectComplete = React.useCallback(() => {
    setVerifiedAt(new Date().toISOString());
    setScreen("success");
  }, []);

  function handleContinue() {
    const last4 = aadhaarDigits.slice(-4);
    onSuccess({
      verified: true,
      maskedAadhaar: buildMaskedAadhaar(last4),
      verifiedAt,
      method: "digilocker_mock",
    });
  }

  const last4 = aadhaarDigits.slice(-4);
  const maskedAadhaar = buildMaskedAadhaar(last4 || "XXXX");

  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence mode="wait">
        {screen === "entry" && (
          <EntryScreen
            key="entry"
            onSubmit={handleEntrySubmit}
            onSkip={onSkip}
          />
        )}

        {screen === "redirect" && (
          <RedirectScreen
            key="redirect"
            onComplete={handleRedirectComplete}
          />
        )}

        {screen === "success" && (
          <SuccessScreen
            key="success"
            maskedAadhaar={maskedAadhaar}
            verifiedAt={verifiedAt}
            onContinue={handleContinue}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default AadhaarVerification;
