"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Phone, KeyRound, ArrowRight, Loader2, HardHat, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";

type Step = "role" | "phone" | "otp";
type Role = "worker" | "admin";

interface LoginModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ isOpen, onOpenChange }: LoginModalProps) {
  const [step, setStep] = useState<Step>("role");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("role");
      setSelectedRole(null);
      setPhone("");
      setOtp(["", "", "", "", "", ""]);
      setLoading(false);
    }
  }, [isOpen]);

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setStep("phone");
  };

  const handleSendOTP = async () => {
    if (phone.length < 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    try {
      await new Promise((res) => setTimeout(res, 800));
      setStep("otp");
      toast.success("OTP sent successfully!");
    } catch {
      toast.error("Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }
    setLoading(true);
    try {
      await new Promise((res) => setTimeout(res, 800));
      toast.success("Verified successfully!");
      onOpenChange(false);
      if (selectedRole === "admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/worker/dashboard");
      }
    } catch {
      toast.error("Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const getSubtitle = () => {
    if (step === "role") return "Choose how you want to sign in";
    if (step === "phone")
      return `Signing in as ${selectedRole === "admin" ? "Admin" : "Worker"} — enter your phone number`;
    return "Enter the 6-digit OTP sent to your phone";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-transparent border-none ring-0" showCloseButton={false}>
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
            {getSubtitle()}
          </p>

          <AnimatePresence mode="wait">

            {/* — STEP 1: Role Selection — */}
            {step === "role" && (
              <motion.div
                key="role"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleRoleSelect("worker")}
                    className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-muted hover:border-[#6c5ce7] hover:bg-[#6c5ce7]/10 transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <HardHat className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground text-sm">Worker</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Field access</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleRoleSelect("admin")}
                    className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-muted hover:border-[#ec4899] hover:bg-[#ec4899]/10 transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ec4899] to-[#f43f5e] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground text-sm">Admin</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Full control</p>
                    </div>
                  </button>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-5">
                  Select your role to continue
                </p>
              </motion.div>
            )}

            {/* — STEP 2: Phone Number — */}
            {step === "phone" && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div
                  className={`flex items-center gap-2 mb-5 px-3 py-2 rounded-xl text-sm font-medium w-fit mx-auto ${
                    selectedRole === "admin"
                      ? "bg-[#ec4899]/10 text-[#ec4899] border border-[#ec4899]/30"
                      : "bg-[#6c5ce7]/10 text-[#6c5ce7] border border-[#6c5ce7]/30"
                  }`}
                >
                  {selectedRole === "admin"
                    ? <ShieldCheck className="w-4 h-4" />
                    : <HardHat className="w-4 h-4" />
                  }
                  {selectedRole === "admin" ? "Admin Login" : "Worker Login"}
                </div>

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
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="9876543210"
                      className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  onClick={handleSendOTP}
                  disabled={loading || phone.length < 10}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Send OTP <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>

                <button
                  onClick={() => {
                    setStep("role");
                    setPhone("");
                    setSelectedRole(null);
                  }}
                  className="w-full mt-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Change Role
                </button>
              </motion.div>
            )}

            {/* — STEP 3: OTP Verification — */}
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
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        className="w-11 h-13 rounded-xl bg-muted border border-border text-center text-lg font-bold text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    <span className="gradient-text font-semibold">Demo mode</span> — enter any 6 digits
                  </p>
                </div>

                <button
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.join("").length !== 6}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a855f7] text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Verify & Continue <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>

                <button
                  onClick={() => {
                    setStep("phone");
                    setOtp(["", "", "", "", "", ""]);
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
