"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Phone,
  KeyRound,
  ArrowRight,
  Loader2,
  HardHat,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";
import { type ConfirmationResult } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { sendOTP, AuthError } from "@/lib/auth";
import { useRecaptcha } from "@/lib/hooks/useRecaptcha";
import { isMockAuthEnabled, mockSendOTP } from "@/lib/mockAuth";

type Step = "phone" | "otp";
type Role = "worker" | "admin";

interface LoginModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ isOpen, onOpenChange }: LoginModalProps) {
  const { verifyOtp } = useAuth();
  const useMockAuth = isMockAuthEnabled();
  const {
    recaptchaRef,
    verifier,
    isReady,
    error: recaptchaError,
    resetVerifier,
  } = useRecaptcha();

  const [step, setStep] = useState<Step>("phone");
  const [selectedRole, setSelectedRole] = useState<Role>("worker");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [mockPhone, setMockPhone] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Reset state when modal opens ──────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setStep("phone");
      setSelectedRole("worker");
      setPhone("");
      setOtp(["", "", "", "", "", ""]);
      setLoading(false);
      setConfirmationResult(null);
      setMockPhone("");
      setResendCountdown(0);
    }
  }, [isOpen]);

  // ── Resend countdown timer ────────────────────────────────────────────
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // ── STEP 1: Send OTP ──────────────────────────────────────────────────
  const handleSendOTP = useCallback(async () => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    if (!useMockAuth && (!verifier || !isReady)) {
      toast.error("Please complete the reCAPTCHA verification first");
      return;
    }

    setLoading(true);
    try {
      if (useMockAuth) {
        // Mock auth flow
        await mockSendOTP(cleaned);
        setMockPhone(cleaned);
        setOtp(["", "", "", "", "", ""]);
        setStep("otp");
        setResendCountdown(30);
        toast.success("OTP sent! Use 123456");
      } else {
        // Firebase auth flow
        const result = await sendOTP(cleaned, verifier!);
        setConfirmationResult(result);
        setOtp(["", "", "", "", "", ""]);
        setStep("otp");
        setResendCountdown(30);
        toast.success("OTP sent!");
      }
    } catch (error) {
      if (!useMockAuth) {
        resetVerifier();
      }
      if (error instanceof AuthError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to send OTP. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [phone, verifier, isReady, useMockAuth, resetVerifier]);

  // ── STEP 2: Verify OTP ────────────────────────────────────────────────
  const handleVerifyOTP = useCallback(async (code: string) => {
    if (code.length !== 6) return;
    
    if (!useMockAuth && !confirmationResult) {
      toast.error("Please request an OTP first.");
      return;
    }

    setLoading(true);
    try {
      if (useMockAuth) {
        await verifyOtp(mockPhone, code, selectedRole);
      } else {
        await verifyOtp(confirmationResult!, code, selectedRole);
      }
      toast.success("Login successful!");
      onOpenChange(false);
      
      // Redirect based on role and onboarding status
      // The page.tsx will handle the actual redirect via useEffect
    } catch (error) {
      if (error instanceof AuthError) {
        switch (error.code) {
          case "billing-not-enabled":
            toast.error(error.message);
            break;
          case "invalid-otp":
            toast.error("Incorrect OTP. Please check and try again.");
            break;
          case "otp-expired":
            toast.error("OTP expired. Please request a new one.");
            break;
          default:
            toast.error(error.message);
        }
      } else {
        toast.error(error instanceof Error ? error.message : "Verification failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [confirmationResult, mockPhone, selectedRole, useMockAuth, verifyOtp, onOpenChange]);

  // ── OTP input handlers ────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    const fullCode = newOtp.join("");
    if (fullCode.length === 6) {
      handleVerifyOTP(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newOtp = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);

    // Focus last filled or next empty
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();

    // Auto-submit if full
    if (pasted.length === 6) {
      handleVerifyOTP(pasted);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────
  const handleResendOTP = async () => {
    if (resendCountdown > 0) return;
    if (!useMockAuth && !verifier) return;

    setLoading(true);
    try {
      if (useMockAuth) {
        await mockSendOTP(mockPhone);
        setOtp(["", "", "", "", "", ""]);
        setResendCountdown(30);
        toast.success("OTP resent! Use 123456");
      } else {
        const result = await sendOTP(phone.replace(/\D/g, ""), verifier!);
        setConfirmationResult(result);
        setOtp(["", "", "", "", "", ""]);
        setResendCountdown(30);
        toast.success("OTP resent!");
      }
    } catch (error) {
      if (!useMockAuth) {
        resetVerifier();
      }
      if (error instanceof AuthError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to resend OTP.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Masked phone for display ──────────────────────────────────────────
  const maskedPhone = phone.length >= 4
    ? `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`
    : phone;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden bg-transparent border-none ring-0"
        showCloseButton={false}
      >
        <div className="glass rounded-3xl p-8 sm:p-10 relative">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-lg"
          >
            ×
          </button>

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#ec4899] flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1
            className="text-xl font-bold text-center mb-2"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            Welcome to <span className="gradient-text">RoziRakshak</span>
          </h1>
          <p className="text-center text-muted-foreground text-sm mb-8">
            {step === "phone"
              ? "Enter your phone number and select your role"
              : `Enter the 6-digit OTP sent to +91 ${maskedPhone}`}
          </p>

          {/* reCAPTCHA container - invisible, hidden from view */}
          {!useMockAuth && (
            <div
              className="absolute -left-[9999px] top-0 w-px h-px overflow-hidden pointer-events-none"
            >
              <div ref={recaptchaRef} />
            </div>
          )}
          
          {/* reCAPTCHA loading/error status */}
          {!useMockAuth && recaptchaError && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
              <p className="text-xs text-destructive text-center">
                {recaptchaError}
              </p>
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={resetVerifier}
                  className="text-xs text-destructive underline underline-offset-2 hover:opacity-80"
                >
                  Retry reCAPTCHA
                </button>
              </div>
            </div>
          )}

          {/* Mock auth indicator */}
          {useMockAuth && step === "phone" && (
            <div className="mb-4 p-3 rounded-xl bg-warning/10 border border-warning/30">
              <p className="text-xs text-warning text-center">
                🧪 Mock Auth Mode: Use OTP <strong>123456</strong>
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ── STEP 1: Phone + Role ── */}
            {step === "phone" && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Phone input */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Phone Number
                  </label>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-muted border border-border focus-within:border-primary transition-colors">
                    <Phone className="w-5 h-5 text-muted-foreground" />
                    <span className="text-muted-foreground font-medium">+91</span>
                    <input
                      type="tel"
                      maxLength={10}
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="9876543210"
                      className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Role selector */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    I am a
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Worker toggle */}
                    <button
                      type="button"
                      onClick={() => setSelectedRole("worker")}
                      className={`group flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl font-semibold text-sm transition-all duration-300 cursor-pointer ${
                        selectedRole === "worker"
                          ? "bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white shadow-lg shadow-[#6c5ce7]/25"
                          : "border border-border text-muted-foreground hover:border-[#6c5ce7]/50 hover:text-foreground bg-transparent"
                      }`}
                    >
                      <HardHat
                        className={`w-5 h-5 transition-transform duration-300 ${
                          selectedRole === "worker" ? "scale-110" : ""
                        }`}
                      />
                      Worker
                    </button>

                    {/* Admin toggle */}
                    <button
                      type="button"
                      onClick={() => setSelectedRole("admin")}
                      className={`group flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl font-semibold text-sm transition-all duration-300 cursor-pointer ${
                        selectedRole === "admin"
                          ? "bg-gradient-to-r from-[#ec4899] to-[#f43f5e] text-white shadow-lg shadow-[#ec4899]/25"
                          : "border border-border text-muted-foreground hover:border-[#ec4899]/50 hover:text-foreground bg-transparent"
                      }`}
                    >
                      <ShieldCheck
                        className={`w-5 h-5 transition-transform duration-300 ${
                          selectedRole === "admin" ? "scale-110" : ""
                        }`}
                      />
                      Admin
                    </button>
                  </div>

                  {/* Helper text */}
                  <p className="text-xs text-muted-foreground mt-3 text-center leading-relaxed">
                    First time? Your role is set when you first sign up.
                    <br />
                    Returning users are recognised automatically.
                  </p>
                </div>

                {/* Send OTP button */}
                <button
                  onClick={handleSendOTP}
                  disabled={loading || phone.replace(/\D/g, "").length < 10 || (!useMockAuth && !isReady)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : !useMockAuth && !isReady ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Loading reCAPTCHA...
                    </>
                  ) : (
                    <>
                      Send OTP <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {/* ── STEP 2: OTP Verification ── */}
            {step === "otp" && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-5">
                  <label className="block text-sm font-medium text-muted-foreground mb-4">
                    <KeyRound className="w-4 h-4 inline mr-1" />
                    Verification Code
                  </label>
                  <div className="flex justify-center gap-2.5">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onPaste={i === 0 ? handleOtpPaste : undefined}
                        className="w-11 h-13 rounded-xl bg-muted border border-border text-center text-lg font-bold text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        autoFocus={i === 0}
                        disabled={loading}
                      />
                    ))}
                  </div>
                </div>

                {/* Verify button */}
                <button
                  onClick={() => handleVerifyOTP(otp.join(""))}
                  disabled={loading || otp.join("").length !== 6}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Verify & Continue <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                {/* Resend OTP / countdown */}
                <div className="flex items-center justify-center mt-4">
                  {resendCountdown > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Resend OTP in{" "}
                      <span className="font-semibold text-foreground">
                        {resendCountdown}s
                      </span>
                    </p>
                  ) : (
                    <button
                      onClick={handleResendOTP}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs text-primary-light hover:text-foreground transition-colors font-medium"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Resend OTP
                    </button>
                  )}
                </div>

                {/* Change phone */}
                <button
                  onClick={() => {
                    setStep("phone");
                    setOtp(["", "", "", "", "", ""]);
                    setConfirmationResult(null);
                    setMockPhone("");
                    setResendCountdown(0);
                  }}
                  className="w-full mt-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Change Phone Number
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
