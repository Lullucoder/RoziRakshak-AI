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
  ChevronDown,
} from "lucide-react";
import { serverTimestamp } from "firebase/firestore";
import { AadhaarVerification } from "@/components/onboarding/AadhaarVerification";
import type { AadhaarVerificationResult } from "@/components/onboarding/AadhaarVerification";
import { FaceVerificationStep } from "@/components/onboarding/FaceVerificationStep";
import type { FaceVerificationResult } from "@/components/onboarding/FaceVerificationStep";
import { createWorker } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
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
  const { user, userProfile } = useAuth();
  const [step, setStep]     = useState<OnboardingStep>("aadhaar");
  const [aadhaarResult, setAadhaarResult] = useState<AadhaarVerificationResult | null>(null);
  const [personal, setPersonal] = useState<PersonalDetails>({ name: "", city: "", platform: "" });
  const [work, setWork]         = useState<WorkDetails>({
    zone: "", workingHours: "morning", weeklyEarningRange: "", upiId: "",
  });
  const [faceResult, setFaceResult] = useState<FaceVerificationResult | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Deterministic demo uid — in production, read from the authenticated session
  const workerUid = `worker-${Date.now()}`;

  const handleAadhaarSuccess = useCallback((result: AadhaarVerificationResult) => {
    setAadhaarResult(result);
    setStep("personal");
  }, []);

  const handleAadhaarSkip = useCallback(() => {
    setAadhaarResult(null);
    setStep("personal");
  }, []);

  const handleFaceVerified = useCallback((result: FaceVerificationResult) => {
    setFaceResult(result);
    handleFinalSubmit(result);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aadhaarResult, personal, work]);

  async function handleFinalSubmit(face: FaceVerificationResult) {
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
        uid:                workerUid,
        phone:
              user?.phone ||
              (user as { providerData?: Array<{ phoneNumber?: string | null }> } | null)
                ?.providerData?.[0]?.phoneNumber ||
              userProfile?.phone ||
              "",
        name:               personal.name,
        city:               personal.city,
        platform:           personal.platform,
        zone:               work.zone,
        workingHours:       work.workingHours,
        weeklyEarningRange: work.weeklyEarningRange,
        upiId:              work.upiId,
        role:               "worker",
        isOnboarded:        true,
        trustScore:         aadhaarResult?.verified ? 0.85 : 0.75,
        activePlan:         null,
        claimsCount:        0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        joinedDate:         serverTimestamp() as any,
        // ── Face liveness fields ──
        face_verified:        true,
        face_image_r2_key:    face.r2Key,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        face_verified_at:     serverTimestamp() as any,
        liveness_check_passed: true,
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
          <FaceVerificationStep
            key="face"
            workerUid={workerUid}
            onVerified={handleFaceVerified}
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
