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
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useWorkerTheme } from "../layout";

import { useAuth } from "@/contexts/AuthContext";
import { getActivePolicyByWorker, getClaimsByWorker } from "@/lib/firestore";
import type { Claim } from "@/types/claim";
import type { Policy } from "@/types/policy";

const triggers = [
  { icon: CloudRain, label: "Rain", status: "active", color: "#3b82f6" },
  { icon: Thermometer, label: "Heat", status: "normal", color: "#f97316" },
  { icon: Wind, label: "AQI", status: "warning", color: "#8b5cf6" },
  { icon: MapPin, label: "Zone", status: "normal", color: "#ef4444" },
  { icon: Wifi, label: "Platform", status: "normal", color: "#06b6d4" },
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
  paid: "status-approved",
  held: "status-held",
  denied: "status-denied",
};

const triggerTypeLabel: Record<string, string> = {
  heavy_rain: "Heavy Rain",
  extreme_heat: "Extreme Heat",
  hazardous_aqi: "Hazardous AQI",
  zone_closure: "Zone Closure",
  platform_outage: "Platform Outage",
};

function toDate(input: unknown): Date | null {
  if (!input) return null;
  if (typeof input === "string") return new Date(input);
  if (typeof input === "object" && input !== null && "seconds" in input) {
    return new Date((input as { seconds: number }).seconds * 1000);
  }
  return null;
}

function formatClaimDate(input: unknown): string {
  const date = toDate(input);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatPlanName(plan: string): string {
  if (!plan) return "No Plan";
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)} Plan`;
}

export default function WorkerDashboard() {
  const { theme, setTheme } = useWorkerTheme();
  const { user, userProfile } = useAuth();
  const [activePolicy, setActivePolicy] = useState<Policy | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Dismissable dark-mode banner
  const DISMISS_KEY = "worker-dark-tip-dismissed";
  const [bannerDismissed, setBannerDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    setBannerDismissed(dismissed);
  }, []);

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!user) {
        setLoadingData(false);
        return;
      }

      try {
        const [policy, workerClaims] = await Promise.all([
          getActivePolicyByWorker(user.uid),
          getClaimsByWorker(user.uid),
        ]);

        setActivePolicy(policy);

        const sortedClaims = [...workerClaims].sort((a, b) => {
          const aTime = toDate(a.createdAt)?.getTime() ?? 0;
          const bTime = toDate(b.createdAt)?.getTime() ?? 0;
          return bTime - aTime;
        });

        setClaims(sortedClaims);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        toast.error("Could not load live dashboard data.");
      } finally {
        setLoadingData(false);
      }
    };

    void loadDashboardData();
  }, [user]);

  const recentClaims = claims.slice(0, 2).map((claim) => ({
    id: claim.id,
    type: triggerTypeLabel[claim.triggerType] || claim.triggerType,
    date: formatClaimDate(claim.createdAt),
    amount: claim.payoutAmount || 0,
    status: claim.status,
  }));

  const totalProtected = claims
    .filter((claim) => (claim.payoutAmount || 0) > 0)
    .reduce((sum, claim) => sum + (claim.payoutAmount || 0), 0);

  const autoApprovedCount = claims.filter(
    (claim) => claim.status === "auto_approved" || claim.status === "approved" || claim.status === "paid"
  ).length;

  const dismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const showBanner = theme === "dark" && !bannerDismissed;

  return (
    <div className="px-4 pt-6">
      {/* ——— Dark Mode Outdoor Tip Banner ——— */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            key="dark-tip-banner"
            initial={{ opacity: 0, y: -8, scaleY: 0.9 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -8, scaleY: 0.9 }}
            transition={{ duration: 0.25 }}
            className="mb-4 rounded-2xl p-3 flex items-center gap-3"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.10))",
              border: "1px solid rgba(245,158,11,0.35)",
            }}
          >
            <Sun className="w-5 h-5 flex-shrink-0" style={{ color: "#d97706" }} />
            <p className="flex-1 text-xs font-medium" style={{ color: "#92400e" }}>
              Tip: Switch to <strong>Light Mode</strong> for better visibility outdoors.
            </p>
            <button
              id="dark-tip-switch-now-btn"
              onClick={() => { setTheme("light"); dismissBanner(); }}
              className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              aria-label="Switch to light mode"
              style={{
                background: "rgba(245,158,11,0.25)",
                color: "#92400e",
                border: "1px solid rgba(245,158,11,0.5)",
                minHeight: "36px",
              }}
            >
              Switch Now
            </button>
            <button
              id="dark-tip-dismiss-btn"
              onClick={dismissBanner}
              style={{ minHeight: "36px", minWidth: "36px" }}
              className="flex-shrink-0 rounded-lg flex items-center justify-center transition-colors hover:bg-amber-200/30"
              aria-label="Dismiss tip"
            >
              <X className="w-3.5 h-3.5" style={{ color: "#92400e" }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground">Good evening,</p>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-outfit)" }}>
            {userProfile?.name || "Worker"} 👋
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
            <span className="text-sm text-white/80 font-medium">
              Active Cover — {formatPlanName(activePolicy?.plan || "")}
            </span>
          </div>
          <p className="text-3xl font-bold text-white mb-1">
            ₹{activePolicy?.maxProtection ?? 0}
          </p>
          <p className="text-sm text-white/70">Max weekly protection</p>
          <div className="flex items-center gap-4 mt-4 text-sm text-white/80">
            <span>Premium: ₹{activePolicy?.premium ?? 0}</span>
            <span>•</span>
            <span>Expires: {formatClaimDate(activePolicy?.weekEnd)}</span>
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
                className={`w-2 h-2 rounded-full ${
                  t.status === "active"
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
          <span className="text-2xl font-bold text-foreground">{totalProtected}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {loadingData ? "Loading claims..." : `${autoApprovedCount} claims auto-approved`}
        </p>
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
          {recentClaims.length === 0 && !loadingData && (
            <div className="glass rounded-xl p-4 text-sm text-muted-foreground">No claims yet.</div>
          )}
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
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClass[claim.status] || "status-reviewing"}`}
                >
                  {statusLabel[claim.status] || claim.status}
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
