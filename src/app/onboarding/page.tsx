"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Shield,
  User,
  Briefcase,
  Camera,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { serverTimestamp } from "firebase/firestore";
import { AadhaarVerification } from "@/components/onboarding/AadhaarVerification";
import type { AadhaarVerificationResult } from "@/components/onboarding/AadhaarVerification";
import { createWorker } from "@/lib/firestore";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingStep = "aadhaar" | "personal" | "work" | "face" | "submitting";

interface PersonalDetails {
  name: string;
  city: string;
  platform: string;
}

interface WorkDetails {
  zone: string;
  workingHours: string;
  weeklyEarningRange: string;
  upiId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = [
  "Zepto", "Blinkit", "Instamart", "BigBasket Now",
  "Swiggy Instamart", "Dunzo", "Other",
];
const CITIES = [
  "Bengaluru", "Delhi", "Mumbai", "Hyderabad",
  "Chennai", "Pune", "Kolkata", "Ahmedabad",
];
const SHIFTS = [
  { value: "morning", label: "Morning (6am–12pm)" },
  { value: "afternoon", label: "Afternoon (12pm–6pm)" },
  { value: "evening", label: "Evening (6pm–12am)" },
  { value: "full_day", label: "Full Day" },
];
const EARNINGS = [
  "₹2,000–₹4,000", "₹4,000–₹6,000",
  "₹6,000–₹8,000", "₹8,000–₹12,000", "₹12,000+",
];

const STEP_META = [
  { id: "aadhaar" as const,  label: "Identity",  Icon: Shield   },
  { id: "personal" as const, label: "Personal",  Icon: User     },
  { id: "work" as const,     label: "Work",      Icon: Briefcase },
  { id: "face" as const,     label: "Face KYC",  Icon: Camera   },
];

const STEP_ORDER: OnboardingStep[] = ["aadhaar", "personal", "work", "face", "submitting"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StepBar({ current }: { current: OnboardingStep }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center w-full max-w-md mx-auto mb-8 px-1">
      {STEP_META.map((step, i) => {
        const done    = i < idx;
        const active  = step.id === current;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <motion.div
                animate={{
                  background: done
                    ? "#217346"
                    : active
                    ? "var(--primary)"
                    : "var(--muted)",
                  scale: active ? 1.1 : 1,
                }}
                transition={{ duration: 0.25 }}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ color: done || active ? "white" : "var(--muted-foreground)" }}
              >
                {done
                  ? <CheckCircle2 className="w-5 h-5" />
                  : <step.Icon className="w-4 h-4" />
                }
              </motion.div>
              <span
                className="text-[10px] font-medium transition-colors"
                style={{ color: active ? "var(--foreground)" : "var(--muted-foreground)" }}
              >
                {step.label}
              </span>
            </div>
            {i < STEP_META.length - 1 && (
              <div
                className="flex-1 h-0.5 mx-1 mb-4 rounded-full transition-all duration-400"
                style={{ background: i < idx ? "#217346" : "var(--muted)" }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Select helper ────────────────────────────────────────────────────────────

function Select({
  label, value, onChange, options, placeholder = "Select…", id,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
  placeholder?: string; id?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-1.5">{label}</label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl bg-muted border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:border-primary transition-colors pr-9"
        >
          <option value="" disabled>{placeholder}</option>
          {options.map((opt) =>
            typeof opt === "string"
              ? <option key={opt} value={opt}>{opt}</option>
              : <option key={opt.value} value={opt.value}>{opt.label}</option>
          )}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function TextInput({
  label, value, onChange, placeholder, id, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; id?: string; type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-foreground mb-1.5">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-muted border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
      />
    </div>
  );
}

// ─── Screen 2: Personal Details ───────────────────────────────────────────────

function PersonalStep({
  data, onChange, onNext, onBack,
}: {
  data: PersonalDetails;
  onChange: (d: PersonalDetails) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const valid = data.name.trim().length >= 2 && data.city && data.platform;

  return (
    <motion.div
      key="personal"
      className="w-full max-w-md"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <div className="glass rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">Personal Details</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Tell us a bit about yourself</p>
        </div>

        <TextInput
          id="name-input"
          label="Full Name"
          value={data.name}
          onChange={(v) => onChange({ ...data, name: v })}
          placeholder="e.g. Arjun Kumar"
        />

        <Select
          id="city-select"
          label="City"
          value={data.city}
          onChange={(v) => onChange({ ...data, city: v })}
          options={CITIES}
          placeholder="Select your city"
        />

        <Select
          id="platform-select"
          label="Delivery Platform"
          value={data.platform}
          onChange={(v) => onChange({ ...data, platform: v })}
          options={PLATFORMS}
          placeholder="Select your platform"
        />

        <div className="flex gap-3 pt-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            id="personal-next-btn"
            disabled={!valid}
            onClick={onNext}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{
              background: valid
                ? "linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))"
                : "var(--muted)",
              color: valid ? "white" : "var(--muted-foreground)",
              cursor: valid ? "pointer" : "not-allowed",
            }}
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Screen 3: Work Details ───────────────────────────────────────────────────

function WorkStep({
  data, onChange, onNext, onBack,
}: {
  data: WorkDetails;
  onChange: (d: WorkDetails) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const valid =
    data.zone.trim().length >= 2 &&
    data.workingHours &&
    data.weeklyEarningRange &&
    data.upiId.trim().length >= 3;

  return (
    <motion.div
      key="work"
      className="w-full max-w-md"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <div className="glass rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">Work Details</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Help us personalize your coverage</p>
        </div>

        <TextInput
          id="zone-input"
          label="Primary Delivery Zone"
          value={data.zone}
          onChange={(v) => onChange({ ...data, zone: v })}
          placeholder="e.g. Koramangala, Indiranagar"
        />

        <Select
          id="shift-select"
          label="Typical Working Shift"
          value={data.workingHours}
          onChange={(v) => onChange({ ...data, workingHours: v })}
          options={SHIFTS}
        />

        <Select
          id="earnings-select"
          label="Weekly Earning Range"
          value={data.weeklyEarningRange}
          onChange={(v) => onChange({ ...data, weeklyEarningRange: v })}
          options={EARNINGS}
          placeholder="Select earning range"
        />

        <TextInput
          id="upi-input"
          label="UPI ID (for payouts)"
          value={data.upiId}
          onChange={(v) => onChange({ ...data, upiId: v })}
          placeholder="yourname@upi"
          type="text"
        />

        <div className="flex gap-3 pt-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            id="work-next-btn"
            disabled={!valid}
            onClick={onNext}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: valid
                ? "linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))"
                : "var(--muted)",
              color: valid ? "white" : "var(--muted-foreground)",
              cursor: valid ? "pointer" : "not-allowed",
            }}
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Screen 4: Face Verification (mock) ──────────────────────────────────────

function FaceStep({
  done, onCapture, onNext, onBack,
}: {
  done: boolean; onCapture: () => void; onNext: () => void; onBack: () => void;
}) {
  const [capturing, setCapturing] = useState(false);

  function handleCapture() {
    setCapturing(true);
    setTimeout(() => {
      setCapturing(false);
      onCapture();
    }, 2200);
  }

  return (
    <motion.div
      key="face"
      className="w-full max-w-md"
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">Face Verification</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Take a quick selfie to confirm your identity. This is a one-time step.
        </p>

        {/* Camera frame */}
        <div
          className="relative mx-auto mb-6 rounded-2xl overflow-hidden"
          style={{
            width: "100%",
            maxWidth: 280,
            aspectRatio: "3/4",
            background: "var(--muted)",
            border: done
              ? "2px solid #217346"
              : "2px dashed var(--border)",
          }}
        >
          {done ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ background: "rgba(33,115,70,0.08)" }}>
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
              >
                <CheckCircle2 className="w-16 h-16" style={{ color: "#217346" }} />
              </motion.div>
              <p className="text-sm font-semibold" style={{ color: "#217346" }}>Face captured!</p>
            </div>
          ) : capturing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              {/* Scanning animation */}
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border-4 border-primary/30" />
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-primary"
                  style={{ borderTopColor: "transparent" }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                />
                <Camera className="absolute inset-0 m-auto w-10 h-10 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">Scanning face…</p>
              {/* Scan line */}
              <motion.div
                className="absolute left-0 right-0 h-0.5"
                style={{ background: "linear-gradient(90deg, transparent, var(--primary), transparent)" }}
                animate={{ top: ["20%", "80%", "20%"] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              {/* Face silhouette */}
              <svg width="80" height="100" viewBox="0 0 80 100" fill="none"
                className="opacity-20">
                <ellipse cx="40" cy="38" rx="28" ry="34" stroke="var(--foreground)" strokeWidth="2"/>
                <path d="M15 90 Q40 70 65 90" stroke="var(--foreground)" strokeWidth="2"/>
              </svg>
              <p className="text-xs text-muted-foreground text-center px-4">
                Position your face in the frame
              </p>
            </div>
          )}

          {/* Corner guides */}
          {!done && !capturing && (
            <>
              {[
                { top: "8px", left: "8px", borderTop: "2px solid var(--primary)", borderLeft: "2px solid var(--primary)" },
                { top: "8px", right: "8px", borderTop: "2px solid var(--primary)", borderRight: "2px solid var(--primary)" },
                { bottom: "8px", left: "8px", borderBottom: "2px solid var(--primary)", borderLeft: "2px solid var(--primary)" },
                { bottom: "8px", right: "8px", borderBottom: "2px solid var(--primary)", borderRight: "2px solid var(--primary)" },
              ].map((style, i) => (
                <div key={i} className="absolute w-5 h-5" style={style} />
              ))}
            </>
          )}
        </div>

        {/* Instructions */}
        <div
          className="rounded-xl p-3 mb-5 text-xs text-muted-foreground"
          style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
        >
          <p className="font-semibold text-foreground mb-1">📍 Tips for a clear scan:</p>
          <ul className="space-y-0.5 list-disc pl-4">
            <li>Good lighting, face forward</li>
            <li>Remove sunglasses or mask</li>
            <li>Hold still for 2 seconds</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          {!done ? (
            <button
              id="capture-face-btn"
              disabled={capturing}
              onClick={handleCapture}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, var(--gradient-start), var(--gradient-mid))",
              }}
            >
              {capturing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Capturing…</>
              ) : (
                <><Camera className="w-4 h-4" /> Capture Selfie</>
              )}
            </button>
          ) : (
            <button
              id="face-next-btn"
              onClick={onNext}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #217346 0%, #2a9356 100%)",
                boxShadow: "0 4px 16px rgba(33,115,70,0.35)",
              }}
            >
              Complete Setup <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-center text-[10px] text-muted-foreground mt-4">
          Face data is not stored. Used only for one-time identity confirmation.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Screen 5: Submitting ─────────────────────────────────────────────────────

function SubmittingScreen({ success }: { success: boolean }) {
  return (
    <motion.div
      key="submitting"
      className="w-full max-w-md flex flex-col items-center text-center py-12"
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {!success ? (
        <>
          <div className="relative mb-6">
            <motion.div
              className="w-20 h-20 rounded-full border-4 border-primary/20"
              style={{ borderTopColor: "var(--primary)" }}
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
            />
            <Shield className="absolute inset-0 m-auto w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Setting up your account…</h2>
          <p className="text-sm text-muted-foreground">Securing your details. Just a moment.</p>
        </>
      ) : (
        <>
          <motion.div
            initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="mb-6"
          >
            <CheckCircle2 className="w-20 h-20" style={{ color: "#217346" }} />
          </motion.div>
          <h2 className="text-xl font-bold text-foreground mb-1">Welcome aboard! 🎉</h2>
          <p className="text-sm text-muted-foreground">Redirecting to your dashboard…</p>
        </>
      )}
    </motion.div>
  );
}

// ─── Main Onboarding Page ─────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]     = useState<OnboardingStep>("aadhaar");
  const [aadhaarResult, setAadhaarResult] = useState<AadhaarVerificationResult | null>(null);
  const [personal, setPersonal] = useState<PersonalDetails>({ name: "", city: "", platform: "" });
  const [work, setWork]         = useState<WorkDetails>({
    zone: "", workingHours: "morning", weeklyEarningRange: "", upiId: "",
  });
  const [faceDone, setFaceDone] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleAadhaarSuccess = useCallback((result: AadhaarVerificationResult) => {
    setAadhaarResult(result);
    setStep("personal");
  }, []);

  const handleAadhaarSkip = useCallback(() => {
    setAadhaarResult(null);
    setStep("personal");
  }, []);

  async function handleFinalSubmit() {
    setStep("submitting");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const kycFields: Record<string, any> = {};
      if (aadhaarResult) {
        kycFields.aadhaar_verified     = aadhaarResult.verified;
        kycFields.aadhaar_masked       = aadhaarResult.maskedAadhaar;
        kycFields.aadhaar_verified_at  = serverTimestamp();
        kycFields.kyc_method           = aadhaarResult.method;
      } else {
        kycFields.aadhaar_verified = false;
      }

      await createWorker({
        uid:                `worker-${Date.now()}`,
        phone:              "",
        name:               personal.name,
        city:               personal.city,
        platform:           personal.platform,
        zone:               work.zone,
        workingHours:       work.workingHours,
        weeklyEarningRange: work.weeklyEarningRange,
        upiId:              work.upiId,
        role:               "worker",
        isOnboarded:        true,
        trustScore:         aadhaarResult?.verified ? 0.80 : 0.70,
        activePlan:         null,
        claimsCount:        0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        joinedDate:         serverTimestamp() as any,
        ...kycFields,
      });

      setSubmitSuccess(true);
      toast.success("Onboarding complete! Welcome to RoziRakshak AI.");
      setTimeout(() => router.push("/worker/dashboard"), 1800);
    } catch (err) {
      console.error("Onboarding submit error:", err);
      toast.error("Something went wrong. Please try again.");
      setStep("face");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-10">
      {/* Brand header */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#6c5ce7] to-[#ec4899] flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <span className="text-base font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
          RoziRakshak <span className="text-primary">AI</span>
        </span>
      </div>

      {/* Progress bar (only during active steps, not submitting) */}
      {step !== "submitting" && <StepBar current={step} />}

      {/* Step content */}
      <AnimatePresence mode="wait">
        {step === "aadhaar" && (
          <motion.div
            key="aadhaar"
            className="w-full max-w-md"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
          >
            <AadhaarVerification
              onSuccess={handleAadhaarSuccess}
              onSkip={handleAadhaarSkip}
            />
          </motion.div>
        )}

        {step === "personal" && (
          <PersonalStep
            key="personal"
            data={personal}
            onChange={setPersonal}
            onNext={() => setStep("work")}
            onBack={() => setStep("aadhaar")}
          />
        )}

        {step === "work" && (
          <WorkStep
            key="work"
            data={work}
            onChange={setWork}
            onNext={() => setStep("face")}
            onBack={() => setStep("personal")}
          />
        )}

        {step === "face" && (
          <FaceStep
            key="face"
            done={faceDone}
            onCapture={() => setFaceDone(true)}
            onNext={handleFinalSubmit}
            onBack={() => setStep("work")}
          />
        )}

        {step === "submitting" && (
          <SubmittingScreen key="submitting" success={submitSuccess} />
        )}
      </AnimatePresence>

      {/* Step counter hint */}
      {step !== "submitting" && (
        <p className="mt-6 text-[11px] text-muted-foreground">
          Step {STEP_ORDER.indexOf(step) + 1} of {STEP_META.length}
        </p>
      )}
    </div>
  );
}
