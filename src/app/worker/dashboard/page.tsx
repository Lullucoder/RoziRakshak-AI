"use client";

import React from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { useAuth } from "@/contexts/AuthContext";

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

export default function WorkerDashboard() {
  const { userProfile } = useAuth();
  
  return (
    <div className="px-4 pt-6">
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
