"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  CloudRain,
  Thermometer,
  Wind,
  MapPin,
  Wifi,
  IndianRupee,
  ArrowRight,
  Bell,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Zap,
  FileText,
  Clock,
  CircleDot,
  CheckCheck,
  Banknote,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type Timestamp,
} from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════════════════════
//  TRIGGER METADATA
// ═══════════════════════════════════════════════════════════════════════════════

const TRIGGER_META: Record<
  string,
  { icon: React.ElementType; color: string; label: string; message: string }
> = {
  heavy_rain: {
    icon: CloudRain,
    color: "#3b82f6",
    label: "Heavy Rain",
    message: "Heavy rainfall detected in your zone",
  },
  extreme_heat: {
    icon: Thermometer,
    color: "#f97316",
    label: "Extreme Heat",
    message: "Dangerous heat levels in your zone",
  },
  hazardous_aqi: {
    icon: Wind,
    color: "#8b5cf6",
    label: "Hazardous AQI",
    message: "Air quality is hazardous in your zone",
  },
  zone_closure: {
    icon: MapPin,
    color: "#ef4444",
    label: "Zone Closure",
    message: "Your zone has been temporarily closed",
  },
  platform_outage: {
    icon: Wifi,
    color: "#06b6d4",
    label: "Platform Outage",
    message: "Platform experiencing service disruption",
  },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  moderate: { label: "Moderate", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  high: { label: "High", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  severe: { label: "Severe", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PAYOUT RANGES BY SEVERITY
// ═══════════════════════════════════════════════════════════════════════════════

const PAYOUT_RANGES: Record<string, { min: number; max: number; label: string }> = {
  moderate: { min: 150, max: 250, label: "₹150 – ₹250" },
  high: { min: 300, max: 500, label: "₹300 – ₹500" },
  severe: { min: 600, max: 800, label: "₹600 – ₹800" },
};

const CLAIM_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; step: number }
> = {
  pending_fraud_check: {
    label: "Pending Verification",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    step: 1,
  },
  under_review: {
    label: "Under Review",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    step: 1,
  },
  auto_approved: {
    label: "Auto Approved",
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
    step: 2,
  },
  approved: {
    label: "Approved",
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
    step: 2,
  },
  paid: {
    label: "Paid",
    color: "#6c5ce7",
    bg: "rgba(108,92,231,0.12)",
    step: 3,
  },
  held: {
    label: "Held for Review",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    step: 1,
  },
  denied: {
    label: "Denied",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    step: 0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface TriggerAlertDoc {
  id: string;
  type: string;
  severity: string;
  zone: string;
  city: string;
  details: string;
  createdAt: Timestamp | string | null;
  startTime: Timestamp | string | null;
}

interface AutoClaimDoc {
  id: string;
  triggerType: string;
  triggerSeverity: string;
  status: string;
  payoutAmount: number;
  description: string;
  zone: string;
  autoInitiated: boolean;
  createdAt: Timestamp | string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function resolveDate(ts: Timestamp | string | null | undefined): Date | null {
  if (!ts) return null;
  if (typeof ts === "string") return new Date(ts);
  if (typeof ts === "object" && "toDate" in ts) return ts.toDate();
  return null;
}

/** Returns a human-readable relative time string like "2 hours ago". */
function timeAgo(ts: Timestamp | string | null | undefined): string {
  const d = resolveDate(ts);
  if (!d) return "just now";

  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Build a plain-language alert description. */
function getAlertMessage(alert: TriggerAlertDoc): string {
  const meta = TRIGGER_META[alert.type];
  if (!meta) return alert.details || "Trigger event detected in your zone";

  // Build context-rich message
  const suffix =
    alert.type === "heavy_rain" || alert.type === "extreme_heat" || alert.type === "hazardous_aqi"
      ? " — claim auto-initiated"
      : alert.type === "zone_closure"
        ? " — deliveries suspended"
        : " — orders may be affected";

  return meta.message + suffix;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STATIC DATA (kept from original dashboard)
// ═══════════════════════════════════════════════════════════════════════════════

const triggers = [
  { icon: CloudRain, label: "Rain", status: "active", color: "#3b82f6" },
  { icon: Thermometer, label: "Heat", status: "normal", color: "#f97316" },
  { icon: Wind, label: "AQI", status: "warning", color: "#8b5cf6" },
  { icon: MapPin, label: "Zone", status: "normal", color: "#ef4444" },
  { icon: Wifi, label: "Platform", status: "normal", color: "#06b6d4" },
];

const recentClaims = [
  {
    id: "cl_001",
    type: "Heavy Rain",
    date: "18 Mar",
    amount: 750,
    status: "auto_approved",
  },
  {
    id: "cl_004",
    type: "Platform Outage",
    date: "19 Mar",
    amount: 500,
    status: "auto_approved",
  },
];

const statusLabel: Record<string, string> = {
  auto_approved: "Auto Approved",
  under_review: "Under Review",
  approved: "Approved",
  held: "Held",
  denied: "Denied",
};

const statusClass: Record<string, string> = {
  auto_approved: "status-approved",
  under_review: "status-reviewing",
  approved: "status-approved",
  held: "status-held",
  denied: "status-denied",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ACTIVE ALERTS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function ActiveAlerts({ zone }: { zone: string }) {
  const [alerts, setAlerts] = useState<TriggerAlertDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!zone) {
      setLoading(false);
      return;
    }

    // 24 hours ago
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const q = query(
      collection(db, "triggerEvents"),
      where("zone", "==", zone),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: TriggerAlertDoc[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const ts = resolveDate(data.createdAt || data.startTime);
          // Client-side filter for last 24 hours
          if (ts && ts >= cutoff) {
            docs.push({ id: d.id, ...data } as TriggerAlertDoc);
          }
        });
        setAlerts(docs);
        setLoading(false);
      },
      (err) => {
        console.error("ActiveAlerts listener error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [zone]);

  // ── Loading State ──
  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Active Alerts
        </h2>
        <div
          className="glass rounded-2xl p-6 flex items-center justify-center gap-2"
          style={{ minHeight: 80 }}
        >
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Checking your zone…</span>
        </div>
      </div>
    );
  }

  // ── Empty / Clear State ──
  if (alerts.length === 0) {
    return (
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Active Alerts
        </h2>
        <div
          className="glass rounded-2xl p-5 flex items-center gap-3"
          style={{ border: "1px solid rgba(16,185,129,0.2)" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(16,185,129,0.12)" }}
          >
            <CheckCircle2 className="w-5 h-5" style={{ color: "#10b981" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#10b981" }}>
              Your zone is clear
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              No active alerts in the last 24 hours
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Alerts List ──
  return (
    <motion.div
      className="mb-6"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Active Alerts
        </h2>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: "rgba(239,68,68,0.12)",
            color: "#ef4444",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] animate-pulse" />
          {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {alerts.map((alert, i) => {
            const meta = TRIGGER_META[alert.type] || {
              icon: AlertTriangle,
              color: "#888",
              label: alert.type,
              message: "Trigger detected",
            };
            const Icon = meta.icon;
            const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.moderate;
            const ts = alert.createdAt || alert.startTime;

            return (
              <motion.div
                key={alert.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-xl p-4 relative overflow-hidden"
                style={{
                  borderLeft: `3px solid ${meta.color}`,
                }}
              >
                {/* Subtle glow accent */}
                <div
                  className="absolute top-0 left-0 w-20 h-full opacity-[0.06] pointer-events-none"
                  style={{
                    background: `linear-gradient(90deg, ${meta.color}, transparent)`,
                  }}
                />

                <div className="relative flex items-start gap-3">
                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: `${meta.color}18` }}
                  >
                    <Icon className="w-4.5 h-4.5" style={{ color: meta.color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">{meta.label}</span>
                      <span
                        className="text-[9px] font-bold uppercase px-1.5 py-[1px] rounded-full"
                        style={{
                          color: sev.color,
                          backgroundColor: sev.bg,
                        }}
                      >
                        {sev.label}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                      {getAlertMessage(alert)}
                    </p>
                  </div>

                  {/* Time ago */}
                  <span className="text-[10px] text-muted-foreground/70 font-medium whitespace-nowrap flex-shrink-0 mt-1">
                    {timeAgo(ts)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTO CLAIM CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function AutoClaimCard({ workerId }: { workerId: string }) {
  const [claims, setClaims] = useState<AutoClaimDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workerId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "claims"),
      where("workerId", "==", workerId),
      where("autoInitiated", "==", true),
      orderBy("createdAt", "desc"),
      limit(3)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as AutoClaimDoc[];
        setClaims(docs);
        setLoading(false);
      },
      (err) => {
        console.error("AutoClaimCard listener error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [workerId]);

  if (loading || claims.length === 0) return null;

  // Steps for the progress indicator
  const STEPS = [
    { icon: CircleDot, label: "Initiated" },
    { icon: CheckCheck, label: "Approved" },
    { icon: Banknote, label: "Paid" },
  ];

  return (
    <motion.div
      className="mb-6"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      <div className="space-y-3">
        {claims.map((claim) => {
          const meta = TRIGGER_META[claim.triggerType] || {
            icon: AlertTriangle,
            color: "#888",
            label: claim.triggerType,
            message: "Trigger detected",
          };
          const Icon = meta.icon;
          const sev = SEVERITY_CONFIG[claim.triggerSeverity] || SEVERITY_CONFIG.moderate;
          const statusCfg = CLAIM_STATUS_CONFIG[claim.status] || CLAIM_STATUS_CONFIG.pending_fraud_check;
          const payout = PAYOUT_RANGES[claim.triggerSeverity] || PAYOUT_RANGES.moderate;
          const currentStep = statusCfg.step;

          return (
            <motion.div
              key={claim.id}
              className="rounded-2xl relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(108,92,231,0.08) 0%, rgba(168,85,247,0.06) 100%)",
                border: "1px solid rgba(108,92,231,0.2)",
              }}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              {/* Header stripe */}
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{
                  background: "linear-gradient(90deg, rgba(108,92,231,0.15) 0%, rgba(168,85,247,0.08) 100%)",
                  borderBottom: "1px solid rgba(108,92,231,0.12)",
                }}
              >
                <Zap className="w-3.5 h-3.5 text-[#6c5ce7]" />
                <span className="text-xs font-semibold text-[#6c5ce7]">
                  A claim has been automatically initiated for you
                </span>
              </div>

              <div className="p-4">
                {/* Trigger info row */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${meta.color}18` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{meta.label}</span>
                      <span
                        className="text-[9px] font-bold uppercase px-1.5 py-[1px] rounded-full"
                        style={{ color: sev.color, backgroundColor: sev.bg }}
                      >
                        {sev.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Expected payout: <span className="font-semibold text-foreground">{payout.label}</span>
                    </p>
                  </div>
                </div>

                {/* Status step indicator */}
                <div className="flex items-center gap-1">
                  {STEPS.map((step, i) => {
                    const StepIcon = step.icon;
                    const isCompleted = i < currentStep;
                    const isCurrent = i === currentStep - 1;
                    const stepColor = isCompleted || isCurrent ? statusCfg.color : "#555";

                    return (
                      <React.Fragment key={step.label}>
                        <div className="flex flex-col items-center gap-1 flex-1">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isCurrent ? "ring-2 ring-offset-1 ring-offset-background" : ""
                              }`}
                            style={{
                              backgroundColor: isCompleted || isCurrent ? `${stepColor}18` : "rgba(255,255,255,0.05)",
                              borderColor: stepColor,
                              ...(isCurrent ? { ringColor: stepColor } : {}),
                            }}
                          >
                            <StepIcon
                              className="w-3.5 h-3.5"
                              style={{ color: isCompleted || isCurrent ? stepColor : "#666" }}
                            />
                          </div>
                          <span
                            className="text-[9px] font-medium"
                            style={{ color: isCompleted || isCurrent ? stepColor : "#666" }}
                          >
                            {step.label}
                          </span>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div
                            className="h-[2px] flex-1 rounded-full -mt-4"
                            style={{
                              backgroundColor: i < currentStep - 1 ? stepColor : "rgba(255,255,255,0.08)",
                            }}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Current status badge */}
                <div className="mt-3 flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: statusCfg.color, backgroundColor: statusCfg.bg }}
                  >
                    <Clock className="w-3 h-3" />
                    {statusCfg.label}
                  </span>
                  {claim.payoutAmount > 0 && (
                    <span className="text-xs font-semibold text-foreground">
                      ₹{claim.payoutAmount}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

export default function WorkerDashboard() {
  const { userProfile } = useAuth();
  const workerZone = userProfile?.zone || "Koramangala";
  const workerId = userProfile?.uid || "worker-demo-001";
  const workerName = userProfile?.name?.split(" ")[0] || "Arjun";

  // Determine greeting based on time of day
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
            {workerName} 👋
          </h1>
        </div>
        <button
          onClick={() => toast("🔔 Cover expiring in 3 days — renew now!", { icon: "📢" })}
          className="w-10 h-10 rounded-full bg-muted flex items-center justify-center relative hover:bg-muted/80 transition-colors"
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-background" />
        </button>
      </div>

      {/* ═══  ACTIVE ALERTS (Live Firestore)  ═══ */}
      <ActiveAlerts zone={workerZone} />

      {/* ═══  AUTO CLAIM CARD (Live Firestore)  ═══ */}
      <AutoClaimCard workerId={workerId} />

      {/* Active Cover */}
      <motion.div
        className="rounded-2xl p-5 bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] relative overflow-hidden mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-6 -translate-x-6" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-white/80" />
            <span className="text-sm text-white/80 font-medium">Active Cover — Core Plan</span>
          </div>
          <p className="text-3xl font-bold text-white mb-1">₹1,500</p>
          <p className="text-sm text-white/70">Max weekly protection</p>
          <div className="flex items-center gap-4 mt-4 text-sm text-white/80">
            <span>Premium: ₹39</span>
            <span>•</span>
            <span>Expires: 23 Mar</span>
          </div>
        </div>
      </motion.div>

      {/* Triggers Watched */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Triggers Monitored
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {triggers.map((t) => (
            <div
              key={t.label}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-xl glass min-w-[72px]"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${t.color}20` }}
              >
                <t.icon className="w-5 h-5" style={{ color: t.color }} />
              </div>
              <span className="text-[10px] font-medium">{t.label}</span>
              <div
                className={`w-2 h-2 rounded-full ${t.status === "active"
                    ? "bg-[#3b82f6] animate-pulse"
                    : t.status === "warning"
                      ? "bg-[#f59e0b] animate-pulse"
                      : "bg-accent"
                  }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Protected Earnings */}
      <motion.div
        className="glass rounded-2xl p-5 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Protected This Week</span>
          <TrendingUp className="w-4 h-4 text-foreground" />
        </div>
        <div className="flex items-baseline gap-1">
          <IndianRupee className="w-5 h-5 text-foreground" />
          <span className="text-2xl font-bold text-foreground">1,250</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">2 claims auto-approved</p>
      </motion.div>

      {/* Recent Claims */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Recent Claims
          </h2>
          <Link href="/worker/claims" className="text-xs text-primary flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2">
          {recentClaims.map((claim) => (
            <motion.div
              key={claim.id}
              className="glass rounded-xl p-4 flex items-center justify-between"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div>
                <p className="font-medium text-sm">{claim.type}</p>
                <p className="text-xs text-muted-foreground">{claim.date}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-sm text-foreground">+₹{claim.amount}</p>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClass[claim.status]}`}
                >
                  {statusLabel[claim.status]}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Renewal Nudge */}
      <motion.div
        className="glass rounded-2xl p-4 border border-[rgba(108,92,231,0.3)] mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <p className="text-sm font-medium mb-2">
          📅 Your cover expires in <strong className="text-warning">3 days</strong>
        </p>
        <Link
          href="/worker/policy"
          className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
        >
          Renew Now <ArrowRight className="w-4 h-4" />
        </Link>
      </motion.div>
    </div>
  );
}
